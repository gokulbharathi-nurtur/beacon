import { SweepDetail } from '@/app/components/SweepDetail';

export default async function CoverageSweepPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <SweepDetail sweepId={id} />;
}
