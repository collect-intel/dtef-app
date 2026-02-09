import type { Metadata, ResolvingMetadata } from 'next';
import { cache } from 'react';
import { generateAnalysisPageMetadata } from '@/app/utils/metadataUtils';
import { ComparisonDataV2 } from '@/app/utils/types';
import { getResultByFileName, getCoreResult } from '@/lib/storageService';
import { ClientPage } from './ClientPage';
import { AnalysisProvider } from '@/app/analysis/context/AnalysisProvider';

type ThisPageProps = {
  params: Promise<{
    configId: string;
    runLabel: string;
    timestamp: string;
  }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

type ThisPageGenerateMetadataProps = {
  params: Promise<{
    configId: string;
    runLabel: string;
    timestamp: string;
  }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export const revalidate = 3600;

export async function generateMetadata(
  props: ThisPageGenerateMetadataProps,
  parent: ResolvingMetadata
): Promise<Metadata> {
  return generateAnalysisPageMetadata(
    {
      params: props.params,
      searchParams: props.searchParams,
    },
    parent
  );
}

const getComparisonData = cache(async (params: ThisPageProps['params']): Promise<ComparisonDataV2 | null> => {
  const rawParams = await params;
  // Next.js may not fully decode URL params (e.g. %3A stays encoded for colons)
  const configId = decodeURIComponent(rawParams.configId);
  const runLabel = decodeURIComponent(rawParams.runLabel);
  const timestamp = decodeURIComponent(rawParams.timestamp);

  try {
    // Prefer direct core artefact read (works in SSR/Netlify without localhost fetch)
    const core = await getCoreResult(configId, runLabel, timestamp);
    if (core) {
      console.log(`[Page Fetch] Using core artefact for ${configId}/${runLabel}/${timestamp}`);
      return core as ComparisonDataV2;
    }

    // Fallback to legacy monolith for backward compatibility
    const fileName = `${runLabel}_${timestamp}_comparison.json`;
    const jsonData = await getResultByFileName(configId, fileName);
    if (!jsonData) {
      console.log(`[Page Fetch] Data not found for file: ${fileName}`);
      return null;
    }

    console.log(`[Page Fetch] Using full data from storage for ${configId}/${runLabel}/${timestamp}`);
    return jsonData as ComparisonDataV2;

  } catch (error) {
    console.error(`[Page Fetch] Failed to get comparison data for ${configId}/${runLabel}/${timestamp}:`, error);
    return null;
  }
});

export default async function ComparisonPage(props: ThisPageProps) {
  const data = await getComparisonData(props.params);
  const rawParams = await props.params;
  const configId = decodeURIComponent(rawParams.configId);
  const runLabel = decodeURIComponent(rawParams.runLabel);
  const timestamp = decodeURIComponent(rawParams.timestamp);

  if (!data) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center">
        <div className="max-w-lg mx-auto px-6 py-12 text-center">
          <h1 className="text-2xl font-bold mb-3">Results Not Available</h1>
          <p className="text-muted-foreground mb-6">
            This evaluation is either still processing or encountered an error during execution. Results will appear here once the evaluation completes successfully.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <a href={`/analysis/${configId}`} className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium rounded-md border border-border hover:bg-muted transition-colors">
              View All Runs
            </a>
            <a href="/all" className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium rounded-md border border-border hover:bg-muted transition-colors">
              Browse All Evaluations
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <AnalysisProvider
        initialData={data}
        configId={configId}
        runLabel={runLabel}
        timestamp={timestamp}
    >
        <ClientPage />
    </AnalysisProvider>
  );
} 