'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ChevronRight,
  ChevronLeft,
  CircleAlert,
  Loader2,
  ArrowRight,
  RotateCw,
  Check,
  Pencil,
  X,
  MousePointerClick,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import type { DiffResult, InteractionStep, RawEvent, StepResult, TemplateDefinition } from '@/lib/types';
import type { RunRow } from '@/lib/db/schema';
import { unmarkForDisplay } from '@/lib/capture/undefinedMarker';
import { StatusBadge } from './StatusBadge';
import { DiffView } from './DiffView';
import { JsonCompareView } from './JsonCompareView';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface RunTemplateDiff {
  templateId: string;
  templateName: string;
  templateProjectName: string | null;
  diff: DiffResult;
}

interface RunResponse {
  run: RunRow;
  diffs: RunTemplateDiff[];
  missingTemplateCount: number;
  suggestedTemplate: TemplateDefinition | null;
  project: { id: string; name: string } | null;
}

const POLL_INTERVAL_MS = 1500;

export function RunDetail({ runId }: { runId: string }) {
  const router = useRouter();
  const [data, setData] = useState<RunResponse | null>(null);
  const [showRaw, setShowRaw] = useState(false);
  const [rerunning, setRerunning] = useState(false);
  const [rerunError, setRerunError] = useState<string | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [savingName, setSavingName] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function saveName() {
    const next = draftName.trim();
    if (!next || next === data?.run.name) {
      setEditingName(false);
      return;
    }
    setSavingName(true);
    try {
      const res = await fetch(`/api/runs/${runId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: next }),
      });
      if (res.ok) {
        setData((d) => (d ? { ...d, run: { ...d.run, name: next } } : d));
        setEditingName(false);
      }
    } finally {
      setSavingName(false);
    }
  }

  async function handleRerun() {
    if (!data?.run) return;
    if (!data.run.projectId) {
      setRerunError('This run predates projects — open it from a project to rerun.');
      return;
    }
    setRerunning(true);
    try {
      const res = await fetch('/api/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: data.run.projectId,
          url: data.run.targetUrl,
          mode: data.run.mode,
          ...(data.run.mode === 'diff'
            ? { templateIds: data.run.templateIds ?? (data.run.templateId ? [data.run.templateId] : []) }
            : {}),
        }),
      });
      const body = await res.json();
      if (res.ok) {
        router.push(`/runs/${body.id}`);
      } else {
        setRerunError('Rerun failed.');
        setRerunning(false);
      }
    } catch {
      setRerunError('Rerun failed — is the server reachable?');
      setRerunning(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      const res = await fetch(`/api/runs/${runId}`, { cache: 'no-store' });
      if (cancelled) return;
      if (!res.ok) return;
      // Undefined-valued captured fields survive the DB/API JSON round-trip as a marker
      // string (see lib/capture/undefinedMarker.ts) — swap it back to real `undefined`
      // here so the raw-JSON/JsonTree views below render it via their existing
      // `value === undefined` handling instead of showing the marker literally.
      const body: RunResponse = unmarkForDisplay(await res.json()) as RunResponse;
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

  const { run, diffs, missingTemplateCount, project } = data;

  return (
    <div className="space-y-6">
      <div>
        {project && (
          <Link
            href={`/projects/${project.id}`}
            className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ChevronLeft className="size-3.5" />
            {project.name}
          </Link>
        )}
        <div className="mb-1.5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <StatusBadge status={run.status} />
            <span className="text-xs text-muted-foreground">{run.mode} run</span>
            {run.kind === 'click' && (
              <span className="inline-flex items-center gap-0.5 rounded-sm bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary">
                <MousePointerClick className="size-3" />
                click
              </span>
            )}
          </div>
          {run.status === 'complete' && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleRerun}
              disabled={rerunning}
            >
              {rerunning ? <Loader2 className="size-3.5 animate-spin" /> : <RotateCw className="size-3.5" />}
              Rerun
            </Button>
          )}
        </div>
        {editingName ? (
          <div className="flex items-center gap-2">
            <Input
              autoFocus
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveName();
                if (e.key === 'Escape') setEditingName(false);
              }}
              className="h-9 max-w-md text-lg font-semibold"
            />
            <Button type="button" size="icon-sm" onClick={saveName} disabled={savingName} aria-label="Save name">
              {savingName ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
            </Button>
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              onClick={() => setEditingName(false)}
              aria-label="Cancel"
            >
              <X className="size-4" />
            </Button>
          </div>
        ) : (
          <div className="group flex items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight">{run.name ?? run.targetUrl}</h1>
            <button
              type="button"
              onClick={() => {
                setDraftName(run.name ?? '');
                setEditingName(true);
              }}
              className="text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
              aria-label="Edit run name"
            >
              <Pencil className="size-3.5" />
            </button>
          </div>
        )}
        {run.name && <p className="mt-0.5 break-all text-xs text-muted-foreground">{run.targetUrl}</p>}
        {rerunError && <p className="mt-1 text-sm text-destructive">{rerunError}</p>}
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
        <div className="rounded-sm bg-status-critical/10 px-4 py-3 text-sm text-status-critical ring-1 ring-status-critical/20">
          <p className="flex items-center gap-1.5 font-medium">
            <CircleAlert className="size-4" />
            Run failed
          </p>
          <p className="mt-1 font-mono text-xs opacity-90">{run.errorMessage}</p>
        </div>
      )}

      {run.status === 'complete' && run.timedOut && (
        <div className="rounded-sm bg-status-warning/10 px-4 py-3 text-sm text-status-warning ring-1 ring-status-warning/25">
          <p className="flex items-center gap-1.5 font-medium">
            <CircleAlert className="size-4" />
            Capture hit the time ceiling
          </p>
          <p className="mt-1 text-xs opacity-90">
            Pushes were still arriving when the capture stopped, so late events may be missing. Re-run — a slow
            data-driven page (a property list, search results) sometimes needs a second pass.
          </p>
        </div>
      )}

      {run.steps && run.steps.length > 0 && <StepsPerformed steps={run.steps} results={run.stepResults ?? []} />}

      {run.status === 'complete' && run.mode === 'diff' && (
        <div className="space-y-3">
          {missingTemplateCount > 0 && (
            <p className="text-xs text-muted-foreground">
              {missingTemplateCount} template{missingTemplateCount === 1 ? '' : 's'} this run targeted{' '}
              {missingTemplateCount === 1 ? 'no longer exists' : 'no longer exist'} and {missingTemplateCount === 1 ? 'is' : 'are'}{' '}
              not shown.
            </p>
          )}
          {diffs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No template available to diff against.</p>
          ) : diffs.length === 1 ? (
            <TemplateDiff diff={diffs[0].diff} />
          ) : (
            <Tabs defaultValue={diffs[0].templateId}>
              <TabsList variant="line">
                {diffs.map((d) => {
                  const problems =
                    d.diff.summary.mismatchedCount +
                    d.diff.summary.missingCount +
                    d.diff.summary.unexpectedCount +
                    d.diff.summary.countMismatchCount;
                  return (
                    <TabsTrigger key={d.templateId} value={d.templateId}>
                      {d.templateName}
                      <span className={`ml-1.5 text-xs ${problems > 0 ? 'text-status-critical' : 'text-status-good'}`}>
                        {problems > 0 ? `⚠ ${problems}` : '✓'}
                      </span>
                    </TabsTrigger>
                  );
                })}
              </TabsList>
              {diffs.map((d) => (
                <TabsContent key={d.templateId} value={d.templateId} className="pt-4">
                  <TemplateDiff diff={d.diff} />
                </TabsContent>
              ))}
            </Tabs>
          )}
        </div>
      )}

      {run.status === 'complete' && run.mode === 'record' && (
        <RecordSummary
          events={run.capturedEvents ?? []}
          nonEventPushCount={run.nonEventPushCount ?? 0}
          runId={run.id}
          projectId={run.projectId}
          kind={run.kind}
          steps={run.steps ?? []}
        />
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
                <pre className="max-h-96 overflow-auto rounded-sm bg-muted/40 p-3 text-xs">
                  {JSON.stringify(run.capturedEvents, null, 2)}
                </pre>
              </div>
              <div>
                <p className="mb-1 text-xs font-medium text-muted-foreground">
                  Non-event pushes filtered ({run.nonEventPushCount ?? 0}) — e.g. the null-clear pattern
                </p>
                <pre className="max-h-48 overflow-auto rounded-sm bg-muted/40 p-3 text-xs">{JSON.stringify(run.nonEventPushes, null, 2)}</pre>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StepsPerformed({ steps, results }: { steps: InteractionStep[]; results: StepResult[] }) {
  const byIndex = new Map(results.map((r) => [r.index, r]));
  const failure = results.find((r) => r.status !== 'ok');
  return (
    <div className="space-y-2">
      <div className="rounded-sm border border-border bg-muted/30 px-4 py-3">
        <p className="mb-1.5 text-xs font-medium text-muted-foreground">Steps performed</p>
        <ol className="space-y-1 text-sm">
          {steps.map((step, i) => {
            const r = byIndex.get(i);
            const mark = !r ? '·' : r.status === 'ok' ? '✓' : '✗';
            const markClass = !r
              ? 'text-muted-foreground'
              : r.status === 'ok'
                ? 'text-status-good'
                : 'text-status-critical';
            return (
              <li key={i} className="flex items-baseline gap-2">
                <span className={`shrink-0 font-medium ${markClass}`}>{mark}</span>
                <span>
                  {i + 1}. Click{' '}
                  <span className="font-mono text-foreground">{step.label?.trim() || step.target.value}</span>{' '}
                  <span className="text-xs text-muted-foreground">
                    ({step.target.by === 'css' ? 'CSS' : 'text'})
                  </span>
                  {!r && <span className="ml-1 text-xs text-muted-foreground italic">not reached</span>}
                </span>
              </li>
            );
          })}
        </ol>
      </div>
      {failure && (
        <div className="rounded-sm bg-status-critical/10 px-4 py-3 text-sm text-status-critical ring-1 ring-status-critical/20">
          <p className="flex items-center gap-1.5 font-medium">
            <CircleAlert className="size-4" />
            Step {failure.index + 1} ({failure.label?.trim() || failure.target.value}):{' '}
            {failure.status === 'target_not_found'
              ? 'target not found'
              : failure.status === 'target_disabled'
                ? 'control was disabled'
                : failure.status === 'click_blocked'
                  ? 'click blocked by an overlay'
                  : 'click failed'}{' '}
            — later steps skipped
          </p>
          {failure.message && <p className="mt-1 font-mono text-xs opacity-90">{failure.message}</p>}
        </div>
      )}
    </div>
  );
}

/** One template's diff: the Structured-diff / JSON-compare sub-tabs. */
function TemplateDiff({ diff }: { diff: DiffResult }) {
  return (
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
  );
}

function RecordSummary({
  events,
  nonEventPushCount,
  runId,
  projectId,
  kind,
  steps,
}: {
  events: RawEvent[];
  nonEventPushCount: number;
  runId: string;
  projectId: string | null;
  kind: 'pageload' | 'click';
  steps: InteractionStep[];
}) {
  const continueParams = new URLSearchParams({ runId, kind });
  if (kind === 'click' && steps.length > 0) continueParams.set('steps', JSON.stringify(steps));
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
      {projectId && (
        <Button
          render={<Link href={`/projects/${projectId}/templates/new?${continueParams.toString()}`} />}
          nativeButton={false}
        >
          Continue — review &amp; save as template
          <ArrowRight className="size-4" />
        </Button>
      )}
    </div>
  );
}
