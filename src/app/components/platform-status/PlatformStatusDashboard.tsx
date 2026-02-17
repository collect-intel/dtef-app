'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import type { PlatformStatusResponse, BlueprintStatusItem, SummaryFileItem } from './types';

// --- Helpers ---

/** Display configId with / instead of __ for readability */
function displayConfigId(configId: string): string {
    return configId.replace(/__/g, '/');
}

// --- Relative time helper ---

function relativeTime(iso: string | null): string {
    if (!iso) return 'Never';
    const date = new Date(iso);
    if (isNaN(date.getTime())) return 'Never';
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffSecs / 60);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);
    const diffMonths = Math.floor(diffDays / 30);
    const diffYears = Math.floor(diffDays / 365);

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    if (diffMonths < 12) return `${diffMonths} month${diffMonths !== 1 ? 's' : ''} ago`;
    return `${diffYears} year${diffYears !== 1 ? 's' : ''} ago`;
}

function formatBytes(bytes: number | undefined): string {
    if (bytes === undefined) return '—';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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

// --- Status badges ---

function StatusBadge({ status }: { status: 'found' | 'missing' | 'recent' | 'stale' | 'orphaned' | 'no-runs' }) {
    const styles: Record<typeof status, string> = {
        found: 'bg-green-500/10 text-green-600 dark:text-green-400',
        missing: 'bg-red-500/10 text-red-600 dark:text-red-400',
        recent: 'bg-green-500/10 text-green-600 dark:text-green-400',
        stale: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
        orphaned: 'bg-orange-500/10 text-orange-600 dark:text-orange-400',
        'no-runs': 'bg-muted text-muted-foreground',
    };
    const labels: Record<typeof status, string> = {
        found: 'Found',
        missing: 'Missing',
        recent: 'Recent',
        stale: 'Stale',
        orphaned: 'Orphaned',
        'no-runs': 'No Runs',
    };
    return (
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${styles[status]}`}>
            {labels[status]}
        </span>
    );
}

function getBlueprintStatus(item: BlueprintStatusItem): 'recent' | 'stale' | 'orphaned' | 'no-runs' {
    if (!item.inGitHub) return 'orphaned';
    if (!item.inS3) return 'no-runs';
    if (item.lastRun) {
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        return new Date(item.lastRun) >= sevenDaysAgo ? 'recent' : 'stale';
    }
    return 'stale';
}

// --- Progress card ---

function ProgressCard({ label, value, total, color, subtitle }: {
    label: string;
    value: number;
    total?: number;
    color: 'green' | 'blue' | 'amber' | 'red';
    subtitle?: string;
}) {
    const pct = total && total > 0 ? Math.round((value / total) * 100) : null;
    const barColors = {
        green: 'bg-green-500',
        blue: 'bg-blue-500',
        amber: 'bg-amber-500',
        red: 'bg-red-500',
    };
    return (
        <div className="bg-card border border-border/50 rounded-lg p-4">
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="text-2xl font-bold mt-1">
                {value}{total !== undefined ? <span className="text-muted-foreground text-base font-normal"> / {total}</span> : ''}
            </p>
            {pct !== null && (
                <div className="mt-2">
                    <div className="bg-muted rounded-full h-1.5 overflow-hidden">
                        <div className={`h-full rounded-full ${barColors[color]}`} style={{ width: `${pct}%` }} />
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{pct}%</p>
                </div>
            )}
            {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
        </div>
    );
}

// --- Tab types ---

type TabId = 'with-runs' | 'no-runs' | 'orphaned' | 'summary-files';

// --- Blueprint table ---

type BlueprintSortKey = 'configId' | 'title' | 'runCount' | 'lastRun' | 'status';

function BlueprintTable({ items, defaultSortKey, defaultSortDir }: {
    items: BlueprintStatusItem[];
    defaultSortKey: BlueprintSortKey;
    defaultSortDir: SortDirection;
}) {
    const [sort, toggleSort] = useSort<BlueprintSortKey>(defaultSortKey, defaultSortDir);

    const sorted = useMemo(() => sortedBy(items, sort.key, sort.direction, (item, key) => {
        switch (key as BlueprintSortKey) {
            case 'configId': return item.configId;
            case 'title': return item.title || '';
            case 'runCount': return item.runCount;
            case 'lastRun': return item.lastRun ? new Date(item.lastRun).getTime() : 0;
            case 'status': return getBlueprintStatus(item);
            default: return 0;
        }
    }), [items, sort]);

    if (items.length === 0) {
        return <p className="text-center text-muted-foreground py-8 text-sm">No configs in this category.</p>;
    }

    return (
        <div className="bg-card border border-border/50 rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
                <table className="w-full">
                    <thead>
                        <tr className="border-b border-border/50 bg-muted/30">
                            <SortableHeader label="Config ID" sortKey="configId" current={sort} onSort={toggleSort} />
                            <SortableHeader label="Title" sortKey="title" current={sort} onSort={toggleSort} />
                            <SortableHeader label="Runs" sortKey="runCount" current={sort} onSort={toggleSort} align="right" />
                            <SortableHeader label="Last Run" sortKey="lastRun" current={sort} onSort={toggleSort} />
                            <SortableHeader label="Status" sortKey="status" current={sort} onSort={toggleSort} />
                        </tr>
                    </thead>
                    <tbody>
                        {sorted.map(item => (
                            <tr key={item.configId} className="border-b border-border/30 last:border-0 hover:bg-muted/20 transition-colors">
                                <td className="px-4 py-3 text-sm font-mono text-foreground max-w-[300px] truncate" title={displayConfigId(item.configId)}>
                                    {displayConfigId(item.configId)}
                                </td>
                                <td className="px-4 py-3 text-sm max-w-[250px] truncate" title={item.title}>
                                    {item.title ? (
                                        <a
                                            href={`/analysis/${encodeURIComponent(item.configId)}`}
                                            className="text-blue-600 dark:text-blue-400 hover:underline"
                                        >
                                            {item.title}
                                        </a>
                                    ) : (
                                        <span className="text-muted-foreground">—</span>
                                    )}
                                </td>
                                <td className="px-4 py-3 text-sm text-right text-muted-foreground tabular-nums">
                                    {item.runCount > 1 ? item.runCount : item.runCount === 1 ? '1+' : '0'}
                                </td>
                                <td className="px-4 py-3 text-sm text-muted-foreground" title={item.lastRun || undefined}>
                                    {relativeTime(item.lastRun)}
                                </td>
                                <td className="px-4 py-3">
                                    <StatusBadge status={getBlueprintStatus(item)} />
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

// --- Summary files table ---

type SummarySortKey = 'name' | 'path' | 'status' | 'lastModified' | 'size';

function SummaryFileTable({ files, showStatus = false, showDescription = false }: {
    files: SummaryFileItem[];
    showStatus?: boolean;
    showDescription?: boolean;
}) {
    const [sort, toggleSort] = useSort<SummarySortKey>(showStatus ? 'status' : 'name', showStatus ? 'asc' : 'desc');

    const sorted = useMemo(() => sortedBy(files, sort.key, sort.direction, (item, key) => {
        switch (key as SummarySortKey) {
            case 'name': return item.name;
            case 'path': return item.path;
            case 'status': return item.found ? 1 : 0;
            case 'lastModified': return item.lastModified ? new Date(item.lastModified).getTime() : 0;
            case 'size': return item.size || 0;
            default: return 0;
        }
    }), [files, sort]);

    if (files.length === 0) return null;

    return (
        <div className="bg-card border border-border/50 rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
                <table className="w-full">
                    <thead>
                        <tr className="border-b border-border/50 bg-muted/30">
                            <SortableHeader label="Name" sortKey="name" current={sort} onSort={toggleSort} />
                            {!showDescription && <SortableHeader label="Path" sortKey="path" current={sort} onSort={toggleSort} />}
                            {showStatus && <SortableHeader label="Status" sortKey="status" current={sort} onSort={toggleSort} />}
                            <SortableHeader label="Last Modified" sortKey="lastModified" current={sort} onSort={toggleSort} />
                            <SortableHeader label="Size" sortKey="size" current={sort} onSort={toggleSort} align="right" />
                        </tr>
                    </thead>
                    <tbody>
                        {sorted.map(file => (
                            <tr key={file.path} className="border-b border-border/30 last:border-0 hover:bg-muted/20 transition-colors align-top">
                                <td className="px-4 py-3 text-sm">
                                    <div className="font-medium text-foreground">{file.name}</div>
                                    {showDescription && (
                                        <>
                                            <div className="font-mono text-xs text-muted-foreground/70 mt-0.5">{file.path}</div>
                                            {file.description && (
                                                <div className="text-xs text-muted-foreground mt-1">{file.description}</div>
                                            )}
                                            {file.pageLinks && file.pageLinks.length > 0 && (
                                                <div className="flex flex-wrap gap-1.5 mt-1.5">
                                                    {file.pageLinks.map(link => (
                                                        <a
                                                            key={link.href}
                                                            href={link.href}
                                                            className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-blue-500/10 text-blue-600 dark:text-blue-400 hover:bg-blue-500/20 transition-colors"
                                                        >
                                                            {link.label}
                                                        </a>
                                                    ))}
                                                </div>
                                            )}
                                        </>
                                    )}
                                </td>
                                {!showDescription && (
                                    <td className="px-4 py-3 text-sm font-mono text-muted-foreground max-w-[300px] truncate" title={file.path}>
                                        {file.path}
                                    </td>
                                )}
                                {showStatus && (
                                    <td className="px-4 py-3">
                                        <StatusBadge status={file.found ? 'found' : 'missing'} />
                                    </td>
                                )}
                                <td className="px-4 py-3 text-sm text-muted-foreground">
                                    {file.lastModified ? relativeTime(file.lastModified) : '—'}
                                </td>
                                <td className="px-4 py-3 text-sm text-right text-muted-foreground tabular-nums">
                                    {formatBytes(file.size)}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

function SummaryFilesSection({ files }: { files: SummaryFileItem[] }) {
    const core = useMemo(() => files.filter(f => f.category === 'core'), [files]);
    const discovered = useMemo(() => files.filter(f => f.category === 'discovered'), [files]);
    const unidentified = useMemo(() => files.filter(f => f.category === 'unidentified'), [files]);

    return (
        <div className="space-y-6">
            <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-3">Core Platform Files ({core.length})</h3>
                <SummaryFileTable files={core} showStatus showDescription />
            </div>

            {discovered.length > 0 && (
                <div>
                    <h3 className="text-sm font-medium text-muted-foreground mb-2">Per-Entity Files ({discovered.length})</h3>
                    <p className="text-xs text-muted-foreground mb-3">
                        These are dynamically-named files produced per model, blueprint, or survey (e.g. model summaries, model cards, per-survey DTEF results).
                        The platform generates and consumes these files — they aren&apos;t listed individually above because their filenames vary.
                    </p>
                    <SummaryFileTable files={discovered} />
                </div>
            )}

            {unidentified.length > 0 && (
                <div>
                    <h3 className="text-sm font-medium text-muted-foreground mb-2">Unidentified Files ({unidentified.length})</h3>
                    <p className="text-xs text-muted-foreground mb-3">
                        Files in S3 that don&apos;t match any known pattern. These may be leftover from old features or manual uploads.
                    </p>
                    <SummaryFileTable files={unidentified} />
                </div>
            )}
        </div>
    );
}

// --- Main component ---

export default function PlatformStatusDashboard() {
    const [data, setData] = useState<PlatformStatusResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<TabId>('with-runs');
    const [search, setSearch] = useState('');

    useEffect(() => {
        async function fetchData() {
            try {
                const response = await fetch('/api/platform-status');
                if (!response.ok) throw new Error(`Failed to fetch: ${response.status}`);
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

    // Filtered blueprint lists
    const withRuns = useMemo(() => {
        if (!data) return [];
        return data.blueprints.filter(b => b.inGitHub && b.inS3);
    }, [data]);

    const noRuns = useMemo(() => {
        if (!data) return [];
        return data.blueprints.filter(b => b.inGitHub && !b.inS3);
    }, [data]);

    const orphaned = useMemo(() => {
        if (!data) return [];
        return data.blueprints.filter(b => !b.inGitHub && b.inS3);
    }, [data]);

    // Apply search filter
    const filterItems = useCallback((items: BlueprintStatusItem[]) => {
        if (!search) return items;
        const q = search.toLowerCase();
        return items.filter(b =>
            displayConfigId(b.configId).toLowerCase().includes(q) ||
            b.configId.toLowerCase().includes(q) ||
            (b.title || '').toLowerCase().includes(q) ||
            (b.tags || []).some(t => t.toLowerCase().includes(q))
        );
    }, [search]);

    const filterSummaryFiles = useCallback((files: SummaryFileItem[]) => {
        if (!search) return files;
        const q = search.toLowerCase();
        return files.filter(f =>
            f.name.toLowerCase().includes(q) ||
            f.path.toLowerCase().includes(q) ||
            f.expectedPurpose.toLowerCase().includes(q)
        );
    }, [search]);

    const filteredWithRuns = useMemo(() => filterItems(withRuns), [filterItems, withRuns]);
    const filteredNoRuns = useMemo(() => filterItems(noRuns), [filterItems, noRuns]);
    const filteredOrphaned = useMemo(() => filterItems(orphaned), [filterItems, orphaned]);
    const filteredSummaryFiles = useMemo(() => data ? filterSummaryFiles(data.summaryFiles) : [], [data, filterSummaryFiles]);

    if (loading) {
        return (
            <div className="flex items-center justify-center py-16">
                <div className="animate-pulse text-muted-foreground">Loading platform status...</div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="text-center py-16">
                <p className="text-red-500">Error loading platform status: {error}</p>
            </div>
        );
    }

    if (!data) {
        return (
            <div className="text-center py-16">
                <p className="text-muted-foreground">No data available.</p>
            </div>
        );
    }

    const { stats } = data;

    const tabs: { id: TabId; label: string; count: number }[] = [
        { id: 'with-runs', label: 'With Runs', count: filteredWithRuns.length },
        { id: 'no-runs', label: 'No Runs', count: filteredNoRuns.length },
        { id: 'orphaned', label: 'Orphaned', count: filteredOrphaned.length },
        { id: 'summary-files', label: 'Summary Files', count: filteredSummaryFiles.length },
    ];

    return (
        <div className="space-y-6">
            {/* Errors/warnings */}
            {data.errors.length > 0 && (
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4">
                    <p className="text-sm font-medium text-amber-600 dark:text-amber-400 mb-1">Warnings</p>
                    <ul className="text-sm text-amber-600 dark:text-amber-400 space-y-1">
                        {data.errors.map((err, i) => (
                            <li key={i}>{err}</li>
                        ))}
                    </ul>
                </div>
            )}

            {/* Overall stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <ProgressCard
                    label="Configs with Runs"
                    value={stats.configsWithRuns}
                    total={stats.totalGitHubConfigs}
                    color="green"
                />
                <ProgressCard
                    label="Recent Runs (7d)"
                    value={stats.recentRunConfigs}
                    total={stats.configsWithRuns}
                    color="blue"
                />
                <ProgressCard
                    label="Stale Runs (>7d)"
                    value={stats.staleRunConfigs}
                    color={stats.staleRunConfigs === 0 ? 'green' : 'amber'}
                    subtitle="In S3 but last run >7 days ago"
                />
                <ProgressCard
                    label="Orphaned S3 Configs"
                    value={stats.orphanedConfigs}
                    color={stats.orphanedConfigs === 0 ? 'green' : 'amber'}
                    subtitle={stats.orphanedConfigs === 0 ? 'None found' : 'In S3 but not in GitHub'}
                />
            </div>

            {/* Scheduler view */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <ProgressCard
                    label="Periodic Configs"
                    value={stats.periodicConfigs}
                    total={stats.totalGitHubConfigs}
                    color="blue"
                    subtitle="Tagged _periodic"
                />
                <ProgressCard
                    label="Periodic Fresh"
                    value={stats.periodicWithRecentRuns}
                    total={stats.periodicConfigs}
                    color="green"
                    subtitle="Run within 7 days"
                />
                <ProgressCard
                    label="Periodic Needs Run"
                    value={stats.periodicConfigs - stats.periodicWithRecentRuns}
                    total={stats.periodicConfigs}
                    color={stats.periodicConfigs - stats.periodicWithRecentRuns > 0 ? 'amber' : 'green'}
                    subtitle={stats.periodicNeverRun > 0 ? `${stats.periodicNeverRun} never run` : 'All up to date'}
                />
                <ProgressCard
                    label="Summary Files"
                    value={stats.foundSummaryFiles}
                    total={stats.expectedSummaryFiles}
                    color={stats.foundSummaryFiles === stats.expectedSummaryFiles ? 'green' : 'amber'}
                    subtitle={stats.unidentifiedFiles > 0 ? `+${stats.unidentifiedFiles} unidentified` : undefined}
                />
            </div>

            {/* Search */}
            <div>
                <input
                    type="text"
                    placeholder="Search configs, titles, tags, or file paths..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="w-full px-4 py-2.5 bg-card border border-border/50 rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
                />
            </div>

            {/* Tabs */}
            <div className="flex flex-wrap gap-2">
                {tabs.map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`px-3 py-1.5 text-sm rounded-full border transition-colors ${
                            activeTab === tab.id
                                ? 'bg-primary text-primary-foreground border-primary'
                                : 'bg-card border-border text-muted-foreground hover:text-foreground hover:border-foreground/30'
                        }`}
                    >
                        {tab.label} ({tab.count})
                    </button>
                ))}
            </div>

            {/* Tab content */}
            {activeTab === 'with-runs' && (
                <BlueprintTable items={filteredWithRuns} defaultSortKey="lastRun" defaultSortDir="desc" />
            )}
            {activeTab === 'no-runs' && (
                <BlueprintTable items={filteredNoRuns} defaultSortKey="configId" defaultSortDir="asc" />
            )}
            {activeTab === 'orphaned' && (
                <BlueprintTable items={filteredOrphaned} defaultSortKey="lastRun" defaultSortDir="desc" />
            )}
            {activeTab === 'summary-files' && (
                <SummaryFilesSection files={filteredSummaryFiles} />
            )}

            {/* Footer */}
            <p className="text-xs text-muted-foreground text-center">
                Generated {new Date(data.generatedAt).toLocaleString()}
            </p>
        </div>
    );
}
