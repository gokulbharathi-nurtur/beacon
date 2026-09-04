import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { contentMaps, contentMapRules } from '@/lib/db/schema';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [map] = await db.select().from(contentMaps).where(eq(contentMaps.id, id));
  if (!map) {
    return NextResponse.json({ error: 'Content map not found' }, { status: 404 });
  }

  const rules = await db
    .select()
    .from(contentMapRules)
    .where(eq(contentMapRules.contentMapId, id))
    .orderBy(contentMapRules.rowOrder);

  return NextResponse.json({ map, rules });
}
