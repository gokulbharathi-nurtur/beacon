import { desc } from 'drizzle-orm';
import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { db } from '@/lib/db/client';
import { sweeps } from '@/lib/db/schema';
import { SweepForm } from '@/app/components/SweepForm';
import { StatusBadge } from '@/app/components/StatusBadge';
import { Card, CardContent } from '@/components/ui/card';
import { relativeTime } from '@/lib/relativeTime';

export const dynamic = 'force-dynamic';

export default async function CoveragePage() {
  const recentSweeps = await db.select().from(sweeps).orderBy(desc(sweeps.createdAt)).limit(20);

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Coverage sweep</h1>
        <p className="mt-1 mb-5 max-w-2xl text-sm text-muted-foreground">
          Enumerates a site&apos;s pages (sitemap.xml, or a same-origin crawl if there isn&apos;t one), groups them
          into page types, then drives every clickable element on a representative sample of each type in its own
          isolated browser context. Reports elements that fired nothing, events that don&apos;t match the catalog
          shape, and catalog events never observed anywhere on the site — the coverage picture no single template
          or audit run can produce alone.
        </p>
        <SweepForm />
      </div>

      <div>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-sm font-semibold text-foreground">Recent sweeps</h2>
          <span className="text-xs text-muted-foreground">{recentSweeps.length} shown</span>
        </div>
        {recentSweeps.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">No sweeps yet.</CardContent>
          </Card>
        ) : (
          <Card className="p-0">
            <ul className="divide-y divide-border">
              {recentSweeps.map((sweep) => (
                <li key={sweep.id}>
                  <Link
                    href={`/coverage/${sweep.id}`}
                    className="group flex items-center justify-between gap-4 px-4 py-3 text-sm transition-colors hover:bg-muted/60"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-foreground">{sweep.baseUrl}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {sweep.pagesSweptCount} page{sweep.pagesSweptCount === 1 ? '' : 's'} swept ·{' '}
                        {relativeTime(sweep.createdAt)}
                      </p>
                    </div>
                    <StatusBadge status={sweep.status} />
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
