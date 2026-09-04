import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { sweeps, sweepFindings } from '@/lib/db/schema';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [sweep] = await db.select().from(sweeps).where(eq(sweeps.id, id));
  if (!sweep) {
    return NextResponse.json({ error: 'Sweep not found' }, { status: 404 });
  }

  // Findings accumulate as the sweep runs (see executeSweep's incremental inserts), so a
  // running sweep already has a partial, genuinely current result here — not just once
  // status flips to 'complete'.
  const findings = await db.select().from(sweepFindings).where(eq(sweepFindings.sweepId, id));

  return NextResponse.json({ sweep, findings });
}
