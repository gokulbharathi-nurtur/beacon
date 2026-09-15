import { Suspense } from 'react';
import { RecordFlow } from '@/app/components/RecordFlow';

export default async function NewTemplatePage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
      <RecordFlow projectId={projectId} />
    </Suspense>
  );
}
