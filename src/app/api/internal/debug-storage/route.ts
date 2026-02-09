import { NextRequest, NextResponse } from 'next/server';
import { checkBackgroundAuth } from '@/lib/background-function-auth';
import { getCoreResult, getStorageProvider } from '@/lib/storageService';

/**
 * Diagnostic endpoint to test S3 read for a specific configId/runLabel/timestamp.
 * Protected by background auth token. DELETE after debugging.
 */
export async function POST(req: NextRequest) {
  const authError = checkBackgroundAuth(req);
  if (authError) return authError;

  const body = await req.json();
  const { configId, runLabel, timestamp } = body;

  if (!configId || !runLabel || !timestamp) {
    return NextResponse.json({ error: 'Missing configId, runLabel, or timestamp' }, { status: 400 });
  }

  const provider = getStorageProvider();
  const envCheck = {
    STORAGE_PROVIDER: process.env.STORAGE_PROVIDER || '(not set)',
    APP_S3_BUCKET_NAME: process.env.APP_S3_BUCKET_NAME ? 'set' : 'NOT SET',
    APP_S3_REGION: process.env.APP_S3_REGION || 'NOT SET',
    APP_AWS_ACCESS_KEY_ID: process.env.APP_AWS_ACCESS_KEY_ID ? 'set' : 'NOT SET',
    resolvedProvider: provider,
    NODE_ENV: process.env.NODE_ENV || '(not set)',
  };

  try {
    const startTime = Date.now();
    const result = await getCoreResult(configId, runLabel, timestamp);
    const duration = Date.now() - startTime;

    return NextResponse.json({
      env: envCheck,
      configId,
      runLabel,
      timestamp,
      runBase: `${runLabel}_${timestamp}`,
      found: result !== null,
      duration: `${duration}ms`,
      dataKeys: result ? Object.keys(result).slice(0, 10) : null,
      promptCount: result?.promptIds?.length ?? null,
      modelCount: result?.effectiveModels?.length ?? null,
    });
  } catch (error: any) {
    return NextResponse.json({
      env: envCheck,
      configId,
      runLabel,
      timestamp,
      error: error.message,
      errorName: error.name,
      stack: error.stack?.split('\n').slice(0, 5),
    }, { status: 500 });
  }
}
