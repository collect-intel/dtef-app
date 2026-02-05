/**
 * Token Budget Management
 *
 * Estimates token counts for prompt text and manages token budgets
 * to ensure generated prompts fit within model context windows.
 *
 * Uses a simple character-based estimation (~4 chars per token for English).
 * This is sufficient for budget management; exact counts aren't needed.
 */

/** Average characters per token for English text */
const CHARS_PER_TOKEN = 4;

/** Default token budget if not specified */
export const DEFAULT_TOKEN_BUDGET = 4096;

/** Minimum tokens reserved for the model's response */
export const RESPONSE_TOKEN_RESERVE = 256;

/** Minimum tokens for the core prompt (demographic + target question) */
export const CORE_PROMPT_MIN_TOKENS = 200;

/**
 * Estimate the number of tokens in a string.
 * Uses a simple heuristic: ~4 characters per token.
 */
export function estimateTokens(text: string): number {
    if (!text) return 0;
    return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/**
 * Token budget breakdown for a prompt.
 */
export interface TokenBudgetBreakdown {
    /** Total budget available */
    totalBudget: number;
    /** Tokens used by the system prompt */
    systemPromptTokens: number;
    /** Tokens used by the core prompt (demographic info + target question) */
    corePromptTokens: number;
    /** Tokens reserved for model response */
    responseReserve: number;
    /** Remaining tokens available for context questions */
    availableForContext: number;
    /** Number of context questions that fit */
    contextQuestionsFit: number;
    /** Whether the core prompt exceeds budget (error case) */
    overBudget: boolean;
}

/**
 * Calculate how many context questions fit within a token budget.
 *
 * @param systemPrompt - The system prompt text
 * @param corePrompt - The core prompt (demographic info + target question)
 * @param contextQuestionTexts - Array of context question texts, ordered by priority
 * @param tokenBudget - Maximum token budget
 * @returns Budget breakdown with number of context questions that fit
 */
export function calculateTokenBudget(
    systemPrompt: string,
    corePrompt: string,
    contextQuestionTexts: string[],
    tokenBudget: number = DEFAULT_TOKEN_BUDGET
): TokenBudgetBreakdown {
    const systemPromptTokens = estimateTokens(systemPrompt);
    const corePromptTokens = estimateTokens(corePrompt);
    const responseReserve = RESPONSE_TOKEN_RESERVE;

    const fixedTokens = systemPromptTokens + corePromptTokens + responseReserve;
    const availableForContext = Math.max(0, tokenBudget - fixedTokens);

    // Greedily add context questions until budget is exhausted
    let contextTokensUsed = 0;
    let contextQuestionsFit = 0;

    for (const contextText of contextQuestionTexts) {
        const contextTokens = estimateTokens(contextText);
        if (contextTokensUsed + contextTokens <= availableForContext) {
            contextTokensUsed += contextTokens;
            contextQuestionsFit++;
        } else {
            break;
        }
    }

    return {
        totalBudget: tokenBudget,
        systemPromptTokens,
        corePromptTokens,
        responseReserve,
        availableForContext,
        contextQuestionsFit,
        overBudget: fixedTokens > tokenBudget,
    };
}

/**
 * Select context questions that fit within a token budget.
 * Returns the subset of context questions that fit, maintaining order.
 *
 * @param contextItems - Array of {text, tokens} items to select from
 * @param availableTokens - Maximum tokens available for context
 * @returns Indices of selected items
 */
export function selectContextWithinBudget<T extends { text: string }>(
    contextItems: T[],
    availableTokens: number
): T[] {
    const selected: T[] = [];
    let tokensUsed = 0;

    for (const item of contextItems) {
        const tokens = estimateTokens(item.text);
        if (tokensUsed + tokens <= availableTokens) {
            selected.push(item);
            tokensUsed += tokens;
        } else {
            break;
        }
    }

    return selected;
}
