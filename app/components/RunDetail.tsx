'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ChevronRight, CircleAlert, Loader2, ArrowRight } from 'lucide-react';
import type { DiffResult, RawEvent, TemplateDefinition } from '@/lib/types';
import type { RunRow } from '@/lib/db/schema';
import { StatusBadge } from './StatusBadge';
import { DiffView } from './DiffView';
import { JsonCompareView } from './JsonCompareView';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface RunResponse {
  run: RunRow;
  diff: DiffResult | null;
  suggestedTemplate: TemplateDefinition | null;
}

const POLL_INTERVAL_MS = 1500;

export function RunDetail({ runId }: { runId: string }) {
  const [data, setData] = useState<RunResponse | null>(null);
  const [showRaw, setShowRaw] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      const res = await fetch(`/api/runs/${runId}`, { cache: 'no-store' });
      if (cancelled) return;
      if (!res.ok) return;
      const body: RunResponse = await res.json();
      if (cancelled) return;
      setData(body);

      if (body.run.status === 'queued' || body.run.status === 'running') {
        timerRef.current = setTimeout(poll, POLL_INTERVAL_MS);
      }
    }

    poll();
    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [runId]);

  if (!data) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Loading…
      </div>
    );
  }

  const { run, diff } = data;

  return (
    <div className="space-y-6">
      <div>
        <div className="mb-1.5 flex items-center gap-2">
          <StatusBadge status={run.status} />
          <span className="text-xs text-muted-foreground">{run.mode} run</span>
        </div>
        <h1 className="break-all text-xl font-semibold tracking-tight">{run.targetUrl}</h1>
      </div>

      {(run.status === 'queued' || run.status === 'running') && (
        <Card>
          <CardContent className="flex items-center gap-3 py-6 text-sm text-muted-foreground">
            <Loader2 className="size-5 shrink-0 animate-spin text-primary" />
            {run.status === 'queued' ? 'Waiting for a free slot…' : 'Capturing dataLayer pushes and waiting for the page to settle…'}
          </CardContent>
        </Card>
      )}

      {run.status === 'error' && (
        <div className="rounded-md bg-status-critical/10 px-4 py-3 text-sm text-status-critical ring-1 ring-status-critical/20">
          <p className="flex items-center gap-1.5 font-medium">
            <CircleAlert className="size-4" />
            Run failed
          </p>
          <p className="mt-1 font-mono text-xs opacity-90">{run.errorMessage}</p>
        </div>
      )}

      {run.status === 'complete' && run.mode === 'diff' && diff && (
        <Tabs defaultValue="structured">
          <TabsList variant="line">
            <TabsTrigger value="structured">Structured diff</TabsTrigger>
            <TabsTrigger value="json">JSON compare</TabsTrigger>
          </TabsList>
          <TabsContent value="structured" className="pt-4">
            <DiffView diff={diff} />
          </TabsContent>
          <TabsContent value="json" className="pt-4">
            <JsonCompareView diff={diff} />
          </TabsContent>
        </Tabs>
      )}

      {run.status === 'complete' && run.mode === 'record' && (
        <RecordSummary events={run.capturedEvents ?? []} nonEventPushCount={run.nonEventPushCount ?? 0} runId={run.id} />
      )}

      {run.status === 'complete' && (
        <div>
          <button
            type="button"
            onClick={() => setShowRaw((v) => !v)}
            className="flex items-center gap-1 text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground"
          >
            <ChevronRight className={`size-3.5 transition-transform ${showRaw ? 'rotate-90' : ''}`} />
            {showRaw ? 'Hide' : 'Show'} raw capture
          </button>
          {showRaw && (
            <div className="mt-3 space-y-3">
              <div>
                <p className="mb-1 text-xs font-medium text-muted-foreground">Events ({run.capturedEvents?.length ?? 0})</p>
                <pre className="max-h-96 overflow-auto rounded-md bg-muted/40 p-3 text-xs">
                  {JSON.stringify(run.capturedEvents, null, 2)}
                </pre>
              </div>
              <div>
                <p className="mb-1 text-xs font-medium text-muted-foreground">
                  Non-event pushes filtered ({run.nonEventPushCount ?? 0}) — e.g. the null-clear pattern
                </p>
                <pre className="max-h-48 overflow-auto rounded-md bg-muted/40 p-3 text-xs">{JSON.stringify(run.nonEventPushes, null, 2)}</pre>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function RecordSummary({ events, nonEventPushCount, runId }: { events: RawEvent[]; nonEventPushCount: number; runId: string }) {
  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="py-1">
          <p className="text-sm">
            Captured <strong>{events.length}</strong> event{events.length === 1 ? '' : 's'}
            {nonEventPushCount > 0 && (
              <span className="text-muted-foreground">
                {' '}
                ({nonEventPushCount} non-event push{nonEventPushCount === 1 ? '' : 'es'} filtered out)
              </span>
            )}
            .
          </p>
          <ul className="mt-2 space-y-1 text-sm">
            {events.map((ev, i) => (
              <li key={i} className="font-mono text-muted-foreground">
                {ev.event}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
      <Button render={<Link href={`/templates/new?runId=${runId}`} />} nativeButton={false}>
        Continue — review &amp; save as template
        <ArrowRight className="size-4" />
      </Button>
    </div>
  );
}
