import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'AI Comparison Pairs | DTEF',
  description: 'Help evaluate AI by comparing model responses side by side',
};

export default function PairsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
