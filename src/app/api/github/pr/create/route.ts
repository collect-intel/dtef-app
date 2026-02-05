import { NextRequest, NextResponse } from 'next/server';
import { getOctokit } from '@/lib/github/github-utils';
import { BLUEPRINT_CONFIG_UPSTREAM_OWNER, BLUEPRINT_CONFIG_UPSTREAM_REPO } from '@/lib/configConstants';

const UPSTREAM_OWNER = BLUEPRINT_CONFIG_UPSTREAM_OWNER;
const UPSTREAM_REPO = BLUEPRINT_CONFIG_UPSTREAM_REPO;

export async function POST(req: NextRequest) {
    const octokit = await getOctokit(req);
    
    if (!octokit) {
        return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    try {
        const { forkName, title, body, headBranch } = await req.json();

        if (!forkName || !title || !body || !headBranch) {
            return NextResponse.json(
                { error: 'forkName, title, body, and headBranch are required' },
                { status: 400 },
            );
        }

        const userResponse = await octokit.users.getAuthenticated();
        const userLogin = userResponse.data.login;
        
        const prData = {
            title,
            body,
            head: `${userLogin}:${headBranch}`,
            base: 'main',
        };

        const response = await octokit.pulls.create({
            owner: UPSTREAM_OWNER,
            repo: UPSTREAM_REPO,
            ...prData,
        });

        return NextResponse.json(response.data);

    } catch (error: any) {
        console.error('Create PR failed:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
} 