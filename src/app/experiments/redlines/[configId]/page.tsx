import DeprecatedFeature from '@/app/components/DeprecatedFeature';

export const metadata = {
  title: 'Deprecated - Redlines',
};

export default function ConfigRedlinesPage() {
  return (
    <DeprecatedFeature
      featureName="Redlines Analysis"
      description="The redlines annotation analysis was part of the original Weval research platform. DTEF focuses on demographic survey distribution evaluation instead."
    />
  );
}
