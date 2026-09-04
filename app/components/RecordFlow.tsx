'use client';

import { Fragment, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2, ArrowRight, Radio, ChevronRight } from 'lucide-react';
import type { DiffResult, FieldClassification, LeafType, RawEvent, TemplateDefinition, TemplateFieldRule } from '@/lib/types';
import type { RunRow } from '@/lib/db/schema';
import { flattenToPaths } from '@/lib/diff/flatten';
import { inferDefaultClassification, inferAllowEmpty } from '@/lib/diff/classify';
import { sanitizeTemplateEvents } from '@/lib/diff/sanitizeTemplateEvents';
import { extractApiErrorMessage } from '@/lib/apiError';
import { getCategoryByValue } from '@/lib/eventCategories';
import type { ClickableElement } from '@/lib/capture/discoverClickables';
import type { FormTarget } from '@/lib/capture/drivers/form';
import { StatusBadge } from './StatusBadge';
import { ClickableElementPicker } from './ClickableElementPicker';
import { FormPicker } from './FormPicker';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { FieldRulesMenu, type FieldRulesValue } from './FieldRulesMenu';

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
  fields: EditableField[];
}

const POLL_INTERVAL_MS = 1500;
// Comfortably above the server-side DISCOVER_NAV_TIMEOUT_MS (10s in
// app/api/discover-elements/route.ts) plus round-trip — this call also has to wait
// behind any in-flight captures on the shared 2-slot queue, so it's the one fetch in
// this component that gets an explicit client-side timeout.
const DISCOVER_TIMEOUT_MS = 15_000;

export function RecordFlow({ category }: { category: string }) {
  const router = useRouter();
  const categorySlug = getCategoryByValue(category)!.slug;
  const isClickCategory = category === 'click';
  const isFormCategory = category === 'form';
  const searchParams = useSearchParams();
  const prefillUrl = searchParams.get('url') ?? '';
  const resumeRunId = searchParams.get('runId');
  // Set when re-recording an existing template: save() updates it in place (PATCH)
  // instead of creating a new one.
  const existingTemplateId = searchParams.get('templateId');
  const prefillName = searchParams.get('name') ?? '';

  const [step, setStep] = useState<'setup' | 'picking' | 'capturing' | 'review'>(resumeRunId ? 'capturing' : 'setup');
  const [name, setName] = useState(prefillName);
  const [url, setUrl] = useState(prefillUrl);
  const [runId, setRunId] = useState<string | null>(resumeRunId);
  const [run, setRun] = useState<RunRow | null>(null);
  const [events, setEvents] = useState<EditableEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [startingCapture, setStartingCapture] = useState(false);
  const [saving, setSaving] = useState(false);
  const [discovering, setDiscovering] = useState(false);
  const [clickElements, setClickElements] = useState<ClickableElement[]>([]);
  const [selectedElement, setSelectedElement] = useState<ClickableElement | null>(null);
  const [formTargets, setFormTargets] = useState<FormTarget[]>([]);
  const [selectedForm, setSelectedForm] = useState<FormTarget | null>(null);
  // Defaults closed — see the doc comment on FormTarget.allowSubmit in
  // lib/capture/drivers/form.ts. Only a human ticking this box, right here, authorizes
  // sending a real submission; nothing upstream can set it on the caller's behalf.
  const [allowSubmit, setAllowSubmit] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
        setEvents(buildEditableEvents(body.suggestedTemplate, body.run.capturedEvents ?? []));
        setStep('review');
      }
    }

    poll();
    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [runId, step]);

  function handleSetupSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isClickCategory) {
      void discoverElements();
    } else if (isFormCategory) {
      void discoverForms();
    } else {
      void startCapture();
    }
  }

  async function discoverElements() {
    setError(null);
    setDiscovering(true);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DISCOVER_TIMEOUT_MS);
    try {
      const res = await fetch('/api/discover-elements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
        signal: controller.signal,
      });
      const body = await res.json();
      if (!res.ok) {
        setError(extractApiErrorMessage(body, 'Failed to load the page.'));
        return;
      }
      setClickElements(body.elements ?? []);
      setSelectedElement(null);
      setStep('picking');
    } catch (err) {
      setError(
        err instanceof DOMException && err.name === 'AbortError'
          ? 'Taking too long to load that page — try again.'
          : 'Failed to load the page — is the server reachable?'
      );
    } finally {
      clearTimeout(timeout);
      setDiscovering(false);
    }
  }

  async function discoverForms() {
    setError(null);
    setDiscovering(true);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DISCOVER_TIMEOUT_MS);
    try {
      const res = await fetch('/api/discover-forms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
        signal: controller.signal,
      });
      const body = await res.json();
      if (!res.ok) {
        setError(extractApiErrorMessage(body, 'Failed to load the page.'));
        return;
      }
      setFormTargets(body.forms ?? []);
      setSelectedForm(null);
      setAllowSubmit(false);
      setStep('picking');
    } catch (err) {
      setError(
        err instanceof DOMException && err.name === 'AbortError'
          ? 'Taking too long to load that page — try again.'
          : 'Failed to load the page — is the server reachable?'
      );
    } finally {
      clearTimeout(timeout);
      setDiscovering(false);
    }
  }

  async function startCapture() {
    setError(null);
    setStartingCapture(true);
    try {
      const res = await fetch('/api/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url,
          mode: 'record',
          ...(selectedElement ? { clickSelector: selectedElement.selector } : {}),
          ...(selectedForm ? { formSelector: selectedForm.selector, formAllowSubmit: allowSubmit } : {}),
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
    setSaving(true);
    const templateEvents = sanitizeTemplateEvents(
      events.map((ev) => ({
        eventName: ev.eventName,
        occurrenceIndex: ev.occurrenceIndex,
        fields: ev.fields.filter((f) => f.included).map((f) => trimField(f)),
      }))
    );

    try {
      const res = existingTemplateId
        ? await fetch(`/api/templates/${existingTemplateId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: name.trim(), events: templateEvents }),
          })
        : await fetch('/api/templates', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: name.trim(),
              sourceUrl: url,
              category,
              ...(selectedElement
                ? {
                    clickSelector: selectedElement.selector,
                    clickLabel: selectedElement.label,
                    ...(selectedElement.href ? { clickHref: selectedElement.href } : {}),
                  }
                : {}),
              events: templateEvents,
            }),
          });
      const body = await res.json();
      if (!res.ok) {
        setError(extractApiErrorMessage(body, 'Failed to save template.'));
        setSaving(false);
        return;
      }
      router.push(`/${categorySlug}/templates/${existingTemplateId ?? body.id}`);
    } catch {
      setError('Failed to save template — is the server reachable?');
      setSaving(false);
    }
  }

  const usesDiscovery = isClickCategory || isFormCategory;
  const setupBusy = usesDiscovery ? discovering : startingCapture;

  if (step === 'setup') {
    return (
      <div className="max-w-lg space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">Record a new template</h1>
        <p className="text-sm text-muted-foreground">
          {isClickCategory ? (
            <>
              Enter the URL of a known-good (&quot;golden&quot;) page. We&apos;ll load it and list its clickable
              elements so you can pick which one to test.
            </>
          ) : isFormCategory ? (
            <>
              Enter the URL of a known-good (&quot;golden&quot;) page. We&apos;ll load it and list its forms so you
              can pick which one to fill and capture.
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
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" disabled={setupBusy}>
                {setupBusy && <Loader2 className="size-4 animate-spin" />}
                {isClickCategory
                  ? discovering
                    ? 'Loading page…'
                    : 'Find clickable elements'
                  : isFormCategory
                    ? discovering
                      ? 'Loading page…'
                      : 'Find forms'
                    : startingCapture
                      ? 'Starting…'
                      : 'Capture'}
                {!setupBusy && <ArrowRight className="size-4" />}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (step === 'picking' && isFormCategory) {
    return (
      <div className="max-w-2xl space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">Pick a form to fill</h1>
        <p className="text-sm text-muted-foreground">
          Found on <span className="break-all font-mono">{url}</span>. Pick the form you want to test — we&apos;ll
          fill every field and capture whatever it pushes to{' '}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">dataLayer</code>.
        </p>
        <FormPicker forms={formTargets} selectedSelector={selectedForm?.selector ?? null} onSelect={setSelectedForm} />
        {selectedForm?.submitSelector && (
          <label className="flex items-start gap-2 rounded-md bg-status-warning/10 px-3 py-2.5 text-sm ring-1 ring-status-warning/25">
            <Checkbox checked={allowSubmit} onCheckedChange={(checked) => setAllowSubmit(checked === true)} className="mt-0.5" />
            <span>
              <span className="font-medium text-amber-700 dark:text-status-warning">
                Also submit this form — sends a real request to the target site.
              </span>
              <span className="block text-xs text-muted-foreground">
                Only enable this for a site you control (e.g. staging). Leave it off to fill the form and capture
                without submitting.
              </span>
            </span>
          </label>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex items-center gap-3">
          <Button type="button" onClick={startCapture} disabled={!selectedForm || startingCapture}>
            {startingCapture && <Loader2 className="size-4 animate-spin" />}
            {startingCapture ? 'Starting…' : 'Continue'}
            {!startingCapture && <ArrowRight className="size-4" />}
          </Button>
          <Button type="button" variant="outline" onClick={() => setStep('setup')} disabled={startingCapture}>
            Back
          </Button>
        </div>
      </div>
    );
  }

  if (step === 'picking') {
    return (
      <div className="max-w-2xl space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">Pick what to click</h1>
        <p className="text-sm text-muted-foreground">
          Found on <span className="break-all font-mono">{url}</span>. Pick the element you want to test — we&apos;ll
          click it and capture whatever it pushes to <code className="rounded bg-muted px-1 py-0.5 text-xs">dataLayer</code>.
        </p>
        <ClickableElementPicker elements={clickElements} selectedSelector={selectedElement?.selector ?? null} onSelect={setSelectedElement} />
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex items-center gap-3">
          <Button type="button" onClick={startCapture} disabled={!selectedElement || startingCapture}>
            {startingCapture && <Loader2 className="size-4 animate-spin" />}
            {startingCapture ? 'Starting…' : 'Continue'}
            {!startingCapture && <ArrowRight className="size-4" />}
          </Button>
          <Button type="button" variant="outline" onClick={() => setStep('setup')} disabled={startingCapture}>
            Back
          </Button>
        </div>
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
            {selectedElement
              ? `Clicking "${selectedElement.label}" and waiting for dataLayer pushes to settle. This can take up to ~30 seconds.`
              : 'Visiting the page and waiting for dataLayer pushes to settle. This can take up to ~30 seconds.'}
          </CardContent>
        </Card>
        {error && (
          <div className="rounded-md bg-status-critical/10 px-4 py-3 text-sm text-status-critical ring-1 ring-status-critical/20">
            {error}
          </div>
        )}
      </div>
    );
  }

  // step === 'review'
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Review capture</h1>
        {selectedElement && (
          <p className="mt-1 text-sm text-muted-foreground">
            Captured after clicking <strong className="text-foreground">{selectedElement.label}</strong>.
          </p>
        )}
        <p className="mt-1 text-sm text-muted-foreground">
          Captured {events.length} event{events.length === 1 ? '' : 's'} from <span className="break-all font-mono">{url}</span>.
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

      <div className="max-w-sm space-y-1.5">
        <Label htmlFor="name">Template name</Label>
        <Input
          id="name"
          required
          placeholder='e.g. "Homepage", "Property Search Results"'
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      <div className="space-y-4">
        {events.map((ev, eventIdx) => (
          <Card key={`${ev.eventName}-${ev.occurrenceIndex}`} className="gap-0 p-0">
            <div className="border-b border-border bg-muted/50 px-4 py-2 font-mono text-sm">
              {ev.eventName} <span className="text-xs text-muted-foreground">occurrence #{ev.occurrenceIndex}</span>
            </div>
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
                              Rules for every item in <span className="font-mono">{f.path}</span> — seeded from the first captured
                              item, applied to all {items.length}.
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
                                      {itf.type === 'undefined' ? <span className="italic">undefined</span> : formatValue(itf.capturedValue)}
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
          </Card>
        ))}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button type="button" onClick={saveTemplate} disabled={saving}>
        {saving && <Loader2 className="size-4 animate-spin" />}
        {saving ? 'Saving…' : 'Confirm & Save'}
      </Button>
    </div>
  );
}

function buildEditableEvents(suggested: TemplateDefinition, capturedEvents: RawEvent[]): EditableEvent[] {
  return suggested.events.map((templateEvent, i) => {
    const captured = capturedEvents[i];
    const leaves = flattenToPaths(captured);
    const valueByPath = new Map(leaves.map((l) => [l.path, l.value]));
    return {
      eventName: templateEvent.eventName,
      occurrenceIndex: templateEvent.occurrenceIndex,
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

/** `f.type === 'undefined'` fields get their own literal "undefined" label from the
 * caller — this only needs to tell "no value captured for this row" (a plain '—') apart
 * from an actual empty string or other falsy-but-real value. */
function formatValue(value: unknown): string {
  if (value === undefined) return '—';
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
