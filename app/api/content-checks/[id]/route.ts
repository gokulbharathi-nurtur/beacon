import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { contentChecks, contentCheckResults } from '@/lib/db/schema';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [check] = await db.select().from(contentChecks).where(eq(contentChecks.id, id));
  if (!check) {
    return NextResponse.json({ error: 'Content check not found' }, { status: 404 });
  }

  // Results accumulate as the check runs (see executeContentCheck's incremental inserts),
  // same live-poll shape as /api/sweeps/[id].
  const results = await db.select().from(contentCheckResults).where(eq(contentCheckResults.contentCheckId, id));

  return NextResponse.json({ check, results });
}
