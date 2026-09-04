import { desc, eq } from 'drizzle-orm';
import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db/client';
import { runs, templates } from '@/lib/db/schema';
import { getCategoryBySlug } from '@/lib/eventCategories';
import { RunForm } from '@/app/components/RunForm';
import { StatusBadge } from '@/app/components/StatusBadge';
import { Card, CardContent } from '@/components/ui/card';
import { relativeTime } from '@/lib/relativeTime';

export const dynamic = 'force-dynamic';

export default async function CategoryDashboardPage({ params }: { params: Promise<{ category: string }> }) {
  const { category } = await params;
  const cat = getCategoryBySlug(category);
  if (!cat) {
    notFound();
  }

  const [categoryTemplates, recentRunRows] = await Promise.all([
    db.select().from(templates).where(eq(templates.category, cat.value)).orderBy(desc(templates.createdAt)),
    db
      .select({ run: runs })
      .from(runs)
      .innerJoin(templates, eq(runs.templateId, templates.id))
      .where(eq(templates.category, cat.value))
      .orderBy(desc(runs.createdAt))
      .limit(20),
  ]);
  const recentRuns = recentRunRows.map((r) => r.run);

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{cat.label} — Run a check</h1>
        <p className="mt-1 mb-5 text-sm text-muted-foreground">
          Paste a page URL and pick a saved template to diff the live dataLayer against.
        </p>
        <RunForm
          templates={categoryTemplates.map((t) => ({ id: t.id, name: t.name, sourceUrl: t.sourceUrl }))}
          categorySlug={cat.slug}
        />
      </div>

      <div>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-sm font-semibold text-foreground">Recent runs</h2>
          <span className="text-xs text-muted-foreground">{recentRuns.length} shown</span>
        </div>
        {recentRuns.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">No runs yet.</CardContent>
          </Card>
        ) : (
          <Card className="p-0">
            <ul className="divide-y divide-border">
              {recentRuns.map((run) => (
                <li key={run.id}>
                  <Link
                    href={`/runs/${run.id}`}
                    className="group flex items-center justify-between gap-4 px-4 py-3 text-sm transition-colors hover:bg-muted/60"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-foreground">{run.targetUrl}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {run.mode} · {relativeTime(run.createdAt)}
                      </p>
                    </div>
                    <StatusBadge status={run.status} />
                    <ArrowUpRight className="size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </div>
  );
}
