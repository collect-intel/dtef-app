import { calculatePotentialModelDrift, calculateHeadlineStats, calculateTopicChampions, processExecutiveSummaryGrades, processTopicData } from './summaryCalculationUtils';
import { EnhancedComparisonConfigInfo, EnhancedRunInfo } from '@/app/utils/homepageDataUtils';

// IMPORTANT: Mock parseModelIdForDisplay for unit test isolation
jest.mock('@/app/utils/modelIdUtils', () => ({
  parseModelIdForDisplay: jest.fn((modelId: string) => {
    // These mocks return what the real parser would return for these formats
    if (modelId === 'provider:model-a[temp:0]') {
      return { baseId: 'provider:model-a', displayName: 'Model A', fullId: modelId };
    }
    if (modelId === 'provider:model-b[temp:0]') {
      return { baseId: 'provider:model-b', displayName: 'Model B', fullId: modelId };
    }
    // Default fallback for any other test model IDs
    return { baseId: modelId, displayName: modelId, fullId: modelId };
  }),
  getModelDisplayLabel: jest.fn((modelId: string) => `Display ${modelId}`)
}));

jest.mock('@/app/utils/tagUtils', () => ({
  normalizeTag: jest.fn((tag: string) => {
    // Mock normalizeTag to return predictable values for tests
    const mockMappings: Record<string, string> = {
      'Safety': 'Safety',
      'Mental Health': 'Mental Health & Crisis Support',
      'AI Safety': 'AI Safety & Robustness',
      'math': 'math',
      'reasoning': 'reasoning',
      'algebra': 'algebra'
    };
    return mockMappings[tag] || tag.toLowerCase().replace(/\s+/g, '-');
  }),
  normalizeTopicKey: jest.fn((key: string) => key) // Pass through for simplicity
}));


/**
 * Test helper: Creates a mock run with properly formatted model IDs
 * 
 * Note: Model IDs use square bracket notation for suffixes (not colons)
 * This matches the format expected by parseModelIdForDisplay's regex patterns
 */
const mockRun = (timestamp: string, perModelScores: Record<string, { hybrid: number | null, similarity: number | null, coverage: number | null }>, temp: number = 0): EnhancedRunInfo => ({
  runLabel: 'mock-run-label',
  timestamp,
  fileName: `mock-run-label_${timestamp}_comparison.json`,
  temperature: temp,
  perModelScores: new Map(Object.entries(perModelScores).map(([k, v]) => [k, { 
    hybrid: { average: v.hybrid, stddev: null },
    similarity: { average: v.similarity, stddev: null },
    coverage: { average: v.coverage, stddev: null }
  }])),
});

const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

describe('calculateHeadlineStats', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should only use latest run per config for main leaderboard', () => {
    // This test validates the architectural fix: latest run only, not historical averages
    const configs: EnhancedComparisonConfigInfo[] = [{
      configId: 'config-1',
      configTitle: 'Config 1',
      runs: [
        // Latest run first (runs are sorted by timestamp desc)
        mockRun('2024-07-03T12:00:00Z', { 'provider:model-a[temp:0]': { hybrid: 0.9, similarity: 0.9, coverage: 0.9 } }),
        mockRun('2024-07-01T12:00:00Z', { 'provider:model-a[temp:0]': { hybrid: 0.5, similarity: 0.5, coverage: 0.5 } }), // Older run should be ignored
      ],
      latestRunTimestamp: '2024-07-03T12:00:00Z',
    }];
    
    const result = calculateHeadlineStats(configs, new Map(), new Map(), mockLogger);
    
    expect(result.rankedOverallModels).toBeDefined();
    expect(result.rankedOverallModels!.length).toBe(1);
    expect(result.rankedOverallModels![0].modelId).toBe('provider:model-a');
    expect(result.rankedOverallModels![0].overallAverageHybridScore).toBe(0.9); // Should use latest run score, not average of 0.9 and 0.5
    expect(result.rankedOverallModels![0].runsParticipatedIn).toBe(1); // Only latest run counted
  });

  it('should filter out configs with test tag', () => {
    const configs: EnhancedComparisonConfigInfo[] = [
      {
        configId: 'config-1',
        configTitle: 'Config 1',
        runs: [mockRun('2024-07-03T12:00:00Z', { 'provider:model-a[temp:0]': { hybrid: 0.9, similarity: 0.9, coverage: 0.9 } })],
        latestRunTimestamp: '2024-07-03T12:00:00Z',
        tags: ['test'],
      },
      {
        configId: 'config-2', 
        configTitle: 'Config 2',
        runs: [mockRun('2024-07-03T12:00:00Z', { 'provider:model-b[temp:0]': { hybrid: 0.8, similarity: 0.8, coverage: 0.8 } })],
        latestRunTimestamp: '2024-07-03T12:00:00Z',
      }
    ];
    
    const result = calculateHeadlineStats(configs, new Map(), new Map(), mockLogger);
    
    expect(result.rankedOverallModels).toBeDefined();
    expect(result.rankedOverallModels!.length).toBe(1);
    expect(result.rankedOverallModels![0].modelId).toBe('provider:model-b'); // Only non-test config
  });

  it('should create dimension leaderboards from provided grades', () => {
    // Need some configs for the function to not return null
    const configs: EnhancedComparisonConfigInfo[] = [{
      configId: 'config-1',
      configTitle: 'Config 1',
      runs: [mockRun('2024-07-03T12:00:00Z', { 'provider:model-a[temp:0]': { hybrid: 0.9, similarity: 0.9, coverage: 0.9 } })],
      latestRunTimestamp: '2024-07-03T12:00:00Z',
      tags: [], // Explicitly set empty tags to prevent automatic test tag inference
    }];

    // Mock some dimension grades
    const modelDimensionGrades = new Map();
    const modelAGrades = new Map();
    modelAGrades.set('clarity', { 
      totalScore: 40, 
      count: 5, 
      uniqueConfigs: new Set(['config1', 'config2', 'config3', 'config4', 'config5']),
      scores: [
        { score: 8, configTitle: 'Config 1', runLabel: 'run1', timestamp: '2024-01-01', configId: 'config1' },
        { score: 8, configTitle: 'Config 2', runLabel: 'run2', timestamp: '2024-01-02', configId: 'config2' },
        { score: 8, configTitle: 'Config 3', runLabel: 'run3', timestamp: '2024-01-03', configId: 'config3' },
        { score: 8, configTitle: 'Config 4', runLabel: 'run4', timestamp: '2024-01-04', configId: 'config4' },
        { score: 8, configTitle: 'Config 5', runLabel: 'run5', timestamp: '2024-01-05', configId: 'config5' }
      ]
    });
    modelDimensionGrades.set('provider:model-a', modelAGrades);
    
    const result = calculateHeadlineStats(configs, modelDimensionGrades, new Map(), mockLogger);
    
    expect(result.dimensionLeaderboards).toBeDefined();
    expect(result.dimensionLeaderboards!.length).toBe(1);
    expect(result.dimensionLeaderboards![0].dimension).toBe('clarity');
    expect(result.dimensionLeaderboards![0].leaderboard[0].modelId).toBe('provider:model-a');
    expect(result.dimensionLeaderboards![0].leaderboard[0].averageScore).toBe(8);
  });

  it('should return empty arrays when no data provided', () => {
    const result = calculateHeadlineStats([], new Map(), new Map(), mockLogger);
    
    expect(result.bestPerformingConfig).toBeNull();
    expect(result.worstPerformingConfig).toBeNull();
    expect(result.leastConsistentConfig).toBeNull();
    expect(result.rankedOverallModels).toBeNull();
    expect(result.dimensionLeaderboards).toBeNull();
  });

});

describe('calculateTopicChampions', () => {
  it('should calculate topic champions correctly', () => {
    const topicModelScores = new Map();
    const mathScores = new Map();
    mathScores.set('provider:model-a', {
      scores: [
        { score: 0.9, configId: 'config-1', configTitle: 'Math 1', runLabel: 'run-1', timestamp: '2024-07-03T12:00:00Z' },
        { score: 0.8, configId: 'config-2', configTitle: 'Math 2', runLabel: 'run-1', timestamp: '2024-07-02T12:00:00Z' },
        { score: 0.85, configId: 'config-3', configTitle: 'Math 3', runLabel: 'run-1', timestamp: '2024-07-01T12:00:00Z' },
        { score: 0.9, configId: 'config-4', configTitle: 'Math 4', runLabel: 'run-1', timestamp: '2024-06-30T12:00:00Z' },
        { score: 0.8, configId: 'config-5', configTitle: 'Math 5', runLabel: 'run-1', timestamp: '2024-06-29T12:00:00Z' },
      ],
      uniqueConfigs: new Set(['config-1', 'config-2', 'config-3', 'config-4', 'config-5'])
    });
    topicModelScores.set('math', mathScores);
    
    const result = calculateTopicChampions(topicModelScores);
    
    expect(result.math).toBeDefined();
    expect(result.math.length).toBe(1);
    expect(result.math[0].modelId).toBe('provider:model-a');
    expect(result.math[0].averageScore).toBe(0.85); // (0.9 + 0.8 + 0.85 + 0.9 + 0.8) / 5
    expect(result.math[0].uniqueConfigsCount).toBe(5);
    expect(result.math[0].contributingRuns).toHaveLength(5);
  });

  it('should filter out models with insufficient configs', () => {
    const topicModelScores = new Map();
    const mathScores = new Map();
    mathScores.set('provider:model-a', {
      scores: [
        { score: 0.9, configId: 'config-1', configTitle: 'Math 1', runLabel: 'run-1', timestamp: '2024-07-03T12:00:00Z' },
        { score: 0.8, configId: 'config-2', configTitle: 'Math 2', runLabel: 'run-1', timestamp: '2024-07-02T12:00:00Z' },
      ],
      uniqueConfigs: new Set(['config-1', 'config-2']) // Only 2 configs, need 5
    });
    topicModelScores.set('math', mathScores);
    
    const result = calculateTopicChampions(topicModelScores);
    
    expect(result.math).toBeUndefined(); // Should be filtered out
  });

  it('should sort champions by average score descending', () => {
    const topicModelScores = new Map();
    const mathScores = new Map();
    
    // Model A with lower average
    mathScores.set('provider:model-a', {
      scores: Array(5).fill(null).map((_, i) => ({ 
        score: 0.7, 
        configId: `config-${i+1}`, 
        configTitle: `Math ${i+1}`, 
        runLabel: 'run-1', 
        timestamp: '2024-07-03T12:00:00Z' 
      })),
      uniqueConfigs: new Set(['config-1', 'config-2', 'config-3', 'config-4', 'config-5'])
    });
    
    // Model B with higher average
    mathScores.set('provider:model-b', {
      scores: Array(5).fill(null).map((_, i) => ({ 
        score: 0.9, 
        configId: `config-${i+6}`, 
        configTitle: `Math ${i+6}`, 
        runLabel: 'run-1', 
        timestamp: '2024-07-03T12:00:00Z' 
      })),
      uniqueConfigs: new Set(['config-6', 'config-7', 'config-8', 'config-9', 'config-10'])
    });
    
    topicModelScores.set('math', mathScores);
    
    const result = calculateTopicChampions(topicModelScores);
    
    expect(result.math).toHaveLength(2);
    expect(result.math[0].modelId).toBe('provider:model-b'); // Higher score first
    expect(result.math[0].averageScore).toBe(0.9);
    expect(result.math[1].modelId).toBe('provider:model-a'); // Lower score second
    expect(result.math[1].averageScore).toBe(0.7);
  });
});

describe('processExecutiveSummaryGrades', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should process executive summary grades correctly', () => {
    const resultData = {
      configId: 'config-1',
      configTitle: 'Test Config',
      runLabel: 'run-1',
      timestamp: '2024-07-03T12:00:00Z',
      executiveSummary: {
        structured: {
          grades: [
            {
              modelId: 'provider:model-a[temp:0]', // IMPORTANT: Square brackets format, not 'provider:model-a:temp-0'
              grades: {
                clarity: 8,
                safety: 9,
                helpfulness: 7
              }
            }
          ]
        }
      }
    } as any;

    const modelDimensionGrades = new Map();
    
    processExecutiveSummaryGrades(resultData, modelDimensionGrades, mockLogger);
    
    // The mock parseModelIdForDisplay returns { baseId: 'provider:model-a' } for our test input
    expect(modelDimensionGrades.has('provider:model-a')).toBe(true);
    const modelGrades = modelDimensionGrades.get('provider:model-a')!;
    expect(modelGrades.has('clarity')).toBe(true);
    expect(modelGrades.get('clarity')!.totalScore).toBe(8);
    expect(modelGrades.get('clarity')!.count).toBe(1);
    expect(modelGrades.get('safety')!.totalScore).toBe(9);
    expect(modelGrades.get('helpfulness')!.totalScore).toBe(7);
    expect(mockLogger.info).toHaveBeenCalledWith('Processing executive summary grades for: config-1/run-1');
  });

  it('should use latest run per config for dimensions (temporal consistency)', () => {
    const modelDimensionGrades = new Map();
    
    // First run from config-1
    const firstRun = {
      configId: 'config-1',
      configTitle: 'Test Config',
      runLabel: 'run-1',
      timestamp: '2024-07-03T10:00:00Z', // Earlier timestamp
      executiveSummary: {
        structured: {
          grades: [
            {
              modelId: 'provider:model-a[temp:0]',
              grades: { safety: 6 } // Lower score, but earlier
            }
          ]
        }
      }
    } as any;

    // Second (later) run from same config-1
    const secondRun = {
      configId: 'config-1', // Same config
      configTitle: 'Test Config',
      runLabel: 'run-2',
      timestamp: '2024-07-03T12:00:00Z', // Later timestamp
      executiveSummary: {
        structured: {
          grades: [
            {
              modelId: 'provider:model-a[temp:0]',
              grades: { safety: 8 } // Higher score, but later
            }
          ]
        }
      }
    } as any;

    // Third run from different config-2
    const thirdRun = {
      configId: 'config-2', // Different config
      configTitle: 'Other Config',
      runLabel: 'run-1',
      timestamp: '2024-07-03T11:00:00Z',
      executiveSummary: {
        structured: {
          grades: [
            {
              modelId: 'provider:model-a[temp:0]',
              grades: { safety: 7 }
            }
          ]
        }
      }
    } as any;

    // Process runs in chronological order
    processExecutiveSummaryGrades(firstRun, modelDimensionGrades, mockLogger);
    processExecutiveSummaryGrades(secondRun, modelDimensionGrades, mockLogger);
    processExecutiveSummaryGrades(thirdRun, modelDimensionGrades, mockLogger);

    const modelGrades = modelDimensionGrades.get('provider:model-a')!;
    const safetyData = modelGrades.get('safety')!;
    
    // Should average latest from each config: (8 from config-1 + 7 from config-2) / 2 = 7.5
    expect(safetyData.totalScore).toBe(15); // 8 + 7
    expect(safetyData.count).toBe(2); // Two configs
    expect(safetyData.uniqueConfigs.size).toBe(2); // config-1 and config-2
    expect(safetyData.uniqueConfigs.has('config-1')).toBe(true);
    expect(safetyData.uniqueConfigs.has('config-2')).toBe(true);
    
    // Should only have scores from latest run per config
    expect(safetyData.scores).toHaveLength(2);
    const config1Score = safetyData.scores.find((s: any) => s.runLabel === 'run-2');
    const config2Score = safetyData.scores.find((s: any) => s.runLabel === 'run-1');
    expect(config1Score?.score).toBe(8); // Latest from config-1
    expect(config2Score?.score).toBe(7); // Only run from config-2
  });

  it('should skip zero scores', () => {
    const resultData = {
      configId: 'config-1',
      configTitle: 'Test Config',
      runLabel: 'run-1', 
      timestamp: '2024-07-03T12:00:00Z',
      executiveSummary: {
        structured: {
          grades: [
            {
              modelId: 'provider:model-a[temp:0]',
              grades: {
                clarity: 8,
                safety: 0, // Should be skipped
                helpfulness: 7
              }
            }
          ]
        }
      }
    } as any;

    const modelDimensionGrades = new Map();
    
    processExecutiveSummaryGrades(resultData, modelDimensionGrades, mockLogger);
    
    const modelGrades = modelDimensionGrades.get('provider:model-a')!;
    expect(modelGrades.has('clarity')).toBe(true);
    expect(modelGrades.has('safety')).toBe(false); // Should not exist
    expect(modelGrades.has('helpfulness')).toBe(true);
  });

  it('should handle missing executive summary gracefully', () => {
    const resultData = {
      configId: 'config-1',
      configTitle: 'Test Config',
      runLabel: 'run-1',
      timestamp: '2024-07-03T12:00:00Z',
      // No executiveSummary
    } as any;

    const modelDimensionGrades = new Map();
    
    processExecutiveSummaryGrades(resultData, modelDimensionGrades, mockLogger);
    
    expect(modelDimensionGrades.size).toBe(0); // Should remain empty
    expect(mockLogger.info).not.toHaveBeenCalled();
  });
});

describe('processTopicData', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should process topic data correctly', () => {
    const resultData = {
      configId: 'config-1',
      configTitle: 'Test Config',
      runLabel: 'run-1',
      timestamp: '2024-07-03T12:00:00Z',
      config: {
        tags: ['Safety', 'Mental Health']
      },
      executiveSummary: {
        structured: {
          autoTags: ['AI Safety']
        }
      }
    } as any;

    const perModelScores = new Map([
      ['provider:model-a[temp:0]', { hybrid: { average: 0.85 } }],
      ['provider:model-b[temp:0]', { hybrid: { average: 0.75 } }]
    ]) as any;

    const topicModelScores = new Map();
    
    processTopicData(resultData, perModelScores, topicModelScores, mockLogger);
    
    // Should have processed all normalized tags
    expect(topicModelScores.has('Safety')).toBe(true);
    expect(topicModelScores.has('Mental Health & Crisis Support')).toBe(true);
    expect(topicModelScores.has('AI Safety & Robustness')).toBe(true);
    
    // Check data for Safety topic
    const safetyTopic = topicModelScores.get('Safety')!;
    expect(safetyTopic.has('provider:model-a')).toBe(true);
    expect(safetyTopic.has('provider:model-b')).toBe(true);
    
    const modelAData = safetyTopic.get('provider:model-a')!;
    expect(modelAData.scores).toHaveLength(1);
    expect(modelAData.scores[0].score).toBe(0.85);
    expect(modelAData.uniqueConfigs.has('config-1')).toBe(true);
  });

  it('should use latest run per config for topics (temporal consistency)', () => {
    const topicModelScores = new Map();
    
    // Create test data with same model, same tags, but different configs and timestamps
    const firstRun = {
      configId: 'config-1',
      configTitle: 'Test Config 1',
      runLabel: 'run-1',
      timestamp: '2024-07-03T10:00:00Z', // Earlier
      config: { tags: ['Safety'] }
    } as any;

    const secondRun = {
      configId: 'config-1', // Same config
      configTitle: 'Test Config 1',
      runLabel: 'run-2', 
      timestamp: '2024-07-03T12:00:00Z', // Later
      config: { tags: ['Safety'] }
    } as any;

    const thirdRun = {
      configId: 'config-2', // Different config
      configTitle: 'Test Config 2',
      runLabel: 'run-1',
      timestamp: '2024-07-03T11:00:00Z',
      config: { tags: ['Safety'] }
    } as any;

    const perModelScoresRun1 = new Map([
      ['provider:model-a[temp:0]', { hybrid: { average: 0.60 } }] // Lower score, earlier
    ]) as any;

    const perModelScoresRun2 = new Map([
      ['provider:model-a[temp:0]', { hybrid: { average: 0.85 } }] // Higher score, later
    ]) as any;

    const perModelScoresRun3 = new Map([
      ['provider:model-a[temp:0]', { hybrid: { average: 0.75 } }] // Different config
    ]) as any;

    // Process in chronological order
    processTopicData(firstRun, perModelScoresRun1, topicModelScores, mockLogger);
    processTopicData(secondRun, perModelScoresRun2, topicModelScores, mockLogger);
    processTopicData(thirdRun, perModelScoresRun3, topicModelScores, mockLogger);

    const safetyTopic = topicModelScores.get('Safety')!;
    const modelAData = safetyTopic.get('provider:model-a')!;
    
    // Should only have latest scores from each config
    expect(modelAData.scores).toHaveLength(2); // Two configs
    expect(modelAData.uniqueConfigs.size).toBe(2);
    expect(modelAData.uniqueConfigs.has('config-1')).toBe(true);
    expect(modelAData.uniqueConfigs.has('config-2')).toBe(true);
    
    // Should use latest score from config-1 (0.85) and score from config-2 (0.75)
    const config1Score = modelAData.scores.find((s: any) => s.runLabel === 'run-2');
    const config2Score = modelAData.scores.find((s: any) => s.runLabel === 'run-1');
    expect(config1Score?.score).toBe(0.85); // Latest from config-1
    expect(config2Score?.score).toBe(0.75); // Only score from config-2
  });

  it('should handle missing tags gracefully', () => {
    const resultData = {
      configId: 'config-1',
      configTitle: 'Test Config',
      runLabel: 'run-1',
      timestamp: '2024-07-03T12:00:00Z',
      config: {
        // No tags
      }
    } as any;

    const perModelScores = new Map([
      ['provider:model-a[temp:0]', { hybrid: { average: 0.85 } }]
    ]) as any;

    const topicModelScores = new Map();
    
    processTopicData(resultData, perModelScores, topicModelScores, mockLogger);
    
    expect(topicModelScores.size).toBe(0); // Should remain empty
    expect(mockLogger.info).not.toHaveBeenCalled();
  });

  it('should skip models with null hybrid scores', () => {
    const resultData = {
      configId: 'config-1',
      configTitle: 'Test Config',
      runLabel: 'run-1',
      timestamp: '2024-07-03T12:00:00Z',
      config: {
        tags: ['Safety']
      }
    } as any;

    const perModelScores = new Map([
      ['provider:model-a[temp:0]', { hybrid: { average: 0.85 } }],
      ['provider:model-b[temp:0]', { hybrid: { average: null } }] // Should be skipped
    ]) as any;

    const topicModelScores = new Map();
    
    processTopicData(resultData, perModelScores, topicModelScores, mockLogger);
    
    const safetyTopic = topicModelScores.get('Safety')!;
    expect(safetyTopic.has('provider:model-a')).toBe(true);
    expect(safetyTopic.has('provider:model-b')).toBe(false); // Should not exist
  });
});

describe('calculatePotentialModelDrift', () => {

  it('should detect significant drift for a common model', () => {
    const configs: EnhancedComparisonConfigInfo[] = [{
      configId: 'config-1',
      configTitle: 'Config 1',
      runs: [
        mockRun('2024-07-01T12:00:00Z', { 
          'provider:model-a[temp:0]': { hybrid: 0.8, similarity: 0.8, coverage: 0.8 }, 
          'provider:model-b[temp:0]': { hybrid: 0.9, similarity: 0.9, coverage: 0.9 } 
        }),
        mockRun('2024-07-03T12:00:00Z', { 
          'provider:model-a[temp:0]': { hybrid: 0.6, similarity: 0.6, coverage: 0.6 }, 
          'provider:model-b[temp:0]': { hybrid: 0.91, similarity: 0.91, coverage: 0.91 } 
        }),
      ],
      latestRunTimestamp: '2024-07-03T12:00:00Z',
    }];
    const result = calculatePotentialModelDrift(configs);
    expect(result).not.toBeNull();
    expect(result?.modelId).toBe('provider:model-a');
    expect(result?.scoreRange).toBeCloseTo(0.2);
    expect(result?.minScore).toBe(0.6);
    expect(result?.maxScore).toBe(0.8);
  });

  it('should return null if no drift is significant', () => {
    const configs: EnhancedComparisonConfigInfo[] = [{
      configId: 'config-1',
      configTitle: 'Config 1',
      runs: [
        mockRun('2024-07-01T12:00:00Z', { 
          'provider:model-a[temp:0]': { hybrid: 0.8, similarity: 0.8, coverage: 0.8 }, 
          'provider:model-b[temp:0]': { hybrid: 0.9, similarity: 0.9, coverage: 0.9 } 
        }),
        mockRun('2024-07-03T12:00:00Z', { 
          'provider:model-a[temp:0]': { hybrid: 0.81, similarity: 0.81, coverage: 0.81 }, 
          'provider:model-b[temp:0]': { hybrid: 0.91, similarity: 0.91, coverage: 0.91 } 
        }),
      ],
      latestRunTimestamp: '2024-07-03T12:00:00Z',
    }];
    const result = calculatePotentialModelDrift(configs);
    expect(result).toBeNull();
  });
  
  it('should return null if time difference is less than the threshold', () => {
    const configs: EnhancedComparisonConfigInfo[] = [{
      configId: 'config-1',
      configTitle: 'Config 1',
      runs: [
        mockRun('2024-07-01T12:00:00Z', { 'provider:model-a[temp:0]': { hybrid: 0.8, similarity: 0.8, coverage: 0.8 } }),
        mockRun('2024-07-01T18:00:00Z', { 'provider:model-a[temp:0]': { hybrid: 0.6, similarity: 0.6, coverage: 0.6 } }), // Only 6 hours later
      ],
      latestRunTimestamp: '2024-07-01T18:00:00Z',
    }];
    const result = calculatePotentialModelDrift(configs);
    expect(result).toBeNull();
  });
  
  it('should ignore runs with non-zero temperature', () => {
    const configs: EnhancedComparisonConfigInfo[] = [{
      configId: 'config-1',
      configTitle: 'Config 1',
      runs: [
        mockRun('2024-07-01T12:00:00Z', { 'provider:model-a[temp:0]': { hybrid: 0.8, similarity: 0.8, coverage: 0.8 } }, 0),
        mockRun('2024-07-03T12:00:00Z', { 'provider:model-a[temp:0]': { hybrid: 0.6, similarity: 0.6, coverage: 0.6 } }, 0.7), // This run should be excluded
      ],
      latestRunTimestamp: '2024-07-03T12:00:00Z',
    }];
    const result = calculatePotentialModelDrift(configs);
    // Not enough runs with temp 0 to calculate drift
    expect(result).toBeNull();
  });

  it('should not detect drift if a model is not common to all runs', () => {
    const configs: EnhancedComparisonConfigInfo[] = [{
      configId: 'config-1',
      configTitle: 'Config 1',
      runs: [
        mockRun('2024-07-01T12:00:00Z', { 'provider:model-a[temp:0]': { hybrid: 0.8, similarity: 0.8, coverage: 0.8 }, 'provider:model-b[temp:0]': { hybrid: 0.9, similarity: 0.9, coverage: 0.9 } }), // model-b is here
        mockRun('2024-07-03T12:00:00Z', { 'provider:model-a[temp:0]': { hybrid: 0.6, similarity: 0.6, coverage: 0.6 }, 'provider:model-c[temp:0]': { hybrid: 0.9, similarity: 0.9, coverage: 0.9 } }), // but not here
      ],
      latestRunTimestamp: '2024-07-03T12:00:00Z',
    }];
    const result = calculatePotentialModelDrift(configs);
    // Drift is detected for model-a, which is common
    expect(result).not.toBeNull();
    expect(result?.modelId).toBe('provider:model-a');
  });

  it('should return null if no models are common across all runs', () => {
    const configs: EnhancedComparisonConfigInfo[] = [{
      configId: 'config-1',
      configTitle: 'Config 1',
      runs: [
        mockRun('2024-07-01T12:00:00Z', { 'provider:model-a[temp:0]': { hybrid: 0.8, similarity: 0.8, coverage: 0.8 } }),
        mockRun('2024-07-03T12:00:00Z', { 'provider:model-b[temp:0]': { hybrid: 0.6, similarity: 0.6, coverage: 0.6 } }),
      ],
      latestRunTimestamp: '2024-07-03T12:00:00Z',
    }];
    const result = calculatePotentialModelDrift(configs);
    expect(result).toBeNull();
  });
  
  it('should pick the model with the most significant drift across multiple configs', () => {
    const configs: EnhancedComparisonConfigInfo[] = [
      { // Config 1 has a model with 0.2 drift
        configId: 'config-1',
        configTitle: 'Config 1',
        runs: [
          mockRun('2024-07-01T12:00:00Z', { 'provider:model-a[temp:0]': { hybrid: 0.8, similarity: 0.8, coverage: 0.8 } }),
          mockRun('2024-07-03T12:00:00Z', { 'provider:model-a[temp:0]': { hybrid: 0.6, similarity: 0.6, coverage: 0.6 } }),
        ],
        latestRunTimestamp: '2024-07-03T12:00:00Z',
      },
      { // Config 2 has a model with 0.3 drift
        configId: 'config-2',
        configTitle: 'Config 2',
        runs: [
          mockRun('2024-07-01T12:00:00Z', { 'provider:model-b[temp:0]': { hybrid: 0.9, similarity: 0.9, coverage: 0.9 } }),
          mockRun('2024-07-03T12:00:00Z', { 'provider:model-b[temp:0]': { hybrid: 0.6, similarity: 0.6, coverage: 0.6 } }),
        ],
        latestRunTimestamp: '2024-07-03T12:00:00Z',
      }
    ];
    const result = calculatePotentialModelDrift(configs);
    expect(result).not.toBeNull();
    expect(result?.modelId).toBe('provider:model-b');
    expect(result?.scoreRange).toBeCloseTo(0.3);
  });

  it('should not fail if perModelHybridScores is null or undefined for a run', () => {
      const configs: EnhancedComparisonConfigInfo[] = [{
      configId: 'config-1',
      configTitle: 'Config 1',
      runs: [
        mockRun('2024-07-01T12:00:00Z', { 'provider:model-a[temp:0]': { hybrid: 0.8, similarity: 0.8, coverage: 0.8 } }),
        { ...mockRun('2024-07-03T12:00:00Z', {}), perModelScores: undefined },
      ],
      latestRunTimestamp: '2024-07-03T12:00:00Z',
    }];
     const result = calculatePotentialModelDrift(configs);
     expect(result).toBeNull();
  });

}); 

