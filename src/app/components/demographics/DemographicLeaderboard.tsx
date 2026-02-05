'use client';

import { useState, useEffect } from 'react';

interface LeaderboardEntry {
    modelId: string;
    modelName: string;
    overallScore: number;
    segmentCount: number;
}

interface FairnessConcern {
    modelId: string;
    bestSegment: string;
    worstSegment: string;
    gap: number;
}

interface DemographicsData {
    status?: string;
    message?: string;
    generatedAt?: string;
    surveyId?: string;
    resultCount?: number;
    topModels?: LeaderboardEntry[];
    fairnessConcerns?: FairnessConcern[];
    leaderboard?: LeaderboardEntry[];
    aggregation?: {
        modelResults?: Array<{
            modelId: string;
            overallScore: number;
            segmentCount: number;
            totalPrompts: number;
            segmentStdDev: number;
            bestSegment?: { id: string; label: string; score: number };
            worstSegment?: { id: string; label: string; score: number };
        }>;
        disparities?: Array<{
            modelId: string;
            absoluteGap: number;
            bestSegment: { label: string; score: number };
            worstSegment: { label: string; score: number };
        }>;
    };
}

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

export default function DemographicLeaderboard() {
    const [data, setData] = useState<DemographicsData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

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

    const models = data.topModels || data.aggregation?.modelResults || [];
    const disparities = data.fairnessConcerns || [];

    return (
        <div className="space-y-8">
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
                                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Rank</th>
                                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Model</th>
                                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider w-1/3">Score</th>
                                    <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Segments</th>
                                </tr>
                            </thead>
                            <tbody>
                                {models.map((model, idx) => (
                                    <tr key={model.modelId} className="border-b border-border/30 last:border-0 hover:bg-muted/20 transition-colors">
                                        <td className="px-4 py-3 text-sm">
                                            <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-medium ${
                                                idx === 0 ? 'bg-yellow-500/20 text-yellow-600 dark:text-yellow-400' :
                                                idx === 1 ? 'bg-slate-300/20 text-slate-600 dark:text-slate-400' :
                                                idx === 2 ? 'bg-amber-600/20 text-amber-700 dark:text-amber-400' :
                                                'bg-muted text-muted-foreground'
                                            }`}>
                                                {idx + 1}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className="text-sm font-medium text-foreground">
                                                {('modelName' in model && model.modelName) || model.modelId.replace(/^openrouter:/, '')}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3">
                                            <ScoreBar score={model.overallScore} />
                                        </td>
                                        <td className="px-4 py-3 text-right text-sm text-muted-foreground">
                                            {model.segmentCount}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <p className="text-center text-muted-foreground py-8">No model results available.</p>
                )}
            </section>

            {/* Fairness Analysis */}
            {disparities.length > 0 && (
                <section>
                    <div className="text-center mb-6">
                        <h3 className="text-xl font-semibold tracking-tight">Fairness Analysis</h3>
                        <p className="text-muted-foreground text-sm mt-1">
                            Models showing significant accuracy gaps between demographic segments
                        </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {disparities.map((d, idx) => (
                            <div key={idx} className="bg-card border border-border/50 rounded-lg p-4">
                                <div className="flex justify-between items-start mb-2">
                                    <span className="text-sm font-medium text-foreground">
                                        {d.modelId.replace(/^openrouter:/, '')}
                                    </span>
                                    <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 font-medium">
                                        {(d.gap * 100).toFixed(1)}% gap
                                    </span>
                                </div>
                                <div className="text-xs text-muted-foreground space-y-1">
                                    <div className="flex justify-between">
                                        <span>Best: {d.bestSegment}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span>Worst: {d.worstSegment}</span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>
            )}
        </div>
    );
}
