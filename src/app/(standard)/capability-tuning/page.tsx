import DeprecatedFeature from '@/app/components/DeprecatedFeature';

export const metadata = {
  title: 'Deprecated - Capability Tuning',
};

export default function CapabilityTuningPage() {
  return (
    <DeprecatedFeature
      featureName="Capability Tuning"
      description="The capability tuning interface was part of the original Weval platform. DTEF focuses on demographic survey distribution evaluation instead."
    />
  );
}
