import { asc, eq } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db/client';
import { projects, templates } from '@/lib/db/schema';
import { TemplateEditor } from '@/app/components/TemplateEditor';

export const dynamic = 'force-dynamic';

export default async function TemplatePage({
  params,
}: {
  params: Promise<{ projectId: string; templateId: string }>;
}) {
  const { projectId, templateId } = await params;
  // Loaded by id alone — a template's project can change, so the `projectId` segment is
  // only breadcrumb context, not a filter (a stale link would otherwise 404).
  const [[template], allProjects] = await Promise.all([
    db.select().from(templates).where(eq(templates.id, templateId)),
    db.select({ id: projects.id, name: projects.name }).from(projects).orderBy(asc(projects.name)),
  ]);
  if (!template) {
    notFound();
  }
  return <TemplateEditor template={template} projects={allProjects} backProjectId={projectId} />;
}
