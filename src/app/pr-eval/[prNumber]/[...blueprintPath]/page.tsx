import DeprecatedFeature from '@/app/components/DeprecatedFeature';

export const metadata = {
  title: 'Deprecated - PR Evaluation',
};

export default function PREvaulationPage() {
  return (
    <DeprecatedFeature
      featureName="PR Evaluation"
      description="The PR-based evaluation workflow was part of the original Weval platform for evaluating blueprint contributions via GitHub pull requests. DTEF focuses on demographic survey distribution evaluation instead."
    />
  );
}
