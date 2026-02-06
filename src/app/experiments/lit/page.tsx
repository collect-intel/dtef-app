import DeprecatedFeature from '@/app/components/DeprecatedFeature';

export const metadata = {
  title: 'Deprecated - Literature Experiment',
};

export default function LitPage() {
  return (
    <DeprecatedFeature
      featureName="Literature Experiment"
      description="This experimental literature analysis feature was part of the original Weval research platform. DTEF focuses on demographic survey distribution evaluation instead."
    />
  );
}
