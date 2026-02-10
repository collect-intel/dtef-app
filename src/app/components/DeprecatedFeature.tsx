'use client';

import Link from 'next/link';
import Icon from '@/components/ui/icon';

interface DeprecatedFeatureProps {
  featureName: string;
  description?: string;
  alternativeUrl?: string;
  alternativeText?: string;
}

/**
 * A component to display when a user navigates to a deprecated feature.
 * Used during the transition from Weval to DTEF.
 */
export default function DeprecatedFeature({
  featureName,
  description,
  alternativeUrl = '/',
  alternativeText = 'Return to Homepage',
}: DeprecatedFeatureProps) {
  return (
    <div className="min-h-[60vh] flex items-center justify-center p-8">
      <div className="max-w-lg text-center">
        <div className="mb-6">
          <Icon name="package-search" className="w-16 h-16 mx-auto text-muted-foreground/50" />
        </div>
        <h1 className="text-2xl font-bold mb-4 text-foreground">
          {featureName}
        </h1>
        <p className="text-muted-foreground mb-6">
          {description ||
            'This feature was part of the original Weval platform and is not currently active in DTEF (Digital Twin Evaluation Framework). DTEF focuses on measuring how accurately AI models predict demographic survey response distributions.'}
        </p>
        <Link
          href={alternativeUrl}
          className="inline-flex items-center justify-center px-6 py-3 text-sm font-medium rounded-md text-primary-foreground bg-primary hover:bg-primary/90 transition-colors"
        >
          {alternativeText}
        </Link>
        <p className="mt-8 text-xs text-muted-foreground/70">
          DTEF is built on the <a href="https://github.com/weval-org/app" target="_blank" rel="noopener noreferrer" className="underline hover:text-primary">Weval</a> evaluation platform.
        </p>
      </div>
    </div>
  );
}
