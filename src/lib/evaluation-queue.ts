/**
 * In-process evaluation queue with concurrency limiting.
 *
 * Prevents OOM crashes from hundreds of concurrent evaluation pipelines
 * by processing them in controlled batches. Queued items survive as long
 * as the process is alive; on restart the weekly cron will re-discover
 * any that were lost.
 */

const MAX_CONCURRENT = 10;

interface QueueItem {
  id: string;
  fn: () => Promise<void>;
  enqueuedAt: number;
}

let active = 0;
const queue: QueueItem[] = [];

function processNext() {
  while (active < MAX_CONCURRENT && queue.length > 0) {
    const item = queue.shift()!;
    active++;
    const waitTime = Date.now() - item.enqueuedAt;
    console.log(`[eval-queue] Starting ${item.id} (waited ${Math.round(waitTime / 1000)}s, active: ${active}, queued: ${queue.length})`);

    item.fn().finally(() => {
      active--;
      console.log(`[eval-queue] Finished ${item.id} (active: ${active}, queued: ${queue.length})`);
      processNext();
    });
  }
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
