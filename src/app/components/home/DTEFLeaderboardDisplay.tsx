'use client';

import React, { useState } from 'react';
import { getModelDisplayLabel } from '@/app/utils/modelIdUtils';
import Icon from '@/components/ui/icon';
import type { DTEFSummary } from '@/cli/utils/dtefSummaryUtils';
import type { AggregatedModelResult } from '@/cli/services/demographicAggregationService';

const DTEFLeaderboardDisplay: React.FC<{
  dtefSummary: DTEFSummary | null | undefined;
}> = ({ dtefSummary }) => {
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());

  if (!dtefSummary || !dtefSummary.topModels || dtefSummary.topModels.length === 0) {
    return null;
  }

  const toggleCardExpansion = (cardId: string) => {
    const newExpanded = new Set(expandedCards);
    if (expandedCards.has(cardId)) {
      newExpanded.delete(cardId);
    } else {
      newExpanded.add(cardId);
    }
    setExpandedCards(newExpanded);
  };

  // Card 1: Overall Prediction Accuracy — from topModels
  const overallModels = dtefSummary.topModels;
  const overallDisplayed = expandedCards.has('overall') ? overallModels : overallModels.slice(0, 5);
  const hasMoreOverall = overallModels.length > 5;

  // Card 2: Best Model Per Segment Type
  const modelResults = dtefSummary.aggregation?.modelResults || [];
  const segmentTypeLeaders = computeSegmentTypeLeaders(modelResults);

  // Card 3: Fairness & Consistency — models sorted by lowest segmentStdDev
  const consistencyModels = [...modelResults]
    .filter(m => m.segmentStdDev !== undefined && m.segmentCount > 0)
    .sort((a, b) => a.segmentStdDev - b.segmentStdDev)
    .slice(0, 10)
    .map(m => ({
      modelId: m.modelId,
      stdDev: m.segmentStdDev,
      overallScore: m.overallScore,
    }));
  const consistencyDisplayed = expandedCards.has('fairness') ? consistencyModels : consistencyModels.slice(0, 5);
  const hasMoreConsistency = consistencyModels.length > 5;

  return (
    <div>
      <div className="text-center mb-8">
        <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-foreground dark:text-foreground mb-2">
          The Leaderboards
        </h2>
        <p className="text-muted-foreground dark:text-muted-foreground text-sm">
          How accurately do AI models predict demographic survey response distributions?
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
        {/* Card 1: Overall Prediction Accuracy */}
        <div className="border rounded-lg p-4 bg-card">
          <div className="mb-4">
            <div className="flex items-start justify-between mb-3">
              <h4 className="text-lg font-bold text-foreground leading-tight pr-2">Overall Prediction Accuracy</h4>
              <Icon name="bar-chart-3" className="w-6 h-6 flex-shrink-0 text-primary" />
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              How accurately models predict survey response distributions across all demographic segments
            </p>
          </div>
          <ul className="space-y-2">
            {overallDisplayed.map((model, index) => (
              <li key={model.modelId} className="flex justify-between items-center text-sm">
                <div className="flex items-center min-w-0 flex-1">
                  <span className="font-mono text-sm text-muted-foreground mr-2 w-4 flex-shrink-0">
                    {index + 1}.
                  </span>
                  <span className="font-medium truncate">
                    {getModelDisplayLabel(model.modelId, {
                      hideProvider: true,
                      hideModelMaker: true,
                      prettifyModelName: true,
                    })}
                  </span>
                </div>
                <span className="font-semibold text-sm flex-shrink-0">
                  {(model.overallScore * 100).toFixed(0)}%
                </span>
              </li>
            ))}
          </ul>
          {hasMoreOverall && (
            <div className="mt-3">
              <hr className="border-dotted border-muted-foreground/30 mb-2" />
              <button
                onClick={() => toggleCardExpansion('overall')}
                className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors duration-200 flex items-center justify-center gap-1"
              >
                {expandedCards.has('overall') ? (
                  <>
                    <Icon name="chevron-up" className="w-3 h-3" />
                    Show less
                  </>
                ) : (
                  <>
                    <Icon name="chevron-down" className="w-3 h-3" />
                    Show {overallModels.length - 5} more
                  </>
                )}
              </button>
            </div>
          )}
        </div>

        {/* Card 2: By Segment Type */}
        <div className="border rounded-lg p-4 bg-card">
          <div className="mb-4">
            <div className="flex items-start justify-between mb-3">
              <h4 className="text-lg font-bold text-foreground leading-tight pr-2">By Segment Type</h4>
              <Icon name="users" className="w-6 h-6 flex-shrink-0 text-primary" />
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Best performing model for each demographic category
            </p>
          </div>
          <ul className="space-y-2">
            {segmentTypeLeaders.map((leader) => (
              <li key={leader.segmentType} className="flex justify-between items-center text-sm">
                <div className="flex items-center min-w-0 flex-1">
                  <span className="text-muted-foreground mr-2 flex-shrink-0 text-xs uppercase tracking-wide w-20">
                    {leader.segmentType}
                  </span>
                  <span className="font-medium truncate">
                    {getModelDisplayLabel(leader.modelId, {
                      hideProvider: true,
                      hideModelMaker: true,
                      prettifyModelName: true,
                    })}
                  </span>
                </div>
                <span className="font-semibold text-sm flex-shrink-0">
                  {(leader.score * 100).toFixed(0)}%
                </span>
              </li>
            ))}
          </ul>
          {segmentTypeLeaders.length === 0 && (
            <p className="text-sm text-muted-foreground italic">No segment data available</p>
          )}
        </div>

        {/* Card 3: Fairness & Consistency */}
        <div className="border rounded-lg p-4 bg-card">
          <div className="mb-4">
            <div className="flex items-start justify-between mb-3">
              <h4 className="text-lg font-bold text-foreground leading-tight pr-2">Fairness & Consistency</h4>
              <Icon name="scale" className="w-6 h-6 flex-shrink-0 text-primary" />
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Models ranked by consistency across demographic segments — smaller gaps mean more equitable predictions
            </p>
          </div>
          {dtefSummary.fairnessConcerns && dtefSummary.fairnessConcerns.length > 0 && (
            <div className="mb-3 text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/20 rounded px-2 py-1">
              {dtefSummary.fairnessConcerns.length} model(s) show &gt;15% gap between best/worst segments
            </div>
          )}
          <ul className="space-y-2">
            {consistencyDisplayed.map((model, index) => (
              <li key={model.modelId} className="flex justify-between items-center text-sm">
                <div className="flex items-center min-w-0 flex-1">
                  <span className="font-mono text-sm text-muted-foreground mr-2 w-4 flex-shrink-0">
                    {index + 1}.
                  </span>
                  <span className="font-medium truncate">
                    {getModelDisplayLabel(model.modelId, {
                      hideProvider: true,
                      hideModelMaker: true,
                      prettifyModelName: true,
                    })}
                  </span>
                </div>
                <span className="font-semibold text-sm flex-shrink-0 tabular-nums" title={`Std dev: ${model.stdDev.toFixed(3)}`}>
                  ±{(model.stdDev * 100).toFixed(1)}%
                </span>
              </li>
            ))}
          </ul>
          {hasMoreConsistency && (
            <div className="mt-3">
              <hr className="border-dotted border-muted-foreground/30 mb-2" />
              <button
                onClick={() => toggleCardExpansion('fairness')}
                className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors duration-200 flex items-center justify-center gap-1"
              >
                {expandedCards.has('fairness') ? (
                  <>
                    <Icon name="chevron-up" className="w-3 h-3" />
                    Show less
                  </>
                ) : (
                  <>
                    <Icon name="chevron-down" className="w-3 h-3" />
                    Show {consistencyModels.length - 5} more
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

/** Compute the #1 model for each segment type (age, gender, country, etc.) */
function computeSegmentTypeLeaders(
  modelResults: AggregatedModelResult[]
): { segmentType: string; modelId: string; score: number }[] {
  if (modelResults.length === 0) return [];

  // Segment type labels based on segment ID prefixes
  const segmentTypeNames: Record<string, string> = {
    // Human-readable prefixes (from DTEF pipeline)
    'ageGroup': 'Age',
    'gender': 'Gender',
    'environment': 'Environ.',
    'aiConcern': 'AI Concern',
    'religion': 'Religion',
    'country': 'Country',
    // Legacy O-column prefixes (from raw GD CSVs)
    'O2': 'Age',
    'O3': 'Gender',
    'O4': 'Environ.',
    'O5': 'AI Concern',
    'O6': 'Religion',
    'O7': 'Country',
  };

  // For each segment type, find the model with the highest average score
  const leaders = new Map<string, { modelId: string; score: number }>();

  for (const model of modelResults) {
    if (!model.segmentScores) continue;
    // Group segment scores by prefix
    const byType = new Map<string, number[]>();
    for (const seg of model.segmentScores) {
      const prefix = seg.segmentId?.split(':')[0] || seg.segmentId?.substring(0, 2);
      if (!prefix || !segmentTypeNames[prefix]) continue;
      if (!byType.has(prefix)) byType.set(prefix, []);
      byType.get(prefix)!.push(seg.avgCoverageExtent);
    }
    for (const [prefix, scores] of byType) {
      const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
      const current = leaders.get(prefix);
      if (!current || avg > current.score) {
        leaders.set(prefix, { modelId: model.modelId, score: avg });
      }
    }
  }

  return Array.from(leaders.entries())
    .map(([prefix, data]) => ({
      segmentType: segmentTypeNames[prefix] || prefix,
      modelId: data.modelId,
      score: data.score,
    }))
    .sort((a, b) => b.score - a.score);
}

export default DTEFLeaderboardDisplay;
