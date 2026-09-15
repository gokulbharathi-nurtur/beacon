import { NextRequest, NextResponse } from 'next/server';
import { eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { projects, runs, templates } from '@/lib/db/schema';
import { computeDiff } from '@/lib/diff/computeDiff';
import { buildTemplateFromCapture } from '@/lib/diff/buildTemplateFromCapture';
import { updateRunSchema } from '@/lib/validation';
import type { DiffResult, TemplateDefinition } from '@/lib/types';

interface RunTemplateDiff {
  templateId: string;
  templateName: string;
  templateProjectName: string | null;
  diff: DiffResult;
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [run] = await db.select().from(runs).where(eq(runs.id, id));
  if (!run) {
    return NextResponse.json({ error: 'Run not found' }, { status: 404 });
  }

  // One diff per template the run targets, computed on read (never persisted) so each
  // always reflects the template's current field rules. `templateIds` is authoritative;
  // rows created before multi-template support fall back to the single `templateId`.
  let diffs: RunTemplateDiff[] = [];
  let missingTemplateCount = 0;
  if (run.mode === 'diff' && run.status === 'complete' && run.capturedEvents) {
    const ids = run.templateIds ?? (run.templateId ? [run.templateId] : []);
    if (ids.length > 0) {
      const rows = await db
        .select({
          id: templates.id,
          name: templates.name,
          events: templates.events,
          projectName: projects.name,
        })
        .from(templates)
        .leftJoin(projects, eq(projects.id, templates.projectId))
        .where(inArray(templates.id, ids));
      const byId = new Map(rows.map((r) => [r.id, r]));
      const captured = run.capturedEvents;
      diffs = ids
        .map((tid) => byId.get(tid))
        .filter((t): t is NonNullable<typeof t> => Boolean(t))
        .map((t) => ({
          templateId: t.id,
          templateName: t.name,
          templateProjectName: t.projectName,
          diff: computeDiff(captured, { version: 1, events: t.events }),
        }));
      missingTemplateCount = ids.length - diffs.length;
    }
  }
  // Back-compat: the first diff under the old single-value key.
  const diff: DiffResult | null = diffs[0]?.diff ?? null;

  // For record-mode runs, hand back a heuristic-classified starting template — the
  // record-flow UI shows this for the user to confirm/override before saving.
  let suggestedTemplate: TemplateDefinition | null = null;
  if (run.mode === 'record' && run.status === 'complete' && run.capturedEvents) {
    suggestedTemplate = buildTemplateFromCapture(run.capturedEvents);
  }

  let project: { id: string; name: string } | null = null;
  if (run.projectId) {
    const [p] = await db.select({ id: projects.id, name: projects.name }).from(projects).where(eq(projects.id, run.projectId));
    project = p ?? null;
  }

  return NextResponse.json({ run, diff, diffs, missingTemplateCount, suggestedTemplate, project });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = updateRunSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const [updated] = await db
    .update(runs)
    .set({ name: parsed.data.name.trim() })
    .where(eq(runs.id, id))
    .returning();
  if (!updated) {
    return NextResponse.json({ error: 'Run not found' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await db.delete(runs).where(eq(runs.id, id));
  return NextResponse.json({ ok: true });
}
