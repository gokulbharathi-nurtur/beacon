import { NextRequest, NextResponse } from 'next/server';
import { desc } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { sweeps } from '@/lib/db/schema';
import { executeSweep } from '@/lib/runs/executeSweep';
import { assertValidTargetUrl, InvalidTargetUrlError } from '@/lib/urlGuard';
import { createSweepSchema } from '@/lib/validation';

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = createSweepSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    assertValidTargetUrl(parsed.data.baseUrl);
  } catch (err) {
    if (err instanceof InvalidTargetUrlError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }

  const [sweep] = await db.insert(sweeps).values({ baseUrl: parsed.data.baseUrl, status: 'queued' }).returning();

  // Not awaited, and deliberately not routed through the shared browser-context queue —
  // see executeSweep's own doc comment for why wrapping the whole orchestrator would
  // starve the queue rather than share it.
  void executeSweep(sweep.id);

  return NextResponse.json({ id: sweep.id }, { status: 202 });
}

export async function GET() {
  const recentSweeps = await db.select().from(sweeps).orderBy(desc(sweeps.createdAt)).limit(50);
  return NextResponse.json(recentSweeps);
}
