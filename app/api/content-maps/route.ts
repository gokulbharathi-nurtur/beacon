import { NextRequest, NextResponse } from 'next/server';
import { desc, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { contentMaps, contentMapRules } from '@/lib/db/schema';
import { parseContentMapFile, ContentMapParseError } from '@/lib/content/parseContentMap';

export async function POST(request: NextRequest) {
  const formData = await request.formData().catch(() => null);
  if (!formData) {
    return NextResponse.json({ error: 'Expected multipart/form-data.' }, { status: 400 });
  }

  const file = formData.get('file');
  const rawName = formData.get('name');
  const rawProjectId = formData.get('projectId');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'A "file" field (.csv or .xlsx) is required.' }, { status: 400 });
  }
  const projectId = typeof rawProjectId === 'string' && rawProjectId.trim() ? rawProjectId.trim() : null;
  if (!projectId) {
    return NextResponse.json({ error: 'A "projectId" field is required.' }, { status: 400 });
  }
  const name = typeof rawName === 'string' && rawName.trim() ? rawName.trim() : file.name;

  const buffer = Buffer.from(await file.arrayBuffer());
  let rows;
  try {
    rows = await parseContentMapFile(buffer, file.name);
  } catch (err) {
    if (err instanceof ContentMapParseError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }

  if (rows.length === 0) {
    return NextResponse.json(
      { error: 'No usable rows found — every row was missing a "pages" value.' },
      { status: 400 }
    );
  }

  const [map] = await db.insert(contentMaps).values({ projectId, name, sourceFilename: file.name }).returning();
  await db.insert(contentMapRules).values(
    rows.map((row, i) => ({
      contentMapId: map.id,
      rowOrder: i,
      rawPagesText: row.rawPagesText,
      patterns: row.patterns,
      contentGroup: row.contentGroup,
      contentId: row.contentId,
      contentType: row.contentType,
    }))
  );

  return NextResponse.json({ id: map.id, ruleCount: rows.length }, { status: 201 });
}

export async function GET(request: NextRequest) {
  const projectId = request.nextUrl.searchParams.get('projectId');
  const maps = await db
    .select({
      id: contentMaps.id,
      name: contentMaps.name,
      sourceFilename: contentMaps.sourceFilename,
      createdAt: contentMaps.createdAt,
      ruleCount: sql<number>`count(${contentMapRules.id})`,
    })
    .from(contentMaps)
    .leftJoin(contentMapRules, eq(contentMapRules.contentMapId, contentMaps.id))
    .where(projectId ? eq(contentMaps.projectId, projectId) : undefined)
    .groupBy(contentMaps.id)
    .orderBy(desc(contentMaps.createdAt));

  return NextResponse.json(maps);
}
