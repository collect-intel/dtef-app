'use client';

import React from 'react';
import Link from 'next/link';
import { APP_REPO_URL, BLUEPRINT_CONFIG_REPO_URL } from '@/lib/configConstants';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import Icon from '@/components/ui/icon';


export default function HomePageBanner() {
  const [isLearnMoreOpen, setLearnMoreOpen] = React.useState(false);

  return (
    <div className="w-full bg-background pt-2 pb-2 text-foreground">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center my-10 py-2">
            <h1 className="text-4xl font-bold mb-4">A Platform to Build and Share AI Evaluations</h1>
            {/* <p className="max-w-4xl mx-auto text-base sm:text-xl text-foreground/80 dark:text-muted-foreground leading-relaxed">
            Weval is a collaborative platform to build and share context-specific, nuanced AI evaluations. 
            </p> */}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
          {/* Card 1: Why Weval? */}
          <div className="bg-card/40 dark:bg-card/40 backdrop-blur-sm p-6 rounded-lg shadow-lg ring-1 ring-border/50 dark:ring-border/50 flex flex-col h-full">
            <div className="flex items-center mb-4">
              <Icon name="scale" className="w-8 h-8 mr-4 text-primary" />
              <h2 className="text-2xl font-semibold text-foreground dark:text-slate-100">Evaluate What Matters</h2>
            </div>
            <p className="text-sm text-foreground/80 dark:text-muted-foreground leading-relaxed flex-grow mb-4">
              Can AI faithfully represent the views of diverse communities? DTEF measures how accurately models predict survey response distributions across demographic groups—testing whether AI can serve as a reliable proxy for real human perspectives.
            </p>
            <div className="mt-auto pt-4 border-t border-border/30 dark:border-border/30">
              <a
                href={`${APP_REPO_URL}/blob/main/docs/METHODOLOGY.md`}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full inline-flex items-center justify-center px-4 py-2.5 border border-transparent text-sm font-medium rounded-md text-primary-foreground bg-primary hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary dark:ring-offset-background transition-colors shadow-sm hover:shadow-md"
              >
                Our Methodology
              </a>
            </div>
          </div>

          {/* Card 2: For Consumers */}
          <div className="bg-card/40 dark:bg-card/40 backdrop-blur-sm p-6 rounded-lg shadow-lg ring-1 ring-border/50 dark:ring-border/50 flex flex-col h-full">
            <div className="flex items-center mb-4">
              <Icon name="book-open" className="w-8 h-8 mr-4 text-primary" />
              <h2 className="text-2xl font-semibold text-foreground dark:text-slate-100">Explore the Results</h2>
            </div>
            <p className="text-sm text-foreground/80 dark:text-muted-foreground leading-relaxed flex-grow mb-4">
              Browse a public library of community-contributed benchmarks on domains like clinical advice, regional knowledge, legal reasoning, behavioural traits, and AI safety. Track model performance over time as tests re-run automatically.
            </p>
            <div className="mt-auto pt-4 border-t border-border/30 dark:border-border/30">
              <Link
                href="#featured-blueprints"
                className="w-full inline-flex items-center justify-center px-4 py-2.5 border border-transparent text-sm font-medium rounded-md text-primary-foreground bg-primary hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary dark:ring-offset-background transition-colors shadow-sm hover:shadow-md"
              >
                Explore Featured Results
              </Link>
            </div>
          </div>

          {/* Card 3: For Contributors */}
          <div className="bg-card/40 dark:bg-card/40 backdrop-blur-sm p-6 rounded-lg shadow-lg ring-1 ring-border/50 dark:ring-border/50 flex flex-col h-full">
            <div className="flex items-center mb-4">
              <Icon name="edit-3" className="w-8 h-8 mr-4 text-highlight-success" />
              <h2 className="text-2xl font-semibold text-foreground dark:text-slate-100">Contribute Data</h2>
            </div>
            <p className="text-sm text-foreground/80 dark:text-muted-foreground leading-relaxed flex-grow mb-4">
              Have demographic survey data? Contribute it to the DTEF blueprint repository. Survey responses are transformed into evaluation blueprints that test whether AI models can accurately predict how different groups respond.
            </p>
            <div className="mt-auto pt-4 border-t border-border/30 dark:border-border/30">
              <a
                href={BLUEPRINT_CONFIG_REPO_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full inline-flex items-center justify-center px-4 py-2.5 border border-transparent text-sm font-medium rounded-md text-primary-foreground bg-primary hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary dark:ring-offset-background transition-colors shadow-sm hover:shadow-md"
              >
                View Blueprint Repository
              </a>
            </div>
          </div>
        </div>
        
        <div className="mt-10 md:mt-12 text-center">
            <Collapsible open={isLearnMoreOpen} onOpenChange={setLearnMoreOpen}>
                <CollapsibleTrigger asChild>
                    <button className="inline-flex items-center text-sm font-medium text-primary hover:text-primary/90">
                        Learn more about the Digital Twin Evaluation Framework.
                        <Icon name="chevron-down" className={`ml-1.5 h-4 w-4 transition-transform duration-200 ${isLearnMoreOpen ? 'rotate-180' : ''}`} />
                    </button>
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-6 max-w-5xl mx-auto text-left text-md text-foreground/80 dark:text-muted-foreground space-y-4 prose prose-sm dark:prose-invert">
                    <p>
                        <strong>AI systems increasingly claim to represent diverse perspectives—but how do we know they actually can?</strong> When AI is used to simulate public opinion, inform policy, or predict how communities will respond, accuracy across demographic groups isn't optional—it's essential.
                    </p>
                    <p>
                        <strong>DTEF (Digital Twin Evaluation Framework)</strong> is an open platform that measures how well AI models predict real survey response distributions across demographic segments. Using data from large-scale surveys like Global Dialogues, we generate evaluation blueprints that systematically test whether models can faithfully reproduce how different groups—by age, gender, region, religion, and more—actually responded.
                    </p>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 pt-2">
                        <div>
                            <h4 className="font-semibold text-foreground dark:text-slate-200 mt-2 mb-2">What DTEF measures:</h4>
                            <ul className="list-disc list-outside pl-5 space-y-2">
                                <li>
                                <strong>Distribution accuracy.</strong> How closely do AI-predicted response distributions match real survey data for each demographic segment?
                                </li>
                                <li>
                                <strong>Cross-group fidelity.</strong> Does the model perform consistently across age groups, genders, regions, and other demographic dimensions—or does it default to stereotypes?
                                </li>
                            </ul>
                        </div>
                        <div>
                            <h4 className="font-semibold text-foreground dark:text-slate-200 mt-2 mb-2">How it works:</h4>
                            <ul className="list-disc list-outside pl-5 space-y-2">
                                <li>
                                <strong>Survey data in.</strong> Real demographic survey responses are imported and converted into structured evaluation blueprints.
                                </li>
                                <li>
                                <strong>Model predictions out.</strong> AI models are prompted to predict how each demographic group would respond, and their predictions are scored against ground truth using distribution metrics.
                                </li>
                                <li>
                                <strong>Continuous tracking.</strong> Evaluations re‑run automatically so you can track how model accuracy changes over time.
                                </li>
                            </ul>
                        </div>
                    </div>
                </CollapsibleContent>
            </Collapsible>
        </div>
      </div>
    </div>
  );
};

