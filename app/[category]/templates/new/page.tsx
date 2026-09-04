import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { RecordFlow } from '@/app/components/RecordFlow';
import { getCategoryBySlug } from '@/lib/eventCategories';

export default async function NewTemplatePage({ params }: { params: Promise<{ category: string }> }) {
  const { category } = await params;
  const cat = getCategoryBySlug(category);
  if (!cat) {
    notFound();
  }

  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
      <RecordFlow category={cat.value} />
    </Suspense>
  );
}
