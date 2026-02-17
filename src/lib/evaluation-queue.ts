/**
 * In-process evaluation queue with concurrency limiting, periodic backfill,
 * and auto-continuation.
 *
 * Prevents OOM crashes from concurrent evaluation pipelines by processing
 * them in controlled batches. Queued items survive as long as the process
 * is alive; on restart the weekly cron will re-discover any lost items.
 *
 * Auto-continuation: when the queue fully drains after processing evals,
 * it automatically re-triggers the scheduler to pick up any remaining
 * configs that haven't been evaluated yet. This makes the system self-healing
 * after OOM crashes or partial batches.
 *
 * Backfill strategy: runs every BACKFILL_INTERVAL_COMPLETIONS evals and
 * also 30s after the last eval completes (to catch the tail end).
 * A lock prevents overlapping backfills.
 */

const MAX_CONCURRENT = 5; // Reduced from 10 to prevent OOM (~600MB per eval)
const BACKFILL_DEBOUNCE_MS = 30_000; // 30s after last eval completes
const BACKFILL_INTERVAL_COMPLETIONS = 100; // run backfill every N completions
const CONTINUATION_DELAY_MS = 45_000; // wait for backfill before continuation

interface QueueItem {
  id: string;
  fn: () => Promise<void>;
  enqueuedAt: number;
}

let active = 0;
const queue: QueueItem[] = [];
let backfillTimer: ReturnType<typeof setTimeout> | null = null;
let backfillFn: (() => Promise<void>) | null = null;
let backfillRunning = false;
let completionsSinceLastBackfill = 0;

// Auto-continuation: re-trigger scheduler when queue drains
let queueDrainedFn: (() => Promise<void>) | null = null;
let drainHandlerRunning = false;
let continuationTimer: ReturnType<typeof setTimeout> | null = null;

// Lifetime stats (since process start)
let totalEnqueued = 0;
let totalCompleted = 0;
let totalFailed = 0;
let lastCompletedId: string | null = null;
let lastCompletedAt: number | null = null;
let lastFailedId: string | null = null;
let lastFailedAt: number | null = null;
const processStartedAt = Date.now();

function processNext() {
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
      completionsSinceLastBackfill++;
      console.log(`[eval-queue] Finished ${item.id} (active: ${active}, queued: ${queue.length}, completed: ${totalCompleted}, failed: ${totalFailed})`);

      if (completionsSinceLastBackfill >= BACKFILL_INTERVAL_COMPLETIONS) {
        runBackfillNow();
      }
      scheduleDebouncedBackfill();

      // Check if queue fully drained — trigger continuation to schedule more
      if (active === 0 && queue.length === 0 && queueDrainedFn && !drainHandlerRunning && totalCompleted > 0) {
        scheduleQueueDrainedHandler();
      }

      // Use setImmediate to avoid deep recursive call stacks when many evals
      // complete in rapid succession (800+ queued items caused stack overflow)
      setImmediate(processNext);
    });
  }
}

/**
 * Schedule the queue-drained handler after a delay to let backfill complete first.
 */
function scheduleQueueDrainedHandler() {
  // Cancel any pending continuation (in case we're re-entering)
  if (continuationTimer) {
    clearTimeout(continuationTimer);
  }

  drainHandlerRunning = true;
  console.log(`[eval-queue] Queue fully drained (${totalCompleted} completed, ${totalFailed} failed). Scheduling continuation in ${CONTINUATION_DELAY_MS / 1000}s...`);

  continuationTimer = setTimeout(async () => {
    continuationTimer = null;
    try {
      await queueDrainedFn!();
    } catch (err: any) {
      console.error('[eval-queue] Queue drained handler error:', err.message || err);
    } finally {
      drainHandlerRunning = false;
    }
  }, CONTINUATION_DELAY_MS);
}

/**
 * Run backfill immediately (if not already running). Resets the completion counter.
 */
async function runBackfillNow() {
  if (!backfillFn || backfillRunning) return;

  backfillRunning = true;
  completionsSinceLastBackfill = 0;

  // Clear any pending debounce timer since we're running now
  if (backfillTimer) {
    clearTimeout(backfillTimer);
    backfillTimer = null;
  }

  const queueStatus = getQueueStatus();
  console.log(`[eval-queue] Running periodic backfill (active: ${queueStatus.active}, queued: ${queueStatus.queued})`);

  try {
    await backfillFn();
    console.log(`[eval-queue] Periodic backfill completed successfully.`);
  } catch (err) {
    console.error(`[eval-queue] Periodic backfill failed:`, err);
  } finally {
    backfillRunning = false;
  }
}

/**
 * Schedule a debounced backfill for the tail end — fires 30s after the
 * last eval completes, catching any stragglers below the interval threshold.
 */
function scheduleDebouncedBackfill() {
  if (!backfillFn) return;

  if (backfillTimer) {
    clearTimeout(backfillTimer);
  }

  backfillTimer = setTimeout(async () => {
    backfillTimer = null;
    await runBackfillNow();
  }, BACKFILL_DEBOUNCE_MS);
}

/**
 * Register a backfill function to run after evaluations complete.
 * Only one can be registered at a time (last one wins).
 */
export function registerBackfillHandler(fn: () => Promise<void>) {
  backfillFn = fn;
}

/**
 * Register a function to call when the queue fully drains (active=0, queued=0).
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
  // Cancel any pending continuation since new work arrived
  if (continuationTimer) {
    clearTimeout(continuationTimer);
    continuationTimer = null;
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
    completionsSinceBackfill: completionsSinceLastBackfill,
    totalEnqueued,
    totalCompleted,
    totalFailed,
    lastCompletedId,
    lastCompletedAt: lastCompletedAt ? new Date(lastCompletedAt).toISOString() : null,
    lastFailedId,
    lastFailedAt: lastFailedAt ? new Date(lastFailedAt).toISOString() : null,
    processStartedAt: new Date(processStartedAt).toISOString(),
    uptimeSeconds: Math.round((Date.now() - processStartedAt) / 1000),
  };
}
