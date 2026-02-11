'use client';

import { useState, useEffect, useMemo } from 'react';
import { getModelDisplayLabel } from '@/app/utils/modelIdUtils';

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
            absoluteGap: number;
            bestSegment: { id: string; label: string; score: number };
            worstSegment: { id: string; label: string; score: number };
        }>;
    };
}

// Segment type prefix → human-readable label
const SEGMENT_TYPE_LABELS: Record<string, string> = {
    // Human-readable prefixes (from DTEF pipeline)
    'ageGroup': 'Age',
    'gender': 'Gender',
    'environment': 'Environment',
    'aiConcern': 'AI Concern',
    'religion': 'Religion',
    'country': 'Country',
    // Legacy O-column prefixes (from raw GD CSVs)
    'O2': 'Age',
    'O3': 'Gender',
    'O4': 'Environment',
    'O5': 'AI Concern',
    'O6': 'Religion',
    'O7': 'Country',
};

function getSegmentPrefix(segmentId: string): string {
    return segmentId?.split(':')[0] || segmentId?.substring(0, 2) || '';
}

function getSegmentValueLabel(segmentLabel: string): string {
    // Labels like "O2:18-29" → "18-29", "O7:USA" → "USA"
    const colonIdx = segmentLabel.indexOf(':');
    return colonIdx !== -1 ? segmentLabel.substring(colonIdx + 1) : segmentLabel;
}

function formatModelName(modelId: string): string {
    return getModelDisplayLabel(modelId, {
        hideProvider: true,
        hideModelMaker: true,
        prettifyModelName: true,
    });
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

    // Build a table: rows = segment values, cols = models, cells = scores
    const segmentData = useMemo(() => {
        // Collect all segment values for this type and all model scores
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

        // For each segment value, find the top model and average score
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
        }).sort((a, b) => b.bestScore - a.bestScore);
    }, [modelResults, activeType]);

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
                            <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                {SEGMENT_TYPE_LABELS[activeType] || activeType}
                            </th>
                            <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                Best Model
                            </th>
                            <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider w-1/4">
                                Best Score
                            </th>
                            <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                Avg Score
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {segmentData.map((row) => (
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
                {segmentData.length === 0 && (
                    <p className="text-center text-muted-foreground py-6 text-sm">
                        No data available for this segment type.
                    </p>
                )}
            </div>
        </section>
    );
}

/** Gradient bar showing where a model falls on the prior-reliant ↔ context-responsive spectrum */
function ResponsivenessBar({ slope, maxSlope }: { slope: number; maxSlope: number }) {
    // Normalize slope to 0-100 range. Slope can be negative (gets worse with context).
    // Center 0 at 50%, positive slopes go right, negative go left.
    // Use a minimum range of 0.01 to avoid exaggerating trivially small differences.
    const range = Math.max(maxSlope, 0.01);
    const normalized = Math.max(2, Math.min(98, 50 + (slope / range) * 45));

    return (
        <div className="flex items-center gap-2 w-full">
            <div className="flex-1 relative bg-muted rounded-full h-3 overflow-hidden">
                {/* Gradient background */}
                <div
                    className="absolute inset-0 rounded-full"
                    style={{
                        background: 'linear-gradient(to right, #6366f1, #a5b4fc, #e2e8f0, #fbbf24, #f97316)',
                    }}
                />
                {/* Indicator dot */}
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

/** Context Responsiveness section: shows how models respond to increasing context */
function ContextResponsivenessSection({ data }: { data: ContextResponsivenessData }) {
    const models = data.models;
    if (!models || models.length === 0) return null;

    const maxAbsSlope = Math.max(...models.map(m => Math.abs(m.slope)), 0.001);
    const levelsLabel = data.contextLevelsFound
        .map(l => l === 0 ? '0 (baseline)' : String(l))
        .join(', ');

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
                            <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                Model
                            </th>
                            <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider w-1/2">
                                Responsiveness
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {models.map((model) => (
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

// --- Main component ---

export default function DemographicLeaderboard() {
    const [data, setData] = useState<DemographicsData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [expandedModel, setExpandedModel] = useState<string | null>(null);

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

                {models.length > 0 ? (
                    <div className="bg-card border border-border/50 rounded-lg overflow-hidden">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-border/50 bg-muted/30">
                                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider w-12">Rank</th>
                                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Model</th>
                                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider w-1/4">Score</th>
                                    <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Consistency</th>
                                    <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Segments</th>
                                </tr>
                            </thead>
                            <tbody>
                                {models.map((model, idx) => {
                                    const fullData = modelResultMap.get(model.modelId);
                                    const isExpanded = expandedModel === model.modelId;
                                    const hasDetails = fullData && fullData.segmentScores?.length > 0;

                                    return (
                                        <tr key={model.modelId} className="group">
                                            <td colSpan={5} className="p-0">
                                                <div
                                                    className={`grid grid-cols-[3rem_1fr_25%_5rem_4rem] items-center border-b border-border/30 hover:bg-muted/20 transition-colors ${hasDetails ? 'cursor-pointer' : ''}`}
                                                    onClick={() => hasDetails && setExpandedModel(isExpanded ? null : model.modelId)}
                                                >
                                                    <div className="px-4 py-3 text-sm">
                                                        <RankBadge rank={idx + 1} />
                                                    </div>
                                                    <div className="px-4 py-3 flex items-center gap-2 min-w-0">
                                                        <span className="text-sm font-medium text-foreground truncate">
                                                            {formatModelName(model.modelId)}
                                                        </span>
                                                        {hasDetails && (
                                                            <span className={`text-muted-foreground text-xs transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
                                                                ▾
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="px-4 py-3">
                                                        <ScoreBar score={model.overallScore} />
                                                    </div>
                                                    <div className="px-4 py-3 text-right text-sm text-muted-foreground tabular-nums">
                                                        {fullData ? `±${(fullData.segmentStdDev * 100).toFixed(1)}%` : '—'}
                                                    </div>
                                                    <div className="px-4 py-3 text-right text-sm text-muted-foreground">
                                                        {model.segmentCount}
                                                    </div>
                                                </div>
                                                {isExpanded && fullData && (
                                                    <div className="border-b border-border/30 bg-muted/10">
                                                        <ModelSegmentBreakdown model={fullData} />
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
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

            {/* Fairness Analysis */}
            {(fairnessConcerns.length > 0 || disparities.length > 0) && (
                <section>
                    <div className="text-center mb-6">
                        <h3 className="text-xl font-semibold tracking-tight">Fairness Analysis</h3>
                        <p className="text-muted-foreground text-sm mt-1">
                            Models showing significant accuracy gaps between demographic segments
                        </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {disparities.length > 0 ? disparities.map((d) => (
                            <div key={d.modelId} className="bg-card border border-border/50 rounded-lg p-4">
                                <div className="flex justify-between items-start mb-3">
                                    <span className="text-sm font-medium text-foreground">
                                        {formatModelName(d.modelId)}
                                    </span>
                                    <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 font-medium">
                                        {(d.absoluteGap * 100).toFixed(1)}% gap
                                    </span>
                                </div>
                                <div className="space-y-2">
                                    <div className="flex justify-between items-center text-xs">
                                        <span className="text-green-600 dark:text-green-400">
                                            Best: {getSegmentValueLabel(d.bestSegment.label)}
                                        </span>
                                        <span className="font-mono">{(d.bestSegment.score * 100).toFixed(1)}%</span>
                                    </div>
                                    <div className="flex justify-between items-center text-xs">
                                        <span className="text-red-600 dark:text-red-400">
                                            Worst: {getSegmentValueLabel(d.worstSegment.label)}
                                        </span>
                                        <span className="font-mono">{(d.worstSegment.score * 100).toFixed(1)}%</span>
                                    </div>
                                </div>
                            </div>
                        )) : fairnessConcerns.map((d, idx) => (
                            <div key={idx} className="bg-card border border-border/50 rounded-lg p-4">
                                <div className="flex justify-between items-start mb-2">
                                    <span className="text-sm font-medium text-foreground">
                                        {formatModelName(d.modelId)}
                                    </span>
                                    <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 font-medium">
                                        {(d.gap * 100).toFixed(1)}% gap
                                    </span>
                                </div>
                                <div className="text-xs text-muted-foreground space-y-1">
                                    <div>Best: {d.bestSegment}</div>
                                    <div>Worst: {d.worstSegment}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>
            )}
        </div>
    );
}
