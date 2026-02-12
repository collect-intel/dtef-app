'use client';

import { useState, useEffect, useMemo, useCallback, Fragment } from 'react';
import { getModelDisplayLabel } from '@/app/utils/modelIdUtils';
import {
    SEGMENT_TYPE_LABELS as SHARED_SEGMENT_TYPE_LABELS,
    getSegmentPrefix as sharedGetSegmentPrefix,
    getSegmentValueLabel as sharedGetSegmentValueLabel,
    getCategoryLabel,
} from '@/lib/segmentUtils';

// --- Types ---

interface SegmentScore {
    segmentId: string;
    segmentLabel: string;
    segmentAttributes: Record<string, string>;
    modelId: string;
    avgCoverageExtent: number;
    promptCount: number;
}

interface ModelResult {
    modelId: string;
    overallScore: number;
    segmentCount: number;
    totalPrompts: number;
    segmentStdDev: number;
    segmentScores: SegmentScore[];
    bestSegment?: { id: string; label: string; score: number };
    worstSegment?: { id: string; label: string; score: number };
}

interface FairnessConcern {
    modelId: string;
    category?: string;
    categoryLabel?: string;
    bestSegment: string;
    worstSegment: string;
    gap: number;
}

interface ContextResponsivenessModel {
    modelId: string;
    displayName: string;
    slope: number;
}

interface ContextResponsivenessData {
    models: ContextResponsivenessModel[];
    contextLevelsFound: number[];
}

interface DemographicsData {
    status?: string;
    message?: string;
    generatedAt?: string;
    surveyId?: string;
    resultCount?: number;
    topModels?: Array<{
        modelId: string;
        modelName: string;
        overallScore: number;
        segmentCount: number;
    }>;
    fairnessConcerns?: FairnessConcern[];
    contextResponsiveness?: ContextResponsivenessData;
    aggregation?: {
        modelResults?: ModelResult[];
        disparities?: Array<{
            modelId: string;
            category?: string;
            categoryLabel?: string;
            segmentCount?: number;
            absoluteGap: number;
            bestSegment: { id: string; label: string; score: number };
            worstSegment: { id: string; label: string; score: number };
        }>;
    };
}

// Re-export shared segment utilities for local use
const SEGMENT_TYPE_LABELS = SHARED_SEGMENT_TYPE_LABELS;
const getSegmentPrefix = sharedGetSegmentPrefix;
const getSegmentValueLabel = sharedGetSegmentValueLabel;

function formatModelName(modelId: string): string {
    return getModelDisplayLabel(modelId, {
        hideProvider: true,
        hideModelMaker: true,
        prettifyModelName: true,
    });
}

// --- Sort utilities ---

type SortDirection = 'asc' | 'desc';
interface SortConfig<K extends string = string> { key: K; direction: SortDirection }

function useSort<K extends string>(defaultKey: K, defaultDir: SortDirection = 'desc'): [SortConfig<K>, (key: K) => void] {
    const [sort, setSort] = useState<SortConfig<K>>({ key: defaultKey, direction: defaultDir });
    const toggle = useCallback((key: K) => {
        setSort(prev => prev.key === key
            ? { key, direction: prev.direction === 'desc' ? 'asc' : 'desc' }
            : { key, direction: 'desc' }
        );
    }, []);
    return [sort, toggle];
}

function sortedBy<T>(items: T[], key: string, dir: SortDirection, accessor: (item: T, key: string) => number | string): T[] {
    return [...items].sort((a, b) => {
        const va = accessor(a, key);
        const vb = accessor(b, key);
        if (typeof va === 'number' && typeof vb === 'number') {
            return dir === 'desc' ? vb - va : va - vb;
        }
        const sa = String(va).toLowerCase();
        const sb = String(vb).toLowerCase();
        return dir === 'asc' ? sa.localeCompare(sb) : sb.localeCompare(sa);
    });
}

/** Clickable column header with sort indicator */
function SortableHeader<K extends string>({
    label, sortKey, current, onSort, align = 'left', className = '',
}: {
    label: string; sortKey: K; current: SortConfig<K>; onSort: (key: K) => void;
    align?: 'left' | 'right'; className?: string;
}) {
    const isActive = current.key === sortKey;
    return (
        <th
            className={`px-4 py-3 text-xs font-medium uppercase tracking-wider select-none cursor-pointer group transition-colors hover:text-foreground ${
                align === 'right' ? 'text-right' : 'text-left'
            } ${isActive ? 'text-foreground' : 'text-muted-foreground'} ${className}`}
            onClick={() => onSort(sortKey)}
        >
            <span className="inline-flex items-center gap-1">
                {align === 'right' && <SortIndicator active={isActive} direction={current.direction} />}
                {label}
                {align !== 'right' && <SortIndicator active={isActive} direction={current.direction} />}
            </span>
        </th>
    );
}

function SortIndicator({ active, direction }: { active: boolean; direction: SortDirection }) {
    return (
        <span className={`inline-flex flex-col text-[8px] leading-none ${active ? 'text-foreground' : 'text-muted-foreground/30 group-hover:text-muted-foreground/60'}`}>
            <span className={active && direction === 'asc' ? 'text-foreground' : active ? 'text-muted-foreground/30' : ''}>▲</span>
            <span className={active && direction === 'desc' ? 'text-foreground' : active ? 'text-muted-foreground/30' : ''}>▼</span>
        </span>
    );
}

// --- Sub-components ---

function ScoreBar({ score, maxScore = 1 }: { score: number; maxScore?: number }) {
    const pct = Math.min(100, (score / maxScore) * 100);
    const color = score >= 0.8 ? 'bg-green-500' : score >= 0.6 ? 'bg-yellow-500' : 'bg-red-500';
    return (
        <div className="flex items-center gap-2 w-full">
            <div className="flex-1 bg-muted rounded-full h-2 overflow-hidden">
                <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
            </div>
            <span className="text-xs text-muted-foreground w-12 text-right">
                {(score * 100).toFixed(1)}%
            </span>
        </div>
    );
}

function RankBadge({ rank }: { rank: number }) {
    const cls = rank === 1 ? 'bg-yellow-500/20 text-yellow-600 dark:text-yellow-400'
        : rank === 2 ? 'bg-slate-300/20 text-slate-600 dark:text-slate-400'
        : rank === 3 ? 'bg-amber-600/20 text-amber-700 dark:text-amber-400'
        : 'bg-muted text-muted-foreground';
    return (
        <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-medium ${cls}`}>
            {rank}
        </span>
    );
}

/** Expandable segment breakdown for a single model */
function ModelSegmentBreakdown({ model }: { model: ModelResult }) {
    const grouped = useMemo(() => {
        const groups = new Map<string, SegmentScore[]>();
        for (const seg of model.segmentScores || []) {
            const prefix = getSegmentPrefix(seg.segmentId);
            if (!SEGMENT_TYPE_LABELS[prefix]) continue;
            if (!groups.has(prefix)) groups.set(prefix, []);
            groups.get(prefix)!.push(seg);
        }
        // Sort each group by score descending
        for (const scores of groups.values()) {
            scores.sort((a, b) => b.avgCoverageExtent - a.avgCoverageExtent);
        }
        return groups;
    }, [model.segmentScores]);

    if (grouped.size === 0) {
        return <p className="text-sm text-muted-foreground italic px-4 py-2">No segment data available</p>;
    }

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
            {Array.from(grouped.entries()).map(([prefix, scores]) => (
                <div key={prefix} className="bg-muted/30 rounded-lg p-3">
                    <h5 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                        {SEGMENT_TYPE_LABELS[prefix] || prefix}
                    </h5>
                    <ul className="space-y-1">
                        {scores.map(seg => (
                            <li key={seg.segmentId} className="flex justify-between items-center text-sm">
                                <span className="truncate mr-2">{getSegmentValueLabel(seg.segmentLabel)}</span>
                                <span className={`font-mono text-xs flex-shrink-0 ${
                                    seg.avgCoverageExtent >= 0.8 ? 'text-green-600 dark:text-green-400'
                                    : seg.avgCoverageExtent >= 0.6 ? 'text-yellow-600 dark:text-yellow-400'
                                    : 'text-red-600 dark:text-red-400'
                                }`}>
                                    {(seg.avgCoverageExtent * 100).toFixed(1)}%
                                </span>
                            </li>
                        ))}
                    </ul>
                </div>
            ))}
        </div>
    );
}

// --- Segment Explorer ---

type SegmentSortKey = 'label' | 'bestModel' | 'bestScore' | 'avgScore';

/** Segment Explorer: tabs for each segment type with per-value leaderboards */
function SegmentExplorer({ modelResults }: { modelResults: ModelResult[] }) {
    const segmentTypes = useMemo(() => {
        const types = new Set<string>();
        for (const model of modelResults) {
            for (const seg of model.segmentScores || []) {
                const prefix = getSegmentPrefix(seg.segmentId);
                if (SEGMENT_TYPE_LABELS[prefix]) types.add(prefix);
            }
        }
        return Array.from(types).sort();
    }, [modelResults]);

    const [activeType, setActiveType] = useState<string>(segmentTypes[0] || 'O2');
    const [sort, toggleSort] = useSort<SegmentSortKey>('bestScore');

    // Build a table: rows = segment values, cols = models, cells = scores
    const segmentData = useMemo(() => {
        const valueMap = new Map<string, { label: string; models: Map<string, number> }>();

        for (const model of modelResults) {
            for (const seg of model.segmentScores || []) {
                if (getSegmentPrefix(seg.segmentId) !== activeType) continue;
                if (!valueMap.has(seg.segmentId)) {
                    valueMap.set(seg.segmentId, {
                        label: getSegmentValueLabel(seg.segmentLabel),
                        models: new Map(),
                    });
                }
                valueMap.get(seg.segmentId)!.models.set(model.modelId, seg.avgCoverageExtent);
            }
        }

        return Array.from(valueMap.entries()).map(([segId, data]) => {
            let bestModel = '';
            let bestScore = -1;
            let totalScore = 0;
            let count = 0;
            for (const [modelId, score] of data.models) {
                totalScore += score;
                count++;
                if (score > bestScore) {
                    bestScore = score;
                    bestModel = modelId;
                }
            }
            return {
                segmentId: segId,
                label: data.label,
                bestModel,
                bestScore,
                avgScore: count > 0 ? totalScore / count : 0,
                modelCount: count,
            };
        });
    }, [modelResults, activeType]);

    const sortedData = useMemo(() => sortedBy(segmentData, sort.key, sort.direction, (item, key) => {
        switch (key as SegmentSortKey) {
            case 'label': return item.label;
            case 'bestModel': return formatModelName(item.bestModel);
            case 'bestScore': return item.bestScore;
            case 'avgScore': return item.avgScore;
            default: return 0;
        }
    }), [segmentData, sort]);

    if (segmentTypes.length === 0) return null;

    return (
        <section>
            <div className="text-center mb-6">
                <h3 className="text-xl font-semibold tracking-tight">Segment Explorer</h3>
                <p className="text-muted-foreground text-sm mt-1">
                    How do models perform for specific demographic segments?
                </p>
            </div>

            {/* Segment type tabs */}
            <div className="flex flex-wrap justify-center gap-2 mb-6">
                {segmentTypes.map(type => (
                    <button
                        key={type}
                        onClick={() => setActiveType(type)}
                        className={`px-3 py-1.5 text-sm rounded-full border transition-colors ${
                            activeType === type
                                ? 'bg-primary text-primary-foreground border-primary'
                                : 'bg-card border-border text-muted-foreground hover:text-foreground hover:border-foreground/30'
                        }`}
                    >
                        {SEGMENT_TYPE_LABELS[type] || type}
                    </button>
                ))}
            </div>

            {/* Per-segment-value table */}
            <div className="bg-card border border-border/50 rounded-lg overflow-hidden">
                <table className="w-full">
                    <thead>
                        <tr className="border-b border-border/50 bg-muted/30">
                            <SortableHeader label={SEGMENT_TYPE_LABELS[activeType] || activeType} sortKey="label" current={sort} onSort={toggleSort} />
                            <SortableHeader label="Best Model" sortKey="bestModel" current={sort} onSort={toggleSort} />
                            <SortableHeader label="Best Score" sortKey="bestScore" current={sort} onSort={toggleSort} className="w-1/4" />
                            <SortableHeader label="Avg Score" sortKey="avgScore" current={sort} onSort={toggleSort} align="right" />
                        </tr>
                    </thead>
                    <tbody>
                        {sortedData.map((row) => (
                            <tr key={row.segmentId} className="border-b border-border/30 last:border-0 hover:bg-muted/20 transition-colors">
                                <td className="px-4 py-3 text-sm font-medium text-foreground">
                                    {row.label}
                                </td>
                                <td className="px-4 py-3 text-sm text-muted-foreground truncate max-w-[200px]">
                                    {formatModelName(row.bestModel)}
                                </td>
                                <td className="px-4 py-3">
                                    <ScoreBar score={row.bestScore} />
                                </td>
                                <td className="px-4 py-3 text-right text-sm text-muted-foreground">
                                    {(row.avgScore * 100).toFixed(1)}%
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {sortedData.length === 0 && (
                    <p className="text-center text-muted-foreground py-6 text-sm">
                        No data available for this segment type.
                    </p>
                )}
            </div>
        </section>
    );
}

// --- Context Responsiveness ---

/** Gradient bar showing where a model falls on the prior-reliant <-> context-responsive spectrum */
function ResponsivenessBar({ slope, maxSlope }: { slope: number; maxSlope: number }) {
    const range = Math.max(maxSlope, 0.01);
    const normalized = Math.max(2, Math.min(98, 50 + (slope / range) * 45));

    return (
        <div className="flex items-center gap-2 w-full">
            <div className="flex-1 relative bg-muted rounded-full h-3 overflow-hidden">
                <div
                    className="absolute inset-0 rounded-full"
                    style={{
                        background: 'linear-gradient(to right, #6366f1, #a5b4fc, #e2e8f0, #fbbf24, #f97316)',
                    }}
                />
                <div
                    className="absolute top-0.5 w-2 h-2 rounded-full bg-foreground border border-background shadow-sm"
                    style={{ left: `calc(${normalized}% - 4px)` }}
                />
            </div>
            <span className="text-xs text-muted-foreground w-16 text-right font-mono">
                {slope >= 0 ? '+' : ''}{(slope * 100).toFixed(2)}
            </span>
        </div>
    );
}

type ContextSortKey = 'model' | 'slope';

/** Context Responsiveness section: shows how models respond to increasing context */
function ContextResponsivenessSection({ data }: { data: ContextResponsivenessData }) {
    const models = data.models;
    if (!models || models.length === 0) return null;

    const [sort, toggleSort] = useSort<ContextSortKey>('slope');

    const maxAbsSlope = Math.max(...models.map(m => Math.abs(m.slope)), 0.001);
    const levelsLabel = data.contextLevelsFound
        .map(l => l === 0 ? '0 (baseline)' : String(l))
        .join(', ');

    const sorted = useMemo(() => sortedBy(models, sort.key, sort.direction, (item, key) => {
        switch (key as ContextSortKey) {
            case 'model': return formatModelName(item.modelId);
            case 'slope': return item.slope;
            default: return 0;
        }
    }), [models, sort]);

    return (
        <section>
            <div className="text-center mb-6">
                <h3 className="text-xl font-semibold tracking-tight">Context Responsiveness</h3>
                <p className="text-muted-foreground text-sm mt-1">
                    How much does prediction accuracy change as models receive more context?
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                    Based on evaluations at {levelsLabel} context questions
                </p>
            </div>

            {/* Spectrum legend */}
            <div className="flex justify-between items-center text-xs text-muted-foreground mb-4 px-2">
                <span className="flex items-center gap-1">
                    <span className="inline-block w-3 h-3 rounded-full" style={{ background: '#6366f1' }} />
                    Prior-reliant
                </span>
                <span className="flex items-center gap-1">
                    Context-responsive
                    <span className="inline-block w-3 h-3 rounded-full" style={{ background: '#f97316' }} />
                </span>
            </div>

            <div className="bg-card border border-border/50 rounded-lg overflow-hidden">
                <table className="w-full">
                    <thead>
                        <tr className="border-b border-border/50 bg-muted/30">
                            <SortableHeader label="Model" sortKey="model" current={sort} onSort={toggleSort} />
                            <SortableHeader label="Responsiveness" sortKey="slope" current={sort} onSort={toggleSort} className="w-1/2" />
                        </tr>
                    </thead>
                    <tbody>
                        {sorted.map((model) => (
                            <tr key={model.modelId} className="border-b border-border/30 last:border-0 hover:bg-muted/20 transition-colors">
                                <td className="px-4 py-3 text-sm font-medium text-foreground truncate max-w-[250px]">
                                    {formatModelName(model.modelId)}
                                </td>
                                <td className="px-4 py-3">
                                    <ResponsivenessBar slope={model.slope} maxSlope={maxAbsSlope} />
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <p className="text-xs text-muted-foreground mt-3 text-center">
                Score = slope of accuracy vs. context count. Positive = improves with more context.
            </p>
        </section>
    );
}

// --- Fairness Analysis ---

/** Two-tone gap bar: green portion for worst score, amber for the gap */
function GapBar({ worst, best }: { worst: number; best: number }) {
    const worstPct = Math.min(100, worst * 100);
    const gapPct = Math.min(100 - worstPct, (best - worst) * 100);
    return (
        <div className="flex items-center gap-2 w-full">
            <div className="flex-1 bg-muted rounded-full h-2.5 overflow-hidden flex">
                <div className="h-full bg-green-500/70 rounded-l-full" style={{ width: `${worstPct}%` }} />
                <div className="h-full bg-amber-500/70" style={{ width: `${gapPct}%` }} />
            </div>
            <span className="text-xs text-muted-foreground w-14 text-right font-mono tabular-nums">
                {((best - worst) * 100).toFixed(1)}%
            </span>
        </div>
    );
}

/** Expandable drill-down: all segments in a category for a model */
function FairnessDrillDown({ modelResult, categoryPrefix }: { modelResult: ModelResult; categoryPrefix: string }) {
    const segments = useMemo(() => {
        return (modelResult.segmentScores || [])
            .filter(s => getSegmentPrefix(s.segmentId) === categoryPrefix)
            .sort((a, b) => b.avgCoverageExtent - a.avgCoverageExtent);
    }, [modelResult, categoryPrefix]);

    if (segments.length === 0) return null;

    return (
        <div className="px-6 py-3 bg-muted/10">
            <p className="text-xs text-muted-foreground mb-2">
                All {getCategoryLabel(categoryPrefix)} segments for {formatModelName(modelResult.modelId)}:
            </p>
            <ul className="space-y-1.5">
                {segments.map(seg => (
                    <li key={seg.segmentId} className="flex items-center gap-3 text-sm">
                        <span className="w-28 truncate text-foreground">{getSegmentValueLabel(seg.segmentLabel)}</span>
                        <div className="flex-1">
                            <ScoreBar score={seg.avgCoverageExtent} />
                        </div>
                    </li>
                ))}
            </ul>
        </div>
    );
}

type FairnessSortKey = 'model' | 'category' | 'gap' | 'bestScore' | 'worstScore';

/** Sorted table of model x category disparity rows */
function FairnessAnalysisTable({
    disparities,
    modelResults,
    expandedRow,
    onToggleRow,
    showAll,
    onToggleShowAll,
}: {
    disparities: Array<{
        modelId: string;
        category?: string;
        categoryLabel?: string;
        segmentCount?: number;
        absoluteGap: number;
        bestSegment: { id: string; label: string; score: number };
        worstSegment: { id: string; label: string; score: number };
    }>;
    modelResults: ModelResult[];
    expandedRow: string | null;
    onToggleRow: (key: string) => void;
    showAll: boolean;
    onToggleShowAll: () => void;
}) {
    const modelResultMap = useMemo(() => new Map(modelResults.map(m => [m.modelId, m])), [modelResults]);
    const [sort, toggleSort] = useSort<FairnessSortKey>('gap');

    // Resolve category for old-format entries that lack it (fallback: extract from segment ID)
    const rows = useMemo(() => disparities.map(d => {
        const cat = d.category || getSegmentPrefix(d.bestSegment.id);
        return {
            ...d,
            category: cat,
            categoryLabel: d.categoryLabel || getCategoryLabel(cat),
            rowKey: `${d.modelId}::${cat}`,
        };
    }), [disparities]);

    const sortedRows = useMemo(() => sortedBy(rows, sort.key, sort.direction, (item, key) => {
        switch (key as FairnessSortKey) {
            case 'model': return formatModelName(item.modelId);
            case 'category': return item.categoryLabel;
            case 'gap': return item.absoluteGap;
            case 'bestScore': return item.bestSegment.score;
            case 'worstScore': return item.worstSegment.score;
            default: return 0;
        }
    }), [rows, sort]);

    const displayed = showAll ? sortedRows : sortedRows.slice(0, 10);

    return (
        <section>
            <div className="text-center mb-6">
                <h3 className="text-xl font-semibold tracking-tight">Fairness Analysis</h3>
                <p className="text-muted-foreground text-sm mt-1 max-w-2xl mx-auto">
                    Within-category accuracy gaps ranked by severity. &ldquo;Accuracy&rdquo; is the average coverage
                    extent score from the LLM evaluator across all evaluation runs for that demographic segment.
                </p>
            </div>

            <div className="bg-card border border-border/50 rounded-lg overflow-hidden">
                <table className="w-full">
                    <thead>
                        <tr className="border-b border-border/50 bg-muted/30">
                            <SortableHeader label="Model" sortKey="model" current={sort} onSort={toggleSort} />
                            <SortableHeader label="Category" sortKey="category" current={sort} onSort={toggleSort} />
                            <SortableHeader label="Gap" sortKey="gap" current={sort} onSort={toggleSort} className="w-1/4" />
                            <SortableHeader label="Best Segment" sortKey="bestScore" current={sort} onSort={toggleSort} className="hidden sm:table-cell" />
                            <SortableHeader label="Worst Segment" sortKey="worstScore" current={sort} onSort={toggleSort} className="hidden sm:table-cell" />
                            <th className="w-8 px-2"></th>
                        </tr>
                    </thead>
                    <tbody>
                        {displayed.map((d) => {
                            const isExpanded = expandedRow === d.rowKey;
                            const fullModel = modelResultMap.get(d.modelId);
                            return (
                                <Fragment key={d.rowKey}>
                                    <tr
                                        className="border-b border-border/30 last:border-0 hover:bg-muted/20 transition-colors cursor-pointer"
                                        onClick={() => onToggleRow(d.rowKey)}
                                    >
                                        <td className="px-4 py-3 text-sm font-medium text-foreground truncate max-w-[200px]">
                                            {formatModelName(d.modelId)}
                                        </td>
                                        <td className="px-4 py-3">
                                            <CategoryBadge label={d.categoryLabel} />
                                        </td>
                                        <td className="px-4 py-3">
                                            <GapBar worst={d.worstSegment.score} best={d.bestSegment.score} />
                                        </td>
                                        <td className="px-4 py-3 text-sm text-muted-foreground hidden sm:table-cell">
                                            <span className="text-green-600 dark:text-green-400">{getSegmentValueLabel(d.bestSegment.label)}</span>
                                            <span className="font-mono text-xs ml-1">({(d.bestSegment.score * 100).toFixed(1)}%)</span>
                                        </td>
                                        <td className="px-4 py-3 text-sm text-muted-foreground hidden sm:table-cell">
                                            <span className="text-red-600 dark:text-red-400">{getSegmentValueLabel(d.worstSegment.label)}</span>
                                            <span className="font-mono text-xs ml-1">({(d.worstSegment.score * 100).toFixed(1)}%)</span>
                                        </td>
                                        <td className="px-2 py-3 text-muted-foreground">
                                            <span className={`text-xs transition-transform inline-block ${isExpanded ? 'rotate-180' : ''}`}>▾</span>
                                        </td>
                                    </tr>
                                    {isExpanded && fullModel && (
                                        <tr>
                                            <td colSpan={6} className="p-0 border-b border-border/30 bg-muted/10">
                                                <FairnessDrillDown modelResult={fullModel} categoryPrefix={d.category} />
                                            </td>
                                        </tr>
                                    )}
                                </Fragment>
                            );
                        })}
                    </tbody>
                </table>
                {rows.length === 0 && (
                    <p className="text-center text-muted-foreground py-6 text-sm">
                        No significant within-category disparities detected.
                    </p>
                )}
            </div>
            {sortedRows.length > 10 && (
                <div className="text-center mt-3">
                    <button
                        onClick={onToggleShowAll}
                        className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                        {showAll ? 'Show top 10' : `Show all ${sortedRows.length} entries`}
                    </button>
                </div>
            )}
        </section>
    );
}

/** Colored pill showing category name */
function CategoryBadge({ label }: { label: string }) {
    const colorMap: Record<string, string> = {
        Age: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
        Gender: 'bg-purple-500/10 text-purple-600 dark:text-purple-400',
        Country: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
        Environment: 'bg-teal-500/10 text-teal-600 dark:text-teal-400',
        Religion: 'bg-orange-500/10 text-orange-600 dark:text-orange-400',
        'AI Concern': 'bg-pink-500/10 text-pink-600 dark:text-pink-400',
    };
    const cls = colorMap[label] || 'bg-muted text-muted-foreground';
    return (
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>
            {label}
        </span>
    );
}

// --- Leaderboard ---

type LeaderboardSortKey = 'score' | 'model' | 'consistency' | 'segments';

// --- Main component ---

export default function DemographicLeaderboard() {
    const [data, setData] = useState<DemographicsData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [expandedModel, setExpandedModel] = useState<string | null>(null);
    const [expandedFairnessRow, setExpandedFairnessRow] = useState<string | null>(null);
    const [showAllFairness, setShowAllFairness] = useState(false);
    const [lbSort, toggleLbSort] = useSort<LeaderboardSortKey>('score');

    useEffect(() => {
        async function fetchData() {
            try {
                const response = await fetch('/api/demographics');
                if (!response.ok) throw new Error('Failed to fetch');
                const json = await response.json();
                setData(json);
            } catch (e: any) {
                setError(e.message);
            } finally {
                setLoading(false);
            }
        }
        fetchData();
    }, []);

    if (loading) {
        return (
            <div className="flex items-center justify-center py-16">
                <div className="animate-pulse text-muted-foreground">Loading demographic data...</div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="text-center py-16">
                <p className="text-red-500">Error loading demographics: {error}</p>
            </div>
        );
    }

    // Empty state
    if (!data || data.status === 'no_data') {
        return (
            <div className="text-center py-16 space-y-4">
                <div className="text-4xl">📊</div>
                <h3 className="text-lg font-medium text-foreground">No Demographic Data Yet</h3>
                <p className="text-muted-foreground max-w-md mx-auto">
                    {data?.message || 'Run demographic evaluations to see how AI models predict survey response distributions across different demographic groups.'}
                </p>
                <div className="mt-6 p-4 bg-muted/50 rounded-lg max-w-lg mx-auto text-left text-sm text-muted-foreground">
                    <p className="font-medium text-foreground mb-2">Getting started:</p>
                    <ol className="list-decimal list-inside space-y-1">
                        <li>Prepare survey data in DTEF format</li>
                        <li>Run <code className="bg-muted px-1 rounded">pnpm cli dtef generate -i data.json</code></li>
                        <li>Publish blueprints to dtef-configs</li>
                        <li>Execute evaluations via scheduled functions or CLI</li>
                    </ol>
                </div>
            </div>
        );
    }

    const modelResults = data.aggregation?.modelResults || [];
    const models = data.topModels || modelResults;
    const fairnessConcerns = data.fairnessConcerns || [];
    const disparities = data.aggregation?.disparities || [];

    // Create a lookup for full model data (for expandable rows)
    const modelResultMap = new Map(modelResults.map(m => [m.modelId, m]));

    // Assign score-based rank, then sort by active column
    const rankedModels = models.map((m, i) => ({ ...m, scoreRank: i + 1 }));
    const sortedModels = [...rankedModels].sort((a, b) => {
        const dir = lbSort.direction === 'desc' ? -1 : 1;
        switch (lbSort.key) {
            case 'score': return dir * (a.overallScore - b.overallScore);
            case 'model': {
                const na = formatModelName(a.modelId).toLowerCase();
                const nb = formatModelName(b.modelId).toLowerCase();
                return -dir * na.localeCompare(nb);
            }
            case 'consistency': {
                const fa = modelResultMap.get(a.modelId);
                const fb = modelResultMap.get(b.modelId);
                return dir * ((fa?.segmentStdDev ?? 1) - (fb?.segmentStdDev ?? 1));
            }
            case 'segments': return dir * (a.segmentCount - b.segmentCount);
            default: return 0;
        }
    });

    return (
        <div className="space-y-10">
            {/* Leaderboard Table */}
            <section>
                <div className="text-center mb-6">
                    <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight">
                        Demographic Prediction Accuracy
                    </h2>
                    <p className="text-muted-foreground text-sm mt-1">
                        How well do AI models predict survey response distributions across demographic groups?
                    </p>
                    {data.resultCount && (
                        <p className="text-xs text-muted-foreground mt-1">
                            Based on {data.resultCount} evaluation{data.resultCount !== 1 ? 's' : ''}
                            {data.generatedAt && ` · Updated ${new Date(data.generatedAt).toLocaleDateString()}`}
                        </p>
                    )}
                </div>

                {sortedModels.length > 0 ? (
                    <div className="bg-card border border-border/50 rounded-lg overflow-hidden">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-border/50 bg-muted/30">
                                    <SortableHeader label="Rank" sortKey="score" current={lbSort} onSort={toggleLbSort} className="w-12" />
                                    <SortableHeader label="Model" sortKey="model" current={lbSort} onSort={toggleLbSort} />
                                    <SortableHeader label="Score" sortKey="score" current={lbSort} onSort={toggleLbSort} className="w-1/4" />
                                    <SortableHeader label="Consistency" sortKey="consistency" current={lbSort} onSort={toggleLbSort} align="right" />
                                    <SortableHeader label="Segments" sortKey="segments" current={lbSort} onSort={toggleLbSort} align="right" />
                                </tr>
                            </thead>
                            <tbody>
                                {sortedModels.map((model) => {
                                    const fullData = modelResultMap.get(model.modelId);
                                    const isExpanded = expandedModel === model.modelId;
                                    const hasDetails = fullData && fullData.segmentScores?.length > 0;

                                    return (
                                        <Fragment key={model.modelId}>
                                            <tr
                                                className={`border-b border-border/30 last:border-0 hover:bg-muted/20 transition-colors ${hasDetails ? 'cursor-pointer' : ''}`}
                                                onClick={() => hasDetails && setExpandedModel(isExpanded ? null : model.modelId)}
                                            >
                                                <td className="px-4 py-3 text-sm">
                                                    <RankBadge rank={model.scoreRank} />
                                                </td>
                                                <td className="px-4 py-3">
                                                    <div className="flex items-center gap-2 min-w-0">
                                                        <span className="text-sm font-medium text-foreground truncate">
                                                            {formatModelName(model.modelId)}
                                                        </span>
                                                        {hasDetails && (
                                                            <span className={`text-muted-foreground text-xs transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
                                                                ▾
                                                            </span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <ScoreBar score={model.overallScore} />
                                                </td>
                                                <td className="px-4 py-3 text-right text-sm text-muted-foreground tabular-nums">
                                                    {fullData ? `±${(fullData.segmentStdDev * 100).toFixed(1)}%` : '—'}
                                                </td>
                                                <td className="px-4 py-3 text-right text-sm text-muted-foreground">
                                                    {model.segmentCount}
                                                </td>
                                            </tr>
                                            {isExpanded && fullData && (
                                                <tr>
                                                    <td colSpan={5} className="p-0 border-b border-border/30 bg-muted/10">
                                                        <ModelSegmentBreakdown model={fullData} />
                                                    </td>
                                                </tr>
                                            )}
                                        </Fragment>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <p className="text-center text-muted-foreground py-8">No model results available.</p>
                )}
            </section>

            {/* Segment Explorer */}
            {modelResults.length > 0 && (
                <SegmentExplorer modelResults={modelResults} />
            )}

            {/* Context Responsiveness */}
            {data.contextResponsiveness && data.contextResponsiveness.models.length > 0 && (
                <ContextResponsivenessSection data={data.contextResponsiveness} />
            )}

            {/* Fairness Analysis — sorted table with expandable drill-down */}
            {disparities.length > 0 && (
                <FairnessAnalysisTable
                    disparities={disparities}
                    modelResults={modelResults}
                    expandedRow={expandedFairnessRow}
                    onToggleRow={(key) => setExpandedFairnessRow(expandedFairnessRow === key ? null : key)}
                    showAll={showAllFairness}
                    onToggleShowAll={() => setShowAllFairness(!showAllFairness)}
                />
            )}
        </div>
    );
}
