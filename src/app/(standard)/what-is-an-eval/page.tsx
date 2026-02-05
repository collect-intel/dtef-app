import React from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import Icon from '@/components/ui/icon';
import { APP_REPO_URL, BLUEPRINT_CONFIG_REPO_URL } from '@/lib/configConstants';

export const metadata = {
  title: 'What is a Digital Twin Evaluation? | DTEF',
  description: 'Understanding digital twin evaluations: how DTEF measures whether AI models can accurately predict demographic survey response distributions.',
};

export default function WhatIsAnEvalPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">

        {/* Header */}
        <div className="mb-6">
          <h1 className="text-4xl font-bold mb-4">What is a Digital Twin Evaluation?</h1>
        </div>

        {/* Definition */}
        <section className="mb-12">
          <Card className="p-6 bg-primary/5 border-primary/20">
            <p className="text-lg text-foreground leading-relaxed">
              A <strong>digital twin evaluation</strong> tests whether an AI model can accurately predict how real people from specific demographic groups would respond to survey questions. It measures the gap between AI-generated predictions and actual human survey data—revealing where AI faithfully represents diverse perspectives and where it falls short.
            </p>
          </Card>
        </section>

        {/* What is a "digital twin"? */}
        <section className="mb-16">
          <h2 className="text-2xl font-semibold mb-6 flex items-center">
            <Icon name="users" className="w-6 h-6 mr-3 text-primary" />
            What is a "Digital Twin"?
          </h2>
          <div className="prose prose-lg dark:prose-invert max-w-none">
            <p className="text-foreground/90 leading-relaxed mb-4">
              In engineering, a "digital twin" is a virtual replica of a physical system. In the context of AI and public opinion, a <strong>digital twin</strong> is an AI model tasked with simulating the perspectives, beliefs, and response patterns of a specific group of people.
            </p>
            <p className="text-foreground/90 leading-relaxed mb-4">
              For example, you might ask an AI: "How would women aged 18-24 in urban areas respond to this question about AI regulation?" If the model can produce a response distribution that closely matches how that group <em>actually</em> responded in a real survey, it's functioning as an accurate digital twin for that segment.
            </p>
            <div className="my-6 pl-6 pr-6 py-4 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border-l-4 border-primary rounded-r-lg shadow-sm">
              <p className="text-foreground font-semibold leading-relaxed m-0">
                The question isn't whether AI <em>can</em> simulate human perspectives—it already claims to. The question is whether those simulations are accurate and equitable across all groups.
              </p>
            </div>
          </div>
        </section>

        {/* What is an "evaluation"? */}
        <section className="mb-16">
          <h2 className="text-2xl font-semibold mb-6 flex items-center">
            <Icon name="scale" className="w-6 h-6 mr-3 text-primary" />
            What is an "Evaluation"?
          </h2>
          <div className="prose prose-lg dark:prose-invert max-w-none">
            <p className="text-foreground/90 leading-relaxed mb-4">
              An <strong>evaluation</strong> (or "eval") is a structured, reproducible test that measures a specific capability of an AI model. Rather than asking "Is this AI good?", an eval asks a precise question like "Can this model predict the response distribution of rural men aged 45-64 on questions about technology governance?"
            </p>
            <p className="text-foreground/90 leading-relaxed">
              Evaluations produce quantitative scores—making it possible to compare models, track changes over time, and identify systematic gaps.
            </p>
          </div>
        </section>

        {/* How DTEF Works */}
        <section className="mb-16">
          <h2 className="text-2xl font-semibold mb-6 flex items-center">
            <Icon name="layers" className="w-6 h-6 mr-3 text-primary" />
            How DTEF Works
          </h2>

          <div className="space-y-6">
            {/* Step 1 */}
            <Card className="p-6">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-lg">
                  1
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold mb-2">Start with real survey data</h3>
                  <p className="text-foreground/80">
                    DTEF uses responses from large-scale demographic surveys—like <a href="https://github.com/collect-intel/global-dialogues" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Global Dialogues</a>—where thousands of people across dozens of demographic segments have answered questions about technology, governance, and society.
                  </p>
                </div>
              </div>
            </Card>

            {/* Step 2 */}
            <Card className="p-6">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-lg">
                  2
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold mb-2">Generate evaluation blueprints</h3>
                  <p className="text-foreground/80">
                    The DTEF CLI transforms survey data into structured blueprints. Each blueprint contains prompts that ask AI models to predict how a specific demographic segment (e.g., "women aged 25-34 in urban areas") would distribute their responses across the answer options for each survey question.
                  </p>
                </div>
              </div>
            </Card>

            {/* Step 3 */}
            <Card className="p-6">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-lg">
                  3
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold mb-2">AI models make predictions</h3>
                  <p className="text-foreground/80">
                    Multiple AI models (GPT, Claude, Gemini, Llama, and more) are prompted with each blueprint. Each model predicts the percentage of the demographic group that would choose each answer option—producing a predicted response distribution.
                  </p>
                </div>
              </div>
            </Card>

            {/* Step 4 */}
            <Card className="p-6">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-lg">
                  4
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold mb-2">Score against ground truth</h3>
                  <p className="text-foreground/80">
                    Predicted distributions are compared to actual survey responses using distribution metrics like Jensen-Shannon divergence, cosine similarity, and earth mover's distance. This produces transparent, quantitative accuracy scores for every model-segment-question combination.
                  </p>
                </div>
              </div>
            </Card>

            {/* Step 5 */}
            <Card className="p-6">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-lg">
                  5
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold mb-2">Track and compare</h3>
                  <p className="text-foreground/80">
                    Results are aggregated into leaderboards showing which models best represent which groups. Evaluations re-run automatically, so you can track how model accuracy changes over time as models are updated.
                  </p>
                </div>
              </div>
            </Card>
          </div>
        </section>

        {/* Why This Matters */}
        <section className="mb-16">
          <h2 className="text-2xl font-semibold mb-6 flex items-center">
            <Icon name="alert-circle" className="w-6 h-6 mr-3 text-primary" />
            Why This Matters
          </h2>

          <div className="grid md:grid-cols-2 gap-6">
            <Card className="p-6">
              <h3 className="text-lg font-semibold mb-3 flex items-center">
                <Icon name="shield" className="w-5 h-5 mr-2 text-primary" />
                Representativeness
              </h3>
              <p className="text-foreground/80">
                AI is increasingly used to simulate public opinion, inform policy decisions, and personalize services. If models systematically misrepresent certain demographic groups, those groups are effectively silenced in AI-mediated decisions.
              </p>
            </Card>

            <Card className="p-6">
              <h3 className="text-lg font-semibold mb-3 flex items-center">
                <Icon name="globe" className="w-5 h-5 mr-2 text-primary" />
                Equity
              </h3>
              <p className="text-foreground/80">
                DTEF reveals whether AI accuracy varies across demographic groups. A model might predict urban young adult responses well but fail for rural elderly populations—a disparity that's invisible without systematic measurement.
              </p>
            </Card>

            <Card className="p-6">
              <h3 className="text-lg font-semibold mb-3 flex items-center">
                <Icon name="check-circle" className="w-5 h-5 mr-2 text-primary" />
                Trust
              </h3>
              <p className="text-foreground/80">
                Before relying on AI to represent human perspectives, we need evidence that it actually can. DTEF provides that evidence—or reveals where trust is not yet warranted.
              </p>
            </Card>

            <Card className="p-6">
              <h3 className="text-lg font-semibold mb-3 flex items-center">
                <Icon name="trending-up" className="w-5 h-5 mr-2 text-primary" />
                Accountability
              </h3>
              <p className="text-foreground/80">
                By producing transparent, reproducible scores, DTEF creates accountability for model developers. When results show a model performs poorly for specific groups, there's clear evidence driving improvement.
              </p>
            </Card>
          </div>
        </section>

        {/* CTA Section */}
        <section className="mb-8">
          <Card className="p-8 bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20">
            <h2 className="text-2xl font-semibold mb-4 text-center">Explore DTEF</h2>
            <p className="text-center text-foreground/80 mb-8 max-w-2xl mx-auto">
              DTEF is fully open source. Browse evaluation results, read the methodology, or contribute survey data to expand the framework's coverage.
            </p>

            <div className="grid md:grid-cols-3 gap-6 mb-6">
              <div className="flex flex-col items-center text-center">
                <Icon name="book-open" className="w-8 h-8 mb-3 text-primary" />
                <h3 className="font-semibold mb-2">View Results</h3>
                <p className="text-sm text-muted-foreground mb-3">
                  Browse the leaderboard and see how models perform across demographic groups.
                </p>
                <Link
                  href="/"
                  className="inline-flex items-center text-sm text-primary hover:underline font-medium"
                >
                  Go to Homepage
                  <Icon name="arrow-right" className="w-4 h-4 ml-1" />
                </Link>
              </div>

              <div className="flex flex-col items-center text-center">
                <Icon name="file-text" className="w-8 h-8 mb-3 text-primary" />
                <h3 className="font-semibold mb-2">Read the Methodology</h3>
                <p className="text-sm text-muted-foreground mb-3">
                  Understand how evaluations are structured, scored, and interpreted.
                </p>
                <a
                  href={`${APP_REPO_URL}/blob/main/docs/METHODOLOGY.md`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center text-sm text-primary hover:underline font-medium"
                >
                  Methodology Doc
                  <Icon name="arrow-right" className="w-4 h-4 ml-1" />
                </a>
              </div>

              <div className="flex flex-col items-center text-center">
                <Icon name="git-branch" className="w-8 h-8 mb-3 text-primary" />
                <h3 className="font-semibold mb-2">Contribute</h3>
                <p className="text-sm text-muted-foreground mb-3">
                  Submit survey data or evaluation blueprints to the public repository.
                </p>
                <a
                  href={BLUEPRINT_CONFIG_REPO_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center text-sm text-primary hover:underline font-medium"
                >
                  Blueprint Repository
                  <Icon name="arrow-right" className="w-4 h-4 ml-1" />
                </a>
              </div>
            </div>
          </Card>
        </section>
      </div>
    </div>
  );
}
