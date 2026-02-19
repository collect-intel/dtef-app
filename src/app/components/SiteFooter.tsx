'use client';

import { usePathname } from 'next/navigation';
import CIPLogo from '@/components/icons/CIPLogo';
import { APP_REPO_URL, BLUEPRINT_CONFIG_REPO_URL } from '@/lib/configConstants';
import { cn } from '@/lib/utils';

interface SiteFooterProps {
  contentMaxWidth?: string;
}

function useBugReportUrl() {
  const pathname = usePathname();

  const params = new URLSearchParams({
    template: 'bug_report.yml',
  });

  if (typeof window !== 'undefined') {
    params.set('page-url', window.location.href);
  } else if (pathname) {
    params.set('page-url', pathname);
  }

  // Extract blueprint ID from /analysis/[configId]/... paths
  const match = pathname?.match(/^\/analysis\/([^/]+)/);
  if (match) {
    params.set('blueprint-id', decodeURIComponent(match[1]));
  }

  return `${APP_REPO_URL}/issues/new?${params.toString()}`;
}

export function SiteFooter({ contentMaxWidth = 'max-w-7xl' }: SiteFooterProps) {
  const bugReportUrl = useBugReportUrl();

  return (
    <div className="w-full bg-header py-6 border-t border-border/50">
      <div className={cn("mx-auto px-4 sm:px-6 lg:px-8", contentMaxWidth)}>
        <footer className="flex flex-col md:flex-row items-center justify-between gap-6">
          <a
            href="https://cip.org"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center space-x-3 group"
          >
            <CIPLogo className="w-8 h-8 text-muted-foreground group-hover:text-foreground transition-colors duration-200" />
            <span className="text-sm text-muted-foreground group-hover:text-foreground transition-colors duration-200">
              A Collective Intelligence Project
            </span>
          </a>
          <div className="flex items-center space-x-4 text-sm">
            <a
              href={APP_REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-primary dark:hover:text-sky-400 transition-colors"
            >
              View App on GitHub
            </a>
            <span className="text-muted-foreground/60">|</span>
            <a
              href={BLUEPRINT_CONFIG_REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-primary dark:hover:text-sky-400 transition-colors"
            >
              View Eval Blueprints on GitHub
            </a>
            <span className="text-muted-foreground/60">|</span>
            <a
              href={bugReportUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-primary dark:hover:text-sky-400 transition-colors"
            >
              Report a Bug
            </a>
          </div>
        </footer>
      </div>
    </div>
  );
}
