import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { runs, templates } from '@/lib/db/schema';
import { updateTemplateSchema } from '@/lib/validation';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [template] = await db.select().from(templates).where(eq(templates.id, id));
  if (!template) {
    return NextResponse.json({ error: 'Template not found' }, { status: 404 });
  }
  return NextResponse.json(template);
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = updateTemplateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const [updated] = await db
    .update(templates)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(templates.id, id))
    .returning();

  if (!updated) {
    return NextResponse.json({ error: 'Template not found' }, { status: 404 });
  }
  return NextResponse.json(updated);
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Past diff runs reference this template via runs.template_id (a foreign key
  // better-sqlite3 enforces by default). Unlink them rather than delete them so their
  // capture history survives — the delete confirmation dialog promises exactly this. Both
  // writes go in one transaction so a template is never left half-deleted.
  db.transaction((tx) => {
    tx.update(runs).set({ templateId: null }).where(eq(runs.templateId, id)).run();
    tx.delete(templates).where(eq(templates.id, id)).run();
  });
  return NextResponse.json({ ok: true });
}
