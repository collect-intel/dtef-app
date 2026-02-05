/**
 * Demographics API Endpoint
 *
 * Serves DTEF demographic evaluation data for the demographics page.
 * Returns aggregated model performance across demographic segments.
 */

import { NextResponse } from 'next/server';
import { getJsonFile } from '@/lib/storageService';
import type { DTEFSummary } from '@/cli/utils/dtefSummaryUtils';

export const dynamic = 'force-dynamic';

const DTEF_SUMMARY_KEY = 'live/aggregates/dtef_summary.json';

/**
 * GET /api/demographics
 *
 * Returns the DTEF demographics summary.
 * Query params:
 *   - surveyId: optional filter by survey
 */
export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const surveyId = searchParams.get('surveyId');

        const key = surveyId
            ? `live/aggregates/dtef_summary_${surveyId}.json`
            : DTEF_SUMMARY_KEY;

        const data = await getJsonFile<DTEFSummary>(key);

        if (data) {
            return NextResponse.json(data);
        }

        // Return empty state when no DTEF data exists yet
        return NextResponse.json({
            status: 'no_data',
            message: 'No DTEF evaluation results available yet. Run demographic evaluations to populate this page.',
            leaderboard: [],
            segments: [],
            surveys: [],
        });
    } catch (error) {
        console.error('[API/demographics] Error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
