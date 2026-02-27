import type { Metadata } from 'next';
import ExperimentsContent from '@/app/components/experiments/ExperimentsContent';

export const metadata: Metadata = {
    title: 'Experiments | DTEF',
    description: 'Track and compare A/B experiments across evaluation conditions in the Digital Twin Evaluation Framework.',
};

export const revalidate = 3600;

export default function ExperimentsPage() {
    return (
        <div className="min-h-screen bg-background text-foreground">
            <div className="fixed inset-0 -z-10 dark:bg-gradient-to-br dark:from-slate-900 dark:to-slate-800 bg-gradient-to-br from-slate-50 to-slate-100" />
            <div className="max-w-7xl mx-auto">
                <div className="px-4 sm:px-6 lg:px-8 py-8 md:py-10 space-y-8">
                    <header className="text-center space-y-2">
                        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
                            Experiments
                        </h1>
                        <p className="text-muted-foreground max-w-2xl mx-auto">
                            Track A/B experiments comparing evaluation conditions: context formats, reasoning modes, and eval types.
                        </p>
                    </header>

                    <ExperimentsContent />
                </div>
            </div>
        </div>
    );
}
