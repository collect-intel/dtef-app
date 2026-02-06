import DeprecatedFeature from '@/app/components/DeprecatedFeature';

export const metadata = {
  title: 'Deprecated - Pain Points',
};

export default function PainPointsPage() {
  return (
    <DeprecatedFeature
      featureName="Pain Points Analysis"
      description="The pain points analysis was part of the original Weval research platform for summarizing model failures. DTEF focuses on demographic survey distribution evaluation instead."
    />
  );
}
