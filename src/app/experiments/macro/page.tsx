import DeprecatedFeature from '@/app/components/DeprecatedFeature';

export const metadata = {
  title: 'Deprecated - Macro Canvas',
};

export default function MacroPage() {
  return (
    <DeprecatedFeature
      featureName="Macro Canvas"
      description="The macro visualization canvas was part of the original Weval research platform for exploring evaluation data at scale. DTEF focuses on demographic survey distribution evaluation instead."
    />
  );
}
