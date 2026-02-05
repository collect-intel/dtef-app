import type { Metadata } from 'next';
import DemographicLeaderboard from '@/app/components/demographics/DemographicLeaderboard';

export const metadata: Metadata = {
    title: 'Demographic Prediction Accuracy | DTEF',
    description: 'How accurately do AI models predict survey response distributions across demographic groups?',
};

export const revalidate = 3600;

export default function DemographicsPage() {
    return (
        <div className="min-h-screen bg-background text-foreground">
            <div className="fixed inset-0 -z-10 dark:bg-gradient-to-br dark:from-slate-900 dark:to-slate-800 bg-gradient-to-br from-slate-50 to-slate-100" />
            <div className="max-w-7xl mx-auto">
                <div className="px-4 sm:px-6 lg:px-8 py-8 md:py-10 space-y-8">
                    <header className="text-center space-y-2">
                        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
                            Demographics
                        </h1>
                        <p className="text-muted-foreground max-w-2xl mx-auto">
                            Evaluating how well AI models understand and predict response patterns across demographic groups.
                        </p>
                    </header>

                    <DemographicLeaderboard />
                </div>
            </div>
        </div>
    );
}
