# DTEF Coding Agent Architecture & Guidelines

*Comprehensive guide for AI coding agents working on the Digital Twin Evaluation Framework*

**Last Updated:** 2025-01-27  
**Purpose:** Ensure all coding agents have clear understanding of project structure, conventions, and workflow

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Architecture Principles](#architecture-principles)
3. [Code Organization](#code-organization)
4. [Development Workflow](#development-workflow)
5. [Task Selection & Prioritization](#task-selection--prioritization)
6. [Coding Standards](#coding-standards)
7. [Testing Requirements](#testing-requirements)
8. [Documentation Standards](#documentation-standards)
9. [Common Patterns & Conventions](#common-patterns--conventions)
10. [Troubleshooting Guide](#troubleshooting-guide)
11. [Agent Communication Protocol](#agent-communication-protocol)

---

## Project Overview

### What is DTEF?

The **Digital Twin Evaluation Framework (DTEF)** is a platform for evaluating how accurately AI models can predict demographic-specific survey response distributions. It's built as a modified fork of the [weval](https://github.com/weval-org/app) evaluation platform.

### Key Differences from Weval

| Aspect | Weval | DTEF |
|--------|-------|------|
| **Blueprint Source** | User-created custom blueprints | Auto-generated from survey data |
| **Evaluation Focus** | Generic model capabilities | Demographic prediction accuracy |
| **Evaluation Types** | User-defined prompts/criteria | Pre-defined evaluation types |
| **Results Display** | Standard leaderboards | Demographic segment leaderboards |

### Core Workflow

```
Survey Data → DTEF Format → Blueprint Generation → Evaluation → Results → Aggregation → UI Display
```

### Key Documents to Read First

1. **`DTEF_OVERVIEW.md`** - High-level project overview and goals
2. **`PROJECT_CONTEXT.md`** - Essential context for agents
3. **`DTEF_PROJECT_PLAN.md`** - High-level implementation plan
4. **`DTEF_TASK_PLAN.md`** - Detailed task breakdown (this is your roadmap)
5. **`docs/ARCHITECTURE.md`** - Weval architecture (DTEF is based on this)

---

## Architecture Principles

### 1. Preserve Weval Infrastructure

**Rule:** Don't break existing weval functionality unless explicitly required.

- Keep evaluation execution infrastructure intact
- Maintain blueprint parsing/execution compatibility
- Preserve storage and retrieval mechanisms
- Only modify what's necessary for DTEF features

**What to Preserve:**
- `comparison-pipeline-service.ts` - Core evaluation engine
- `blueprint-service.ts` - Blueprint parsing
- `storageService.ts` - Storage abstraction
- `summaryCalculationUtils.ts` - Summary generation

### 2. Extend, Don't Replace

**Rule:** Create new services/components rather than modifying existing ones when possible.

- Create `demographicBlueprintService.ts` instead of modifying `surveyBlueprintService.ts`
- Create new types in `dtef.ts` rather than breaking existing `survey.ts` types
- Mark legacy code as deprecated, don't delete it

### 3. Type Safety First

**Rule:** Use TypeScript types rigorously. Avoid `any` types.

- Define interfaces for all data structures
- Use discriminated unions for variant types
- Export types for reuse
- Document types with JSDoc

### 4. Test-Driven Development

**Rule:** Write tests alongside implementation, not after.

- Create test files in `__tests__/` directories
- Test edge cases and error conditions
- Maintain high test coverage
- Tests should be fast and isolated

### 5. Incremental Development

**Rule:** Build and test incrementally. Don't build large features in one go.

- Complete one task at a time
- Verify acceptance criteria before moving on
- Test each component as you build it
- Get feedback early

---

## Code Organization

### Directory Structure

```
dtef-app/
├── src/
│   ├── app/                    # Next.js app directory
│   │   ├── api/                # API routes
│   │   │   └── demographic-leaderboards/  # DTEF API endpoints
│   │   ├── (standard)/         # Public pages
│   │   │   └── demographics/  # DTEF-specific pages
│   │   └── components/         # React components
│   │       └── dtef/           # DTEF-specific components
│   ├── cli/                    # CLI commands and services
│   │   ├── commands/           # CLI command handlers
│   │   ├── services/           # Business logic
│   │   │   ├── adapters/       # Data format adapters
│   │   │   └── __tests__/      # Service tests
│   │   └── utils/              # CLI utilities
│   ├── lib/                    # Shared libraries
│   │   ├── blueprint-service.ts    # Blueprint parsing (weval)
│   │   ├── storageService.ts       # Storage abstraction (weval)
│   │   └── configConstants.ts      # Configuration constants
│   ├── point-functions/        # Custom evaluation functions
│   │   └── distribution_metric.ts  # DTEF distribution evaluator
│   ├── types/                  # TypeScript type definitions
│   │   ├── survey.ts           # Survey types (legacy + new)
│   │   ├── dtef.ts             # DTEF-specific types
│   │   └── shared.ts           # Shared types (weval)
│   └── utils/                  # Shared utilities
├── docs/                       # Documentation
│   ├── ARCHITECTURE.md         # Weval architecture
│   ├── SURVEY_MODULE.md        # Survey module docs
│   └── DTEF_*.md               # DTEF-specific docs
├── examples/                   # Example files
│   └── blueprints/             # Example blueprints
├── netlify/
│   └── functions/             # Netlify serverless functions
└── scripts/                    # Utility scripts
```

### File Naming Conventions

- **Services:** `camelCase.ts` (e.g., `demographicBlueprintService.ts`)
- **Types:** `camelCase.ts` (e.g., `dtef.ts`, `survey.ts`)
- **Components:** `PascalCase.tsx` (e.g., `DemographicLeaderboard.tsx`)
- **Tests:** `*.test.ts` or `*.test.tsx`
- **Config files:** `kebab-case` (e.g., `netlify.toml`)

### Import Organization

```typescript
// 1. External dependencies
import { z } from 'zod';
import * as fs from 'fs/promises';

// 2. Internal shared utilities
import { getLogger } from '@/utils/logger';
import { WevalConfig } from '@/types/shared';

// 3. Local imports
import { DemographicBlueprintService } from './demographicBlueprintService';
import { DTEFSurveyData } from '@/types/dtef';
```

---

## Development Workflow

### Starting Work

1. **Read Context Documents**
   - Start with `DTEF_OVERVIEW.md` and `PROJECT_CONTEXT.md`
   - Review `DTEF_TASK_PLAN.md` to understand current phase
   - Check `DTEF_PROJECT_PLAN.md` for high-level context

2. **Check Current Status**
   - Review task status in `DTEF_TASK_PLAN.md`
   - Check for any open PRs or recent commits
   - Read any recent documentation updates

3. **Select a Task**
   - Start with Phase 0 if not completed
   - Work through phases sequentially
   - Complete all tasks in a phase before moving to next
   - Check dependencies before starting a task

4. **Understand the Task**
   - Read task description and acceptance criteria
   - Identify files to create/modify
   - Review related code to understand patterns
   - Check for similar implementations in codebase

### During Development

1. **Create/Modify Files**
   - Follow naming conventions
   - Use existing patterns as templates
   - Write clear, self-documenting code
   - Add JSDoc comments for public APIs

2. **Write Tests**
   - Create test files alongside implementation
   - Test happy paths and edge cases
   - Test error conditions
   - Ensure tests pass before moving on

3. **Verify Acceptance Criteria**
   - Check each acceptance criterion
   - Run tests
   - Test manually if needed
   - Document any deviations

4. **Update Documentation**
   - Update relevant docs if architecture changes
   - Add code comments for complex logic
   - Update task status in `DTEF_TASK_PLAN.md`

### Completing Work

1. **Final Verification**
   - All acceptance criteria met
   - Tests passing
   - No linter errors
   - Code follows conventions

2. **Update Task Status**
   - Mark task as complete in `DTEF_TASK_PLAN.md`
   - Document any issues or decisions
   - Note any follow-up work needed

3. **Prepare for Next Task**
   - Review next task dependencies
   - Ensure prerequisites are met
   - Plan approach for next task

---

## Task Selection & Prioritization

### Task Priority Order

1. **Phase 0 (Infrastructure)** - Must complete first
2. **Phase 1 (Evaluation)** - Must complete before Phase 2
3. **Phase 2 (Blueprint Generation)** - Core feature, high priority
4. **Phase 3 (Results & Aggregation)** - Depends on Phase 2
5. **Phase 4 (UI)** - Depends on Phase 3
6. **Phase 5 (Testing)** - Depends on all previous phases
7. **Phase 6 (Polish)** - Final phase

### Task Selection Rules

**DO:**
- ✅ Start with Phase 0, Task 0.1
- ✅ Complete tasks in numerical order within a phase
- ✅ Verify dependencies are met before starting
- ✅ Complete all tasks in a phase before moving to next phase
- ✅ Check validation checkpoints before proceeding

**DON'T:**
- ❌ Skip phases or tasks
- ❌ Start a task without completing dependencies
- ❌ Mark tasks complete without meeting acceptance criteria
- ❌ Modify code outside the scope of current task
- ❌ Break existing functionality

### Handling Blockers

If you encounter a blocker:

1. **Document the Issue**
   - What task are you working on?
   - What's the specific problem?
   - What have you tried?
   - What error messages or symptoms?

2. **Check Documentation**
   - Review relevant docs
   - Check for similar issues in codebase
   - Review architecture docs

3. **Make a Decision**
   - Can you work around it?
   - Does it require architecture change?
   - Should you proceed with a different approach?

4. **Document Decision**
   - Update task notes
   - Document in relevant docs
   - Note any follow-up needed

---

## Coding Standards

### TypeScript

**Use strict mode:**
```typescript
// Good
function calculateMAE(predicted: number[], actual: number[]): number {
  // Implementation
}

// Bad
function calculateMAE(predicted: any, actual: any): any {
  // Implementation
}
```

**Prefer interfaces over types for objects:**
```typescript
// Good
interface DemographicSegment {
  id: string;
  label: string;
}

// Acceptable for unions
type QuestionType = 'single-select' | 'multi-select';
```

**Use discriminated unions for variants:**
```typescript
type SurveyQuestion = 
  | { type: 'single-select'; options: string[] }
  | { type: 'multi-select'; options: string[] }
  | { type: 'open-ended' };
```

### Error Handling

**Use Result types for operations that can fail:**
```typescript
interface Result<T, E = Error> {
  success: boolean;
  data?: T;
  error?: E;
}

function parseDistribution(text: string): Result<number[]> {
  try {
    // Parse logic
    return { success: true, data: parsed };
  } catch (error) {
    return { success: false, error: error as Error };
  }
}
```

**Throw errors for programming errors:**
```typescript
function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Required environment variable ${key} is not set`);
  }
  return value;
}
```

### Async/Await

**Always use async/await, not promises:**
```typescript
// Good
async function loadSurveyData(path: string): Promise<DTEFSurveyData> {
  const content = await fs.readFile(path, 'utf-8');
  return JSON.parse(content);
}

// Bad
function loadSurveyData(path: string): Promise<DTEFSurveyData> {
  return fs.readFile(path, 'utf-8').then(content => JSON.parse(content));
}
```

**Handle errors properly:**
```typescript
// Good
try {
  const data = await loadSurveyData(path);
  return data;
} catch (error) {
  logger.error('Failed to load survey data', { path, error });
  throw new Error(`Failed to load survey data from ${path}: ${error.message}`);
}
```

### Logging

**Use the logger utility:**
```typescript
import { getLogger } from '@/utils/logger';

const logger = await getLogger('demographic-blueprint-service');

logger.info('Generating blueprints', { segmentCount: 10 });
logger.error('Failed to generate blueprint', { error, segmentId });
```

**Log levels:**
- `logger.debug()` - Detailed debugging info
- `logger.info()` - General information
- `logger.warn()` - Warnings (non-fatal issues)
- `logger.error()` - Errors (fatal issues)

---

## Testing Requirements

### Test Structure

**Place tests next to source files:**
```
src/cli/services/
├── demographicBlueprintService.ts
└── __tests__/
    └── demographicBlueprintService.test.ts
```

### Test Naming

```typescript
describe('DemographicBlueprintService', () => {
  describe('generateBlueprints', () => {
    it('should generate blueprints for single-attribute segments', () => {
      // Test implementation
    });

    it('should handle missing demographic data gracefully', () => {
      // Test implementation
    });
  });
});
```

### Test Coverage Requirements

- **Unit tests:** All public methods
- **Edge cases:** Empty inputs, invalid data, missing fields
- **Error cases:** Network failures, parsing errors, validation failures
- **Integration tests:** For critical paths (blueprint generation → execution)

### Test Data

**Use fixtures for test data:**
```typescript
// tests/fixtures/sample-survey.json
{
  "surveyId": "test-survey",
  "questions": { /* ... */ },
  "segments": [ /* ... */ ]
}

// In test file
import sampleSurvey from '../fixtures/sample-survey.json';
```

---

## Documentation Standards

### Code Comments

**JSDoc for public APIs:**
```typescript
/**
 * Generates Weval blueprints from demographic survey data.
 * 
 * @param surveyData - The survey data in DTEF format
 * @param config - Configuration for blueprint generation
 * @returns Array of WevalConfig blueprints
 * @throws {ValidationError} If survey data is invalid
 * 
 * @example
 * ```typescript
 * const blueprints = DemographicBlueprintService.generateBlueprints(
 *   surveyData,
 *   { contextQuestionCount: 5, detailLevels: ['age', 'gender'] }
 * );
 * ```
 */
static generateBlueprints(
  surveyData: DTEFSurveyData,
  config: DemographicBlueprintConfig
): WevalConfig[] {
  // Implementation
}
```

**Inline comments for complex logic:**
```typescript
// Calculate MAE: mean of absolute differences between predicted and actual
// Lower MAE = better prediction accuracy
const mae = predicted.reduce((sum, pred, i) => {
  return sum + Math.abs(pred - actual[i]);
}, 0) / predicted.length;
```

### Documentation Files

**Update docs when architecture changes:**
- `DTEF_PROJECT_PLAN.md` - High-level plan
- `DTEF_TASK_PLAN.md` - Task status
- `PROJECT_CONTEXT.md` - Architecture decisions
- Component-specific docs in `docs/`

---

## Common Patterns & Conventions

### Service Pattern

**Services are static classes:**
```typescript
export class DemographicBlueprintService {
  private static validateInput(data: DTEFSurveyData): void {
    // Private helper
  }

  static generateBlueprints(
    surveyData: DTEFSurveyData,
    config: DemographicBlueprintConfig
  ): WevalConfig[] {
    // Public API
  }
}
```

### Configuration Pattern

**Use interfaces for configuration:**
```typescript
interface DemographicBlueprintConfig {
  contextQuestionCount: number;
  targetQuestionCount: number;
  detailLevels: string[];
  outputFormat: 'percentage' | 'distribution';
  tokenLimit?: number; // Optional with default
}

// Provide defaults
const defaultConfig: Partial<DemographicBlueprintConfig> = {
  contextQuestionCount: 5,
  tokenLimit: 4096,
};
```

### Validation Pattern

**Validate early, fail fast:**
```typescript
function generateBlueprints(
  surveyData: DTEFSurveyData,
  config: DemographicBlueprintConfig
): WevalConfig[] {
  // Validate inputs first
  DTEFSurveyValidator.validate(surveyData);
  validateConfig(config);
  
  // Then proceed with logic
  // ...
}
```

### Error Pattern

**Create specific error types:**
```typescript
export class ValidationError extends Error {
  constructor(message: string, public field?: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

// Usage
if (!surveyData.surveyId) {
  throw new ValidationError('surveyId is required', 'surveyId');
}
```

---

## Troubleshooting Guide

### Common Issues

#### Issue: "Cannot find module '@/types/dtef'"

**Solution:**
- Check that `src/types/dtef.ts` exists
- Verify TypeScript path mapping in `tsconfig.json`
- Ensure types are exported

#### Issue: "Environment variable not set"

**Solution:**
- Check `.env.local` file exists
- Verify variable name matches exactly
- Run `pnpm validate:env` to check all variables

#### Issue: "Blueprint execution fails"

**Solution:**
- Validate blueprint format manually
- Check blueprint against WevalConfig type
- Review evaluation point function registration
- Check logs for specific error messages

#### Issue: "Tests failing after changes"

**Solution:**
- Run tests in isolation: `pnpm test -- demographicBlueprintService`
- Check test data matches current types
- Verify mocks are updated
- Check for async/await issues

### Debugging Steps

1. **Check Logs**
   - Review console output
   - Check Netlify function logs (if applicable)
   - Review test output

2. **Verify Types**
   - Run `pnpm type-check`
   - Check for type errors
   - Verify imports are correct

3. **Test Incrementally**
   - Test individual functions
   - Test with minimal data
   - Add complexity gradually

4. **Review Similar Code**
   - Look for similar implementations
   - Check existing patterns
   - Review architecture docs

---

## Agent Communication Protocol

### When Starting Work

**Announce your intent:**
```
I'm starting work on [Task X.Y: Task Name] from Phase [N].
Dependencies: [list completed dependencies]
Plan: [brief description of approach]
```

### During Work

**Update on progress:**
```
Progress on [Task X.Y]:
- ✅ Completed: [what's done]
- 🔄 In progress: [what you're working on]
- ⚠️ Blocked: [any issues]
- 📝 Notes: [any decisions or findings]
```

### When Completing Work

**Summarize completion:**
```
Completed [Task X.Y: Task Name]
- ✅ All acceptance criteria met
- ✅ Tests passing
- 📝 Notes: [any important notes]
- 🔗 Next: [next task to work on]
```

### When Blocked

**Ask for help:**
```
Blocked on [Task X.Y: Task Name]
Issue: [specific problem]
Attempted: [what you've tried]
Question: [specific question]
```

### Code Review Notes

**When making significant changes:**
- Document architectural decisions
- Explain non-obvious code
- Note any trade-offs made
- Document future improvements needed

---

## Quick Reference

### Key Files

| File | Purpose |
|------|---------|
| `DTEF_TASK_PLAN.md` | Detailed task breakdown - **YOUR ROADMAP** |
| `DTEF_PROJECT_PLAN.md` | High-level implementation plan |
| `PROJECT_CONTEXT.md` | Essential project context |
| `DTEF_OVERVIEW.md` | Project overview and goals |
| `src/types/dtef.ts` | DTEF-specific type definitions |
| `src/cli/services/demographicBlueprintService.ts` | Core blueprint generation |
| `src/point-functions/distribution_metric.ts` | Distribution evaluation function |

### Key Commands

```bash
# Run tests
pnpm test

# Run type check
pnpm type-check

# Run linter
pnpm lint

# Validate environment
pnpm validate:env

# Run CLI command
pnpm cli survey generate-demographic --input data.json

# Start dev server
pnpm dev
```

### Key Concepts

- **Demographic Segment:** A group defined by demographic attributes (e.g., "Age 18-25, Female")
- **Response Distribution:** Percentages for each answer option (e.g., [20%, 30%, 25%, 15%, 10%])
- **Blueprint:** Weval evaluation configuration (YAML/JSON)
- **MAE:** Mean Absolute Error - lower is better
- **JSD:** Jensen-Shannon Divergence - lower is better

---

## Final Notes

1. **Read First, Code Second** - Understand the architecture before making changes
2. **Test Always** - Write tests alongside code
3. **Document Decisions** - Future agents need to understand why
4. **Follow Patterns** - Use existing code as templates
5. **Ask Questions** - Better to clarify than guess

**Remember:** You're building on top of weval. Preserve what works, extend what's needed, and document everything.

---

**End of Agent Architecture Guide**
