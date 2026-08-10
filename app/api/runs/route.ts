import { NextRequest, NextResponse } from 'next/server';
import { desc } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { runs } from '@/lib/db/schema';
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

  const [run] = await db
    .insert(runs)
    .values({
      targetUrl: url,
      templateId: mode === 'diff' ? templateId : null,
      mode,
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
