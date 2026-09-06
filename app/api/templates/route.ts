import { NextRequest, NextResponse } from 'next/server';
import { desc } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { templates } from '@/lib/db/schema';
import { createTemplateSchema } from '@/lib/validation';

export async function GET() {
  const allTemplates = await db.select().from(templates).orderBy(desc(templates.createdAt));
  return NextResponse.json(allTemplates);
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = createTemplateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const [template] = await db
      .insert(templates)
      .values({
        name: parsed.data.name,
        sourceUrl: parsed.data.sourceUrl,
        events: parsed.data.events,
      })
      .returning();
    return NextResponse.json(template, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'A template with that name already exists.' }, { status: 409 });
  }
}
