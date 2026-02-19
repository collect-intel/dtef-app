import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config");

    // In-process eval scheduler cron — replaces unreliable GitHub Actions cron.
    // Only runs in production with S3 storage (not during dev/build).
    if (process.env.STORAGE_PROVIDER === 's3') {
      const intervalMs = parseInt(process.env.EVAL_CRON_INTERVAL_MS || '3600000', 10); // default 1 hour
      const batchSize = parseInt(process.env.EVAL_CRON_BATCH || '200', 10);
      const startupDelayMs = 60_000; // wait 60s for server to warm up
      let cronRunning = false;

      const runScheduler = async () => {
        if (cronRunning) {
          console.log('[eval-cron] Previous run still active, skipping.');
          return;
        }
        cronRunning = true;
        try {
          const { callBackgroundFunction } = await import('@/lib/background-function-client');
          console.log(`[eval-cron] Triggering scheduler (batch=${batchSize})...`);
          const response = await callBackgroundFunction({
            functionName: 'fetch-and-schedule-evals',
            body: { limit: batchSize },
            timeout: 600_000, // 10 min — scheduler loops through all configs
          });
          if (response.ok) {
            const d = response.data;
            console.log(`[eval-cron] Result: ${d?.scheduled || 0} scheduled, ${d?.skippedFresh || 0} fresh, ${d?.total || '?'} total`);
          } else {
            console.error(`[eval-cron] Scheduler error: ${response.status} ${response.error}`);
          }
        } catch (err: any) {
          console.error(`[eval-cron] Failed: ${err.message}`);
        } finally {
          cronRunning = false;
        }
      };

      setTimeout(() => {
        console.log(`[eval-cron] Starting in-process scheduler (interval=${intervalMs / 1000}s, batch=${batchSize})`);
        runScheduler(); // first run immediately after startup delay
        setInterval(runScheduler, intervalMs);
      }, startupDelayMs);
    }
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
