/**
 * Shared segment category utilities.
 *
 * Centralises the segment-type label map and helper functions previously
 * duplicated across DemographicLeaderboard.tsx and DTEFLeaderboardDisplay.tsx.
 */

/** Segment ID prefix → human-readable category label */
export const SEGMENT_TYPE_LABELS: Record<string, string> = {
  // Human-readable prefixes (from DTEF pipeline)
  ageGroup: 'Age',
  gender: 'Gender',
  environment: 'Environment',
  aiConcern: 'AI Concern',
  religion: 'Religion',
  country: 'Country',
  // Legacy O-column prefixes (from raw GD CSVs)
  O2: 'Age',
  O3: 'Gender',
  O4: 'Environment',
  O5: 'AI Concern',
  O6: 'Religion',
  O7: 'Country',
};

/** All known category keys (deduplicated by canonical label). */
export const SEGMENT_CATEGORIES = Object.keys(SEGMENT_TYPE_LABELS);

/**
 * Extract the category prefix from a segment ID.
 * e.g. "country:USA" → "country", "O7:USA" → "O7"
 */
export function getSegmentPrefix(segmentId: string): string {
  return segmentId?.split(':')[0] || segmentId?.substring(0, 2) || '';
}

/**
 * Extract the human-readable value from a segment label.
 * e.g. "O2:18-29" → "18-29", "country:USA" → "USA"
 */
export function getSegmentValueLabel(segmentLabel: string): string {
  const colonIdx = segmentLabel.indexOf(':');
  return colonIdx !== -1 ? segmentLabel.substring(colonIdx + 1) : segmentLabel;
}

/**
 * Get the human-readable category label for a segment ID prefix.
 * Returns the prefix itself if no mapping exists.
 */
export function getCategoryLabel(prefix: string): string {
  return SEGMENT_TYPE_LABELS[prefix] || prefix;
}
