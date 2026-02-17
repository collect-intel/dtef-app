/**
 * In-process evaluation queue with concurrency limiting and periodic backfill.
 *
 * Prevents OOM crashes from hundreds of concurrent evaluation pipelines
 * by processing them in controlled batches. Queued items survive as long
 * as the process is alive; on restart the weekly cron will re-discover
 * any that were lost.
 *
 * Backfill strategy: runs every BACKFILL_INTERVAL_COMPLETIONS evals and
 * also 30s after the last eval completes (to catch the tail end).
 * A lock prevents overlapping backfills.
 */

const MAX_CONCURRENT = 10;
const BACKFILL_DEBOUNCE_MS = 30_000; // 30s after last eval completes
const BACKFILL_INTERVAL_COMPLETIONS = 25; // run backfill every N completions

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

function processNext() {
  while (active < MAX_CONCURRENT && queue.length > 0) {
    const item = queue.shift()!;
    active++;
    const waitTime = Date.now() - item.enqueuedAt;
    console.log(`[eval-queue] Starting ${item.id} (waited ${Math.round(waitTime / 1000)}s, active: ${active}, queued: ${queue.length})`);

    item.fn().finally(() => {
      active--;
      completionsSinceLastBackfill++;
      console.log(`[eval-queue] Finished ${item.id} (active: ${active}, queued: ${queue.length}, since backfill: ${completionsSinceLastBackfill})`);

      if (completionsSinceLastBackfill >= BACKFILL_INTERVAL_COMPLETIONS) {
        runBackfillNow();
      }
      scheduleDebouncedBackfill();

      // Use setImmediate to avoid deep recursive call stacks when many evals
      // complete in rapid succession (800+ queued items caused stack overflow)
      setImmediate(processNext);
    });
  }
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
 * Enqueue an evaluation for processing. Returns immediately.
 * The evaluation will run when a concurrency slot is available.
 */
export function enqueueEvaluation(id: string, fn: () => Promise<void>): { position: number; queueLength: number } {
  queue.push({ id, fn, enqueuedAt: Date.now() });
  const position = queue.length;
  console.log(`[eval-queue] Enqueued ${id} (position: ${position}, active: ${active})`);
  processNext();
  return { position, queueLength: queue.length };
}

/**
 * Get current queue status.
 */
export function getQueueStatus(): { active: number; queued: number; completionsSinceBackfill: number } {
  return { active, queued: queue.length, completionsSinceBackfill: completionsSinceLastBackfill };
}
