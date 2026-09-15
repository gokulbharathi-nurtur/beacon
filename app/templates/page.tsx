import { desc, eq } from 'drizzle-orm';
import Link from 'next/link';
import { Plus, ArrowUpRight, FileStack, MousePointerClick } from 'lucide-react';
import { db } from '@/lib/db/client';
import { projects, templates } from '@/lib/db/schema';
import type { TemplateKind } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { relativeTime } from '@/lib/relativeTime';

export const dynamic = 'force-dynamic';

type Row = {
  id: string;
  name: string;
  sourceUrl: string;
  kind: TemplateKind;
  updatedAt: Date;
  events: unknown[];
  projectId: string | null;
  projectName: string | null;
};

function TemplateList({ rows }: { rows: Row[] }) {
  return (
    <Card className="p-0">
      <ul className="divide-y divide-border">
        {rows.map((t) => (
          <li key={t.id}>
            <Link
              href={`/templates/${t.id}`}
              className="group flex items-center justify-between gap-4 px-4 py-3.5 hover:bg-muted/60"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-foreground">{t.name}</span>
                  <span className="text-xs text-muted-foreground">{t.events.length} events</span>
                </div>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">{t.sourceUrl}</p>
              </div>
              <span className="shrink-0 rounded-sm bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                {t.projectName ?? 'Unassigned'}
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">updated {relativeTime(t.updatedAt)}</span>
              <ArrowUpRight className="size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export default async function GlobalTemplatesPage() {
  const rows = (await db
    .select({
      id: templates.id,
      name: templates.name,
      sourceUrl: templates.sourceUrl,
      kind: templates.kind,
      updatedAt: templates.updatedAt,
      events: templates.events,
      projectId: templates.projectId,
      projectName: projects.name,
    })
    .from(templates)
    .leftJoin(projects, eq(projects.id, templates.projectId))
    .orderBy(desc(templates.createdAt))) as Row[];

  const pageload = rows.filter((t) => t.kind !== 'click');
  const click = rows.filter((t) => t.kind === 'click');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Templates</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Every saved reference capture, across all projects. Each template&apos;s project is set from its source
            URL&apos;s hostname and can be changed in the editor.
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button variant="outline" render={<Link href="/templates/new" />} nativeButton={false}>
            <Plus className="size-4" />
            Page-load template
          </Button>
          <Button render={<Link href="/templates/new?kind=click" />} nativeButton={false}>
            <MousePointerClick className="size-4" />
            Click template
          </Button>
        </div>
      </div>

      {rows.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <FileStack className="size-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No templates saved yet.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          <section className="space-y-2">
            <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Page load</h2>
            {pageload.length === 0 ? (
              <p className="text-sm text-muted-foreground">No page-load templates yet.</p>
            ) : (
              <TemplateList rows={pageload} />
            )}
          </section>
          <section className="space-y-2">
            <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Click</h2>
            {click.length === 0 ? (
              <p className="text-sm text-muted-foreground">No click templates yet.</p>
            ) : (
              <TemplateList rows={click} />
            )}
          </section>
        </div>
      )}
    </div>
  );
}
