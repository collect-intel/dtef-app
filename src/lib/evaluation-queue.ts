/**
 * In-process evaluation queue with concurrency limiting, drain-time backfill,
 * and auto-continuation.
 *
 * Prevents OOM crashes from concurrent evaluation pipelines by processing
 * them in controlled batches. Queued items survive as long as the process
 * is alive; on restart the cron will re-discover any lost items.
 *
 * Auto-continuation: when the queue fully drains after processing evals,
 * it runs backfill (to update aggregate summaries), then re-triggers the
 * scheduler to pick up any remaining configs.
 *
 * Summary update strategy:
 *   Tier 1 (per-eval): incrementalSummaryUpdate() runs after each eval,
 *     updating per-config summary, all_blueprints_summary, latest_runs_summary.
 *   Tier 2 (drain-time): lightweightBackfill() reads per-config summaries
 *     (~20KB each, ~20-40MB total) to rebuild homepage_summary + model summaries.
 *     Old full backfill downloaded all raw results (500MB+) causing OOM.
 */

const MAX_CONCURRENT = 3; // Reduced from 5 — leaves memory headroom for backfill
const DRAIN_DELAY_MS = 15_000; // 15s after queue drains before starting backfill

interface QueueItem {
  id: string;
  fn: () => Promise<void>;
  enqueuedAt: number;
}

let active = 0;
const queue: QueueItem[] = [];
let backfillFn: (() => Promise<void>) | null = null;
let backfillRunning = false;

// Queue drain: backfill + auto-continuation
let queueDrainedFn: (() => Promise<void>) | null = null;
let drainTimer: ReturnType<typeof setTimeout> | null = null;
let drainHandlerRunning = false;

// Lifetime stats (since process start)
let totalEnqueued = 0;
let totalCompleted = 0;
let totalFailed = 0;
let totalBackfills = 0;
let lastCompletedId: string | null = null;
let lastCompletedAt: number | null = null;
let lastFailedId: string | null = null;
let lastFailedAt: number | null = null;
let lastBackfillAt: number | null = null;
const processStartedAt = Date.now();

function processNext() {
  // Don't start new evals while backfill is running — it needs full memory.
  // Items stay queued and will be processed after backfill completes.
  if (backfillRunning) return;

  while (active < MAX_CONCURRENT && queue.length > 0) {
    const item = queue.shift()!;
    active++;
    const waitTime = Date.now() - item.enqueuedAt;
    console.log(`[eval-queue] Starting ${item.id} (waited ${Math.round(waitTime / 1000)}s, active: ${active}, queued: ${queue.length})`);

    item.fn().then(() => {
      totalCompleted++;
      lastCompletedId = item.id;
      lastCompletedAt = Date.now();
    }).catch((err) => {
      totalFailed++;
      lastFailedId = item.id;
      lastFailedAt = Date.now();
      console.error(`[eval-queue] Eval failed for ${item.id}:`, err?.message || err);
    }).finally(() => {
      active--;
      console.log(`[eval-queue] Finished ${item.id} (active: ${active}, queued: ${queue.length}, completed: ${totalCompleted}, failed: ${totalFailed})`);

      // Check if queue fully drained — run backfill then continuation
      if (active === 0 && queue.length === 0 && totalCompleted > 0) {
        scheduleDrainHandler();
      }

      // Use setImmediate to avoid deep recursive call stacks when many evals
      // complete in rapid succession (800+ queued items caused stack overflow)
      setImmediate(processNext);
    });
  }
}

/**
 * When the queue drains: run lightweight backfill (reads per-config summaries,
 * ~20-40MB) then trigger continuation (to schedule more evals).
 */
function scheduleDrainHandler() {
  if (drainTimer) {
    clearTimeout(drainTimer);
  }

  drainHandlerRunning = true;
  console.log(`[eval-queue] Queue drained (${totalCompleted} completed, ${totalFailed} failed). Backfill + continuation in ${DRAIN_DELAY_MS / 1000}s...`);

  drainTimer = setTimeout(async () => {
    drainTimer = null;

    // Step 1: Run backfill (with no evals active, full memory available)
    if (backfillFn && !backfillRunning) {
      backfillRunning = true;
      console.log('[eval-queue] Starting backfill (no active evals, full memory available)...');
      const backfillStart = Date.now();
      try {
        await backfillFn();
        totalBackfills++;
        lastBackfillAt = Date.now();
        const durationSec = Math.round((Date.now() - backfillStart) / 1000);
        console.log(`[eval-queue] Backfill completed in ${durationSec}s.`);
      } catch (err: any) {
        console.error('[eval-queue] Backfill failed:', err?.message || err);
      } finally {
        backfillRunning = false;
      }
    }

    // Process any items that arrived during backfill before continuation
    if (queue.length > 0) {
      console.log(`[eval-queue] Processing ${queue.length} items queued during backfill...`);
      processNext();
    }

    // Step 2: Trigger continuation (schedule more evals)
    if (queueDrainedFn) {
      try {
        await queueDrainedFn();
      } catch (err: any) {
        console.error('[eval-queue] Continuation handler error:', err?.message || err);
      }
    }

    drainHandlerRunning = false;
  }, DRAIN_DELAY_MS);
}

/**
 * Register a backfill function to run when the queue drains.
 * Only one can be registered at a time (last one wins).
 */
export function registerBackfillHandler(fn: () => Promise<void>) {
  backfillFn = fn;
}

/**
 * Register a function to call after backfill, when the queue has drained.
 * Used for auto-continuation: re-triggers the scheduler to process remaining configs.
 * Only one can be registered at a time (last one wins).
 */
export function registerQueueDrainedHandler(fn: () => Promise<void>) {
  queueDrainedFn = fn;
}

/**
 * Enqueue an evaluation for processing. Returns immediately.
 * The evaluation will run when a concurrency slot is available.
 */
export function enqueueEvaluation(id: string, fn: () => Promise<void>): { position: number; queueLength: number } {
  // Cancel any pending drain handler since new work arrived
  if (drainTimer) {
    clearTimeout(drainTimer);
    drainTimer = null;
    drainHandlerRunning = false;
  }

  queue.push({ id, fn, enqueuedAt: Date.now() });
  totalEnqueued++;
  const position = queue.length;
  console.log(`[eval-queue] Enqueued ${id} (position: ${position}, active: ${active})`);
  processNext();
  return { position, queueLength: queue.length };
}

/**
 * Get current queue status including lifetime stats.
 */
export function getQueueStatus() {
  return {
    active,
    queued: queue.length,
    backfillRunning,
    totalEnqueued,
    totalCompleted,
    totalFailed,
    totalBackfills,
    lastCompletedId,
    lastCompletedAt: lastCompletedAt ? new Date(lastCompletedAt).toISOString() : null,
    lastFailedId,
    lastFailedAt: lastFailedAt ? new Date(lastFailedAt).toISOString() : null,
    lastBackfillAt: lastBackfillAt ? new Date(lastBackfillAt).toISOString() : null,
    processStartedAt: new Date(processStartedAt).toISOString(),
    uptimeSeconds: Math.round((Date.now() - processStartedAt) / 1000),
  };
}
