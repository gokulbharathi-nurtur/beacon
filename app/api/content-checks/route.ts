import { NextRequest, NextResponse } from 'next/server';
import { desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { contentChecks, contentMaps } from '@/lib/db/schema';
import { executeContentCheck } from '@/lib/runs/executeContentCheck';
import { assertValidTargetUrl, InvalidTargetUrlError } from '@/lib/urlGuard';
import { createContentCheckSchema } from '@/lib/validation';

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = createContentCheckSchema.safeParse(body);
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

  const [map] = await db.select().from(contentMaps).where(eq(contentMaps.id, parsed.data.contentMapId));
  if (!map) {
    return NextResponse.json({ error: 'Content map not found' }, { status: 404 });
  }

  const [check] = await db
    .insert(contentChecks)
    .values({
      contentMapId: parsed.data.contentMapId,
      baseUrl: parsed.data.baseUrl,
      mode: parsed.data.mode,
      status: 'queued',
    })
    .returning();

  // Not awaited, and deliberately not routed through the shared browser-context queue —
  // see executeContentCheck's own doc comment.
  void executeContentCheck(check.id);

  return NextResponse.json({ id: check.id }, { status: 202 });
}

export async function GET() {
  const recent = await db
    .select({
      id: contentChecks.id,
      baseUrl: contentChecks.baseUrl,
      mode: contentChecks.mode,
      status: contentChecks.status,
      pagesCheckedCount: contentChecks.pagesCheckedCount,
      createdAt: contentChecks.createdAt,
      contentMapName: contentMaps.name,
    })
    .from(contentChecks)
    .leftJoin(contentMaps, eq(contentMaps.id, contentChecks.contentMapId))
    .orderBy(desc(contentChecks.createdAt))
    .limit(50);

  return NextResponse.json(recent);
}
