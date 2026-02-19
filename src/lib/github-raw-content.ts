/**
 * GitHub Raw Content CDN utilities
 *
 * raw.githubusercontent.com serves raw file content from public repos
 * with NO API rate limit (unlike api.github.com which is 5000/hr authenticated,
 * 60/hr unauthenticated). This module provides CDN-based fetching for
 * blueprint files and model collections.
 */

import { BLUEPRINT_CONFIG_REPO_SLUG } from './configConstants';

// --- CDN URL Builder ---

/**
 * Builds a raw.githubusercontent.com URL for a file in a public GitHub repo.
 * These URLs bypass the GitHub API rate limit entirely.
 */
export function getRawContentUrl(repoSlug: string, ref: string, path: string): string {
  return `https://raw.githubusercontent.com/${repoSlug}/${ref}/${path}`;
}

/**
 * Fetches raw file content from GitHub CDN (no API rate limit for public repos).
 * Falls back-compatible: throws on failure so callers can catch and fall back.
 */
export async function fetchRawContent(repoSlug: string, ref: string, path: string): Promise<string> {
  const url = getRawContentUrl(repoSlug, ref, path);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`CDN fetch failed for ${path}: ${response.status} ${response.statusText}`);
  }
  return response.text();
}

// --- Model Collection Cache ---

interface CachedCollection {
  data: string[];
  fetchedAt: number;
}

const modelCollectionCache = new Map<string, CachedCollection>();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Fetches a model collection with in-memory caching (10-min TTL).
 * Uses CDN when commitSha is available, falls back to GitHub API.
 *
 * Only ~10 unique model collections exist, so caching them all is cheap.
 */
export async function fetchModelCollectionCached(
  collectionName: string,
  commitSha: string | null,
  githubToken?: string
): Promise<string[] | null> {
  const cacheKey = collectionName;
  const cached = modelCollectionCache.get(cacheKey);

  if (cached && (Date.now() - cached.fetchedAt) < CACHE_TTL_MS) {
    return cached.data;
  }

  try {
    let rawContent: string;

    if (commitSha) {
      // Use CDN (no rate limit)
      rawContent = await fetchRawContent(
        BLUEPRINT_CONFIG_REPO_SLUG,
        commitSha,
        `models/${collectionName}.json`
      );
    } else {
      // Fallback to GitHub API when no commit SHA available
      const headers: Record<string, string> = {
        'Accept': 'application/vnd.github.v3.raw',
      };
      if (githubToken) {
        headers['Authorization'] = `token ${githubToken}`;
      }
      const url = `https://api.github.com/repos/${BLUEPRINT_CONFIG_REPO_SLUG}/contents/models/${collectionName}.json`;
      const response = await fetch(url, { headers });
      if (!response.ok) {
        throw new Error(`API fetch failed: ${response.status}`);
      }
      rawContent = await response.text();
    }

    const parsed = JSON.parse(rawContent);
    if (!Array.isArray(parsed) || !parsed.every((m: unknown) => typeof m === 'string')) {
      console.error(`[github-raw-content] Invalid format for model collection '${collectionName}'`);
      return null;
    }

    modelCollectionCache.set(cacheKey, { data: parsed, fetchedAt: Date.now() });
    return parsed;
  } catch (error: any) {
    console.error(`[github-raw-content] Failed to fetch model collection '${collectionName}': ${error.message}`);
    return null;
  }
}

/**
 * Pre-warms the model collection cache by fetching all collection files.
 * Uses the tree API response (already fetched by scheduler) to discover collections,
 * then fetches each via CDN.
 *
 * Call this once at the start of the scheduler run to avoid per-blueprint API calls.
 */
export async function preWarmModelCollections(
  collectionNames: string[],
  commitSha: string | null,
  githubToken?: string
): Promise<void> {
  const results = await Promise.allSettled(
    collectionNames.map(name =>
      fetchModelCollectionCached(name, commitSha, githubToken)
    )
  );

  let succeeded = 0;
  let failed = 0;
  for (const result of results) {
    if (result.status === 'fulfilled' && result.value !== null) {
      succeeded++;
    } else {
      failed++;
    }
  }

  console.log(`[github-raw-content] Pre-warmed ${succeeded} model collections (${failed} failed)`);
}

/**
 * Clears the model collection cache. Useful for testing.
 */
export function clearModelCollectionCache(): void {
  modelCollectionCache.clear();
}
