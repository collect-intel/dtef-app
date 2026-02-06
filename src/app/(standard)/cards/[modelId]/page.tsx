import DeprecatedFeature from '@/app/components/DeprecatedFeature';

export const metadata = {
  title: 'Deprecated - Model Card',
};

export default function ModelCardPage() {
  return (
    <DeprecatedFeature
      featureName="Model Card"
      description="The model cards feature was part of the original Weval platform. DTEF focuses on demographic survey distribution evaluation instead."
    />
  );
}
