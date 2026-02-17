import { NextRequest, NextResponse } from 'next/server';
import { checkBackgroundAuth } from '@/lib/background-function-auth';
import { getQueueStatus } from '@/lib/evaluation-queue';

export async function GET(req: NextRequest) {
  const authError = checkBackgroundAuth(req);
  if (authError) return authError;

  return NextResponse.json(getQueueStatus());
}
