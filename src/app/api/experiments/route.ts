/**
 * Experiments API Endpoint
 *
 * Serves experiment tracking data for the experiments page.
 * Returns individual experiments or the experiment index.
 */

import { NextResponse } from 'next/server';
import { getJsonFile } from '@/lib/storageService';
import type { ExperimentRecord, ExperimentIndex } from '@/types/experiment';

export const dynamic = 'force-dynamic';

/**
 * GET /api/experiments
 *
 * Query params:
 *   - id: return a single experiment by ID
 *   - (none): return the experiment index
 */
export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');

        if (id) {
            const experiment = await getJsonFile<ExperimentRecord>(`live/experiments/${id}.json`);
            if (experiment) {
                return NextResponse.json(experiment);
            }
            return NextResponse.json(
                { error: `Experiment "${id}" not found` },
                { status: 404 }
            );
        }

        const index = await getJsonFile<ExperimentIndex>('live/aggregates/experiments_index.json');
        if (index) {
            return NextResponse.json(index);
        }

        return NextResponse.json({
            experiments: [],
            lastUpdated: new Date().toISOString(),
        });
    } catch (error) {
        console.error('[API/experiments] Error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
