'use client';

import React, { useEffect, useState } from 'react';
import type { ExperimentRecord, ExperimentIndex, ExperimentStatus } from '@/types/experiment';

type StatusFilter = 'all' | ExperimentStatus;

const STATUS_COLORS: Record<ExperimentStatus, string> = {
    planned: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
    running: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
    completed: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
    failed: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
};

const CONCLUSION_LABELS: Record<string, { label: string; color: string }> = {
    promoted: { label: 'Promoted', color: 'text-green-600 dark:text-green-400' },
    rejected: { label: 'Rejected', color: 'text-red-600 dark:text-red-400' },
    'needs-more-data': { label: 'Needs More Data', color: 'text-yellow-600 dark:text-yellow-400' },
};

function StatusBadge({ status }: { status: ExperimentStatus }) {
    return (
        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[status]}`}>
            {status.charAt(0).toUpperCase() + status.slice(1)}
        </span>
    );
}

function ScoreBar({ score, label, maxScore = 1.0 }: { score: number; label: string; maxScore?: number }) {
    const pct = Math.min(100, (score / maxScore) * 100);
    return (
        <div className="flex items-center gap-3 text-sm">
            <span className="w-32 text-muted-foreground truncate">{label}</span>
            <div className="flex-1 h-4 bg-muted/30 rounded-full overflow-hidden">
                <div
                    className="h-full bg-primary/70 rounded-full transition-all"
                    style={{ width: `${pct}%` }}
                />
            </div>
            <span className="w-14 text-right font-mono text-xs">{score.toFixed(3)}</span>
        </div>
    );
}

function ExperimentCard({ experiment, expanded, onToggle }: {
    experiment: ExperimentRecord;
    expanded: boolean;
    onToggle: () => void;
}) {
    return (
        <div className="bg-card/60 backdrop-blur-sm rounded-lg ring-1 ring-border/50 overflow-hidden">
            <button
                className="w-full text-left p-5 hover:bg-muted/20 transition-colors"
                onClick={onToggle}
            >
                <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2">
                            <StatusBadge status={experiment.status} />
                            <span className="text-xs text-muted-foreground font-mono">{experiment.id}</span>
                        </div>
                        <h3 className="text-lg font-semibold truncate">{experiment.title}</h3>
                        <p className="text-sm text-muted-foreground line-clamp-2">{experiment.hypothesis}</p>
                    </div>
                    <div className="flex-shrink-0 text-right space-y-1">
                        {experiment.results?.conditionScores && (
                            <div className="text-sm font-mono">
                                {Object.entries(experiment.results.conditionScores).map(([name, score]) => (
                                    <div key={name} className="text-muted-foreground">
                                        {name}: <span className="text-foreground">{score.toFixed(3)}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                        {experiment.conclusion && CONCLUSION_LABELS[experiment.conclusion] && (
                            <div className={`text-sm font-medium ${CONCLUSION_LABELS[experiment.conclusion].color}`}>
                                {CONCLUSION_LABELS[experiment.conclusion].label}
                            </div>
                        )}
                        <span className="text-xs text-muted-foreground">
                            {expanded ? '[-]' : '[+]'}
                        </span>
                    </div>
                </div>
            </button>

            {expanded && (
                <div className="border-t border-border/50 p-5 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <h4 className="text-sm font-medium text-muted-foreground mb-1">Hypothesis</h4>
                            <p className="text-sm">{experiment.hypothesis}</p>
                        </div>
                        <div>
                            <h4 className="text-sm font-medium text-muted-foreground mb-1">Success Criteria</h4>
                            <p className="text-sm">{experiment.successCriteria}</p>
                        </div>
                    </div>

                    {experiment.design?.conditionMap && !experiment.results?.conditionScores && (
                        <div>
                            <h4 className="text-sm font-medium text-muted-foreground mb-2">Conditions</h4>
                            <div className="flex flex-wrap gap-2">
                                {Object.entries(experiment.design.conditionMap).map(([name, configIds]) => (
                                    <span key={name} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-muted/30 text-sm">
                                        <span className="font-mono text-xs">{name}</span>
                                        <span className="text-muted-foreground text-xs">({(configIds as string[]).length} configs)</span>
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}

                    {experiment.results?.conditionScores && (
                        <div>
                            <h4 className="text-sm font-medium text-muted-foreground mb-2">Score Comparison</h4>
                            <div className="space-y-2">
                                {Object.entries(experiment.results.conditionScores).map(([name, score]) => (
                                    <ScoreBar key={name} score={score} label={name} />
                                ))}
                            </div>
                        </div>
                    )}

                    {experiment.results && (
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            {experiment.results.summary && (
                                <div>
                                    <h4 className="text-sm font-medium text-muted-foreground mb-1">Summary</h4>
                                    <p className="text-sm">{experiment.results.summary}</p>
                                </div>
                            )}
                            {experiment.results.pValue != null && (
                                <div>
                                    <h4 className="text-sm font-medium text-muted-foreground mb-1">p-value</h4>
                                    <p className="text-sm font-mono">{experiment.results.pValue.toFixed(4)}</p>
                                </div>
                            )}
                            {experiment.results.effectSize != null && (
                                <div>
                                    <h4 className="text-sm font-medium text-muted-foreground mb-1">Effect Size</h4>
                                    <p className="text-sm font-mono">{experiment.results.effectSize.toFixed(4)}</p>
                                </div>
                            )}
                        </div>
                    )}

                    {experiment.notes && (
                        <div>
                            <h4 className="text-sm font-medium text-muted-foreground mb-1">Notes</h4>
                            <p className="text-sm whitespace-pre-wrap">{experiment.notes}</p>
                        </div>
                    )}

                    <div className="flex gap-4 text-xs text-muted-foreground">
                        <span>Created: {new Date(experiment.createdAt).toLocaleDateString()}</span>
                        {experiment.completedAt && (
                            <span>Completed: {new Date(experiment.completedAt).toLocaleDateString()}</span>
                        )}
                        {experiment.configIds.length > 0 && (
                            <span>{experiment.configIds.length} config(s)</span>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

export default function ExperimentsContent() {
    const [experiments, setExperiments] = useState<ExperimentRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [filter, setFilter] = useState<StatusFilter>('all');
    const [expandedId, setExpandedId] = useState<string | null>(null);

    useEffect(() => {
        async function fetchExperiments() {
            try {
                const res = await fetch('/api/experiments');
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const data: ExperimentIndex = await res.json();
                setExperiments(data.experiments || []);
            } catch (e: any) {
                setError(e.message);
            } finally {
                setLoading(false);
            }
        }
        fetchExperiments();
    }, []);

    if (loading) {
        return (
            <div className="text-center py-12 text-muted-foreground">
                Loading experiments...
            </div>
        );
    }

    if (error) {
        return (
            <div className="text-center py-12 text-red-500">
                Error loading experiments: {error}
            </div>
        );
    }

    const filtered = filter === 'all'
        ? experiments
        : experiments.filter(e => e.status === filter);

    const statusCounts = {
        all: experiments.length,
        planned: experiments.filter(e => e.status === 'planned').length,
        running: experiments.filter(e => e.status === 'running').length,
        completed: experiments.filter(e => e.status === 'completed').length,
        failed: experiments.filter(e => e.status === 'failed').length,
    };

    return (
        <div className="space-y-6">
            {/* Filter tabs */}
            <div className="flex flex-wrap gap-2">
                {(['all', 'running', 'completed', 'planned', 'failed'] as StatusFilter[]).map(status => (
                    <button
                        key={status}
                        onClick={() => setFilter(status)}
                        className={`px-3 py-1.5 rounded-full text-sm transition-colors ${
                            filter === status
                                ? 'bg-primary text-primary-foreground'
                                : 'bg-muted/30 text-muted-foreground hover:bg-muted/50'
                        }`}
                    >
                        {status.charAt(0).toUpperCase() + status.slice(1)}
                        {statusCounts[status] > 0 && (
                            <span className="ml-1.5 opacity-70">({statusCounts[status]})</span>
                        )}
                    </button>
                ))}
            </div>

            {/* Experiment cards */}
            {filtered.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                    {experiments.length === 0
                        ? 'No experiments yet. Use the CLI to create one: pnpm cli dtef experiment create'
                        : `No ${filter} experiments.`
                    }
                </div>
            ) : (
                <div className="space-y-4">
                    {filtered.map(exp => (
                        <ExperimentCard
                            key={exp.id}
                            experiment={exp}
                            expanded={expandedId === exp.id}
                            onToggle={() => setExpandedId(expandedId === exp.id ? null : exp.id)}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}
