import { NextRequest, NextResponse } from 'next/server';
import { desc, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { projects, runs, templates } from '@/lib/db/schema';
import { getQueue } from '@/lib/queue';
import { executeRun } from '@/lib/runs/executeRun';
import { deriveRunName } from '@/lib/runs/deriveRunName';
import { assertValidTargetUrl, InvalidTargetUrlError } from '@/lib/urlGuard';
import { createRunSchema } from '@/lib/validation';

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = createRunSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { projectId, url, mode } = parsed.data;
  const name = parsed.data.name?.trim() || deriveRunName(url);

  // Accept either shape; the list is the source of truth. Dedupe, cap at 2.
  const templateIds = [
    ...new Set(parsed.data.templateIds ?? (parsed.data.templateId ? [parsed.data.templateId] : [])),
  ].slice(0, 2);

  // What the run captures — and what interactions it reproduces. For a record run this
  // comes from the form; for a diff run it's taken from the primary template below.
  let kind: 'pageload' | 'click' = mode === 'record' ? parsed.data.kind ?? 'pageload' : 'pageload';
  let steps = mode === 'record' ? parsed.data.steps ?? [] : [];

  if (mode === 'diff' && templateIds.length === 0) {
    return NextResponse.json({ error: 'At least one template is required when mode is "diff".' }, { status: 400 });
  }
  if (mode === 'diff' && !projectId) {
    return NextResponse.json({ error: 'projectId is required when mode is "diff".' }, { status: 400 });
  }

  if (projectId) {
    const [project] = await db.select({ id: projects.id }).from(projects).where(eq(projects.id, projectId));
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }
  }

  if (templateIds.length > 0) {
    const found = await db
      .select({ id: templates.id, kind: templates.kind, steps: templates.steps })
      .from(templates)
      .where(inArray(templates.id, templateIds));
    if (found.length !== templateIds.length) {
      return NextResponse.json({ error: 'One or more templates were not found.' }, { status: 404 });
    }
    if (mode === 'diff') {
      const byId = new Map(found.map((t) => [t.id, t]));
      const primary = byId.get(templateIds[0])!;
      // A 2-template run must compare like with like — mixing a page-load and a click
      // template would reproduce one template's steps against the other's expectations.
      if (found.some((t) => t.kind !== primary.kind)) {
        return NextResponse.json(
          { error: 'Both templates in a run must be the same kind (page load or click).' },
          { status: 400 }
        );
      }
      kind = primary.kind;
      steps = primary.steps ?? [];
    }
  }

  try {
    assertValidTargetUrl(url);
  } catch (err) {
    if (err instanceof InvalidTargetUrlError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }

  const [run] = await db
    .insert(runs)
    .values({
      projectId: projectId ?? null,
      name,
      targetUrl: url,
      templateId: mode === 'diff' ? (templateIds[0] ?? null) : null,
      templateIds: mode === 'diff' ? templateIds : null,
      mode,
      kind,
      steps: steps.length > 0 ? steps : null,
      status: 'queued',
    })
    .returning();

  // Not awaited — the job runs in the background, bounded by the shared p-queue.
  void getQueue().add(() => executeRun(run.id));

  return NextResponse.json({ id: run.id }, { status: 202 });
}

export async function GET(request: NextRequest) {
  const projectId = request.nextUrl.searchParams.get('projectId');
  const recentRuns = await db
    .select()
    .from(runs)
    .where(projectId ? eq(runs.projectId, projectId) : undefined)
    .orderBy(desc(runs.createdAt))
    .limit(50);
  return NextResponse.json(recentRuns);
}
