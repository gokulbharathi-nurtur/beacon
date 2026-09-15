import { desc, eq } from 'drizzle-orm';
import Link from 'next/link';
import { Plus, ArrowUpRight, FileStack, MousePointerClick } from 'lucide-react';
import { db } from '@/lib/db/client';
import { templates } from '@/lib/db/schema';
import type { TemplateRow } from '@/lib/db/schema';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { relativeTime } from '@/lib/relativeTime';

export const dynamic = 'force-dynamic';

function TemplateList({ projectId, rows }: { projectId: string; rows: TemplateRow[] }) {
  return (
    <Card className="p-0">
      <ul className="divide-y divide-border">
        {rows.map((t) => (
          <li key={t.id}>
            <Link
              href={`/projects/${projectId}/templates/${t.id}`}
              className="group flex items-center justify-between gap-4 px-4 py-3.5 hover:bg-muted/60"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-foreground">{t.name}</span>
                  <span className="text-xs text-muted-foreground">{t.events.length} events</span>
                </div>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">{t.sourceUrl}</p>
              </div>
              <span className="shrink-0 text-xs text-muted-foreground">updated {relativeTime(t.updatedAt)}</span>
              <ArrowUpRight className="size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export default async function TemplatesPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const allTemplates = await db
    .select()
    .from(templates)
    .where(eq(templates.projectId, projectId))
    .orderBy(desc(templates.createdAt));

  const pageload = allTemplates.filter((t) => t.kind !== 'click');
  const click = allTemplates.filter((t) => t.kind === 'click');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Templates</h2>
          <p className="mt-1 text-sm text-muted-foreground">Saved reference captures used to diff future runs against.</p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button variant="outline" render={<Link href={`/projects/${projectId}/templates/new`} />} nativeButton={false}>
            <Plus className="size-4" />
            Page-load template
          </Button>
          <Button render={<Link href={`/projects/${projectId}/templates/new?kind=click`} />} nativeButton={false}>
            <MousePointerClick className="size-4" />
            Click template
          </Button>
        </div>
      </div>

      {allTemplates.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <FileStack className="size-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No templates saved yet.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          <section className="space-y-2">
            <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Page load</h3>
            {pageload.length === 0 ? (
              <p className="text-sm text-muted-foreground">No page-load templates yet.</p>
            ) : (
              <TemplateList projectId={projectId} rows={pageload} />
            )}
          </section>
          <section className="space-y-2">
            <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Click</h3>
            {click.length === 0 ? (
              <p className="text-sm text-muted-foreground">No click templates yet.</p>
            ) : (
              <TemplateList projectId={projectId} rows={click} />
            )}
          </section>
        </div>
      )}
    </div>
  );
}
