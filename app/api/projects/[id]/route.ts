import { NextRequest, NextResponse } from 'next/server';
import { and, eq, ne, sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { contentChecks, contentMaps, projectHostnames, projects, runs, templates } from '@/lib/db/schema';
import { updateProjectSchema } from '@/lib/validation';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [project] = await db.select().from(projects).where(eq(projects.id, id));
  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }
  const hostnames = await db
    .select({ hostname: projectHostnames.hostname })
    .from(projectHostnames)
    .where(eq(projectHostnames.projectId, id));
  return NextResponse.json({ ...project, hostnames: hostnames.map((h) => h.hostname) });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = updateProjectSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const [project] = await db.select().from(projects).where(eq(projects.id, id));
  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  const nextHostnames = parsed.data.hostnames ? [...new Set(parsed.data.hostnames)] : null;

  if (nextHostnames) {
    const clashes = await db
      .select({ hostname: projectHostnames.hostname })
      .from(projectHostnames)
      .where(
        and(
          ne(projectHostnames.projectId, id),
          nextHostnames.length === 1
            ? eq(projectHostnames.hostname, nextHostnames[0])
            : sql`${projectHostnames.hostname} IN ${nextHostnames}`
        )
      );
    if (clashes.length > 0) {
      return NextResponse.json(
        { error: `Already used by another project: ${clashes.map((c) => c.hostname).join(', ')}` },
        { status: 409 }
      );
    }
  }

  db.transaction((tx) => {
    if (parsed.data.name !== undefined || nextHostnames) {
      tx.update(projects)
        .set({ ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}), updatedAt: new Date() })
        .where(eq(projects.id, id))
        .run();
    }
    if (nextHostnames) {
      tx.delete(projectHostnames).where(eq(projectHostnames.projectId, id)).run();
      tx.insert(projectHostnames)
        .values(nextHostnames.map((hostname) => ({ projectId: id, hostname })))
        .run();
    }
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // Detach everything this project owns before deleting it (a foreign key better-sqlite3
  // enforces). Templates/runs/checks/maps survive as unassigned rather than being destroyed.
  db.transaction((tx) => {
    tx.update(templates).set({ projectId: null }).where(eq(templates.projectId, id)).run();
    tx.update(runs).set({ projectId: null }).where(eq(runs.projectId, id)).run();
    tx.update(contentChecks).set({ projectId: null }).where(eq(contentChecks.projectId, id)).run();
    tx.update(contentMaps).set({ projectId: null }).where(eq(contentMaps.projectId, id)).run();
    tx.delete(projectHostnames).where(eq(projectHostnames.projectId, id)).run();
    tx.delete(projects).where(eq(projects.id, id)).run();
  });

  return NextResponse.json({ ok: true });
}
