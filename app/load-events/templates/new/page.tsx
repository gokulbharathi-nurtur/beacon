import { Suspense } from 'react';
import { RecordFlow } from '@/app/components/RecordFlow';

export default function NewTemplatePage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
      <RecordFlow />
    </Suspense>
  );
}
