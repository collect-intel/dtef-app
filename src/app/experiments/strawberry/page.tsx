import DeprecatedFeature from '@/app/components/DeprecatedFeature';

export const metadata = {
  title: 'Deprecated - Strawberry',
};

export default function StrawberryPage() {
  return (
    <DeprecatedFeature
      featureName="Strawberry Test"
      description="The Strawberry test was part of the original Weval research platform for testing specific model capabilities. DTEF focuses on demographic survey distribution evaluation instead."
    />
  );
}
