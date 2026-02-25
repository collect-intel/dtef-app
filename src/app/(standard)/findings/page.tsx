import type { Metadata } from 'next';
import FindingsContent from '@/app/components/findings/FindingsContent';

export const metadata: Metadata = {
    title: 'Research Findings | DTEF',
    description: 'Preliminary findings from the Digital Twin Evaluation Framework: exploring how well AI models predict demographic-specific survey responses.',
};

export const revalidate = 3600;

export default function FindingsPage() {
    return (
        <div className="min-h-screen bg-background text-foreground">
            <div className="fixed inset-0 -z-10 dark:bg-gradient-to-br dark:from-slate-900 dark:to-slate-800 bg-gradient-to-br from-slate-50 to-slate-100" />
            <div className="max-w-7xl mx-auto">
                <div className="px-4 sm:px-6 lg:px-8 py-8 md:py-10 space-y-12">
                    <header className="text-center space-y-4">
                        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
                            Research Findings
                        </h1>
                        <p className="text-muted-foreground max-w-3xl mx-auto text-base sm:text-lg">
                            Can AI models serve as &ldquo;digital twins&rdquo; that approximate how different communities think?
                            Here are some preliminary observations from our ongoing research.
                        </p>
                    </header>

                    <FindingsContent />
                </div>
            </div>
        </div>
    );
}
