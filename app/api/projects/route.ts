import { NextRequest, NextResponse } from 'next/server';
import { desc, eq, isNotNull, sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { contentChecks, projectHostnames, projects, runs, templates } from '@/lib/db/schema';
import { createProjectSchema } from '@/lib/validation';

/** `SELECT project_id, count(*) ... GROUP BY project_id` on one table, as a Map. */
async function countsByProject(table: typeof templates | typeof runs | typeof contentChecks) {
  const rows = await db
    .select({ projectId: table.projectId, n: sql<number>`count(*)` })
    .from(table)
    .where(isNotNull(table.projectId))
    .groupBy(table.projectId);
  return new Map(rows.map((r) => [r.projectId as string, r.n]));
}

export async function GET() {
  const [rows, hostnames, templateCounts, runCounts, checkCounts] = await Promise.all([
    db
      .select({ id: projects.id, name: projects.name, createdAt: projects.createdAt, updatedAt: projects.updatedAt })
      .from(projects)
      .orderBy(desc(projects.updatedAt)),
    db.select({ projectId: projectHostnames.projectId, hostname: projectHostnames.hostname }).from(projectHostnames),
    countsByProject(templates),
    countsByProject(runs),
    countsByProject(contentChecks),
  ]);

  const hostnamesByProject = new Map<string, string[]>();
  for (const h of hostnames) {
    const list = hostnamesByProject.get(h.projectId) ?? [];
    list.push(h.hostname);
    hostnamesByProject.set(h.projectId, list);
  }

  return NextResponse.json(
    rows.map((r) => ({
      ...r,
      hostnames: hostnamesByProject.get(r.id) ?? [],
      templateCount: templateCounts.get(r.id) ?? 0,
      runCount: runCounts.get(r.id) ?? 0,
      contentCheckCount: checkCounts.get(r.id) ?? 0,
    }))
  );
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = createProjectSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const uniqueHostnames = [...new Set(parsed.data.hostnames)];

  // A hostname belongs to exactly one project. Report the collision instead of letting the
  // UNIQUE constraint throw a 500.
  const clashes = await db
    .select({ hostname: projectHostnames.hostname, projectId: projectHostnames.projectId })
    .from(projectHostnames)
    .where(
      uniqueHostnames.length === 1
        ? eq(projectHostnames.hostname, uniqueHostnames[0])
        : sql`${projectHostnames.hostname} IN ${uniqueHostnames}`
    );
  if (clashes.length > 0) {
    return NextResponse.json(
      { error: `Already used by another project: ${clashes.map((c) => c.hostname).join(', ')}` },
      { status: 409 }
    );
  }

  const created = db.transaction((tx) => {
    const [project] = tx.insert(projects).values({ name: parsed.data.name }).returning().all();
    tx.insert(projectHostnames)
      .values(uniqueHostnames.map((hostname) => ({ projectId: project.id, hostname })))
      .run();
    return project;
  });

  return NextResponse.json({ id: created.id }, { status: 201 });
}
