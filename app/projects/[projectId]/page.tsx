import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { projects, runs, templates } from '@/lib/db/schema';
import { RunForm } from '@/app/components/RunForm';
import { RecentRuns } from '@/app/components/RecentRuns';

export const dynamic = 'force-dynamic';

export default async function ProjectDashboardPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;

  const [allTemplates, recentRuns] = await Promise.all([
    // Templates are a global library — the run form can diff against any project's template,
    // even though each template still belongs to the project it was recorded in.
    db
      .select({
        id: templates.id,
        name: templates.name,
        sourceUrl: templates.sourceUrl,
        kind: templates.kind,
        steps: templates.steps,
        projectId: templates.projectId,
        projectName: projects.name,
      })
      .from(templates)
      .leftJoin(projects, eq(projects.id, templates.projectId))
      .orderBy(desc(templates.createdAt)),
    db
      .select()
      .from(runs)
      .where(and(eq(runs.projectId, projectId), eq(runs.mode, 'diff')))
      .orderBy(desc(runs.createdAt))
      .limit(20),
  ]);

  return (
    <div className="space-y-10">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Run a check</h2>
        <p className="mt-1 mb-5 text-sm text-muted-foreground">
          Paste a page URL and pick a saved template to diff the live dataLayer against.
        </p>
        <RunForm
          projectId={projectId}
          templates={allTemplates.map((t) => ({
            id: t.id,
            name: t.name,
            sourceUrl: t.sourceUrl,
            kind: t.kind,
            steps: t.steps ?? [],
            projectName: t.projectId === projectId ? null : t.projectName,
          }))}
        />
      </div>

      <div>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-sm font-semibold text-foreground">Recent runs</h2>
          <span className="text-xs text-muted-foreground">{recentRuns.length} shown</span>
        </div>
        <RecentRuns runs={recentRuns} />
      </div>
    </div>
  );
}
