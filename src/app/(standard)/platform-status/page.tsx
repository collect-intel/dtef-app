import type { Metadata } from 'next';
import PlatformStatusDashboard from '@/app/components/platform-status/PlatformStatusDashboard';

export const metadata: Metadata = {
    title: 'Platform Status | DTEF',
    description: 'Cross-reference blueprint configs with evaluation results to see platform data coverage.',
};

export const revalidate = 3600;

export default function PlatformStatusPage() {
    return (
        <div className="min-h-screen bg-background text-foreground">
            <div className="fixed inset-0 -z-10 dark:bg-gradient-to-br dark:from-slate-900 dark:to-slate-800 bg-gradient-to-br from-slate-50 to-slate-100" />
            <div className="max-w-7xl mx-auto">
                <div className="px-4 sm:px-6 lg:px-8 py-8 md:py-10 space-y-8">
                    <header className="text-center space-y-2">
                        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
                            Platform Status
                        </h1>
                        <p className="text-muted-foreground max-w-2xl mx-auto">
                            Blueprint configs vs. evaluation results — what&apos;s been run, what hasn&apos;t, and what&apos;s the state of our data.
                        </p>
                    </header>

                    <PlatformStatusDashboard />
                </div>
            </div>
        </div>
    );
}
