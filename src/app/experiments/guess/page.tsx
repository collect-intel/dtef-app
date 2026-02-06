import DeprecatedFeature from '@/app/components/DeprecatedFeature';

export const metadata = {
  title: 'Deprecated - Guess the Model',
};

export default function GuessPage() {
  return (
    <DeprecatedFeature
      featureName="Guess the Model"
      description="This experimental feature for analyzing LLM writing patterns was part of the original Weval research platform. DTEF focuses on demographic survey distribution evaluation instead."
    />
  );
}
