import { NextRequest, NextResponse } from 'next/server';
import { desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { projects, templates } from '@/lib/db/schema';
import { createTemplateSchema } from '@/lib/validation';
import { matchProjectByUrl } from '@/lib/projects/matchProject';

export async function GET(request: NextRequest) {
  const projectId = request.nextUrl.searchParams.get('projectId');
  const allTemplates = await db
    .select()
    .from(templates)
    .where(projectId ? eq(templates.projectId, projectId) : undefined)
    .orderBy(desc(templates.createdAt));
  return NextResponse.json(allTemplates);
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = createTemplateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  // `projectId` omitted -> auto-assign by hostname; explicit (string|null) -> honour it.
  let projectId: string | null;
  if (parsed.data.projectId === undefined) {
    projectId = (await matchProjectByUrl(parsed.data.sourceUrl))?.id ?? null;
  } else {
    projectId = parsed.data.projectId;
    if (projectId) {
      const [project] = await db.select({ id: projects.id }).from(projects).where(eq(projects.id, projectId));
      if (!project) {
        return NextResponse.json({ error: 'Project not found' }, { status: 404 });
      }
    }
  }

  try {
    const [template] = await db
      .insert(templates)
      .values({
        projectId,
        name: parsed.data.name,
        sourceUrl: parsed.data.sourceUrl,
        kind: parsed.data.kind,
        steps: parsed.data.kind === 'click' ? parsed.data.steps ?? [] : null,
        events: parsed.data.events,
      })
      .returning();
    return NextResponse.json(template, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'A template with that name already exists.' }, { status: 409 });
  }
}
