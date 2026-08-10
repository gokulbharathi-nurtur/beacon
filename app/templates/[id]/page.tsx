import { eq } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db/client';
import { templates } from '@/lib/db/schema';
import { TemplateEditor } from '@/app/components/TemplateEditor';

export const dynamic = 'force-dynamic';

export default async function TemplatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [template] = await db.select().from(templates).where(eq(templates.id, id));
  if (!template) {
    notFound();
  }
  return <TemplateEditor template={template} />;
}
