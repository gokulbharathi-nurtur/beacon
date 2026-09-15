import { desc, eq, sql } from 'drizzle-orm';
import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { db } from '@/lib/db/client';
import { contentChecks, contentMaps, contentMapRules } from '@/lib/db/schema';
import { ContentMapUpload } from '@/app/components/ContentMapUpload';
import { ContentCheckForm } from '@/app/components/ContentCheckForm';
import { StatusBadge } from '@/app/components/StatusBadge';
import { Card, CardContent } from '@/components/ui/card';
import { relativeTime } from '@/lib/relativeTime';

export const dynamic = 'force-dynamic';

export default async function ContentCheckPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;

  const maps = await db
    .select({
      id: contentMaps.id,
      name: contentMaps.name,
      createdAt: contentMaps.createdAt,
      ruleCount: sql<number>`count(${contentMapRules.id})`,
    })
    .from(contentMaps)
    .leftJoin(contentMapRules, eq(contentMapRules.contentMapId, contentMaps.id))
    .where(eq(contentMaps.projectId, projectId))
    .groupBy(contentMaps.id)
    .orderBy(desc(contentMaps.createdAt));

  const recentChecks = await db
    .select({
      id: contentChecks.id,
      baseUrl: contentChecks.baseUrl,
      mode: contentChecks.mode,
      status: contentChecks.status,
      pagesCheckedCount: contentChecks.pagesCheckedCount,
      createdAt: contentChecks.createdAt,
      contentMapName: contentMaps.name,
    })
    .from(contentChecks)
    .leftJoin(contentMaps, eq(contentMaps.id, contentChecks.contentMapId))
    .where(eq(contentChecks.projectId, projectId))
    .orderBy(desc(contentChecks.createdAt))
    .limit(20);

  return (
    <div className="space-y-10">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Content check</h2>
        <p className="mt-1 mb-5 max-w-2xl text-sm text-muted-foreground">
          Checks the <code className="font-mono">page</code> object a page_loaded event carries — its
          content_group/content_id/content_type — against a reference table you upload, mapping URL patterns to
          the values expected there. Crawls a site (sitemap.xml, or a same-origin crawl if there isn&apos;t
          one), then samples a few pages per matched reference row.
        </p>

        <div className="grid gap-4 md:grid-cols-2">
          <ContentMapUpload projectId={projectId} />
          <ContentCheckForm projectId={projectId} maps={maps.map((m) => ({ id: m.id, name: m.name }))} />
        </div>
      </div>

      {maps.length > 0 && (
        <div>
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-sm font-semibold text-foreground">Reference tables</h2>
            <span className="text-xs text-muted-foreground">{maps.length} shown</span>
          </div>
          <Card className="p-0">
            <ul className="divide-y divide-border">
              {maps.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
                  <span className="min-w-0 flex-1 truncate font-medium text-foreground">{m.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {m.ruleCount} row{m.ruleCount === 1 ? '' : 's'} · {relativeTime(m.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}

      <div>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-sm font-semibold text-foreground">Recent checks</h2>
          <span className="text-xs text-muted-foreground">{recentChecks.length} shown</span>
        </div>
        {recentChecks.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">No checks yet.</CardContent>
          </Card>
        ) : (
          <Card className="p-0">
            <ul className="divide-y divide-border">
              {recentChecks.map((check) => (
                <li key={check.id}>
                  <Link
                    href={`/projects/${projectId}/content-check/${check.id}`}
                    className="group flex items-center justify-between gap-4 px-4 py-3 text-sm transition-colors hover:bg-muted/60"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-foreground">{check.baseUrl}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {check.mode === 'page' ? 'This page only' : 'Whole site'} ·{' '}
                        {check.contentMapName ?? '(deleted reference table)'} · {check.pagesCheckedCount} page
                        {check.pagesCheckedCount === 1 ? '' : 's'} checked · {relativeTime(check.createdAt)}
                      </p>
                    </div>
                    <StatusBadge status={check.status} />
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
