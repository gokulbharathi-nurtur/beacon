import { NextRequest, NextResponse } from 'next/server';
import { desc } from 'drizzle-orm';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { runs, templates } from '@/lib/db/schema';
import { getQueue } from '@/lib/queue';
import { executeRun } from '@/lib/runs/executeRun';
import { assertValidTargetUrl, InvalidTargetUrlError } from '@/lib/urlGuard';
import { createRunSchema } from '@/lib/validation';

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = createRunSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { url, templateId, mode } = parsed.data;

  if (mode === 'diff' && !templateId) {
    return NextResponse.json({ error: 'templateId is required when mode is "diff".' }, { status: 400 });
  }

  try {
    assertValidTargetUrl(url);
  } catch (err) {
    if (err instanceof InvalidTargetUrlError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }

  // For diff mode, the click target is always derived from the template, not the
  // client — RunForm has no UI to supply one, and re-clicking whatever the template
  // recorded is the whole point of "run a check" against a click-event template.
  // Record and audit modes take it from the client instead (the discovery picker on a
  // first record, the template on a re-record, or the element an audit wants to exercise).
  let clickSelector: string | null = parsed.data.clickSelector ?? null;
  // What the template recorded — carried through so executeRun can compare it against
  // what the selector actually resolves to live, without a second template lookup.
  let clickLabel: string | null = null;
  let clickHref: string | null = null;
  if (mode === 'diff' && templateId) {
    const [template] = await db.select().from(templates).where(eq(templates.id, templateId));
    clickSelector = template?.clickSelector ?? null;
    clickLabel = template?.clickLabel ?? null;
    clickHref = template?.clickHref ?? null;
  }

  // Record mode only — diff/audit runs never carry a form driver, same reasoning as
  // clickSelector above but stricter: re-submitting a form automatically on every future
  // check is a real-world side effect this tool must never repeat on its own.
  const formSelector = mode === 'record' ? (parsed.data.formSelector ?? null) : null;
  const formAllowSubmit = mode === 'record' ? (parsed.data.formAllowSubmit ?? false) : false;

  const [run] = await db
    .insert(runs)
    .values({
      targetUrl: url,
      templateId: mode === 'diff' ? templateId : null,
      mode,
      clickSelector,
      clickLabel,
      clickHref,
      formSelector,
      formAllowSubmit,
      status: 'queued',
    })
    .returning();

  // Not awaited — the job runs in the background, bounded by the shared p-queue.
  void getQueue().add(() => executeRun(run.id));

  return NextResponse.json({ id: run.id }, { status: 202 });
}

export async function GET() {
  const recentRuns = await db.select().from(runs).orderBy(desc(runs.createdAt)).limit(50);
  return NextResponse.json(recentRuns);
}
