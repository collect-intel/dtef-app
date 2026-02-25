'use client';

import React from 'react';
import Link from 'next/link';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

// ─────────────────────────────────────────────────────────────────────────────
// Updatable data constants — edit these when new analysis runs complete
// ─────────────────────────────────────────────────────────────────────────────

const STATS = {
    /** Date the underlying statistical analysis was generated */
    analysisDate: 'February 2026',
    /** Number of survey rounds evaluated */
    surveyRounds: 8,
    /** Total number of AI models evaluated */
    modelCount: 24,
    /** Total evaluation results processed */
    resultCount: 1308,
    /** Total segment-question score data points */
    scoreDataPoints: '929,597',
    /** Baselines */
    baselines: {
        uniform: 0.647,
        populationMarginal: 0.833,
        shuffled: 0.761,
    },
    /** Best model score and name */
    bestModel: { name: 'Claude Sonnet 4.5', score: 0.767 },
    /** Average model score */
    avgModelScore: 0.730,
    /** Pairwise significance */
    pairwise: {
        significantPairs: 237,
        totalPairs: 273,
        percentage: 86.8,
    },
    /** Context responsive models (overall significant) */
    contextResponsiveModels: 9,
    /** Category-level significant model x category pairs */
    significantModelCategoryPairs: 19,
    totalModelCategoryPairs: 93,
    /** Data quality by category */
    categories: [
        { name: 'Gender', avgSampleSize: 516, noiseFloor: 0.928, reliable: 99.3 },
        { name: 'AI Concern', avgSampleSize: 350, noiseFloor: 0.899, reliable: 100 },
        { name: 'Environment', avgSampleSize: 350, noiseFloor: 0.888, reliable: 100 },
        { name: 'Age', avgSampleSize: 203, noiseFloor: 0.850, reliable: 94.7 },
        { name: 'Religion', avgSampleSize: 149, noiseFloor: 0.781, reliable: 73.6 },
        { name: 'Country', avgSampleSize: 33, noiseFloor: 0.640, reliable: 30.7 },
    ],
    /** Top models for context responsiveness */
    topContextModels: [
        { name: 'GPT-5', slope: 0.00387, categories: ['Country', 'Religion', 'Environment'] },
        { name: 'Qwen3-32B', slope: 0.00318, categories: ['Country', 'Environment'] },
        { name: 'Claude 3.7 Sonnet', slope: 0.00152, categories: ['Gender', 'Country', 'Environment', 'Religion'] },
    ],
    /** Top 10 models for the leaderboard display */
    topModels: [
        { name: 'Claude Sonnet 4.5', score: 0.767 },
        { name: 'Claude 3.7 Sonnet', score: 0.765 },
        { name: 'Claude Sonnet 4', score: 0.761 },
        { name: 'GPT-5.1', score: 0.761 },
        { name: 'Claude Haiku 4.5', score: 0.754 },
        { name: 'GPT-4.1', score: 0.753 },
        { name: 'GPT-4o', score: 0.749 },
        { name: 'GPT-5', score: 0.749 },
        { name: 'Mistral Medium 3', score: 0.742 },
        { name: 'GPT-4.1 Mini', score: 0.742 },
    ],
};

// ─────────────────────────────────────────────────────────────────────────────
// Helper components
// ─────────────────────────────────────────────────────────────────────────────

function StatCard({ value, label, sublabel }: { value: string; label: string; sublabel?: string }) {
    return (
        <div className="bg-card/60 backdrop-blur-sm p-5 rounded-lg ring-1 ring-border/50 text-center">
            <div className="text-3xl sm:text-4xl font-bold text-primary">{value}</div>
            <div className="text-sm font-medium text-foreground mt-1">{label}</div>
            {sublabel && <div className="text-xs text-muted-foreground mt-0.5">{sublabel}</div>}
        </div>
    );
}

function ScoreBar({ score, label, color, showBaselines }: {
    score: number;
    label: string;
    color: string;
    showBaselines?: boolean;
}) {
    const pct = Math.max(0, Math.min(100, score * 100));
    return (
        <div className="flex items-center gap-3">
            <div className="w-36 sm:w-44 text-sm text-right text-foreground/80 shrink-0">{label}</div>
            <div className="flex-1 relative h-6 bg-muted/30 rounded-full overflow-hidden">
                <div
                    className={`h-full rounded-full transition-all duration-700 ${color}`}
                    style={{ width: `${pct}%` }}
                />
                {showBaselines && (
                    <>
                        <div
                            className="absolute top-0 h-full w-px bg-foreground/40"
                            style={{ left: `${STATS.baselines.populationMarginal * 100}%` }}
                            title="Population Marginal Baseline"
                        />
                        <div
                            className="absolute top-0 h-full w-px bg-foreground/20 border-dashed"
                            style={{ left: `${STATS.baselines.uniform * 100}%` }}
                            title="Uniform Baseline"
                        />
                    </>
                )}
            </div>
            <div className="w-14 text-sm font-mono text-foreground/80 shrink-0">{score.toFixed(3)}</div>
        </div>
    );
}

function SectionNumber({ n }: { n: number }) {
    return (
        <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary text-sm font-bold mr-3 shrink-0">
            {n}
        </span>
    );
}

function FindingSection({ number, title, children }: { number: number; title: string; children: React.ReactNode }) {
    return (
        <section className="space-y-5">
            <h2 className="flex items-center text-xl sm:text-2xl font-semibold tracking-tight">
                <SectionNumber n={number} />
                {title}
            </h2>
            {children}
        </section>
    );
}

function QualityDot({ pct }: { pct: number }) {
    const color = pct >= 95 ? 'bg-green-500' : pct >= 70 ? 'bg-yellow-500' : 'bg-red-500';
    return <span className={`inline-block w-2.5 h-2.5 rounded-full ${color}`} />;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main content
// ─────────────────────────────────────────────────────────────────────────────

export default function FindingsContent() {
    const [methodOpen, setMethodOpen] = React.useState(false);

    return (
        <div className="space-y-14">
            {/* ── Intro: What is a Digital Twin? ────────────────────────────── */}
            <section className="bg-card/40 backdrop-blur-sm rounded-lg ring-1 ring-border/50 p-6 sm:p-8 space-y-4">
                <h2 className="text-xl sm:text-2xl font-semibold tracking-tight">
                    What is a &ldquo;Digital Twin&rdquo;?
                </h2>
                <div className="text-sm text-foreground/80 leading-relaxed space-y-3 max-w-4xl">
                    <p>
                        Imagine asking an AI: <em>&ldquo;How would 18&ndash;25 year olds in Brazil respond to this policy question?&rdquo;</em> If the model could reliably predict their collective response distribution, it would function
                        as a <strong>digital twin</strong> of that demographic group &mdash; a computational proxy that
                        approximates the views of a real community.
                    </p>
                    <p>
                        If this were possible, it could change how we understand public opinion, design inclusive policies, and think about
                        AI systems that claim to represent diverse perspectives. But an open question remains: <strong>can today&rsquo;s
                        AI models actually do this?</strong>
                    </p>
                    <p>
                        The Digital Twin Evaluation Framework (DTEF) is an early-stage research project that attempts to answer that question. Using real survey data from
                        the <a href="https://globaldialogues.ai/" target="_blank" rel="noopener noreferrer" className="text-primary hover:text-primary/80 transition-colors underline">Global Dialogues</a> project &mdash; {STATS.surveyRounds} rounds
                        of surveys covering topics from AI governance to social values &mdash; we test {STATS.modelCount} AI models on their
                        ability to predict how specific demographic groups actually responded. These are preliminary findings from an ongoing investigation.
                    </p>
                </div>
            </section>

            {/* ── Summary Stats ─────────────────────────────────────────────── */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard value={String(STATS.modelCount)} label="AI Models Tested" sublabel="across major providers" />
                <StatCard value={String(STATS.surveyRounds)} label="Survey Rounds" sublabel="Global Dialogues GD1-GD7" />
                <StatCard value={STATS.scoreDataPoints} label="Data Points" sublabel="segment-question scores" />
                <StatCard value={`${STATS.pairwise.percentage}%`} label="Pairs Significant" sublabel="statistically distinguishable" />
            </div>

            {/* ── Finding 1: The Baseline Challenge ─────────────────────────── */}
            <FindingSection number={1} title="The Baseline Challenge">
                <div className="bg-card/40 backdrop-blur-sm rounded-lg ring-1 ring-border/50 p-6 space-y-5">
                    <p className="text-sm text-foreground/80 leading-relaxed max-w-4xl">
                        Before evaluating AI models, we established three simple baselines that require no AI at all.
                        If models can&rsquo;t beat these, it suggests they may not yet be adding value for demographic-specific prediction.
                    </p>

                    <div className="space-y-2.5 max-w-3xl">
                        <ScoreBar score={STATS.baselines.populationMarginal} label="Population Marginal" color="bg-amber-500/80" />
                        <ScoreBar score={STATS.baselines.shuffled} label="Shuffled Null" color="bg-slate-400/60" />
                        <ScoreBar score={STATS.bestModel.score} label={STATS.bestModel.name} color="bg-primary/80" showBaselines />
                        <ScoreBar score={STATS.avgModelScore} label="Average Model" color="bg-primary/50" showBaselines />
                        <ScoreBar score={STATS.baselines.uniform} label="Uniform (Random)" color="bg-red-400/50" />
                    </div>

                    <div className="mt-4 space-y-3">
                        <div className="bg-amber-500/10 border border-amber-500/30 rounded-md p-4">
                            <p className="text-sm font-medium text-foreground">
                                Key finding: No AI model yet outperforms the population marginal baseline.
                            </p>
                            <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
                                The <strong>population marginal</strong> simply predicts the overall population&rsquo;s answer distribution, ignoring demographics entirely.
                                Its score of <span className="font-mono">{STATS.baselines.populationMarginal.toFixed(3)}</span> means
                                that knowing &ldquo;what people in general think&rdquo; is still a better predictor than any AI model&rsquo;s attempt
                                to account for demographic differences.
                                The best model ({STATS.bestModel.name}) scores <span className="font-mono">{STATS.bestModel.score.toFixed(3)}</span> &mdash;
                                a gap of <span className="font-mono">{(STATS.baselines.populationMarginal - STATS.bestModel.score).toFixed(3)}</span>.
                            </p>
                        </div>

                        <p className="text-xs text-muted-foreground leading-relaxed">
                            However, all models significantly outperform the <strong>uniform baseline</strong> ({STATS.baselines.uniform.toFixed(3)}),
                            which guesses equal probability for every option. Models have learned <em>what people in general think</em>,
                            but not yet <em>how specific demographics differ from the average</em>.
                        </p>
                    </div>
                </div>
            </FindingSection>

            {/* ── Finding 2: The Leaderboard Is Real ────────────────────────── */}
            <FindingSection number={2} title="Model Differences Are Statistically Meaningful">
                <div className="bg-card/40 backdrop-blur-sm rounded-lg ring-1 ring-border/50 p-6 space-y-5">
                    <p className="text-sm text-foreground/80 leading-relaxed max-w-4xl">
                        Despite all models falling below the population marginal baseline, their differences appear
                        statistically meaningful. Permutation testing (10,000 iterations) with Holm-Bonferroni correction
                        suggests that <strong>{STATS.pairwise.significantPairs} of {STATS.pairwise.totalPairs}</strong> model
                        pairs ({STATS.pairwise.percentage}%) are significantly different at the 0.05 level. However,
                        statistical significance does not necessarily imply practical importance &mdash; many differences are small.
                    </p>

                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-border/50">
                                    <th className="text-left py-2 pr-4 text-muted-foreground font-medium w-10">#</th>
                                    <th className="text-left py-2 pr-4 text-muted-foreground font-medium">Model</th>
                                    <th className="text-right py-2 pr-4 text-muted-foreground font-medium">Score</th>
                                    <th className="text-left py-2 text-muted-foreground font-medium w-1/3">vs. Baselines</th>
                                </tr>
                            </thead>
                            <tbody>
                                {STATS.topModels.map((m, i) => {
                                    const pct = ((m.score - 0.63) / (0.85 - 0.63)) * 100;
                                    const margPct = ((STATS.baselines.populationMarginal - 0.63) / (0.85 - 0.63)) * 100;
                                    return (
                                        <tr key={m.name} className="border-b border-border/20 last:border-0">
                                            <td className="py-2.5 pr-4 font-mono text-muted-foreground">{i + 1}</td>
                                            <td className="py-2.5 pr-4 font-medium">{m.name}</td>
                                            <td className="py-2.5 pr-4 text-right font-mono">{m.score.toFixed(3)}</td>
                                            <td className="py-2.5">
                                                <div className="relative h-4 bg-muted/30 rounded-full overflow-visible">
                                                    <div
                                                        className="h-full rounded-full bg-primary/70"
                                                        style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
                                                    />
                                                    <div
                                                        className="absolute top-0 h-full w-0.5 bg-amber-500/80"
                                                        style={{ left: `${Math.max(0, Math.min(100, margPct))}%` }}
                                                        title="Population Marginal"
                                                    />
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    <p className="text-xs text-muted-foreground text-center">
                        Top 10 of {STATS.modelCount} models. Amber line = population marginal baseline ({STATS.baselines.populationMarginal.toFixed(3)}).
                        Full rankings on the <Link href="/demographics" className="text-primary hover:text-primary/80 underline">demographics page</Link>.
                    </p>
                </div>
            </FindingSection>

            {/* ── Finding 3: Data Quality Varies ────────────────────────────── */}
            <FindingSection number={3} title="Not All Demographics Are Equal">
                <div className="bg-card/40 backdrop-blur-sm rounded-lg ring-1 ring-border/50 p-6 space-y-5">
                    <p className="text-sm text-foreground/80 leading-relaxed max-w-4xl">
                        The reliability of these evaluations depends heavily on how many survey respondents we have per demographic
                        segment. Categories like <strong>gender</strong> (avg. 516 respondents) produce relatively stable benchmarks,
                        while <strong>country-level</strong> segments (avg. 33 respondents) have enough sampling noise that
                        apparent model differences may not be real. This is a significant limitation of the current dataset.
                    </p>

                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-border/50">
                                    <th className="text-left py-2 pr-4 text-muted-foreground font-medium">Category</th>
                                    <th className="text-right py-2 pr-4 text-muted-foreground font-medium">Avg. Respondents</th>
                                    <th className="text-right py-2 pr-4 text-muted-foreground font-medium">Noise Floor</th>
                                    <th className="text-center py-2 pr-4 text-muted-foreground font-medium">Quality</th>
                                    <th className="text-right py-2 text-muted-foreground font-medium">Reliable Pairs</th>
                                </tr>
                            </thead>
                            <tbody>
                                {STATS.categories.map(c => (
                                    <tr key={c.name} className="border-b border-border/20 last:border-0">
                                        <td className="py-2.5 pr-4 font-medium">{c.name}</td>
                                        <td className="py-2.5 pr-4 text-right font-mono">{c.avgSampleSize}</td>
                                        <td className="py-2.5 pr-4 text-right font-mono">{c.noiseFloor.toFixed(3)}</td>
                                        <td className="py-2.5 pr-4 text-center"><QualityDot pct={c.reliable} /></td>
                                        <td className="py-2.5 text-right font-mono">{c.reliable.toFixed(1)}%</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <div className="flex items-center gap-4 text-xs text-muted-foreground justify-center">
                        <span className="flex items-center gap-1.5"><span className="inline-block w-2.5 h-2.5 rounded-full bg-green-500" /> High reliability</span>
                        <span className="flex items-center gap-1.5"><span className="inline-block w-2.5 h-2.5 rounded-full bg-yellow-500" /> Moderate</span>
                        <span className="flex items-center gap-1.5"><span className="inline-block w-2.5 h-2.5 rounded-full bg-red-500" /> Low reliability</span>
                    </div>

                    <Collapsible>
                        <CollapsibleTrigger className="text-xs text-primary hover:text-primary/80 cursor-pointer flex items-center gap-1">
                            <span>What does &ldquo;noise floor&rdquo; mean?</span>
                            <span className="text-[10px]">&#9660;</span>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                            <p className="text-xs text-muted-foreground mt-2 leading-relaxed max-w-3xl">
                                The noise floor measures how similar two random samples from the <em>same</em> population would
                                look, given the sample size. A noise floor of 0.928 (gender) means that even perfect predictions
                                would only score ~0.93 due to sampling uncertainty. When the noise floor is low (0.64 for country),
                                random sampling variation alone could explain apparent differences between models. We use the formula:
                                <span className="font-mono ml-1">1 - sqrt((k-1) / (2n * ln2))</span>.
                            </p>
                        </CollapsibleContent>
                    </Collapsible>
                </div>
            </FindingSection>

            {/* ── Finding 4: Evidence-Adapting vs. Stereotype-Holding ────────── */}
            <FindingSection number={4} title="Evidence-Adapting vs. Stereotype-Holding">
                <div className="bg-card/40 backdrop-blur-sm rounded-lg ring-1 ring-border/50 p-6 space-y-5">
                    <p className="text-sm text-foreground/80 leading-relaxed max-w-4xl">
                        When we give models more information about a demographic group (showing them how the group answered
                        other survey questions), do they use that evidence to improve their predictions &mdash; or do they
                        ignore it and rely on stereotypes?
                    </p>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-3xl mx-auto">
                        <div className="bg-muted/20 rounded-md p-4 text-center space-y-1">
                            <div className="text-xs text-muted-foreground uppercase tracking-wider">Zero Context</div>
                            <div className="text-sm font-medium">Only demographics</div>
                            <div className="text-xs text-muted-foreground">Model relies on priors</div>
                        </div>
                        <div className="bg-muted/20 rounded-md p-4 text-center space-y-1 ring-2 ring-primary/30">
                            <div className="text-xs text-muted-foreground uppercase tracking-wider">Adding Context</div>
                            <div className="text-sm font-medium">5 &rarr; 10 &rarr; All questions</div>
                            <div className="text-xs text-muted-foreground">Does accuracy improve?</div>
                        </div>
                        <div className="bg-muted/20 rounded-md p-4 text-center space-y-1">
                            <div className="text-xs text-muted-foreground uppercase tracking-wider">Full Context</div>
                            <div className="text-sm font-medium">All survey responses</div>
                            <div className="text-xs text-muted-foreground">Maximum evidence</div>
                        </div>
                    </div>

                    <div className="space-y-4 mt-2">
                        <p className="text-sm font-medium text-foreground">
                            Only {STATS.contextResponsiveModels} of {STATS.modelCount} models show statistically significant improvement with more context:
                        </p>

                        <div className="space-y-3">
                            {STATS.topContextModels.map(m => (
                                <div key={m.name} className="flex items-start gap-3">
                                    <div className="w-40 sm:w-48 text-sm font-medium shrink-0">{m.name}</div>
                                    <div className="flex-1">
                                        <div className="relative h-5 bg-muted/30 rounded-full overflow-hidden">
                                            <div
                                                className="h-full rounded-full bg-indigo-500/70"
                                                style={{ width: `${Math.min(100, (m.slope / 0.004) * 100)}%` }}
                                            />
                                        </div>
                                        <div className="flex items-center justify-between mt-1">
                                            <span className="text-xs text-muted-foreground">
                                                +{(m.slope * 100).toFixed(2)}% per context question
                                            </span>
                                            <span className="text-xs text-muted-foreground">
                                                {m.categories.join(', ')}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="bg-indigo-500/10 border border-indigo-500/30 rounded-md p-4 mt-2">
                            <p className="text-sm font-medium text-foreground">
                                Most models don&rsquo;t benefit from additional context.
                            </p>
                            <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
                                Of the {STATS.modelCount} models tested, 15 show flat or <em>negative</em> slopes &mdash; meaning
                                more demographic evidence doesn&rsquo;t help (or slightly hurts) their predictions. One interpretation is
                                that these models may rely on fixed assumptions about demographic groups rather than reasoning
                                from the provided data, though other explanations are possible.
                                At the category level, only <strong>{STATS.significantModelCategoryPairs}</strong> of {STATS.totalModelCategoryPairs} model-category
                                pairs survive joint statistical correction.
                            </p>
                        </div>
                    </div>
                </div>
            </FindingSection>

            {/* ── Finding 5: Confidence & Uncertainty ───────────────────────── */}
            <FindingSection number={5} title="Confidence in the Rankings">
                <div className="bg-card/40 backdrop-blur-sm rounded-lg ring-1 ring-border/50 p-6 space-y-5">
                    <p className="text-sm text-foreground/80 leading-relaxed max-w-4xl">
                        Bootstrap resampling (1,000 iterations) shows that while model <em>ranks</em> are broadly stable,
                        the score differences between adjacent models are small enough that their confidence intervals overlap.
                    </p>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="bg-muted/20 rounded-md p-4 space-y-1">
                            <div className="text-2xl font-bold text-primary">22 of 23</div>
                            <div className="text-sm text-foreground/80">adjacent model pairs have overlapping 95% CIs</div>
                            <div className="text-xs text-muted-foreground mt-1">
                                Adjacent models&rsquo; score differences may not be meaningful given survey sampling uncertainty.
                            </div>
                        </div>
                        <div className="bg-muted/20 rounded-md p-4 space-y-1">
                            <div className="text-2xl font-bold text-primary">0</div>
                            <div className="text-sm text-foreground/80">rank changes from sample-size weighting</div>
                            <div className="text-xs text-muted-foreground mt-1">
                                Rankings appear stable: weighting by respondent count (&#8730;n) produces no rank changes in this dataset.
                            </div>
                        </div>
                    </div>

                    <p className="text-xs text-muted-foreground leading-relaxed max-w-3xl">
                        In other words: broad tiers may be meaningful (top performers vs. middle vs. bottom), but don&rsquo;t read too
                        much into a model being ranked #3 vs. #4. Focus on clusters rather than individual positions.
                    </p>
                </div>
            </FindingSection>

            {/* ── What This Means ───────────────────────────────────────────── */}
            <section className="space-y-5">
                <h2 className="text-xl sm:text-2xl font-semibold tracking-tight text-center">
                    Preliminary Takeaways
                </h2>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="bg-card/40 backdrop-blur-sm rounded-lg ring-1 ring-border/50 p-6 space-y-3">
                        <h3 className="text-base font-semibold text-foreground">The Gap Is Measurable</h3>
                        <p className="text-sm text-foreground/80 leading-relaxed">
                            In our tests, AI models appear to know what people in general think, but haven&rsquo;t yet learned how specific
                            demographics <em>differ</em> from that average. The gap between the best model ({STATS.bestModel.score.toFixed(3)})
                            and the population marginal baseline ({STATS.baselines.populationMarginal.toFixed(3)}) gives us a concrete
                            metric to track over time.
                        </p>
                    </div>

                    <div className="bg-card/40 backdrop-blur-sm rounded-lg ring-1 ring-border/50 p-6 space-y-3">
                        <h3 className="text-base font-semibold text-foreground">Progress May Be Trackable</h3>
                        <p className="text-sm text-foreground/80 leading-relaxed">
                            With {STATS.pairwise.percentage}% of model pairs being statistically distinguishable, the
                            rankings appear to carry signal. As new model versions are released, this framework could help
                            measure whether they&rsquo;re getting better at representing diverse perspectives &mdash; though
                            more work is needed to validate that the metric reliably captures real-world representational quality.
                        </p>
                    </div>

                    <div className="bg-card/40 backdrop-blur-sm rounded-lg ring-1 ring-border/50 p-6 space-y-3">
                        <h3 className="text-base font-semibold text-foreground">Some Models Appear to Learn</h3>
                        <p className="text-sm text-foreground/80 leading-relaxed">
                            The context responsiveness test attempts to distinguish models that reason from evidence
                            vs. those relying on fixed priors. In our data, only a few models (notably Claude 3.7 Sonnet across 4 categories)
                            consistently improve when given more information about a demographic group. These results warrant further investigation.
                        </p>
                    </div>

                    <div className="bg-card/40 backdrop-blur-sm rounded-lg ring-1 ring-border/50 p-6 space-y-3">
                        <h3 className="text-base font-semibold text-foreground">Better Data Needed</h3>
                        <p className="text-sm text-foreground/80 leading-relaxed">
                            Country-level evaluation is currently unreliable (only 30.7% of data points meet quality
                            thresholds). For this framework to meaningfully assess cross-cultural representation, larger and more diverse
                            survey samples would be needed &mdash; particularly at the country and religion level.
                        </p>
                    </div>
                </div>
            </section>

            {/* ── Next Steps ────────────────────────────────────────────────── */}
            <section className="bg-card/40 backdrop-blur-sm rounded-lg ring-1 ring-border/50 p-6 sm:p-8 space-y-4">
                <h2 className="text-xl sm:text-2xl font-semibold tracking-tight">What&rsquo;s Next</h2>
                <div className="text-sm text-foreground/80 leading-relaxed space-y-3 max-w-4xl">
                    <p>
                        DTEF is an early-stage, ongoing research project. These findings are preliminary and represent a snapshot from {STATS.analysisDate}.
                        The methodology, metrics, and interpretations are all subject to revision as we learn more.
                    </p>
                    <ul className="space-y-2 ml-4">
                        <li className="flex items-start gap-2">
                            <span className="text-primary mt-0.5 shrink-0">&bull;</span>
                            <span><strong>Expanded datasets:</strong> Integration of additional survey sources beyond Global Dialogues to broaden cultural and topical coverage.</span>
                        </li>
                        <li className="flex items-start gap-2">
                            <span className="text-primary mt-0.5 shrink-0">&bull;</span>
                            <span><strong>Intersectional analysis:</strong> Testing demographic combinations (e.g., &ldquo;young urban women&rdquo;) rather than single dimensions.</span>
                        </li>
                        <li className="flex items-start gap-2">
                            <span className="text-primary mt-0.5 shrink-0">&bull;</span>
                            <span><strong>Temporal tracking:</strong> Measuring whether models capture opinion shifts across survey rounds over time.</span>
                        </li>
                        <li className="flex items-start gap-2">
                            <span className="text-primary mt-0.5 shrink-0">&bull;</span>
                            <span><strong>Continuous benchmarking:</strong> Automatic re-evaluation as new model versions are released.</span>
                        </li>
                    </ul>
                </div>
            </section>

            {/* ── Methodology ───────────────────────────────────────────────── */}
            <Collapsible open={methodOpen} onOpenChange={setMethodOpen}>
                <CollapsibleTrigger className="w-full">
                    <div className="bg-card/40 backdrop-blur-sm rounded-lg ring-1 ring-border/50 p-5 flex items-center justify-between cursor-pointer hover:bg-muted/20 transition-colors">
                        <span className="text-sm font-medium text-foreground">About the Methodology</span>
                        <span className={`text-xs text-muted-foreground transition-transform ${methodOpen ? 'rotate-180' : ''}`}>&#9660;</span>
                    </div>
                </CollapsibleTrigger>
                <CollapsibleContent>
                    <div className="bg-card/40 backdrop-blur-sm rounded-b-lg ring-1 ring-border/50 ring-t-0 p-6 space-y-4 -mt-2 text-sm text-foreground/80 leading-relaxed">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <h4 className="font-medium text-foreground">Evaluation Task</h4>
                                <p>
                                    Each model receives a demographic profile and (optionally) context showing how that group
                                    answered other questions. It then predicts the response distribution for a target question.
                                    Predictions are compared to real survey data using Jensen-Shannon Divergence (JSD) similarity.
                                </p>
                            </div>
                            <div className="space-y-2">
                                <h4 className="font-medium text-foreground">Scoring</h4>
                                <p>
                                    JSD similarity ranges from 0 (completely wrong) to 1 (perfect match). We use
                                    the formula <span className="font-mono text-xs">1 - sqrt(JSD)</span>, which provides an intuitive
                                    similarity score that equals 1.0 when predicted and actual distributions are identical.
                                </p>
                            </div>
                            <div className="space-y-2">
                                <h4 className="font-medium text-foreground">Statistical Testing</h4>
                                <p>
                                    Pairwise permutation tests (10,000 iterations) with Holm-Bonferroni correction for multiple
                                    comparisons. Context responsiveness tested via regression slope with permutation null.
                                    Bootstrap resampling (1,000 iterations) for confidence intervals.
                                </p>
                            </div>
                            <div className="space-y-2">
                                <h4 className="font-medium text-foreground">Data Source</h4>
                                <p>
                                    Survey data from <a href="https://globaldialogues.ai/" target="_blank" rel="noopener noreferrer" className="text-primary hover:text-primary/80 underline">Global Dialogues</a>,
                                    rounds GD1&ndash;GD7. Demographics include age, gender, country, religion, environment (urban/rural),
                                    and AI concern level. Sample sizes range from ~33 (country) to ~516 (gender) respondents per segment.
                                </p>
                            </div>
                        </div>
                        <p className="text-xs text-muted-foreground mt-4">
                            Full statistical report and methodology details available in
                            the <a href="https://github.com/collect-intel/dtef-app" target="_blank" rel="noopener noreferrer" className="text-primary hover:text-primary/80 underline">project repository</a>.
                        </p>
                    </div>
                </CollapsibleContent>
            </Collapsible>
        </div>
    );
}
