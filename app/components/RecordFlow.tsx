'use client';

import { Fragment, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2, ArrowRight, Radio, ChevronRight, Trash2, MousePointerClick } from 'lucide-react';
import type {
  DiffResult,
  FieldClassification,
  InteractionStep,
  LeafType,
  RawEvent,
  TemplateDefinition,
  TemplateFieldRule,
  TemplateKind,
} from '@/lib/types';
import type { RunRow } from '@/lib/db/schema';
import { flattenToPaths } from '@/lib/diff/flatten';
import { inferDefaultClassification, inferAllowEmpty } from '@/lib/diff/classify';
import { sanitizeTemplateEvents } from '@/lib/diff/sanitizeTemplateEvents';
import { extractApiErrorMessage } from '@/lib/apiError';
import { StatusBadge } from './StatusBadge';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { FieldRulesMenu, type FieldRulesValue } from './FieldRulesMenu';
import { Combobox } from '@/components/ui/combobox';
import { StepsEditor, cleanSteps } from './StepsEditor';
import { ClickableScanner } from './ClickableScanner';
import { isNoiseEvent } from '@/lib/capture/clickNoiseEvents';

const UNASSIGNED = '__unassigned__';

interface RunResponse {
  run: RunRow;
  diff: DiffResult | null;
  suggestedTemplate: TemplateDefinition | null;
}

interface EditableField {
  path: string;
  type: LeafType;
  classification: FieldClassification;
  capturedValue: unknown;
  allowEmpty: boolean;
  /** Only meaningful for type 'array'. Optional — undefined means no count check. */
  expectedCount: number | undefined;
  /** Only meaningful for type 'string'. Optional — undefined means no contains check. */
  containsText: string | undefined;
  matchesPattern?: string;
  excludesPattern?: string;
  oneOf?: string[];
  /** Only meaningful for type 'array'. One level deep — item fields don't get their own itemFields. */
  itemFields?: EditableField[];
  /** Transient UI state — not part of the saved template. */
  itemsExpanded?: boolean;
  /**
   * Transient UI state — whether this field is kept as a rule at all when the template
   * is saved (see saveTemplate's filter). Defaults to true for every field except
   * type 'undefined', which defaults to false since most of the time a field that's
   * usually absent isn't something you want to assert on — flip it on if you do.
   */
  included: boolean;
}
interface EditableEvent {
  eventName: string;
  occurrenceIndex: number;
  /** When true, a future run that doesn't fire this event isn't a "missing event" failure. */
  optional: boolean;
  /** Transient UI state — when true this event is not saved to the template at all. Seeded
   * true for page-load noise on a click recording. */
  omitted: boolean;
  /** Which configured step (0-based) triggered this event, or null if it fired before any
   * step (page load). Always null for a page-load-kind recording. */
  stepIndex: number | null;
  /** Transient UI state, multi-save mode only (see `multiSaveMode`) — whether this event
   * is part of the template about to be saved. Not "consumed" on save, so the same event
   * can be picked again for a different combination. */
  selectedForSave: boolean;
  fields: EditableField[];
}

const POLL_INTERVAL_MS = 1500;

export function RecordFlow({
  projectId,
  projects,
}: {
  /** Set on the project-scoped route (`/projects/[id]/templates/new`) — the new template
   * goes straight into that project, no picker shown. Omitted on the global
   * `/templates/new` route, where the project is auto-matched by hostname and editable. */
  projectId?: string;
  /** All projects, for the picker in the global flow. */
  projects?: { id: string; name: string }[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const prefillUrl = searchParams.get('url') ?? '';
  const resumeRunId = searchParams.get('runId');
  // Set when re-recording an existing template: save() updates it in place (PATCH)
  // instead of creating a new one.
  const existingTemplateId = searchParams.get('templateId');
  const prefillName = searchParams.get('name') ?? '';

  const scoped = Boolean(projectId);
  const kind: TemplateKind = searchParams.get('kind') === 'click' ? 'click' : 'pageload';

  const [step, setStep] = useState<'setup' | 'capturing' | 'review'>(resumeRunId ? 'capturing' : 'setup');
  const [name, setName] = useState(prefillName);
  const [url, setUrl] = useState(prefillUrl);
  const [steps, setSteps] = useState<InteractionStep[]>(() => {
    const raw = searchParams.get('steps');
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as InteractionStep[];
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch {
        /* fall through to the default */
      }
    }
    return [];
  });

  function addStep(step: InteractionStep) {
    setSteps((prev) =>
      prev.some((s) => s.target.by === step.target.by && s.target.value === step.target.value) ? prev : [...prev, step]
    );
  }
  const [runId, setRunId] = useState<string | null>(resumeRunId);
  const [run, setRun] = useState<RunRow | null>(null);
  const [events, setEvents] = useState<EditableEvent[]>([]);
  // Which event cards are expanded, keyed by `${eventName}-${occurrenceIndex}`. Empty =
  // all collapsed, which is the default — a busy page can capture 20+ events.
  const [openEvents, setOpenEvents] = useState<Set<string>>(new Set());
  // Included/Excluded tabs in the review step; "Event timeline" can jump into either.
  const [activeTab, setActiveTab] = useState<'included' | 'excluded'>('included');
  const eventCardRefs = useRef(new Map<string, HTMLDivElement>());
  const [error, setError] = useState<string | null>(null);
  const [startingCapture, setStartingCapture] = useState(false);
  const [saving, setSaving] = useState(false);
  // Global flow only: which project the saved template lands in. Seeded from a hostname
  // match once the capture completes; UNASSIGNED means "leave it with no project".
  const [chosenProjectId, setChosenProjectId] = useState<string>(projectId ?? UNASSIGNED);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Templates already saved from *this* capture, in multi-save mode — each save stays on
  // the review screen so a different event combination can be saved as another template.
  const [savedFromThisCapture, setSavedFromThisCapture] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    if (!runId || step !== 'capturing') return;
    let cancelled = false;

    async function poll() {
      const res = await fetch(`/api/runs/${runId}`, { cache: 'no-store' });
      if (cancelled || !res.ok) return;
      const body: RunResponse = await res.json();
      if (cancelled) return;
      setRun(body.run);

      if (body.run.status === 'queued' || body.run.status === 'running') {
        timerRef.current = setTimeout(poll, POLL_INTERVAL_MS);
        return;
      }
      if (body.run.status === 'error') {
        setError(body.run.errorMessage ?? 'Capture failed.');
        return;
      }
      if (body.run.status === 'complete' && body.suggestedTemplate) {
        setUrl(body.run.targetUrl);
        setEvents(
          buildEditableEvents(body.suggestedTemplate, body.run.capturedEvents ?? [], kind, body.run.eventStepIndex ?? undefined)
        );
        setStep('review');
        // Global flow: pre-select the project whose hostname list owns this URL.
        if (!scoped && !existingTemplateId) {
          try {
            const m = await fetch(`/api/projects/match?url=${encodeURIComponent(body.run.targetUrl)}`);
            const mj = await m.json();
            if (!cancelled && mj.project?.id) setChosenProjectId(mj.project.id);
          } catch {
            /* leave as UNASSIGNED */
          }
        }
      }
    }

    poll();
    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [runId, step, scoped, existingTemplateId, kind]);

  function handleSetupSubmit(e: React.FormEvent) {
    e.preventDefault();
    void startCapture();
  }

  async function startCapture() {
    setError(null);
    setStartingCapture(true);
    try {
      const res = await fetch('/api/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          url,
          mode: 'record',
          kind,
          ...(kind === 'click' ? { steps: cleanSteps(steps) } : {}),
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(extractApiErrorMessage(body, 'Failed to start capture.'));
        setStartingCapture(false);
        return;
      }
      setRunId(body.id);
      setStep('capturing');
    } catch {
      setError('Failed to start capture — is the server reachable?');
      setStartingCapture(false);
    }
  }

  function toggleClassification(eventIdx: number, fieldIdx: number) {
    setEvents((prev) =>
      prev.map((ev, i) =>
        i !== eventIdx
          ? ev
          : {
              ...ev,
              fields: ev.fields.map((f, j) =>
                j !== fieldIdx ? f : { ...f, classification: f.classification === 'exact' ? 'structural' : 'exact' }
              ),
            }
      )
    );
  }

  // Plain spread — deliberately not a manual per-key whitelist, which previously went
  // stale every time FieldRulesValue grew a new option (matchesPattern/excludesPattern/
  // oneOf all silently no-op'd until this was fixed). `patch` only ever contains
  // FieldRulesValue keys, so spreading it over `f` is exactly "merge these, leave
  // everything else untouched" — including an explicit `{ key: undefined }` "remove".
  function updateRules(eventIdx: number, fieldIdx: number, patch: FieldRulesValue) {
    setEvents((prev) =>
      prev.map((ev, i) =>
        i !== eventIdx ? ev : { ...ev, fields: ev.fields.map((f, j) => (j !== fieldIdx ? f : { ...f, ...patch })) }
      )
    );
  }

  function toggleFieldIncluded(eventIdx: number, fieldIdx: number) {
    setEvents((prev) =>
      prev.map((ev, i) =>
        i !== eventIdx ? ev : { ...ev, fields: ev.fields.map((f, j) => (j !== fieldIdx ? f : { ...f, included: !f.included })) }
      )
    );
  }

  /** Header checkbox: flip every top-level field in one event to included/excluded at once. */
  function setAllFieldsIncluded(eventIdx: number, included: boolean) {
    setEvents((prev) =>
      prev.map((ev, i) => (i !== eventIdx ? ev : { ...ev, fields: ev.fields.map((f) => ({ ...f, included })) }))
    );
  }

  function toggleEventOptional(eventIdx: number, optional: boolean) {
    setEvents((prev) => prev.map((ev, i) => (i !== eventIdx ? ev : { ...ev, optional })));
  }

  function toggleEventOmitted(eventIdx: number, omitted: boolean) {
    setEvents((prev) => prev.map((ev, i) => (i !== eventIdx ? ev : { ...ev, omitted })));
  }

  function toggleEventSelectedForSave(eventIdx: number, selectedForSave: boolean) {
    setEvents((prev) => prev.map((ev, i) => (i !== eventIdx ? ev : { ...ev, selectedForSave })));
  }

  /** Switches to the tab holding this event, expands it, and scrolls it into view — used
   * by the "Event timeline" so clicking an event name jumps straight to it. */
  function focusEvent(eventKey: string, omitted: boolean) {
    setActiveTab(omitted ? 'excluded' : 'included');
    setOpenEvents((prev) => new Set(prev).add(eventKey));
    requestAnimationFrame(() => {
      eventCardRefs.current.get(eventKey)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }

  function toggleEventOpen(key: string) {
    setOpenEvents((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  function setAllEventsOpen(open: boolean) {
    setOpenEvents(open ? new Set(events.map((ev) => `${ev.eventName}-${ev.occurrenceIndex}`)) : new Set());
  }

  function toggleItemFieldIncluded(eventIdx: number, fieldIdx: number, itemFieldIdx: number) {
    setEvents((prev) =>
      prev.map((ev, i) =>
        i !== eventIdx
          ? ev
          : {
              ...ev,
              fields: ev.fields.map((f, j) =>
                j !== fieldIdx || !f.itemFields
                  ? f
                  : {
                      ...f,
                      itemFields: f.itemFields.map((itf, k) => (k !== itemFieldIdx ? itf : { ...itf, included: !itf.included })),
                    }
              ),
            }
      )
    );
  }

  function toggleItemsExpanded(eventIdx: number, fieldIdx: number) {
    setEvents((prev) =>
      prev.map((ev, i) =>
        i !== eventIdx
          ? ev
          : {
              ...ev,
              fields: ev.fields.map((f, j) => {
                if (j !== fieldIdx) return f;
                const nextExpanded = !f.itemsExpanded;
                const needsSeed = nextExpanded && (!f.itemFields || f.itemFields.length === 0);
                const sample = Array.isArray(f.capturedValue) ? f.capturedValue[0] : undefined;
                return {
                  ...f,
                  itemsExpanded: nextExpanded,
                  itemFields: needsSeed && sample !== undefined ? buildItemFieldsFromSample(sample) : f.itemFields,
                };
              }),
            }
      )
    );
  }

  function toggleItemFieldClassification(eventIdx: number, fieldIdx: number, itemFieldIdx: number) {
    setEvents((prev) =>
      prev.map((ev, i) =>
        i !== eventIdx
          ? ev
          : {
              ...ev,
              fields: ev.fields.map((f, j) =>
                j !== fieldIdx || !f.itemFields
                  ? f
                  : {
                      ...f,
                      itemFields: f.itemFields.map((itf, k) =>
                        k !== itemFieldIdx ? itf : { ...itf, classification: itf.classification === 'exact' ? 'structural' : 'exact' }
                      ),
                    }
              ),
            }
      )
    );
  }

  function updateItemFieldRules(eventIdx: number, fieldIdx: number, itemFieldIdx: number, patch: FieldRulesValue) {
    setEvents((prev) =>
      prev.map((ev, i) =>
        i !== eventIdx
          ? ev
          : {
              ...ev,
              fields: ev.fields.map((f, j) =>
                j !== fieldIdx || !f.itemFields
                  ? f
                  : {
                      ...f,
                      itemFields: f.itemFields.map((itf, k) => (k !== itemFieldIdx ? itf : { ...itf, ...patch })),
                    }
              ),
            }
      )
    );
  }

  async function saveTemplate() {
    setError(null);
    if (!name.trim()) {
      setError('Give this template a name.');
      return;
    }
    if (kind === 'click' && cleanSteps(steps).length === 0) {
      setError('Add at least one step for a click template.');
      return;
    }
    setSaving(true);
    const templateEvents = sanitizeTemplateEvents(
      events
        .filter((ev) => !ev.omitted)
        .map((ev) => ({
          eventName: ev.eventName,
          occurrenceIndex: ev.occurrenceIndex,
          ...(ev.optional ? { optional: true } : {}),
          fields: ev.fields.filter((f) => f.included).map((f) => trimField(f)),
        }))
    );

    // scoped flow -> the route's project; global flow -> the picker (UNASSIGNED => null).
    const targetProjectId = scoped ? projectId! : chosenProjectId === UNASSIGNED ? null : chosenProjectId;

    try {
      const res = existingTemplateId
        ? await fetch(`/api/templates/${existingTemplateId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: name.trim(),
              events: templateEvents,
              kind,
              ...(kind === 'click' ? { steps: cleanSteps(steps) } : {}),
            }),
          })
        : await fetch('/api/templates', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              projectId: targetProjectId,
              name: name.trim(),
              sourceUrl: url,
              kind,
              ...(kind === 'click' ? { steps: cleanSteps(steps) } : {}),
              events: templateEvents,
            }),
          });
      const body = await res.json();
      if (!res.ok) {
        setError(extractApiErrorMessage(body, 'Failed to save template.'));
        setSaving(false);
        return;
      }
      const savedId = existingTemplateId ?? body.id;
      router.push(scoped ? `/projects/${projectId}/templates/${savedId}` : `/templates/${savedId}`);
    } catch {
      setError('Failed to save template — is the server reachable?');
      setSaving(false);
    }
  }

  /**
   * Multi-save mode (fresh click recordings only, see `multiSaveMode`): saves exactly the
   * checked events as one new template and stays on the review screen instead of
   * navigating away, so a different combination from the same capture can be saved next.
   */
  async function saveOneTemplate() {
    setError(null);
    if (!name.trim()) {
      setError('Give this template a name.');
      return;
    }
    const chosen = events.filter((ev) => ev.selectedForSave);
    if (chosen.length === 0) {
      setError('Check at least one event to save as a template.');
      return;
    }
    setSaving(true);
    const templateEvents = sanitizeTemplateEvents(
      chosen.map((ev) => ({
        eventName: ev.eventName,
        occurrenceIndex: ev.occurrenceIndex,
        ...(ev.optional ? { optional: true } : {}),
        fields: ev.fields.filter((f) => f.included).map((f) => trimField(f)),
      }))
    );
    const targetProjectId = scoped ? projectId! : chosenProjectId === UNASSIGNED ? null : chosenProjectId;
    const thisName = name.trim();

    try {
      const res = await fetch('/api/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: targetProjectId,
          name: thisName,
          sourceUrl: url,
          kind: 'click',
          steps: cleanSteps(steps),
          events: templateEvents,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(extractApiErrorMessage(body, 'Failed to save template.'));
        setSaving(false);
        return;
      }
      setSavedFromThisCapture((prev) => [...prev, { id: body.id, name: thisName }]);
      setName('');
      setEvents((prev) => prev.map((ev) => ({ ...ev, selectedForSave: false })));
      setSaving(false);
    } catch {
      setError('Failed to save template — is the server reachable?');
      setSaving(false);
    }
  }

  if (step === 'setup') {
    const captureDisabled =
      startingCapture || (kind === 'click' && cleanSteps(steps).length === 0);
    return (
      <div className="max-w-lg space-y-4">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">
            Record a {kind === 'click' ? 'click' : 'page-load'} template
          </h1>
          {kind === 'click' && (
            <span className="inline-flex items-center gap-1 rounded-sm bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
              <MousePointerClick className="size-3" />
              click
            </span>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          {kind === 'click' ? (
            <>
              Enter a known-good page URL and the click(s) to perform. We&apos;ll load the page, accept the cookie
              banner, run your steps, and capture what they push to{' '}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">dataLayer</code>.
            </>
          ) : (
            <>
              Enter the URL of a known-good (&quot;golden&quot;) page. We&apos;ll capture whatever it pushes to{' '}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">dataLayer</code> and let you review it before
              saving.
            </>
          )}
        </p>
        <Card>
          <CardContent>
            <form onSubmit={handleSetupSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="url">Page URL</Label>
                <Input
                  id="url"
                  type="url"
                  required
                  placeholder="https://www.example.com/some-page/"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                />
              </div>
              {kind === 'click' && (
                <div className="space-y-3">
                  <ClickableScanner url={url} steps={steps} onAdd={addStep} />
                  <StepsEditor value={steps} onChange={setSteps} />
                </div>
              )}
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" disabled={captureDisabled}>
                {startingCapture && <Loader2 className="size-4 animate-spin" />}
                {startingCapture ? 'Starting…' : 'Capture'}
                {!startingCapture && <ArrowRight className="size-4" />}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (step === 'capturing') {
    return (
      <div className="max-w-lg space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">Recording…</h1>
        {run && (
          <div className="flex items-center gap-2">
            <StatusBadge status={run.status} />
            <span className="break-all text-sm text-muted-foreground">{run.targetUrl}</span>
          </div>
        )}
        <Card>
          <CardContent className="flex items-center gap-3 py-6 text-sm text-muted-foreground">
            <Radio className="size-5 shrink-0 animate-pulse text-primary" />
            Visiting the page and waiting for dataLayer pushes to settle. This can take up to ~30 seconds.
          </CardContent>
        </Card>
        {error && (
          <div className="rounded-sm bg-status-critical/10 px-4 py-3 text-sm text-status-critical ring-1 ring-status-critical/20">
            {error}
          </div>
        )}
      </div>
    );
  }

  // step === 'review'
  // Fresh click recordings can be carved into several templates from one capture — pick
  // events, name, save, repeat. Re-records and page-load captures keep the single
  // "Confirm & Save" flow, since "several templates from one page load" isn't a real use
  // case and re-recording is about updating one specific existing template.
  const multiSaveMode = kind === 'click' && !existingTemplateId;
  const indexedEvents = events.map((ev, eventIdx) => ({ ev, eventIdx }));
  const includedEvents = indexedEvents.filter(({ ev }) => !ev.omitted);
  const excludedEvents = indexedEvents.filter(({ ev }) => ev.omitted);
  const selectedCount = includedEvents.filter(({ ev }) => ev.selectedForSave).length;
  const savedCount = includedEvents.length;
  const omittedCount = excludedEvents.length;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Review capture</h1>
        {kind === 'click' && cleanSteps(steps).length > 0 && (
          <p className="mt-1 text-sm text-muted-foreground">
            Captured after:{' '}
            {cleanSteps(steps)
              .map((s, i) => `${i + 1}. click "${s.label?.trim() || s.target.value}"`)
              .join('  ')}
          </p>
        )}
        {kind === 'click' && omittedCount > 0 && (
          <p className="mt-1 flex items-start gap-1.5 text-sm text-muted-foreground">
            <span aria-hidden>⚑</span>
            <span>
              {omittedCount} page-load event{omittedCount === 1 ? '' : 's'} ({' '}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">page_loaded</code>, GTM/consent) pre-excluded — a
              click template keeps only the click&apos;s events. Use <strong className="text-foreground">Include event</strong>{' '}
              to keep one anyway.
            </span>
          </p>
        )}
        <p className="mt-1 text-sm text-muted-foreground">
          {multiSaveMode ? (
            <>
              {includedEvents.length} event{includedEvents.length === 1 ? '' : 's'} available from{' '}
              <span className="break-all font-mono">{url}</span> — check the ones for a template below, name it, and save;
              pick a different combination to save another.
            </>
          ) : (
            <>Saving {savedCount} event{savedCount === 1 ? '' : 's'} from <span className="break-all font-mono">{url}</span>.</>
          )}{' '}
          Each field defaults to <strong className="text-foreground">exact</strong> (must match precisely, e.g. an enum like{' '}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">signed_in_status</code>) or{' '}
          <strong className="text-foreground">structural</strong> (must be present with the right type/shape, e.g. a price or an id)
          — flip any that look wrong. Structural text and list fields can take extra rules via the{' '}
          <strong className="text-foreground">Rules</strong> menu (the &quot;⋯&quot; button): <strong className="text-foreground">allow
          empty</strong> (e.g. <code className="rounded bg-muted px-1 py-0.5 text-xs">page_referrer</code> on direct navigation, where
          empty is legitimate), an array&apos;s <strong className="text-foreground">expected count</strong> (a fixed list like a
          &quot;featured properties&quot; carousel that always shows N items), or a string&apos;s{' '}
          <strong className="text-foreground">contains</strong> text (e.g. a click URL that should always include{' '}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">/properties/</code> even though the full URL varies). Leave these off
          for fields that legitimately vary, like search result counts.
        </p>
      </div>

      <div className="flex flex-wrap gap-4">
        {!multiSaveMode && (
          <div className="w-full max-w-sm space-y-1.5">
            <Label htmlFor="name">Template name</Label>
            <Input
              id="name"
              required
              placeholder='e.g. "Homepage", "Property Search Results"'
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
        )}

        {!scoped && !existingTemplateId && (
          <div className="w-full max-w-sm space-y-1.5">
            <Label htmlFor="project">Project</Label>
            <Combobox
              id="project"
              options={[
                { value: UNASSIGNED, label: 'Unassigned' },
                ...(projects ?? []).map((p) => ({ value: p.id, label: p.name })),
              ]}
              value={chosenProjectId}
              onValueChange={(v) => setChosenProjectId(v ?? UNASSIGNED)}
              placeholder="Search projects…"
              emptyText="No projects match."
            />
            <p className="text-xs text-muted-foreground">Auto-selected from the page&apos;s hostname — change if needed.</p>
          </div>
        )}
      </div>

      {kind === 'click' && cleanSteps(steps).length > 0 && (
        <div className="rounded-sm border border-border bg-muted/30 p-3">
          <p className="text-xs font-medium text-muted-foreground">Event timeline</p>
          <p className="mt-0.5 mb-2 text-xs text-muted-foreground">
            Everything captured, in the order it arrived, with your clicks marked in between — this shows what
            happened <em>when</em>, not what each click definitely caused. A slow tracker (a second GTM/consent
            re-scan, a lazy analytics retry) can land after a click it had nothing to do with.
          </p>
          <div className="space-y-2 text-sm">
            {(() => {
              const onLoad = events.filter((ev) => ev.stepIndex === null);
              if (onLoad.length === 0) return null;
              return (
                <div className="flex flex-wrap items-baseline gap-x-1.5">
                  <span className="shrink-0 text-muted-foreground">On page load:</span>
                  {onLoad.map((ev) => {
                    const key = `${ev.eventName}-${ev.occurrenceIndex}`;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => focusEvent(key, ev.omitted)}
                        className="rounded-sm bg-background px-1.5 py-0.5 font-mono text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                      >
                        {ev.eventName}
                      </button>
                    );
                  })}
                </div>
              );
            })()}
            {cleanSteps(steps).map((s, i) => {
              const between = events.filter((ev) => ev.stepIndex === i);
              const result = run?.stepResults?.find((r) => r.index === i);
              // No result at all means the sequence stopped before reaching this step.
              const failed = result ? result.status !== 'ok' : Boolean(run?.stepResults?.length);
              return (
                <div key={i} className="border-t border-border/60 pt-2 first:border-t-0 first:pt-0">
                  <p className={`text-xs font-medium ${failed ? 'text-status-critical' : 'text-foreground'}`}>
                    {failed ? '✗' : '▸'} Clicked <span className="font-mono">{s.label?.trim() || s.target.value}</span>
                  </p>
                  {failed && (
                    <p className="mt-0.5 text-xs text-status-critical">
                      {!result
                        ? 'Not attempted — an earlier step failed, so the sequence stopped.'
                        : result.status === 'target_disabled'
                          ? `This control was disabled, so the click never happened${result.message ? ` — ${result.message}` : ''}`
                          : result.status === 'click_blocked'
                            ? `The click was blocked, so it never reached this control${result.message ? ` — ${result.message}` : ''}`
                            : result.status === 'target_not_found'
                              ? `No matching element was found, so the click never happened${result.message ? ` — ${result.message}` : ''}`
                              : result.message ?? 'The click failed.'}
                    </p>
                  )}
                  <div className="mt-1 flex flex-wrap items-baseline gap-1.5">
                    {between.length === 0 ? (
                      <span className="text-xs text-muted-foreground italic">
                        {failed ? 'nothing captured here' : 'nothing observed before the next click'}
                      </span>
                    ) : (
                      between.map((ev) => {
                        const key = `${ev.eventName}-${ev.occurrenceIndex}`;
                        return (
                          <button
                            key={key}
                            type="button"
                            onClick={() => focusEvent(key, ev.omitted)}
                            className="rounded-sm bg-background px-1.5 py-0.5 font-mono text-xs text-primary underline underline-offset-2 hover:text-foreground"
                          >
                            {ev.eventName}
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'included' | 'excluded')}>
        <TabsList variant="line">
          <TabsTrigger value="included">Included ({includedEvents.length})</TabsTrigger>
          <TabsTrigger value="excluded">Excluded ({excludedEvents.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="included" className="space-y-4 pt-4">
          {includedEvents.length > 1 && (
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                {includedEvents.length} included — {openEvents.size} expanded
                {multiSaveMode && ` — ${selectedCount} selected`}
              </span>
              <div className="flex gap-3">
                <button type="button" onClick={() => setAllEventsOpen(true)} className="hover:text-foreground">
                  Expand all
                </button>
                <button type="button" onClick={() => setAllEventsOpen(false)} className="hover:text-foreground">
                  Collapse all
                </button>
              </div>
            </div>
          )}

          {includedEvents.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing included yet — move an event over from Excluded.</p>
          ) : (
            <div className="space-y-4">
              {includedEvents.map(({ ev, eventIdx }) => {
                const eventKey = `${ev.eventName}-${ev.occurrenceIndex}`;
                const open = openEvents.has(eventKey);
                const allIncluded = ev.fields.length > 0 && ev.fields.every((f) => f.included);
                return (
                  <Card
                    key={eventKey}
                    ref={(el) => {
                      if (el) eventCardRefs.current.set(eventKey, el);
                    }}
                    className="gap-0 p-0"
                  >
                    <div className="flex items-center justify-between gap-3 border-b border-border bg-muted/50 px-4 py-2">
                      <button
                        type="button"
                        onClick={() => toggleEventOpen(eventKey)}
                        aria-expanded={open}
                        className="flex min-w-0 items-center gap-1.5 text-left"
                      >
                        <ChevronRight
                          className={`size-3.5 shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-90' : ''}`}
                        />
                        <span className="truncate font-mono text-sm">
                          {ev.eventName} <span className="text-xs text-muted-foreground">occurrence #{ev.occurrenceIndex}</span>
                        </span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          · {ev.fields.length} field{ev.fields.length === 1 ? '' : 's'}
                        </span>
                        {ev.optional && (
                          <span className="shrink-0 rounded-sm bg-muted px-1.5 text-xs text-muted-foreground">optional</span>
                        )}
                      </button>
                      <div className="flex shrink-0 items-center gap-3">
                        {multiSaveMode && (
                          <label className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                            <Checkbox
                              checked={ev.selectedForSave}
                              onCheckedChange={(checked) => toggleEventSelectedForSave(eventIdx, checked === true)}
                              aria-label={`Add ${ev.eventName} to the template being saved`}
                            />
                            Add to template
                          </label>
                        )}
                        <label className="flex items-center gap-1.5 text-xs font-normal text-muted-foreground">
                          <Checkbox
                            checked={ev.optional}
                            onCheckedChange={(checked) => toggleEventOptional(eventIdx, checked === true)}
                            aria-label={`Mark ${ev.eventName} as optional`}
                          />
                          Optional (don&apos;t flag if this event doesn&apos;t fire)
                        </label>
                        <button
                          type="button"
                          onClick={() => toggleEventOmitted(eventIdx, true)}
                          className="text-muted-foreground hover:text-destructive"
                          aria-label={`Move ${ev.eventName} to Excluded`}
                          title="Move to Excluded"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    </div>
                    {open && (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>
                              <label className="flex items-center gap-1.5 font-normal">
                                <Checkbox
                                  checked={allIncluded}
                                  onCheckedChange={(checked) => setAllFieldsIncluded(eventIdx, checked === true)}
                                  aria-label={`Include all ${ev.eventName} fields in the saved template`}
                                />
                                Include?
                              </label>
                            </TableHead>
                            <TableHead>Field</TableHead>
                            <TableHead>Type</TableHead>
                            <TableHead>Captured value</TableHead>
                            <TableHead>Exact match?</TableHead>
                            <TableHead>Rules</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {ev.fields.map((f, fieldIdx) => {
                            const items = Array.isArray(f.capturedValue) ? f.capturedValue : [];
                            const canDefineItemRules = f.type === 'array' && f.classification === 'structural' && items.length > 0;
                            return (
                              <Fragment key={f.path}>
                                <TableRow className={!f.included ? 'opacity-50' : undefined}>
                                  <TableCell>
                                    <Checkbox
                                      checked={f.included}
                                      onCheckedChange={() => toggleFieldIncluded(eventIdx, fieldIdx)}
                                      aria-label={`Include ${f.path} in the saved template`}
                                    />
                                  </TableCell>
                                  <TableCell className="whitespace-normal break-all font-mono">
                                    {canDefineItemRules && (
                                      <button
                                        type="button"
                                        onClick={() => toggleItemsExpanded(eventIdx, fieldIdx)}
                                        className="mr-1 inline-flex align-middle text-muted-foreground hover:text-foreground"
                                        aria-label="Toggle item field rules"
                                      >
                                        <ChevronRight className={`size-3.5 transition-transform ${f.itemsExpanded ? 'rotate-90' : ''}`} />
                                      </button>
                                    )}
                                    {f.path}
                                    {f.type === 'array' && items.length === 0 && (
                                      <span className="ml-1 text-xs text-muted-foreground italic">(no items captured)</span>
                                    )}
                                  </TableCell>
                                  <TableCell className="text-xs text-muted-foreground">{f.type}</TableCell>
                                  <TableCell className="whitespace-normal break-all font-mono text-xs">
                                    {f.type === 'undefined' ? <span className="italic">undefined</span> : formatValue(f.capturedValue)}
                                  </TableCell>
                                  <TableCell>
                                    <Checkbox
                                      checked={f.classification === 'exact'}
                                      disabled={!f.included}
                                      onCheckedChange={() => toggleClassification(eventIdx, fieldIdx)}
                                    />
                                  </TableCell>
                                  <TableCell>
                                    <FieldRulesMenu
                                      type={f.type}
                                      classification={f.classification}
                                      value={f}
                                      onChange={(patch) => updateRules(eventIdx, fieldIdx, patch)}
                                    />
                                  </TableCell>
                                </TableRow>
                                {canDefineItemRules && f.itemsExpanded && (
                                  <TableRow>
                                    <TableCell colSpan={6} className="bg-muted/30 p-3">
                                      <p className="mb-2 text-xs text-muted-foreground">
                                        Rules for every item in <span className="font-mono">{f.path}</span> — seeded from the first
                                        captured item, applied to all {items.length}.
                                      </p>
                                      <Table>
                                        <TableHeader>
                                          <TableRow>
                                            <TableHead>Include?</TableHead>
                                            <TableHead>Field</TableHead>
                                            <TableHead>Type</TableHead>
                                            <TableHead>Captured value</TableHead>
                                            <TableHead>Exact match?</TableHead>
                                            <TableHead>Rules</TableHead>
                                          </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                          {(f.itemFields ?? []).map((itf, itemFieldIdx) => (
                                            <TableRow key={itf.path} className={!itf.included ? 'opacity-50' : undefined}>
                                              <TableCell>
                                                <Checkbox
                                                  checked={itf.included}
                                                  onCheckedChange={() => toggleItemFieldIncluded(eventIdx, fieldIdx, itemFieldIdx)}
                                                  aria-label={`Include ${itf.path} in the saved template`}
                                                />
                                              </TableCell>
                                              <TableCell className="whitespace-normal break-all font-mono">{itf.path}</TableCell>
                                              <TableCell className="text-xs text-muted-foreground">{itf.type}</TableCell>
                                              <TableCell className="whitespace-normal break-all font-mono text-xs">
                                                {itf.type === 'undefined' ? (
                                                  <span className="italic">undefined</span>
                                                ) : (
                                                  formatValue(itf.capturedValue)
                                                )}
                                              </TableCell>
                                              <TableCell>
                                                <Checkbox
                                                  checked={itf.classification === 'exact'}
                                                  disabled={!itf.included}
                                                  onCheckedChange={() => toggleItemFieldClassification(eventIdx, fieldIdx, itemFieldIdx)}
                                                />
                                              </TableCell>
                                              <TableCell>
                                                <FieldRulesMenu
                                                  type={itf.type}
                                                  classification={itf.classification}
                                                  value={itf}
                                                  onChange={(patch) => updateItemFieldRules(eventIdx, fieldIdx, itemFieldIdx, patch)}
                                                />
                                              </TableCell>
                                            </TableRow>
                                          ))}
                                        </TableBody>
                                      </Table>
                                    </TableCell>
                                  </TableRow>
                                )}
                              </Fragment>
                            );
                          })}
                        </TableBody>
                      </Table>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="excluded" className="space-y-2 pt-4">
          {excludedEvents.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing excluded.</p>
          ) : (
            excludedEvents.map(({ ev, eventIdx }) => {
              const eventKey = `${ev.eventName}-${ev.occurrenceIndex}`;
              return (
                <Card
                  key={eventKey}
                  ref={(el) => {
                    if (el) eventCardRefs.current.set(eventKey, el);
                  }}
                  className="gap-0 p-0"
                >
                  <div className="flex items-center justify-between gap-3 px-4 py-2">
                    <span className="truncate font-mono text-sm">
                      {ev.eventName}{' '}
                      <span className="text-xs text-muted-foreground">
                        occurrence #{ev.occurrenceIndex} · {ev.fields.length} field{ev.fields.length === 1 ? '' : 's'} · not saved
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => toggleEventOmitted(eventIdx, false)}
                      className="shrink-0 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                    >
                      Include event
                    </button>
                  </div>
                </Card>
              );
            })
          )}
        </TabsContent>
      </Tabs>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {multiSaveMode ? (
        <div className="space-y-3">
          {savedFromThisCapture.length > 0 && (
            <div className="rounded-sm border border-status-good/30 bg-status-good/10 p-3 text-sm">
              <p className="mb-1 font-medium text-status-good">Saved from this capture</p>
              <ul className="space-y-0.5">
                {savedFromThisCapture.map((t) => (
                  <li key={t.id}>
                    <a
                      href={scoped ? `/projects/${projectId}/templates/${t.id}` : `/templates/${t.id}`}
                      className="text-primary underline underline-offset-2 hover:text-foreground"
                    >
                      {t.name}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-full max-w-sm space-y-1.5">
              <Label htmlFor="template-batch-name">
                {selectedCount === 0
                  ? 'Check events above, then name this template'
                  : `Name this template (${selectedCount} event${selectedCount === 1 ? '' : 's'} selected)`}
              </Label>
              <Input
                id="template-batch-name"
                placeholder='e.g. "Book a viewing"'
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <Button type="button" onClick={saveOneTemplate} disabled={saving || selectedCount === 0}>
              {saving && <Loader2 className="size-4 animate-spin" />}
              {saving ? 'Saving…' : 'Save as template'}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => router.push(scoped ? `/projects/${projectId}/templates` : '/templates')}
            >
              Done
            </Button>
          </div>
        </div>
      ) : (
        <Button type="button" onClick={saveTemplate} disabled={saving}>
          {saving && <Loader2 className="size-4 animate-spin" />}
          {saving ? 'Saving…' : 'Confirm & Save'}
        </Button>
      )}
    </div>
  );
}

function buildEditableEvents(
  suggested: TemplateDefinition,
  capturedEvents: RawEvent[],
  kind: TemplateKind,
  eventStepIndex?: (number | null)[]
): EditableEvent[] {
  return suggested.events.map((templateEvent, i) => {
    const captured = capturedEvents[i];
    const leaves = flattenToPaths(captured);
    const valueByPath = new Map(leaves.map((l) => [l.path, l.value]));
    return {
      eventName: templateEvent.eventName,
      occurrenceIndex: templateEvent.occurrenceIndex,
      optional: templateEvent.optional ?? false,
      omitted: kind === 'click' && isNoiseEvent(templateEvent.eventName),
      stepIndex: eventStepIndex?.[i] ?? null,
      selectedForSave: false,
      fields: templateEvent.fields.map((rule) => ({
        path: rule.path,
        type: rule.type,
        classification: rule.classification,
        capturedValue: valueByPath.get(rule.path),
        allowEmpty: rule.allowEmpty ?? false,
        expectedCount: rule.expectedCount,
        containsText: rule.containsText,
        included: rule.type !== 'undefined',
      })),
    };
  });
}

/** Formats captured values for display in the review step. */
function formatValue(value: unknown): string {
  if (value === undefined) return 'undefined';
  if (value === null) return 'null';
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

/** Seeds item-field rows from a representative captured array element, same heuristic as top-level fields. */
function buildItemFieldsFromSample(sample: unknown): EditableField[] {
  return flattenToPaths(sample).map((leaf) => {
    const inferred = inferDefaultClassification(leaf.path, leaf.value, leaf.type);
    return {
      path: leaf.path,
      type: leaf.type,
      classification: inferred.classification,
      capturedValue: leaf.value,
      allowEmpty: inferAllowEmpty(leaf.path, leaf.type),
      expectedCount: undefined,
      containsText: undefined,
      included: leaf.type !== 'undefined',
    };
  });
}

/** Trims an EditableField (plus, one level deep, its itemFields) down to the saved TemplateFieldRule shape. */
function trimField(f: EditableField): TemplateFieldRule {
  const base = { path: f.path, classification: f.classification, type: f.type };
  if (f.classification === 'exact') {
    return { ...base, exactValue: f.capturedValue as string | number | boolean | null };
  }
  return {
    ...base,
    allowEmpty: f.allowEmpty,
    ...(f.type === 'array' && f.expectedCount !== undefined ? { expectedCount: f.expectedCount } : {}),
    ...(f.type === 'string' && f.containsText !== undefined ? { containsText: f.containsText } : {}),
    ...(f.type === 'string' && f.matchesPattern !== undefined ? { matchesPattern: f.matchesPattern } : {}),
    ...(f.type === 'string' && f.excludesPattern !== undefined ? { excludesPattern: f.excludesPattern } : {}),
    ...(f.type === 'string' && f.oneOf !== undefined ? { oneOf: f.oneOf } : {}),
    ...(f.type === 'array' && f.itemFields && f.itemFields.some((itf) => itf.included)
      ? { itemFields: f.itemFields.filter((itf) => itf.included).map((itf) => trimField(itf)) }
      : {}),
  };
}
