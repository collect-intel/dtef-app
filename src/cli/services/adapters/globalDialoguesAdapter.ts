/**
 * Global Dialogues Adapter
 *
 * Converts Global Dialogues CSV data (aggregate_standardized.csv) into
 * DTEFSurveyData format for use in the DTEF evaluation pipeline.
 *
 * Data source: https://github.com/collect-intel/global-dialogues
 * See Data/Documentation/DATA_GUIDE.md for format documentation.
 */

import * as fs from 'fs';
import * as path from 'path';
import { DTEFSurveyData, SegmentWithResponses, DemographicResponse } from '@/types/dtef';

// ── Column classification ──────────────────────────────────────────────

/**
 * Default segment column prefixes for demographic categories (O1–O7).
 * O1-O4 are consistent across all rounds. O5-O7 vary: most rounds use
 * O5=aiConcern, O6=religion, O7=country, but GD6UK omits aiConcern
 * and uses O5=religion, O6=country. We auto-detect O5-O7 from values.
 */
const FIXED_SEGMENT_PREFIXES: Record<string, string> = {
  'O1': 'language',
  'O2': 'ageGroup',
  'O3': 'gender',
  'O4': 'environment',
};

/** Known AI concern values (exact match, case-insensitive) */
const AI_CONCERN_VALUES = new Set([
  'equally concerned and excited',
  'more concerned than excited',
  'more excited than concerned',
]);

/** Known religion values (substring match, case-insensitive) */
const RELIGION_INDICATORS = [
  'buddhism', 'christianity', 'hinduism', 'islam', 'judaism',
  'sikhism', 'religious group', 'do not identify with any religious',
];

/**
 * Detect the category for an O-prefix by examining its values.
 * Returns 'aiConcern', 'religion', or 'country'.
 */
function detectCategory(values: string[]): string {
  const lower = values.map(v => v.toLowerCase());
  if (lower.some(v => AI_CONCERN_VALUES.has(v))) return 'aiConcern';
  if (lower.some(v => RELIGION_INDICATORS.some(r => v.includes(r)))) return 'religion';
  return 'country';
}

/**
 * Columns that are metadata, not segment data.
 * These appear before the segment columns in the CSV.
 */
const METADATA_COLUMNS = new Set([
  'Question ID', 'Question Type', 'Question', 'Response',
  'OriginalResponse', 'Star', 'Categories', 'Sentiment',
  'Submitted By', 'Language', 'Sample ID', 'Participant ID',
]);

/**
 * Known demographic-defining question texts (onboarding polls).
 * These define the segments themselves and are excluded from
 * evaluation questions by default.
 */
const DEMOGRAPHIC_QUESTION_PATTERNS = [
  /preferred language/i,
  /how old are you/i,
  /what is your gender/i,
  /what best describes where you live/i,
  /what country or region/i,
  /what religious group/i,
  /how would you describe your feelings about AI/i, // O5 concern question varies
];

// ── Types ──────────────────────────────────────────────────────────────

interface ParsedRow {
  questionId: string;
  questionType: string;
  questionText: string;
  response: string;
  /** Percentage values keyed by segment column name, e.g. "O3: Male" → 45.5 */
  segmentValues: Record<string, number>;
  allValue: number;
}

interface QuestionGroup {
  questionId: string;
  questionText: string;
  questionType: string;
  responses: Array<{
    text: string;
    segmentValues: Record<string, number>;
    allValue: number;
  }>;
}

interface SegmentCountRow {
  questionId: string;
  segmentName: string;
  count: number;
}

export interface GlobalDialoguesAdapterOptions {
  /** Path to the GD<N>_aggregate_standardized.csv file */
  aggregatePath: string;
  /** Optional path to GD<N>_segment_counts_by_question.csv for sample sizes */
  segmentCountsPath?: string;
  /** Global Dialogue round identifier (e.g., "GD4") */
  roundId: string;
  /** Which segment categories to include (default: all O2–O7) */
  segmentCategories?: string[];
  /** Whether to include demographic-defining questions (default: false) */
  includeDemographicQuestions?: boolean;
  /** Minimum sample size for a segment to be included (default: 10) */
  minSampleSize?: number;
  /** Specific question IDs to include (default: all qualifying) */
  questionIds?: string[];
}

// ── CSV Parsing ────────────────────────────────────────────────────────

/**
 * Simple CSV parser that handles quoted fields with commas and newlines.
 */
function parseCSV(content: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let inQuotes = false;

  for (let i = 0; i < content.length; i++) {
    const ch = content[i];
    const next = content[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        currentField += '"';
        i++; // skip escaped quote
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        currentField += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        currentRow.push(currentField);
        currentField = '';
      } else if (ch === '\n' || (ch === '\r' && next === '\n')) {
        currentRow.push(currentField);
        currentField = '';
        if (currentRow.length > 1 || currentRow[0] !== '') {
          rows.push(currentRow);
        }
        currentRow = [];
        if (ch === '\r') i++; // skip \n in \r\n
      } else {
        currentField += ch;
      }
    }
  }

  // Handle last field/row
  if (currentField || currentRow.length > 0) {
    currentRow.push(currentField);
    rows.push(currentRow);
  }

  return rows;
}

/**
 * Parse a percentage string like "45.5%" into a number (45.5).
 * Returns NaN for empty or unparseable values.
 */
function parsePercentage(val: string): number {
  if (!val || val.trim() === '') return NaN;
  const cleaned = val.trim().replace(/%$/, '');
  return parseFloat(cleaned);
}

// ── Segment Value Normalization ─────────────────────────────────────────

/** Standardize segment values that vary across rounds (e.g. Türkiye → Turkey) */
const SEGMENT_VALUE_ALIASES: Record<string, string> = {
  'Türkiye': 'Turkey',
};

function normalizeSegmentValue(value: string): string {
  return SEGMENT_VALUE_ALIASES[value] ?? value;
}

// ── Segment Column Classification ──────────────────────────────────────

interface SegmentColumnInfo {
  /** Full column header (e.g., "O3: Male") */
  header: string;
  /** Category prefix (e.g., "O3") */
  prefix: string;
  /** Attribute name (e.g., "gender") */
  attribute: string;
  /** Value within the attribute (e.g., "Male") */
  value: string;
}

/**
 * Build a complete prefix→attribute mapping for the given CSV headers.
 * O1-O4 are fixed. O5-O7 are auto-detected from column values.
 */
function buildSegmentPrefixMap(headers: string[]): Record<string, string> {
  const prefixMap: Record<string, string> = { ...FIXED_SEGMENT_PREFIXES };

  // Collect values per variable O-prefix (O5, O6, O7, etc.)
  const variablePrefixes: Record<string, string[]> = {};
  for (const h of headers) {
    const match = h.match(/^(O\d+): (.+)$/);
    if (match && !FIXED_SEGMENT_PREFIXES[match[1]]) {
      if (!variablePrefixes[match[1]]) variablePrefixes[match[1]] = [];
      variablePrefixes[match[1]].push(match[2]);
    }
  }

  // Detect category for each variable prefix
  for (const [prefix, values] of Object.entries(variablePrefixes)) {
    prefixMap[prefix] = detectCategory(values);
  }

  return prefixMap;
}

/** Module-level prefix map, set by classifySegmentColumn's caller via buildSegmentPrefixMap */
let activePrefixMap: Record<string, string> = { ...FIXED_SEGMENT_PREFIXES };

/**
 * Classifies a column header as a segment column and extracts its metadata.
 * Returns null if the column is not a recognized segment column.
 */
function classifySegmentColumn(header: string): SegmentColumnInfo | null {
  for (const [prefix, attribute] of Object.entries(activePrefixMap)) {
    if (header.startsWith(`${prefix}: `)) {
      const value = normalizeSegmentValue(header.slice(prefix.length + 2).trim());
      return { header, prefix, attribute, value };
    }
  }
  return null;
}

/**
 * Check if a column is the "All" aggregate column.
 */
function isAllColumn(header: string): boolean {
  return header === 'All';
}

/**
 * Check if a column is a region column (not O-prefixed but also a segment).
 * Region columns like "Africa", "Asia", "Eastern Europe" etc. are included
 * as supplementary segments.
 */
function isRegionColumn(header: string): boolean {
  // Region columns are not O-prefixed, not metadata, and not "All"
  return !METADATA_COLUMNS.has(header) && !isAllColumn(header) && !classifySegmentColumn(header);
}

// ── Core Adapter Logic ─────────────────────────────────────────────────

/**
 * Load and parse the aggregate standardized CSV file.
 */
function loadAggregateCSV(filePath: string): { headers: string[]; rows: ParsedRow[] } {
  const content = fs.readFileSync(filePath, 'utf-8');
  const parsed = parseCSV(content);

  if (parsed.length < 2) {
    throw new Error(`CSV file has insufficient data: ${filePath}`);
  }

  const headers = parsed[0];

  // Build prefix map for this CSV (auto-detects O5-O7 categories)
  activePrefixMap = buildSegmentPrefixMap(headers);

  const rows: ParsedRow[] = [];

  // Find the index of key columns
  const qidIdx = headers.indexOf('Question ID');
  const qtypeIdx = headers.indexOf('Question Type');
  const qTextIdx = headers.indexOf('Question');
  const respIdx = headers.indexOf('Response');
  const allIdx = headers.indexOf('All');

  if (qidIdx < 0 || qtypeIdx < 0 || qTextIdx < 0 || respIdx < 0) {
    throw new Error(`CSV missing required columns. Found: ${headers.slice(0, 15).join(', ')}`);
  }

  for (let i = 1; i < parsed.length; i++) {
    const fields = parsed[i];
    if (fields.length < headers.length) continue;

    const segmentValues: Record<string, number> = {};

    // Extract segment column values
    for (let j = 0; j < headers.length; j++) {
      const h = headers[j];
      if (classifySegmentColumn(h) || isRegionColumn(h)) {
        const pct = parsePercentage(fields[j]);
        if (!isNaN(pct)) {
          segmentValues[h] = pct;
        }
      }
    }

    rows.push({
      questionId: fields[qidIdx],
      questionType: fields[qtypeIdx],
      questionText: fields[qTextIdx],
      response: fields[respIdx],
      segmentValues,
      allValue: allIdx >= 0 ? parsePercentage(fields[allIdx]) : NaN,
    });
  }

  return { headers, rows };
}

/**
 * Load segment counts for determining sample sizes.
 */
function loadSegmentCounts(filePath: string): Map<string, Map<string, number>> {
  const content = fs.readFileSync(filePath, 'utf-8');
  const parsed = parseCSV(content);

  if (parsed.length < 2) return new Map();

  const headers = parsed[0];

  // The segment counts file has: Question ID, Question Text, then segment columns with counts
  const qidIdx = headers.indexOf('Question ID');
  if (qidIdx < 0) return new Map();

  // Map: questionId → (segmentName → count)
  const counts = new Map<string, Map<string, number>>();

  for (let i = 1; i < parsed.length; i++) {
    const fields = parsed[i];
    const qid = fields[qidIdx];
    if (!counts.has(qid)) {
      counts.set(qid, new Map());
    }
    const qCounts = counts.get(qid)!;

    for (let j = 0; j < headers.length; j++) {
      if (j === qidIdx || headers[j] === 'Question Text') continue;
      const count = parseInt(fields[j], 10);
      if (!isNaN(count) && count > 0) {
        qCounts.set(headers[j], count);
      }
    }
  }

  return counts;
}

/**
 * Group parsed rows by question ID to collect all response options per question.
 */
function groupByQuestion(rows: ParsedRow[]): Map<string, QuestionGroup> {
  const groups = new Map<string, QuestionGroup>();

  for (const row of rows) {
    if (!groups.has(row.questionId)) {
      groups.set(row.questionId, {
        questionId: row.questionId,
        questionText: row.questionText,
        questionType: row.questionType,
        responses: [],
      });
    }
    groups.get(row.questionId)!.responses.push({
      text: row.response,
      segmentValues: row.segmentValues,
      allValue: row.allValue,
    });
  }

  return groups;
}

/**
 * Determine if a question is a demographic-defining question based on its text.
 */
function isDemographicQuestion(questionText: string): boolean {
  return DEMOGRAPHIC_QUESTION_PATTERNS.some(pattern => pattern.test(questionText));
}

/**
 * Build a unique segment ID from its attribute and value.
 */
function makeSegmentId(attribute: string, value: string): string {
  return `${attribute}:${value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '')}`;
}

/**
 * Convert Global Dialogues data to DTEFSurveyData format.
 */
export function convertGlobalDialogues(options: GlobalDialoguesAdapterOptions): DTEFSurveyData {
  const {
    aggregatePath,
    segmentCountsPath,
    roundId,
    segmentCategories = ['O2', 'O3', 'O4', 'O5', 'O6', 'O7'], // Exclude O1 (language) by default
    includeDemographicQuestions = false,
    minSampleSize = 10,
    questionIds,
  } = options;

  // Load data
  const { headers, rows } = loadAggregateCSV(aggregatePath);

  // Load segment counts if available
  const segmentCounts = segmentCountsPath && fs.existsSync(segmentCountsPath)
    ? loadSegmentCounts(segmentCountsPath)
    : null;

  // Identify segment columns to use
  const segmentColumns: SegmentColumnInfo[] = [];
  for (const h of headers) {
    const info = classifySegmentColumn(h);
    if (info && segmentCategories.includes(info.prefix)) {
      segmentColumns.push(info);
    }
  }

  // Group rows by question
  const questionGroups = groupByQuestion(rows);

  // Filter to Poll Single Select questions
  const pollQuestions = new Map<string, QuestionGroup>();
  for (const [qid, group] of questionGroups) {
    if (group.questionType !== 'Poll Single Select') continue;
    if (!includeDemographicQuestions && isDemographicQuestion(group.questionText)) continue;
    if (questionIds && !questionIds.includes(qid)) continue;
    pollQuestions.set(qid, group);
  }

  // Build questions map
  const questions: DTEFSurveyData['questions'] = {};
  for (const [qid, group] of pollQuestions) {
    questions[qid] = {
      text: group.questionText,
      type: 'single-select',
      options: group.responses.map(r => r.text),
    };
  }

  // Build segments
  // Each segment column (e.g., "O3: Male") becomes a segment
  const segments: SegmentWithResponses[] = [];

  for (const col of segmentColumns) {
    // Determine sample size from counts file
    let sampleSize = 0;
    if (segmentCounts) {
      // Use sample size from first available question
      for (const [_qid, qCounts] of segmentCounts) {
        const count = qCounts.get(col.header);
        if (count !== undefined) {
          sampleSize = count;
          break;
        }
      }
    }

    // Skip segments below minimum sample size (if we have count data)
    if (segmentCounts && sampleSize < minSampleSize) continue;

    // Build responses for each question
    const responses: DemographicResponse[] = [];
    let hasValidData = false;

    for (const [qid, group] of pollQuestions) {
      const distribution = group.responses.map(r => {
        const val = r.segmentValues[col.header];
        return val !== undefined ? val : 0;
      });

      // Check if distribution has any non-zero data
      const sum = distribution.reduce((a, b) => a + b, 0);
      if (sum > 0) {
        hasValidData = true;
      }

      responses.push({
        questionId: qid,
        distribution,
      });
    }

    // Only include segments that have actual data
    if (!hasValidData) continue;

    segments.push({
      id: makeSegmentId(col.attribute, col.value),
      label: col.value,
      attributes: { [col.attribute]: col.value },
      sampleSize: sampleSize || 0,
      responses,
    });
  }

  return {
    surveyId: `global-dialogues-${roundId.toLowerCase()}`,
    surveyName: `Global Dialogues ${roundId}`,
    description: `Cross-national survey on public perspectives about AI from the ${roundId} round of Global Dialogues. Conducted via AI-moderated dialogue sessions on Remesh.ai with participants recruited through Prolific.`,
    source: `Global Dialogues ${roundId} (https://github.com/collect-intel/global-dialogues)`,
    questions,
    segments,
  };
}

// ── Convenience Functions ──────────────────────────────────────────────

/**
 * Auto-detect available GD rounds from the data directory.
 */
export function detectAvailableRounds(dataDir: string): string[] {
  const rounds: string[] = [];
  const entries = fs.readdirSync(dataDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const name = entry.name;
    // Match GD<N> pattern (GD1, GD2, GD3, ..., GD6UK, etc.)
    if (/^GD\d/.test(name)) {
      const aggFile = path.join(dataDir, name, `${name}_aggregate_standardized.csv`);
      if (fs.existsSync(aggFile)) {
        rounds.push(name);
      }
    }
  }

  return rounds.sort();
}

/**
 * Load a specific GD round from the standard data directory structure.
 */
export function loadGlobalDialoguesRound(
  dataDir: string,
  roundId: string,
  overrides?: Partial<GlobalDialoguesAdapterOptions>,
): DTEFSurveyData {
  const roundDir = path.join(dataDir, roundId);
  const aggregatePath = path.join(roundDir, `${roundId}_aggregate_standardized.csv`);
  const segmentCountsPath = path.join(roundDir, `${roundId}_segment_counts_by_question.csv`);

  if (!fs.existsSync(aggregatePath)) {
    throw new Error(`Aggregate file not found: ${aggregatePath}`);
  }

  return convertGlobalDialogues({
    aggregatePath,
    segmentCountsPath: fs.existsSync(segmentCountsPath) ? segmentCountsPath : undefined,
    roundId,
    ...overrides,
  });
}

/**
 * Load all available GD rounds and merge into a combined dataset.
 * Each round's questions get prefixed with the round ID to avoid collisions.
 */
export function loadAllGlobalDialoguesRounds(
  dataDir: string,
  overrides?: Partial<GlobalDialoguesAdapterOptions>,
): DTEFSurveyData[] {
  const rounds = detectAvailableRounds(dataDir);
  return rounds.map(roundId => loadGlobalDialoguesRound(dataDir, roundId, overrides));
}

/**
 * Get a summary of a converted dataset for display.
 */
export function summarizeDataset(data: DTEFSurveyData): {
  questionCount: number;
  segmentCount: number;
  segmentCategories: string[];
  totalResponses: number;
  sampleSizeRange: { min: number; max: number };
} {
  const questionCount = Object.keys(data.questions).length;
  const segmentCount = data.segments.length;

  // Extract unique segment categories
  const categories = new Set<string>();
  for (const seg of data.segments) {
    for (const attr of Object.keys(seg.attributes)) {
      categories.add(attr);
    }
  }

  const sampleSizes = data.segments.map(s => s.sampleSize).filter(s => s > 0);
  const totalResponses = data.segments.reduce(
    (sum, seg) => sum + seg.responses.length,
    0,
  );

  return {
    questionCount,
    segmentCount,
    segmentCategories: [...categories].sort(),
    totalResponses,
    sampleSizeRange: {
      min: sampleSizes.length > 0 ? Math.min(...sampleSizes) : 0,
      max: sampleSizes.length > 0 ? Math.max(...sampleSizes) : 0,
    },
  };
}
