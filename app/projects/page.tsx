import { desc, isNotNull, sql } from 'drizzle-orm';
import Link from 'next/link';
import { ArrowUpRight, FolderGit2 } from 'lucide-react';
import { db } from '@/lib/db/client';
import { contentChecks, projectHostnames, projects, runs, templates } from '@/lib/db/schema';
import { ProjectsHome } from '@/app/components/ProjectsHome';
import { Card, CardContent } from '@/components/ui/card';
import { relativeTime } from '@/lib/relativeTime';

export const dynamic = 'force-dynamic';

async function countsByProject(table: typeof templates | typeof runs | typeof contentChecks) {
  const rows = await db
    .select({ projectId: table.projectId, n: sql<number>`count(*)` })
    .from(table)
    .where(isNotNull(table.projectId))
    .groupBy(table.projectId);
  return new Map(rows.map((r) => [r.projectId as string, r.n]));
}

export default async function ProjectsPage() {
  const [rows, hostnameRows, templateCounts, runCounts, checkCounts] = await Promise.all([
    db
      .select({ id: projects.id, name: projects.name, updatedAt: projects.updatedAt })
      .from(projects)
      .orderBy(desc(projects.updatedAt)),
    db.select({ projectId: projectHostnames.projectId, hostname: projectHostnames.hostname }).from(projectHostnames),
    countsByProject(templates),
    countsByProject(runs),
    countsByProject(contentChecks),
  ]);

  const hostnamesByProject = new Map<string, string[]>();
  for (const h of hostnameRows) {
    const list = hostnamesByProject.get(h.projectId) ?? [];
    list.push(h.hostname);
    hostnamesByProject.set(h.projectId, list);
  }

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
        <p className="mt-1 mb-5 text-sm text-muted-foreground">
          Each project groups a site&apos;s templates, Load Events runs, and content checks. URLs are routed to a
          project by hostname.
        </p>
        <ProjectsHome />
      </div>

      <div>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-sm font-semibold text-foreground">All projects</h2>
          <span className="text-xs text-muted-foreground">{rows.length} shown</span>
        </div>
        {rows.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
              <FolderGit2 className="size-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">No projects yet — create one above.</p>
            </CardContent>
          </Card>
        ) : (
          <Card className="p-0">
            <ul className="divide-y divide-border">
              {rows.map((p) => {
                const templateCount = templateCounts.get(p.id) ?? 0;
                const runCount = runCounts.get(p.id) ?? 0;
                const contentCheckCount = checkCounts.get(p.id) ?? 0;
                return (
                  <li key={p.id}>
                    <Link
                      href={`/projects/${p.id}`}
                      className="group flex items-center justify-between gap-4 px-4 py-3.5 hover:bg-muted/60"
                    >
                      <div className="min-w-0 flex-1">
                        <span className="font-medium text-foreground">{p.name}</span>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          {(hostnamesByProject.get(p.id) ?? []).join(' · ') || 'No hostnames'}
                        </p>
                      </div>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {templateCount} template{templateCount === 1 ? '' : 's'} · {runCount} run
                        {runCount === 1 ? '' : 's'} · {contentCheckCount} check
                        {contentCheckCount === 1 ? '' : 's'} · {relativeTime(p.updatedAt)}
                      </span>
                      <ArrowUpRight className="size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </Card>
        )}
      </div>
    </div>
  );
}
