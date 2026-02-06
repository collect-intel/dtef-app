import DeprecatedFeature from '@/app/components/DeprecatedFeature';

export const metadata = {
  title: 'Deprecated - NDeltas',
};

export default function NDeltasIndexPage() {
  return (
    <DeprecatedFeature
      featureName="Model Weak Points (NDeltas)"
      description="The NDeltas weak points analysis was part of the original Weval research platform for identifying model failure patterns. DTEF focuses on demographic survey distribution evaluation instead."
    />
  );
}
