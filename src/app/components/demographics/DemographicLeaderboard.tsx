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

interface ContextResponsivenessModel {
    modelId: string;
    displayName: string;
    slope: number;
}

interface ContextResponsivenessData {
    models: ContextResponsivenessModel[];
    contextLevelsFound: number[];
}

interface FullContextDataPoint {
    contextCount: number;
    score: number;
    configId?: string;
    runLabel?: string;
    timestamp?: string;
}

interface FullSegmentResponsiveness {
    segmentId: string;
    dataPoints: FullContextDataPoint[];
    slope: number;
}

interface FullModelResponsiveness {
    modelId: string;
    overallSlope: number;
    segmentResponsiveness: FullSegmentResponsiveness[];
}

interface FullContextAnalysis {
    models: FullModelResponsiveness[];
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
    fairnessConcerns?: Array<{
        modelId: string;
        category?: string;
        categoryLabel?: string;
        bestSegment: string;
        worstSegment: string;
        gap: number;
    }>;
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
        contextAnalysis?: FullContextAnalysis;
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

function SortableHeader<K extends string>({
    label, sortKey, current, onSort, align = 'left', className = '', tooltip,
}: {
    label: string; sortKey: K; current: SortConfig<K>; onSort: (key: K) => void;
    align?: 'left' | 'right'; className?: string; tooltip?: string;
}) {
    const isActive = current.key === sortKey;
    return (
        <th
            className={`px-4 py-3 text-xs font-medium uppercase tracking-wider select-none cursor-pointer group transition-colors hover:text-foreground ${
                align === 'right' ? 'text-right' : 'text-left'
            } ${isActive ? 'text-foreground' : 'text-muted-foreground'} ${className}`}
            onClick={() => onSort(sortKey)}
            title={tooltip}
        >
            <span className="inline-flex items-center gap-1">
                {align === 'right' && <SortIndicator active={isActive} direction={current.direction} />}
                {label}
                {tooltip && <span className="text-muted-foreground/50 text-[10px] not-italic">ⓘ</span>}
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

// --- Shared UI Components ---

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

/** Reusable segment category tab buttons */
function SegmentCategoryTabs({
    segmentTypes,
    activeType,
    onSelect,
    allLabel = 'Overall',
    includeAll = true,
}: {
    segmentTypes: string[];
    activeType: string;
    onSelect: (type: string) => void;
    allLabel?: string;
    includeAll?: boolean;
}) {
    const buttonClass = (isActive: boolean) =>
        `px-3 py-1.5 text-sm rounded-full border transition-colors ${
            isActive
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-card border-border text-muted-foreground hover:text-foreground hover:border-foreground/30'
        }`;

    return (
        <div className="flex flex-wrap justify-center gap-2 mb-6">
            {includeAll && (
                <button onClick={() => onSelect('all')} className={buttonClass(activeType === 'all')}>
                    {allLabel}
                </button>
            )}
            {segmentTypes.map(type => (
                <button key={type} onClick={() => onSelect(type)} className={buttonClass(activeType === type)}>
                    {SEGMENT_TYPE_LABELS[type] || type}
                </button>
            ))}
        </div>
    );
}

/** Reusable show all / show top N toggle */
function ShowAllToggle({
    totalCount,
    isShowingAll,
    onToggle,
    threshold = 10,
}: {
    totalCount: number;
    isShowingAll: boolean;
    onToggle: () => void;
    threshold?: number;
}) {
    if (totalCount <= threshold) return null;
    return (
        <div className="text-center mt-3">
            <button
                onClick={onToggle}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
                {isShowingAll ? `Show top ${threshold}` : `Show all ${totalCount}`}
            </button>
        </div>
    );
}

// --- Leaderboard Sub-components ---

/** Expandable segment breakdown for a single model */
function ModelSegmentBreakdown({ model, filterCategory }: { model: ModelResult; filterCategory?: string }) {
    const grouped = useMemo(() => {
        const groups = new Map<string, SegmentScore[]>();
        for (const seg of model.segmentScores || []) {
            const prefix = getSegmentPrefix(seg.segmentId);
            if (!SEGMENT_TYPE_LABELS[prefix]) continue;
            if (filterCategory && prefix !== filterCategory) continue;
            if (!groups.has(prefix)) groups.set(prefix, []);
            groups.get(prefix)!.push(seg);
        }
        for (const scores of groups.values()) {
            scores.sort((a, b) => b.avgCoverageExtent - a.avgCoverageExtent);
        }
        return groups;
    }, [model.segmentScores, filterCategory]);

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

function SegmentModelDrillDown({ segmentId, modelResults }: {
    segmentId: string;
    modelResults: ModelResult[];
}) {
    const modelScores = useMemo(() => {
        const scores: Array<{ modelId: string; score: number }> = [];
        for (const model of modelResults) {
            for (const seg of model.segmentScores || []) {
                if (seg.segmentId === segmentId) {
                    scores.push({ modelId: model.modelId, score: seg.avgCoverageExtent });
                    break;
                }
            }
        }
        return scores.sort((a, b) => b.score - a.score);
    }, [segmentId, modelResults]);

    if (modelScores.length === 0) return null;

    return (
        <div className="px-6 py-3 bg-muted/10">
            <p className="text-xs text-muted-foreground mb-2">
                All model scores for this segment (sorted by score):
            </p>
            <ul className="space-y-1.5">
                {modelScores.map((ms, i) => (
                    <li key={ms.modelId} className="flex items-center gap-3 text-sm">
                        <span className="w-6 text-xs text-muted-foreground text-right flex-shrink-0">{i + 1}.</span>
                        <span className="w-36 truncate text-foreground">{formatModelName(ms.modelId)}</span>
                        <div className="flex-1">
                            <ScoreBar score={ms.score} />
                        </div>
                    </li>
                ))}
            </ul>
        </div>
    );
}

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
    const [expandedSegment, setExpandedSegment] = useState<string | null>(null);
    const [showAll, setShowAll] = useState(false);

    const segmentData = useMemo(() => {
        const valueMap = new Map<string, { label: string; models: Map<string, number> }>();
        for (const model of modelResults) {
            for (const seg of model.segmentScores || []) {
                if (getSegmentPrefix(seg.segmentId) !== activeType) continue;
                if (!valueMap.has(seg.segmentId)) {
                    valueMap.set(seg.segmentId, { label: getSegmentValueLabel(seg.segmentLabel), models: new Map() });
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
                if (score > bestScore) { bestScore = score; bestModel = modelId; }
            }
            return { segmentId: segId, label: data.label, bestModel, bestScore, avgScore: count > 0 ? totalScore / count : 0, modelCount: count };
        });
    }, [modelResults, activeType]);

    useEffect(() => { setExpandedSegment(null); setShowAll(false); }, [activeType]);

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

    const displayed = showAll ? sortedData : sortedData.slice(0, 10);

    return (
        <section>
            <div className="text-center mb-6">
                <h3 className="text-xl font-semibold tracking-tight">Segment Explorer</h3>
                <p className="text-muted-foreground text-sm mt-1">
                    How do models perform for specific demographic segments?
                </p>
            </div>

            <SegmentCategoryTabs
                segmentTypes={segmentTypes}
                activeType={activeType}
                onSelect={setActiveType}
                includeAll={false}
            />

            <div className="bg-card border border-border/50 rounded-lg overflow-hidden">
                <table className="w-full">
                    <thead>
                        <tr className="border-b border-border/50 bg-muted/30">
                            <SortableHeader label={SEGMENT_TYPE_LABELS[activeType] || activeType}
                                sortKey="label" current={sort} onSort={toggleSort}
                                tooltip="Demographic segment value within the selected category" />
                            <SortableHeader label="Best Model"
                                sortKey="bestModel" current={sort} onSort={toggleSort}
                                tooltip="Model with the highest average score for this segment" />
                            <SortableHeader label="Best Score"
                                sortKey="bestScore" current={sort} onSort={toggleSort} className="w-1/4"
                                tooltip="Highest average score achieved by any single model" />
                            <SortableHeader label="Avg Score"
                                sortKey="avgScore" current={sort} onSort={toggleSort} align="right"
                                tooltip="Mean score across all models for this segment" />
                        </tr>
                    </thead>
                    <tbody>
                        {displayed.map((row) => {
                            const isExpanded = expandedSegment === row.segmentId;
                            return (
                                <Fragment key={row.segmentId}>
                                    <tr
                                        className="border-b border-border/30 last:border-0 hover:bg-muted/20 transition-colors cursor-pointer"
                                        onClick={() => setExpandedSegment(isExpanded ? null : row.segmentId)}
                                    >
                                        <td className="px-4 py-3 text-sm font-medium text-foreground">
                                            <span className="inline-flex items-center gap-2">
                                                {row.label}
                                                <span className={`text-muted-foreground text-xs transition-transform ${isExpanded ? 'rotate-180' : ''}`}>▾</span>
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-sm text-muted-foreground truncate max-w-[200px]">
                                            {formatModelName(row.bestModel)}
                                        </td>
                                        <td className="px-4 py-3"><ScoreBar score={row.bestScore} /></td>
                                        <td className="px-4 py-3 text-right text-sm text-muted-foreground">
                                            {(row.avgScore * 100).toFixed(1)}%
                                        </td>
                                    </tr>
                                    {isExpanded && (
                                        <tr>
                                            <td colSpan={4} className="p-0 border-b border-border/30 bg-muted/10">
                                                <SegmentModelDrillDown segmentId={row.segmentId} modelResults={modelResults} />
                                            </td>
                                        </tr>
                                    )}
                                </Fragment>
                            );
                        })}
                    </tbody>
                </table>
                {sortedData.length === 0 && (
                    <p className="text-center text-muted-foreground py-6 text-sm">No data available for this segment type.</p>
                )}
            </div>
            <ShowAllToggle totalCount={sortedData.length} isShowingAll={showAll} onToggle={() => setShowAll(!showAll)} />
            <p className="text-xs text-muted-foreground mt-3 text-center">
                Click a row to see all model scores for that segment.
            </p>
        </section>
    );
}

// --- Context Responsiveness ---

function ResponsivenessBar({ slope, maxSlope }: { slope: number; maxSlope: number }) {
    const range = Math.max(maxSlope, 0.01);
    const normalized = Math.max(2, Math.min(98, 50 + (slope / range) * 45));
    return (
        <div className="flex items-center gap-2 w-full">
            <div className="flex-1 relative bg-muted rounded-full h-3 overflow-hidden">
                <div
                    className="absolute inset-0 rounded-full"
                    style={{ background: 'linear-gradient(to right, #6366f1, #a5b4fc, #e2e8f0, #fbbf24, #f97316)' }}
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

/** Drill-down showing all models ranked by responsiveness */
function ContextRankingDrillDown({ models, maxSlope }: {
    models: Array<{ modelId: string; slope: number }>;
    maxSlope: number;
}) {
    return (
        <div className="px-6 py-3">
            <p className="text-xs text-muted-foreground mb-2">All models ranked by responsiveness:</p>
            <ul className="space-y-1.5">
                {models.map((m, i) => (
                    <li key={m.modelId} className="flex items-center gap-3 text-sm">
                        <span className="w-6 text-xs text-muted-foreground text-right flex-shrink-0">{i + 1}.</span>
                        <span className="w-36 truncate text-foreground">{formatModelName(m.modelId)}</span>
                        <div className="flex-1">
                            <ResponsivenessBar slope={m.slope} maxSlope={maxSlope} />
                        </div>
                    </li>
                ))}
            </ul>
        </div>
    );
}

type ContextSortKey = 'label' | 'bestModel' | 'slope';

interface ContextRow {
    key: string;
    label: string;
    bestModel: string;
    bestSlope: number;
    allModels: Array<{ modelId: string; slope: number }>;
}

function ContextResponsivenessSection({
    data,
    contextAnalysis,
}: {
    data: ContextResponsivenessData;
    contextAnalysis?: FullContextAnalysis;
}) {
    const models = data.models;
    if (!models || models.length === 0) return null;

    const [activeCategory, setActiveCategory] = useState('all');
    const [sort, toggleSort] = useSort<ContextSortKey>('slope');
    const [expandedRow, setExpandedRow] = useState<string | null>(null);
    const [showAll, setShowAll] = useState(false);

    const hasSegmentData = !!(contextAnalysis?.models?.some(m => m.segmentResponsiveness?.length > 0));

    const segmentTypes = useMemo(() => {
        if (!contextAnalysis) return [];
        const types = new Set<string>();
        for (const model of contextAnalysis.models) {
            for (const seg of model.segmentResponsiveness || []) {
                const prefix = getSegmentPrefix(seg.segmentId);
                if (SEGMENT_TYPE_LABELS[prefix]) types.add(prefix);
            }
        }
        return Array.from(types).sort();
    }, [contextAnalysis]);

    const maxAbsSlope = useMemo(() => {
        let max = 0.001;
        if (contextAnalysis) {
            for (const model of contextAnalysis.models) {
                max = Math.max(max, Math.abs(model.overallSlope));
                for (const seg of model.segmentResponsiveness || []) {
                    max = Math.max(max, Math.abs(seg.slope));
                }
            }
        } else {
            for (const m of models) max = Math.max(max, Math.abs(m.slope));
        }
        return max;
    }, [contextAnalysis, models]);

    // "All" view: rows = categories, showing most responsive model per category
    const categoryRows = useMemo((): ContextRow[] => {
        if (!contextAnalysis || activeCategory !== 'all') return [];
        return segmentTypes.map(type => {
            const modelSlopes: Array<{ modelId: string; slope: number }> = [];
            for (const model of contextAnalysis.models) {
                const catSegs = model.segmentResponsiveness.filter(s => getSegmentPrefix(s.segmentId) === type);
                if (catSegs.length === 0) continue;
                const avg = catSegs.reduce((sum, s) => sum + s.slope, 0) / catSegs.length;
                modelSlopes.push({ modelId: model.modelId, slope: avg });
            }
            modelSlopes.sort((a, b) => b.slope - a.slope);
            const best = modelSlopes[0];
            return {
                key: type,
                label: SEGMENT_TYPE_LABELS[type] || type,
                bestModel: best?.modelId || '',
                bestSlope: best?.slope || 0,
                allModels: modelSlopes,
            };
        });
    }, [contextAnalysis, activeCategory, segmentTypes]);

    // Per-category view: rows = strata within the selected category
    const strataRows = useMemo((): ContextRow[] => {
        if (!contextAnalysis || activeCategory === 'all') return [];
        const segMap = new Map<string, Array<{ modelId: string; slope: number }>>();
        for (const model of contextAnalysis.models) {
            for (const seg of model.segmentResponsiveness || []) {
                if (getSegmentPrefix(seg.segmentId) !== activeCategory) continue;
                if (!segMap.has(seg.segmentId)) segMap.set(seg.segmentId, []);
                segMap.get(seg.segmentId)!.push({ modelId: model.modelId, slope: seg.slope });
            }
        }
        return Array.from(segMap.entries()).map(([segId, ms]) => {
            ms.sort((a, b) => b.slope - a.slope);
            const best = ms[0];
            return {
                key: segId,
                label: getSegmentValueLabel(segId),
                bestModel: best?.modelId || '',
                bestSlope: best?.slope || 0,
                allModels: ms,
            };
        });
    }, [contextAnalysis, activeCategory]);

    // Simple fallback: rows = models with their overall slopes
    const simpleRows = useMemo(() => {
        if (hasSegmentData) return [];
        return [...models]
            .sort((a, b) => sort.direction === 'desc' ? b.slope - a.slope : a.slope - b.slope)
            .map(m => ({ key: m.modelId, label: formatModelName(m.modelId), slope: m.slope }));
    }, [models, hasSegmentData, sort]);

    useEffect(() => { setExpandedRow(null); setShowAll(false); }, [activeCategory]);

    const activeRows = activeCategory === 'all' ? categoryRows : strataRows;
    const sortedRows = useMemo(() => {
        if (!hasSegmentData) return [];
        return sortedBy(activeRows, sort.key, sort.direction, (item, key) => {
            switch (key as ContextSortKey) {
                case 'label': return item.label;
                case 'bestModel': return formatModelName(item.bestModel);
                case 'slope': return item.bestSlope;
                default: return 0;
            }
        });
    }, [activeRows, sort, hasSegmentData]);

    const levelsLabel = data.contextLevelsFound.map(l => l === 0 ? '0 (baseline)' : String(l)).join(', ');
    const displayedRows = showAll ? sortedRows : sortedRows.slice(0, 10);
    const displayedSimple = showAll ? simpleRows : simpleRows.slice(0, 10);

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

            {hasSegmentData && segmentTypes.length > 0 && (
                <SegmentCategoryTabs
                    segmentTypes={segmentTypes}
                    activeType={activeCategory}
                    onSelect={setActiveCategory}
                    allLabel="All Categories"
                />
            )}

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

            {hasSegmentData ? (
                <>
                    <div className="bg-card border border-border/50 rounded-lg overflow-hidden">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-border/50 bg-muted/30">
                                    <SortableHeader
                                        label={activeCategory === 'all' ? 'Category' : (SEGMENT_TYPE_LABELS[activeCategory] || activeCategory)}
                                        sortKey="label" current={sort} onSort={toggleSort}
                                        tooltip={activeCategory === 'all' ? 'Demographic category' : 'Segment value within the selected category'}
                                    />
                                    <SortableHeader
                                        label="Most Responsive"
                                        sortKey="bestModel" current={sort} onSort={toggleSort}
                                        tooltip="Model with the highest context responsiveness slope"
                                    />
                                    <SortableHeader
                                        label="Slope" sortKey="slope" current={sort} onSort={toggleSort} className="w-1/3"
                                        tooltip="Linear regression slope of accuracy vs. context count. Positive = improves with more context"
                                    />
                                </tr>
                            </thead>
                            <tbody>
                                {displayedRows.map(row => {
                                    const isExpanded = expandedRow === row.key;
                                    return (
                                        <Fragment key={row.key}>
                                            <tr
                                                className="border-b border-border/30 last:border-0 hover:bg-muted/20 transition-colors cursor-pointer"
                                                onClick={() => setExpandedRow(isExpanded ? null : row.key)}
                                            >
                                                <td className="px-4 py-3 text-sm font-medium text-foreground">
                                                    <span className="inline-flex items-center gap-2">
                                                        {activeCategory === 'all' ? <CategoryBadge label={row.label} /> : row.label}
                                                        <span className={`text-muted-foreground text-xs transition-transform ${isExpanded ? 'rotate-180' : ''}`}>▾</span>
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-sm text-muted-foreground truncate max-w-[200px]">
                                                    {formatModelName(row.bestModel)}
                                                </td>
                                                <td className="px-4 py-3">
                                                    <ResponsivenessBar slope={row.bestSlope} maxSlope={maxAbsSlope} />
                                                </td>
                                            </tr>
                                            {isExpanded && (
                                                <tr>
                                                    <td colSpan={3} className="p-0 border-b border-border/30 bg-muted/10">
                                                        <ContextRankingDrillDown models={row.allModels} maxSlope={maxAbsSlope} />
                                                    </td>
                                                </tr>
                                            )}
                                        </Fragment>
                                    );
                                })}
                            </tbody>
                        </table>
                        {displayedRows.length === 0 && (
                            <p className="text-center text-muted-foreground py-6 text-sm">
                                No context responsiveness data available for this category.
                            </p>
                        )}
                    </div>
                    <ShowAllToggle totalCount={sortedRows.length} isShowingAll={showAll} onToggle={() => setShowAll(!showAll)} />
                </>
            ) : (
                <>
                    <div className="bg-card border border-border/50 rounded-lg overflow-hidden">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-border/50 bg-muted/30">
                                    <SortableHeader label="Model" sortKey="label" current={sort} onSort={toggleSort}
                                        tooltip="AI model evaluated" />
                                    <SortableHeader label="Responsiveness" sortKey="slope" current={sort} onSort={toggleSort} className="w-1/2"
                                        tooltip="Slope of accuracy vs. context count. Positive = improves with more context" />
                                </tr>
                            </thead>
                            <tbody>
                                {displayedSimple.map(row => (
                                    <tr key={row.key} className="border-b border-border/30 last:border-0 hover:bg-muted/20 transition-colors">
                                        <td className="px-4 py-3 text-sm font-medium text-foreground truncate max-w-[250px]">
                                            {row.label}
                                        </td>
                                        <td className="px-4 py-3">
                                            <ResponsivenessBar slope={row.slope} maxSlope={maxAbsSlope} />
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <ShowAllToggle totalCount={simpleRows.length} isShowingAll={showAll} onToggle={() => setShowAll(!showAll)} />
                </>
            )}

            <p className="text-xs text-muted-foreground mt-3 text-center">
                Slope = linear regression of accuracy vs. context count. Positive = improves with more context.
                {hasSegmentData && ' Click a row to see all model rankings.'}
            </p>
        </section>
    );
}

// --- Fairness Analysis ---

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
                        <div className="flex-1"><ScoreBar score={seg.avgCoverageExtent} /></div>
                    </li>
                ))}
            </ul>
        </div>
    );
}

type FairnessSortKey = 'model' | 'category' | 'gap' | 'bestScore' | 'worstScore';

function FairnessAnalysisTable({
    disparities,
    modelResults,
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
}) {
    const modelResultMap = useMemo(() => new Map(modelResults.map(m => [m.modelId, m])), [modelResults]);
    const [sort, toggleSort] = useSort<FairnessSortKey>('gap');
    const [expandedRow, setExpandedRow] = useState<string | null>(null);
    const [showAll, setShowAll] = useState(false);
    const [activeCategory, setActiveCategory] = useState('all');

    const rows = useMemo(() => disparities.map(d => {
        const cat = d.category || getSegmentPrefix(d.bestSegment.id);
        return {
            ...d,
            category: cat,
            categoryLabel: d.categoryLabel || getCategoryLabel(cat),
            rowKey: `${d.modelId}::${cat}`,
        };
    }), [disparities]);

    // Get unique categories from the disparities
    const segmentTypes = useMemo(() => {
        const types = new Set<string>();
        for (const row of rows) {
            if (SEGMENT_TYPE_LABELS[row.category]) types.add(row.category);
        }
        return Array.from(types).sort();
    }, [rows]);

    // Filter by active category
    const filteredRows = useMemo(() => {
        if (activeCategory === 'all') return rows;
        return rows.filter(r => r.category === activeCategory);
    }, [rows, activeCategory]);

    const sortedRows = useMemo(() => sortedBy(filteredRows, sort.key, sort.direction, (item, key) => {
        switch (key as FairnessSortKey) {
            case 'model': return formatModelName(item.modelId);
            case 'category': return item.categoryLabel;
            case 'gap': return item.absoluteGap;
            case 'bestScore': return item.bestSegment.score;
            case 'worstScore': return item.worstSegment.score;
            default: return 0;
        }
    }), [filteredRows, sort]);

    useEffect(() => { setExpandedRow(null); setShowAll(false); }, [activeCategory]);

    const displayed = showAll ? sortedRows : sortedRows.slice(0, 10);
    const showCategoryColumn = activeCategory === 'all';

    return (
        <section>
            <div className="text-center mb-6">
                <h3 className="text-xl font-semibold tracking-tight">Fairness Analysis</h3>
                <p className="text-muted-foreground text-sm mt-1 max-w-2xl mx-auto">
                    Within-category accuracy gaps ranked by severity. Comparing fairness between segments
                    in the same demographic category.
                </p>
            </div>

            {segmentTypes.length > 1 && (
                <SegmentCategoryTabs
                    segmentTypes={segmentTypes}
                    activeType={activeCategory}
                    onSelect={setActiveCategory}
                    allLabel="All Categories"
                />
            )}

            <div className="bg-card border border-border/50 rounded-lg overflow-hidden">
                <table className="w-full">
                    <thead>
                        <tr className="border-b border-border/50 bg-muted/30">
                            <SortableHeader label="Model" sortKey="model" current={sort} onSort={toggleSort}
                                tooltip="AI model evaluated" />
                            {showCategoryColumn && (
                                <SortableHeader label="Category" sortKey="category" current={sort} onSort={toggleSort}
                                    tooltip="Demographic category being compared" />
                            )}
                            <SortableHeader label="Gap" sortKey="gap" current={sort} onSort={toggleSort} className="w-1/4"
                                tooltip="Difference between best and worst segment scores. Larger gap = less fair" />
                            <SortableHeader label="Best Segment" sortKey="bestScore" current={sort} onSort={toggleSort} className="hidden sm:table-cell"
                                tooltip="Segment with the highest accuracy" />
                            <SortableHeader label="Worst Segment" sortKey="worstScore" current={sort} onSort={toggleSort} className="hidden sm:table-cell"
                                tooltip="Segment with the lowest accuracy" />
                            <th className="w-8 px-2"></th>
                        </tr>
                    </thead>
                    <tbody>
                        {displayed.map((d) => {
                            const isExpanded = expandedRow === d.rowKey;
                            const fullModel = modelResultMap.get(d.modelId);
                            const colSpan = showCategoryColumn ? 6 : 5;
                            return (
                                <Fragment key={d.rowKey}>
                                    <tr
                                        className="border-b border-border/30 last:border-0 hover:bg-muted/20 transition-colors cursor-pointer"
                                        onClick={() => setExpandedRow(isExpanded ? null : d.rowKey)}
                                    >
                                        <td className="px-4 py-3 text-sm font-medium text-foreground truncate max-w-[200px]">
                                            {formatModelName(d.modelId)}
                                        </td>
                                        {showCategoryColumn && (
                                            <td className="px-4 py-3"><CategoryBadge label={d.categoryLabel} /></td>
                                        )}
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
                                            <td colSpan={colSpan} className="p-0 border-b border-border/30 bg-muted/10">
                                                <FairnessDrillDown modelResult={fullModel} categoryPrefix={d.category} />
                                            </td>
                                        </tr>
                                    )}
                                </Fragment>
                            );
                        })}
                    </tbody>
                </table>
                {filteredRows.length === 0 && (
                    <p className="text-center text-muted-foreground py-6 text-sm">
                        No significant within-category disparities detected.
                    </p>
                )}
            </div>
            <ShowAllToggle totalCount={sortedRows.length} isShowingAll={showAll} onToggle={() => setShowAll(!showAll)} />
            <p className="text-xs text-muted-foreground mt-3 text-center">
                Gap = best segment score minus worst segment score within a demographic category. Click a row to see all segment scores.
            </p>
        </section>
    );
}

// --- Main component ---

type LeaderboardSortKey = 'score' | 'model' | 'consistency' | 'segments';

export default function DemographicLeaderboard() {
    const [data, setData] = useState<DemographicsData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Leaderboard state
    const [expandedModel, setExpandedModel] = useState<string | null>(null);
    const [lbSort, toggleLbSort] = useSort<LeaderboardSortKey>('score');
    const [lbCategory, setLbCategory] = useState('overall');
    const [showAllLeaderboard, setShowAllLeaderboard] = useState(false);

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
    const disparities = data.aggregation?.disparities || [];

    return (
        <div className="space-y-10">
            <LeaderboardSection
                data={data}
                modelResults={modelResults}
                expandedModel={expandedModel}
                setExpandedModel={setExpandedModel}
                lbSort={lbSort}
                toggleLbSort={toggleLbSort}
                lbCategory={lbCategory}
                setLbCategory={setLbCategory}
                showAll={showAllLeaderboard}
                setShowAll={setShowAllLeaderboard}
            />

            {modelResults.length > 0 && <SegmentExplorer modelResults={modelResults} />}

            {data.contextResponsiveness && data.contextResponsiveness.models.length > 0 && (
                <ContextResponsivenessSection
                    data={data.contextResponsiveness}
                    contextAnalysis={data.aggregation?.contextAnalysis}
                />
            )}

            {disparities.length > 0 && (
                <FairnessAnalysisTable disparities={disparities} modelResults={modelResults} />
            )}
        </div>
    );
}

// --- Leaderboard Section ---

function LeaderboardSection({
    data,
    modelResults,
    expandedModel,
    setExpandedModel,
    lbSort,
    toggleLbSort,
    lbCategory,
    setLbCategory,
    showAll,
    setShowAll,
}: {
    data: DemographicsData;
    modelResults: ModelResult[];
    expandedModel: string | null;
    setExpandedModel: (id: string | null) => void;
    lbSort: SortConfig<LeaderboardSortKey>;
    toggleLbSort: (key: LeaderboardSortKey) => void;
    lbCategory: string;
    setLbCategory: (cat: string) => void;
    showAll: boolean;
    setShowAll: (v: boolean) => void;
}) {
    // Derive available segment types from model results
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

    // Reset expanded/showAll when category changes
    useEffect(() => {
        setExpandedModel(null);
        setShowAll(false);
    }, [lbCategory, setExpandedModel, setShowAll]);

    // Compute per-model scores based on active category
    const lbData = useMemo(() => {
        if (lbCategory === 'overall') {
            return modelResults.map(m => ({
                modelId: m.modelId,
                score: m.overallScore,
                segmentCount: m.segmentCount,
                segmentStdDev: m.segmentStdDev,
            }));
        }
        return modelResults
            .map(m => {
                const catScores = (m.segmentScores || []).filter(s => getSegmentPrefix(s.segmentId) === lbCategory);
                if (catScores.length === 0) return null;
                const avg = catScores.reduce((sum, s) => sum + s.avgCoverageExtent, 0) / catScores.length;
                const stdDev = catScores.length > 1
                    ? Math.sqrt(catScores.reduce((sum, s) => sum + (s.avgCoverageExtent - avg) ** 2, 0) / catScores.length)
                    : 0;
                return { modelId: m.modelId, score: avg, segmentCount: catScores.length, segmentStdDev: stdDev };
            })
            .filter((m): m is NonNullable<typeof m> => m !== null);
    }, [modelResults, lbCategory]);

    // Full model data lookup for expandable rows
    const modelResultMap = useMemo(() => new Map(modelResults.map(m => [m.modelId, m])), [modelResults]);

    // Rank by score descending, then apply user sort
    const rankedModels = useMemo(() => {
        const byScore = [...lbData].sort((a, b) => b.score - a.score);
        const ranked = byScore.map((m, i) => ({ ...m, scoreRank: i + 1 }));
        return sortedBy(ranked, lbSort.key, lbSort.direction, (item, key) => {
            switch (key as LeaderboardSortKey) {
                case 'score': return item.score;
                case 'model': return formatModelName(item.modelId);
                case 'consistency': return item.segmentStdDev;
                case 'segments': return item.segmentCount;
                default: return 0;
            }
        });
    }, [lbData, lbSort]);

    const displayedModels = showAll ? rankedModels : rankedModels.slice(0, 10);
    const categoryLabel = lbCategory === 'overall' ? '' : ` (${SEGMENT_TYPE_LABELS[lbCategory] || lbCategory})`;

    return (
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

            {segmentTypes.length > 0 && (
                <SegmentCategoryTabs
                    segmentTypes={segmentTypes}
                    activeType={lbCategory === 'overall' ? 'all' : lbCategory}
                    onSelect={(type) => setLbCategory(type === 'all' ? 'overall' : type)}
                    allLabel="Overall"
                />
            )}

            {displayedModels.length > 0 ? (
                <>
                    <div className="bg-card border border-border/50 rounded-lg overflow-hidden">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-border/50 bg-muted/30">
                                    <SortableHeader label="Rank" sortKey="score" current={lbSort} onSort={toggleLbSort} className="w-12"
                                        tooltip="Position based on score" />
                                    <SortableHeader label="Model" sortKey="model" current={lbSort} onSort={toggleLbSort}
                                        tooltip="AI model evaluated" />
                                    <SortableHeader label={`Score${categoryLabel}`} sortKey="score" current={lbSort} onSort={toggleLbSort} className="w-1/4"
                                        tooltip={lbCategory === 'overall'
                                            ? 'Average coverage extent across all demographic segments'
                                            : `Average coverage extent across ${SEGMENT_TYPE_LABELS[lbCategory]} segments`
                                        } />
                                    <SortableHeader label="Consistency" sortKey="consistency" current={lbSort} onSort={toggleLbSort} align="right"
                                        tooltip="Standard deviation of scores across segments. Lower = more consistent" />
                                    <SortableHeader label="Segments" sortKey="segments" current={lbSort} onSort={toggleLbSort} align="right"
                                        tooltip="Number of demographic segments evaluated" />
                                </tr>
                            </thead>
                            <tbody>
                                {displayedModels.map((model) => {
                                    const fullData = modelResultMap.get(model.modelId);
                                    const isExpanded = expandedModel === model.modelId;
                                    const hasDetails = fullData && fullData.segmentScores?.length > 0;

                                    return (
                                        <Fragment key={model.modelId}>
                                            <tr
                                                className={`border-b border-border/30 last:border-0 hover:bg-muted/20 transition-colors ${hasDetails ? 'cursor-pointer' : ''}`}
                                                onClick={() => hasDetails && setExpandedModel(isExpanded ? null : model.modelId)}
                                            >
                                                <td className="px-4 py-3 text-sm"><RankBadge rank={model.scoreRank} /></td>
                                                <td className="px-4 py-3">
                                                    <div className="flex items-center gap-2 min-w-0">
                                                        <span className="text-sm font-medium text-foreground truncate">
                                                            {formatModelName(model.modelId)}
                                                        </span>
                                                        {hasDetails && (
                                                            <span className={`text-muted-foreground text-xs transition-transform ${isExpanded ? 'rotate-180' : ''}`}>▾</span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3"><ScoreBar score={model.score} /></td>
                                                <td className="px-4 py-3 text-right text-sm text-muted-foreground tabular-nums">
                                                    ±{(model.segmentStdDev * 100).toFixed(1)}%
                                                </td>
                                                <td className="px-4 py-3 text-right text-sm text-muted-foreground">
                                                    {model.segmentCount}
                                                </td>
                                            </tr>
                                            {isExpanded && fullData && (
                                                <tr>
                                                    <td colSpan={5} className="p-0 border-b border-border/30 bg-muted/10">
                                                        <ModelSegmentBreakdown
                                                            model={fullData}
                                                            filterCategory={lbCategory !== 'overall' ? lbCategory : undefined}
                                                        />
                                                    </td>
                                                </tr>
                                            )}
                                        </Fragment>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                    <ShowAllToggle totalCount={rankedModels.length} isShowingAll={showAll} onToggle={() => setShowAll(!showAll)} />
                    <p className="text-xs text-muted-foreground mt-3 text-center">
                        Score = average coverage extent{lbCategory !== 'overall' ? ` across ${SEGMENT_TYPE_LABELS[lbCategory]} segments` : ' across all demographic segments'}.
                        Consistency = standard deviation (lower is better). Click a row to see per-segment breakdown.
                    </p>
                </>
            ) : (
                <p className="text-center text-muted-foreground py-8">No model results available.</p>
            )}
        </section>
    );
}
