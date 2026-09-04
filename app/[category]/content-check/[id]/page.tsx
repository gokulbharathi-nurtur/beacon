import { notFound } from 'next/navigation';
import { getCategoryBySlug } from '@/lib/eventCategories';
import { ContentCheckDetail } from '@/app/components/ContentCheckDetail';

export default async function ContentCheckDetailPage({
  params,
}: {
  params: Promise<{ category: string; id: string }>;
}) {
  const { category, id } = await params;
  const cat = getCategoryBySlug(category);
  if (!cat || cat.value !== 'load') {
    notFound();
  }

  return <ContentCheckDetail contentCheckId={id} />;
}
