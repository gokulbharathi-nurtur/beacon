import { Suspense } from 'react';
import { asc } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { projects } from '@/lib/db/schema';
import { RecordFlow } from '@/app/components/RecordFlow';

export const dynamic = 'force-dynamic';

export default async function GlobalNewTemplatePage() {
  const allProjects = await db.select({ id: projects.id, name: projects.name }).from(projects).orderBy(asc(projects.name));
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
      <RecordFlow projects={allProjects} />
    </Suspense>
  );
}
