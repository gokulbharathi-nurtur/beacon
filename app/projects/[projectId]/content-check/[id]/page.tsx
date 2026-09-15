import { ContentCheckDetail } from '@/app/components/ContentCheckDetail';

export default async function ContentCheckDetailPage({
  params,
}: {
  params: Promise<{ projectId: string; id: string }>;
}) {
  const { id } = await params;
  return <ContentCheckDetail contentCheckId={id} />;
}
