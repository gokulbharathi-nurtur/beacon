'use client';

import { useEffect, useRef, useState } from 'react';
import { CircleAlert, Download, Loader2 } from 'lucide-react';
import type { ContentCheckResultRow, ContentCheckRow } from '@/lib/db/schema';
import { StatusBadge } from './StatusBadge';
import { ContentCheckResultsView } from './ContentCheckResultsView';
import { Card, CardContent } from '@/components/ui/card';
import { buttonVariants } from '@/components/ui/button';

interface ContentCheckResponse {
  check: ContentCheckRow;
  results: ContentCheckResultRow[];
}

const POLL_INTERVAL_MS = 2000;

export function ContentCheckDetail({ contentCheckId }: { contentCheckId: string }) {
  const [data, setData] = useState<ContentCheckResponse | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      const res = await fetch(`/api/content-checks/${contentCheckId}`, { cache: 'no-store' });
      if (cancelled || !res.ok) return;
      const body: ContentCheckResponse = await res.json();
      if (cancelled) return;
      setData(body);

      if (body.check.status === 'queued' || body.check.status === 'running') {
        timerRef.current = setTimeout(poll, POLL_INTERVAL_MS);
      }
    }

    poll();
    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [contentCheckId]);

  if (!data) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Loading…
      </div>
    );
  }

  const { check, results } = data;
  const isActive = check.status === 'queued' || check.status === 'running';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="mb-1.5 flex items-center gap-2">
            <StatusBadge status={check.status} />
            <span className="text-xs text-muted-foreground">
              content check · {check.mode === 'page' ? 'this page only' : 'whole site'}
            </span>
          </div>
          <h1 className="break-all text-xl font-semibold tracking-tight">{check.baseUrl}</h1>
        </div>
        {results.length > 0 && (
          <a href={`/api/content-checks/${contentCheckId}/export`} className={buttonVariants({ variant: 'outline' })}>
            <Download className="size-4" />
            Download Excel
          </a>
        )}
      </div>

      {isActive && (
        <Card>
          <CardContent className="flex items-center gap-3 py-6 text-sm text-muted-foreground">
            <Loader2 className="size-5 shrink-0 animate-spin text-primary" />
            <div>
              <p>
                {check.status === 'queued'
                  ? 'Waiting to start…'
                  : check.totalUrlsDiscovered === null
                    ? 'Discovering pages…'
                    : `Checking — ${check.pagesCheckedCount} page${check.pagesCheckedCount === 1 ? '' : 's'} done.`}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground/80">
                Results below update live as pages complete — no need to wait for the whole check.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {check.status === 'error' && (
        <div className="rounded-md bg-status-critical/10 px-4 py-3 text-sm text-status-critical ring-1 ring-status-critical/20">
          <p className="flex items-center gap-1.5 font-medium">
            <CircleAlert className="size-4" />
            Content check failed
          </p>
          <p className="mt-1 font-mono text-xs opacity-90">{check.errorMessage}</p>
        </div>
      )}

      {results.length > 0 ? (
        <ContentCheckResultsView results={results} />
      ) : (
        !isActive &&
        check.status !== 'error' && (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              No pages could be checked — check the site is reachable and has at least one discoverable page.
            </CardContent>
          </Card>
        )
      )}
    </div>
  );
}
