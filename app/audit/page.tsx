import { desc, eq } from 'drizzle-orm';
import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { db } from '@/lib/db/client';
import { runs } from '@/lib/db/schema';
import { getCatalog } from '@/lib/catalog/load';
import { AuditForm } from '@/app/components/AuditForm';
import { StatusBadge } from '@/app/components/StatusBadge';
import { Card, CardContent } from '@/components/ui/card';
import { relativeTime } from '@/lib/relativeTime';

export const dynamic = 'force-dynamic';

export default async function AuditPage() {
  const catalog = getCatalog();
  const recentRuns = await db
    .select()
    .from(runs)
    .where(eq(runs.mode, 'audit'))
    .orderBy(desc(runs.createdAt))
    .limit(20);

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Audit against the event catalog</h1>
        <p className="mt-1 mb-5 max-w-2xl text-sm text-muted-foreground">
          Checks every event a page pushes against the canonical catalog generated from{' '}
          <span className="font-mono text-xs">
            {catalog.packageName}@{catalog.packageVersion}
          </span>{' '}
          — {catalog.events.length} events. Needs no template, so it catches the things a recorded
          template cannot: an event name that has drifted from the spec, a misspelled field, or a
          payload whose shape does not match what the package produces.
        </p>
        <AuditForm />
      </div>

      <div>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-sm font-semibold text-foreground">Recent audits</h2>
          <span className="text-xs text-muted-foreground">{recentRuns.length} shown</span>
        </div>
        {recentRuns.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">No audits yet.</CardContent>
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
                      <p className="mt-0.5 text-xs text-muted-foreground">{relativeTime(run.createdAt)}</p>
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
