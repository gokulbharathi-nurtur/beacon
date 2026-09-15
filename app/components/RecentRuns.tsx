'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowUpRight, Loader2, MousePointerClick, Trash2 } from 'lucide-react';
import type { RunRow } from '@/lib/db/schema';
import { StatusBadge } from './StatusBadge';
import { Card, CardContent } from '@/components/ui/card';
import { relativeTime } from '@/lib/relativeTime';

export function RecentRuns({ runs }: { runs: RunRow[] }) {
  const router = useRouter();
  const [deleting, setDeleting] = useState<Set<string>>(new Set());

  async function remove(id: string) {
    setDeleting((s) => new Set(s).add(id));
    try {
      const res = await fetch(`/api/runs/${id}`, { method: 'DELETE' });
      if (res.ok) router.refresh();
    } finally {
      setDeleting((s) => {
        const next = new Set(s);
        next.delete(id);
        return next;
      });
    }
  }

  if (runs.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">No runs yet.</CardContent>
      </Card>
    );
  }

  return (
    <Card className="p-0">
      <ul className="divide-y divide-border">
        {runs.map((run) => (
          <li key={run.id} className="group flex items-center gap-3 pr-2 text-sm transition-colors hover:bg-muted/60">
            <Link href={`/runs/${run.id}`} className="flex min-w-0 flex-1 items-center gap-4 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <p className="truncate font-medium text-foreground">{run.name ?? run.targetUrl}</p>
                  {run.kind === 'click' && (
                    <span className="inline-flex shrink-0 items-center gap-0.5 rounded-sm bg-primary/10 px-1 py-0.5 text-[10px] font-medium text-primary">
                      <MousePointerClick className="size-2.5" />
                      click
                    </span>
                  )}
                </div>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {run.targetUrl} · {run.mode} · {relativeTime(run.createdAt)}
                </p>
              </div>
              <StatusBadge status={run.status} />
              <ArrowUpRight className="size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
            </Link>
            <button
              type="button"
              onClick={() => remove(run.id)}
              disabled={deleting.has(run.id)}
              aria-label="Delete run"
              className="shrink-0 rounded-sm p-1.5 text-muted-foreground hover:text-destructive disabled:opacity-50"
            >
              {deleting.has(run.id) ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
            </button>
          </li>
        ))}
      </ul>
    </Card>
  );
}
