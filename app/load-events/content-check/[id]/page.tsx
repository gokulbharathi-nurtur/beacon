import { ContentCheckDetail } from '@/app/components/ContentCheckDetail';

export default async function ContentCheckDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ContentCheckDetail contentCheckId={id} />;
}
