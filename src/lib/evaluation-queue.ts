/**
 * In-process evaluation queue with concurrency limiting and debounced backfill.
 *
 * Prevents OOM crashes from hundreds of concurrent evaluation pipelines
 * by processing them in controlled batches. Queued items survive as long
 * as the process is alive; on restart the weekly cron will re-discover
 * any that were lost.
 *
 * After evaluations complete, a single debounced backfill runs instead of
 * one per eval — preventing N concurrent backfills from OOM-crashing the process.
 */

const MAX_CONCURRENT = 10;
const BACKFILL_DEBOUNCE_MS = 30_000; // 30s after last eval completes

interface QueueItem {
  id: string;
  fn: () => Promise<void>;
  enqueuedAt: number;
}

let active = 0;
const queue: QueueItem[] = [];
let backfillTimer: ReturnType<typeof setTimeout> | null = null;
let backfillFn: (() => Promise<void>) | null = null;

function processNext() {
  while (active < MAX_CONCURRENT && queue.length > 0) {
    const item = queue.shift()!;
    active++;
    const waitTime = Date.now() - item.enqueuedAt;
    console.log(`[eval-queue] Starting ${item.id} (waited ${Math.round(waitTime / 1000)}s, active: ${active}, queued: ${queue.length})`);

    item.fn().finally(() => {
      active--;
      console.log(`[eval-queue] Finished ${item.id} (active: ${active}, queued: ${queue.length})`);
      scheduleDebouncedBackfill();
      processNext();
    });
  }
}

/**
 * Schedule a debounced backfill. Resets the timer on each call so that
 * rapid-fire eval completions only trigger one backfill after they settle.
 */
function scheduleDebouncedBackfill() {
  if (!backfillFn) return;

  if (backfillTimer) {
    clearTimeout(backfillTimer);
  }

  backfillTimer = setTimeout(async () => {
    backfillTimer = null;
    if (!backfillFn) return;

    const queueStatus = getQueueStatus();
    console.log(`[eval-queue] Running debounced backfill (active: ${queueStatus.active}, queued: ${queueStatus.queued})`);

    try {
      await backfillFn();
      console.log(`[eval-queue] Debounced backfill completed successfully.`);
    } catch (err) {
      console.error(`[eval-queue] Debounced backfill failed:`, err);
    }
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
export function getQueueStatus(): { active: number; queued: number } {
  return { active, queued: queue.length };
}
