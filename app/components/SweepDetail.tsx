'use client';

import { useEffect, useRef, useState } from 'react';
import { CircleAlert, Loader2 } from 'lucide-react';
import type { SweepFindingRow, SweepRow } from '@/lib/db/schema';
import { StatusBadge } from './StatusBadge';
import { CoverageView } from './CoverageView';
import { Card, CardContent } from '@/components/ui/card';

interface SweepResponse {
  sweep: SweepRow;
  findings: SweepFindingRow[];
}

const POLL_INTERVAL_MS = 2000;

export function SweepDetail({ sweepId }: { sweepId: string }) {
  const [data, setData] = useState<SweepResponse | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      const res = await fetch(`/api/sweeps/${sweepId}`, { cache: 'no-store' });
      if (cancelled || !res.ok) return;
      const body: SweepResponse = await res.json();
      if (cancelled) return;
      setData(body);

      if (body.sweep.status === 'queued' || body.sweep.status === 'running') {
        timerRef.current = setTimeout(poll, POLL_INTERVAL_MS);
      }
    }

    poll();
    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [sweepId]);

  if (!data) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Loading…
      </div>
    );
  }

  const { sweep, findings } = data;
  const isActive = sweep.status === 'queued' || sweep.status === 'running';

  return (
    <div className="space-y-6">
      <div>
        <div className="mb-1.5 flex items-center gap-2">
          <StatusBadge status={sweep.status} />
          <span className="text-xs text-muted-foreground">coverage sweep</span>
        </div>
        <h1 className="break-all text-xl font-semibold tracking-tight">{sweep.baseUrl}</h1>
      </div>

      {isActive && (
        <Card>
          <CardContent className="flex items-center gap-3 py-6 text-sm text-muted-foreground">
            <Loader2 className="size-5 shrink-0 animate-spin text-primary" />
            <div>
              <p>
                {sweep.status === 'queued'
                  ? 'Waiting to start…'
                  : sweep.totalUrlsDiscovered === null
                    ? 'Discovering pages…'
                    : `Sweeping — ${sweep.pagesSweptCount} page${sweep.pagesSweptCount === 1 ? '' : 's'} done, ${sweep.elementsSweptCount} element${sweep.elementsSweptCount === 1 ? '' : 's'} driven.`}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground/80">
                Findings below update live as pages complete — no need to wait for the whole sweep.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {sweep.status === 'error' && (
        <div className="rounded-md bg-status-critical/10 px-4 py-3 text-sm text-status-critical ring-1 ring-status-critical/20">
          <p className="flex items-center gap-1.5 font-medium">
            <CircleAlert className="size-4" />
            Sweep failed
          </p>
          <p className="mt-1 font-mono text-xs opacity-90">{sweep.errorMessage}</p>
        </div>
      )}

      {findings.length > 0 ? (
        <CoverageView sweep={sweep} findings={findings} />
      ) : (
        !isActive &&
        sweep.status !== 'error' && (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              No pages could be swept — check the site is reachable and has at least one discoverable page.
            </CardContent>
          </Card>
        )
      )}
    </div>
  );
}
