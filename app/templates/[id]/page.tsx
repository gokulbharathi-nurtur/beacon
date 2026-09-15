import { asc, eq } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db/client';
import { projects, templates } from '@/lib/db/schema';
import { TemplateEditor } from '@/app/components/TemplateEditor';

export const dynamic = 'force-dynamic';

export default async function GlobalTemplatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [[template], allProjects] = await Promise.all([
    db.select().from(templates).where(eq(templates.id, id)),
    db.select({ id: projects.id, name: projects.name }).from(projects).orderBy(asc(projects.name)),
  ]);
  if (!template) {
    notFound();
  }
  return <TemplateEditor template={template} projects={allProjects} />;
}
