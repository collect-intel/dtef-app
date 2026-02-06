import DeprecatedFeature from '@/app/components/DeprecatedFeature';

export const metadata = {
  title: 'Deprecated - AI Personality Compass',
};

export default function CompassPage() {
  return (
    <DeprecatedFeature
      featureName="AI Personality Compass"
      description="The AI personality compass visualization was part of the original Weval research platform. DTEF focuses on demographic survey distribution evaluation instead."
    />
  );
}
