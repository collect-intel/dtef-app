import DeprecatedFeature from '@/app/components/DeprecatedFeature';

export const metadata = {
  title: 'Deprecated - Model Vibes',
};

export default function VibesPage() {
  return (
    <DeprecatedFeature
      featureName="Model Vibes"
      description="The model similarity visualization was part of the original Weval research platform. DTEF focuses on demographic survey distribution evaluation instead."
    />
  );
}
