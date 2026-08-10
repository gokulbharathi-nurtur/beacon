import { NextResponse } from 'next/server';
import { sqlite } from '@/lib/db/client';

export async function GET() {
  sqlite.prepare('SELECT 1').get();
  return NextResponse.json({ status: 'ok', timestamp: new Date().toISOString() });
}
