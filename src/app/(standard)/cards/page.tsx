import DeprecatedFeature from '@/app/components/DeprecatedFeature';

export const metadata = {
  title: 'Deprecated - Model Cards',
};

export default function ModelCardsIndexPage() {
  return (
    <DeprecatedFeature
      featureName="Model Cards"
      description="The model cards feature was part of the original Weval platform for displaying comprehensive AI model analysis summaries. DTEF focuses on demographic survey distribution evaluation instead."
    />
  );
}
