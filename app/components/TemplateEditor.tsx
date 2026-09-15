'use client';

import { Fragment, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Play, RefreshCw, Trash2, Save, ChevronRight, MousePointerClick } from 'lucide-react';
import type { TemplateRow } from '@/lib/db/schema';
import type { InteractionStep, TemplateEvent, TemplateFieldRule } from '@/lib/types';
import { sanitizeTemplateEvents } from '@/lib/diff/sanitizeTemplateEvents';
import { StepsEditor, cleanSteps } from './StepsEditor';
import { ClickableScanner } from './ClickableScanner';
import { extractApiErrorMessage } from '@/lib/apiError';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card } from '@/components/ui/card';
import { FieldRulesMenu } from './FieldRulesMenu';
import { Combobox } from '@/components/ui/combobox';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

const UNASSIGNED = '__unassigned__';

export function TemplateEditor({
  template,
  projects,
  backProjectId,
}: {
  template: TemplateRow;
  projects: { id: string; name: string }[];
  /** The project whose route this editor was opened under, for the "back to templates"
   * target. Falls back to the template's own project, then the global list. */
  backProjectId?: string;
}) {
  const router = useRouter();
  const [name, setName] = useState(template.name);
  const [events, setEvents] = useState<TemplateEvent[]>(template.events);
  const [steps, setSteps] = useState<InteractionStep[]>(template.steps ?? []);
  const [projectId, setProjectId] = useState<string | null>(template.projectId);
  const [dirty, setDirty] = useState(false);
  const isClick = template.kind === 'click';
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedItemFields, setExpandedItemFields] = useState<Set<string>>(new Set());
  // Expanded event cards, keyed by `${eventName}-${occurrenceIndex}`. Starts all collapsed.
  const [openEvents, setOpenEvents] = useState<Set<string>>(new Set());

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

  // Return to wherever the editor was opened from: a project's template tab keeps you in
  // that project; the global list sends you back there — regardless of the template's
  // own project.
  const listHref = backProjectId ? `/projects/${backProjectId}/templates` : '/templates';

  async function changeProject(next: string | null) {
    const prev = projectId;
    setProjectId(next);
    setError(null);
    const res = await fetch(`/api/templates/${template.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: next }),
    });
    if (!res.ok) {
      setProjectId(prev);
      const body = await res.json().catch(() => null);
      setError(extractApiErrorMessage(body, 'Failed to change project.'));
      return;
    }
    router.refresh();
  }

  function updateField(eventIdx: number, fieldIdx: number, patch: Partial<TemplateFieldRule>) {
    setEvents((prev) =>
      prev.map((ev, i) =>
        i !== eventIdx ? ev : { ...ev, fields: ev.fields.map((f, j) => (j !== fieldIdx ? f : { ...f, ...patch })) }
      )
    );
    setDirty(true);
  }

  function toggleEventOptional(eventIdx: number, optional: boolean) {
    setEvents((prev) => prev.map((ev, i) => (i !== eventIdx ? ev : { ...ev, optional })));
    setDirty(true);
  }

  function removeEvent(eventIdx: number) {
    setEvents((prev) => prev.filter((_, i) => i !== eventIdx));
    setDirty(true);
  }

  function toggleClassification(eventIdx: number, fieldIdx: number, field: TemplateFieldRule) {
    if (field.classification === 'exact') {
      updateField(eventIdx, fieldIdx, { classification: 'structural', exactValue: undefined });
    } else {
      // No live captured sample here (this is the standalone editor, not a fresh
      // record) — seed a reasonable default and let the human fill in the real value.
      const seed = field.type === 'boolean' ? false : field.type === 'number' ? 0 : field.type === 'null' ? null : '';
      updateField(eventIdx, fieldIdx, { classification: 'exact', exactValue: seed });
    }
  }

  function removeField(eventIdx: number, fieldIdx: number) {
    setEvents((prev) =>
      prev.map((ev, i) => (i !== eventIdx ? ev : { ...ev, fields: ev.fields.filter((_, j) => j !== fieldIdx) }))
    );
    setDirty(true);
  }

  function removeItemField(eventIdx: number, fieldIdx: number, itemFieldIdx: number) {
    setEvents((prev) =>
      prev.map((ev, i) =>
        i !== eventIdx
          ? ev
          : {
              ...ev,
              fields: ev.fields.map((f, j) =>
                j !== fieldIdx || !f.itemFields ? f : { ...f, itemFields: f.itemFields.filter((_, k) => k !== itemFieldIdx) }
              ),
            }
      )
    );
    setDirty(true);
  }

  function toggleItemsExpanded(eventIdx: number, fieldIdx: number) {
    const key = `${eventIdx}:${fieldIdx}`;
    setExpandedItemFields((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function updateItemField(eventIdx: number, fieldIdx: number, itemFieldIdx: number, patch: Partial<TemplateFieldRule>) {
    setEvents((prev) =>
      prev.map((ev, i) =>
        i !== eventIdx
          ? ev
          : {
              ...ev,
              fields: ev.fields.map((f, j) =>
                j !== fieldIdx || !f.itemFields
                  ? f
                  : { ...f, itemFields: f.itemFields.map((itf, k) => (k !== itemFieldIdx ? itf : { ...itf, ...patch })) }
              ),
            }
      )
    );
    setDirty(true);
  }

  function toggleItemFieldClassification(eventIdx: number, fieldIdx: number, itemFieldIdx: number, itemField: TemplateFieldRule) {
    if (itemField.classification === 'exact') {
      updateItemField(eventIdx, fieldIdx, itemFieldIdx, { classification: 'structural', exactValue: undefined });
    } else {
      const seed = itemField.type === 'boolean' ? false : itemField.type === 'number' ? 0 : itemField.type === 'null' ? null : '';
      updateItemField(eventIdx, fieldIdx, itemFieldIdx, { classification: 'exact', exactValue: seed });
    }
  }

  async function save() {
    setError(null);
    if (isClick && cleanSteps(steps).length === 0) {
      setError('A click template needs at least one step.');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/templates/${template.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          events: sanitizeTemplateEvents(events),
          ...(isClick ? { kind: 'click', steps: cleanSteps(steps) } : {}),
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(extractApiErrorMessage(body, 'Failed to save.'));
        setSaving(false);
        return;
      }
      setDirty(false);
      setSaving(false);
      router.refresh();
    } catch {
      setError('Failed to save — is the server reachable?');
      setSaving(false);
    }
  }

  async function deleteTemplate() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/templates/${template.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(extractApiErrorMessage(body, 'Failed to delete template.'));
        setBusy(false);
        return;
      }
      router.push(listHref);
    } catch {
      setError('Failed to delete template — is the server reachable?');
      setBusy(false);
    }
  }

  async function reRecord() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          url: template.sourceUrl,
          mode: 'record',
          kind: template.kind,
          ...(isClick ? { steps: cleanSteps(steps) } : {}),
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(extractApiErrorMessage(body, 'Failed to start re-record.'));
        setBusy(false);
        return;
      }
      const params = new URLSearchParams({
        runId: body.id,
        templateId: template.id,
        name: template.name,
        url: template.sourceUrl,
        kind: template.kind,
        ...(isClick ? { steps: JSON.stringify(cleanSteps(steps)) } : {}),
      });
      const reRecordBase = backProjectId ?? projectId;
      router.push(
        reRecordBase
          ? `/projects/${reRecordBase}/templates/new?${params.toString()}`
          : `/templates/new?${params.toString()}`
      );
    } catch {
      setError('Failed to start re-record — is the server reachable?');
      setBusy(false);
    }
  }

  async function runAgainst() {
    if (!projectId) {
      setError('Assign this template to a project before running a diff.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, url: template.sourceUrl, mode: 'diff', templateId: template.id }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(extractApiErrorMessage(body, 'Failed to start run.'));
        setBusy(false);
        return;
      }
      router.push(`/runs/${body.id}`);
    } catch {
      setError('Failed to start run — is the server reachable?');
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <span
          className={`inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-xs ${
            isClick ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
          }`}
        >
          {isClick && <MousePointerClick className="size-3" />}
          {isClick ? 'click' : 'page load'}
        </span>
        <p className="truncate text-xs text-muted-foreground">{template.sourceUrl}</p>
      </div>

      <div className="flex flex-wrap gap-4">
        <div className="w-full max-w-md space-y-1.5">
          <Label htmlFor="template-name">Template name</Label>
          <Input
            id="template-name"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setDirty(true);
            }}
            placeholder='e.g. "Homepage", "Property Search Results"'
          />
        </div>

        <div className="w-full max-w-xs space-y-1.5">
          <Label htmlFor="template-project">Project</Label>
          <Combobox
            id="template-project"
            options={[
              { value: UNASSIGNED, label: 'Unassigned' },
              ...projects.map((p) => ({ value: p.id, label: p.name })),
            ]}
            value={projectId ?? UNASSIGNED}
            onValueChange={(v) => changeProject(v && v !== UNASSIGNED ? v : null)}
            placeholder="Search projects…"
            emptyText="No projects match."
          />
        </div>
      </div>

      {isClick && (
        <div className="max-w-lg space-y-3">
          <ClickableScanner
            url={template.sourceUrl}
            steps={steps}
            onAdd={(step) => {
              setSteps((prev) =>
                prev.some((s) => s.target.by === step.target.by && s.target.value === step.target.value)
                  ? prev
                  : [...prev, step]
              );
              setDirty(true);
            }}
          />
          <StepsEditor
            value={steps}
            onChange={(next) => {
              setSteps(next);
              setDirty(true);
            }}
          />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" onClick={save} disabled={!dirty || saving}>
          {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          {saving ? 'Saving…' : 'Save changes'}
        </Button>
        <Button type="button" variant="outline" onClick={runAgainst} disabled={busy}>
          <Play className="size-4" />
          Run against source URL
        </Button>
        <Button type="button" variant="outline" onClick={reRecord} disabled={busy}>
          <RefreshCw className="size-4" />
          Re-record from source URL
        </Button>
        <AlertDialog>
          <AlertDialogTrigger
            render={
              <Button type="button" variant="destructive" disabled={busy}>
                <Trash2 className="size-4" />
                Delete
              </Button>
            }
          />
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete &quot;{template.name}&quot;?</AlertDialogTitle>
              <AlertDialogDescription>This can&apos;t be undone. Past runs that used this template keep their history.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={deleteTemplate} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {events.length > 1 && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {events.length} events — {openEvents.size} expanded
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

      <div className="space-y-4">
        {events.map((ev, eventIdx) => {
          const eventKey = `${ev.eventName}-${ev.occurrenceIndex}`;
          const open = openEvents.has(eventKey);
          return (
          <Card key={eventKey} className="gap-0 p-0">
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
                <label className="flex items-center gap-1.5 text-xs font-normal text-muted-foreground">
                  <Checkbox
                    checked={ev.optional ?? false}
                    onCheckedChange={(checked) => toggleEventOptional(eventIdx, checked === true)}
                    aria-label={`Mark ${ev.eventName} as optional`}
                  />
                  Optional (don&apos;t flag if this event doesn&apos;t fire)
                </label>
                <button
                  type="button"
                  onClick={() => removeEvent(eventIdx)}
                  className="text-muted-foreground hover:text-destructive"
                  aria-label={`Remove ${ev.eventName} from this template`}
                  title="Remove this event from the template"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            </div>
            {open && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Field</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Exact match?</TableHead>
                  <TableHead>Expected value</TableHead>
                  <TableHead>Rules</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {ev.fields.map((f, fieldIdx) => {
                  // Can use exact match unless the field is an array or object (those are structural only)
                  const canBeExact = f.type !== 'array' && f.type !== 'object';
                  const hasItemFields = f.type === 'array' && (f.itemFields?.length ?? 0) > 0;
                  const expandKey = `${eventIdx}:${fieldIdx}`;
                  const expanded = hasItemFields && expandedItemFields.has(expandKey);
                  return (
                    <Fragment key={f.path}>
                      <TableRow>
                        <TableCell className="whitespace-normal break-all font-mono">
                          {f.type === 'array' &&
                            (hasItemFields ? (
                              <button
                                type="button"
                                onClick={() => toggleItemsExpanded(eventIdx, fieldIdx)}
                                className="mr-1 inline-flex align-middle text-muted-foreground hover:text-foreground"
                                aria-label="Toggle item field rules"
                              >
                                <ChevronRight className={`size-3.5 transition-transform ${expanded ? 'rotate-90' : ''}`} />
                              </button>
                            ) : null)}
                          {f.path}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{f.type}</TableCell>
                        <TableCell>
                          <Checkbox
                            checked={f.classification === 'exact'}
                            disabled={!canBeExact}
                            onCheckedChange={() => toggleClassification(eventIdx, fieldIdx, f)}
                          />
                        </TableCell>
                        <TableCell>
                          {f.classification === 'exact' ? (
                            // For undefined/null, there's only one exact value (implicit), so no input needed
                            f.type === 'undefined' || f.type === 'null' ? (
                              <span className="text-xs text-muted-foreground italic">{f.type}</span>
                            ) : (
                              <ExactValueInput field={f} onChange={(exactValue) => updateField(eventIdx, fieldIdx, { exactValue })} />
                            )
                          ) : (
                            <span className="text-xs text-muted-foreground">{describeStructuralRule(f)}</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <FieldRulesMenu
                              type={f.type}
                              classification={f.classification}
                              value={f}
                              onChange={(patch) => updateField(eventIdx, fieldIdx, patch)}
                            />
                            {f.type === 'array' && !hasItemFields && (
                              <span className="text-xs text-muted-foreground italic">re-record for item rules</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            className="text-muted-foreground hover:text-destructive"
                            onClick={() => removeField(eventIdx, fieldIdx)}
                            aria-label={`Remove ${f.path} from this template`}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                      {expanded && (
                        <TableRow>
                          <TableCell colSpan={6} className="bg-muted/30 p-3">
                            <p className="mb-2 text-xs text-muted-foreground">
                              Rules for every item in <span className="font-mono">{f.path}</span>.
                            </p>
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>Field</TableHead>
                                  <TableHead>Type</TableHead>
                                  <TableHead>Exact match?</TableHead>
                                  <TableHead>Expected value</TableHead>
                                  <TableHead>Rules</TableHead>
                                  <TableHead />
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {(f.itemFields ?? []).map((itf, itemFieldIdx) => {
                                  const itemCanBeExact = itf.type !== 'array' && itf.type !== 'object' && itf.type !== 'undefined';
                                  return (
                                    <TableRow key={itf.path}>
                                      <TableCell className="whitespace-normal break-all font-mono">{itf.path}</TableCell>
                                      <TableCell className="text-xs text-muted-foreground">{itf.type}</TableCell>
                                      <TableCell>
                                        <Checkbox
                                          checked={itf.classification === 'exact'}
                                          disabled={!itemCanBeExact}
                                          onCheckedChange={() => toggleItemFieldClassification(eventIdx, fieldIdx, itemFieldIdx, itf)}
                                        />
                                      </TableCell>
                                      <TableCell>
                                        {itf.classification === 'exact' ? (
                                          <ExactValueInput
                                            field={itf}
                                            onChange={(exactValue) => updateItemField(eventIdx, fieldIdx, itemFieldIdx, { exactValue })}
                                          />
                                        ) : (
                                          <span className="text-xs text-muted-foreground">{describeStructuralRule(itf)}</span>
                                        )}
                                      </TableCell>
                                      <TableCell>
                                        <FieldRulesMenu
                                          type={itf.type}
                                          classification={itf.classification}
                                          value={itf}
                                          onChange={(patch) => updateItemField(eventIdx, fieldIdx, itemFieldIdx, patch)}
                                        />
                                      </TableCell>
                                      <TableCell>
                                        <Button
                                          type="button"
                                          variant="ghost"
                                          size="icon-xs"
                                          className="text-muted-foreground hover:text-destructive"
                                          onClick={() => removeItemField(eventIdx, fieldIdx, itemFieldIdx)}
                                          aria-label={`Remove ${itf.path} from this template`}
                                        >
                                          <Trash2 className="size-3.5" />
                                        </Button>
                                      </TableCell>
                                    </TableRow>
                                  );
                                })}
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
    </div>
  );
}

/** Plain-English summary of a structural rule, shown in the "Expected value" column. */
function describeStructuralRule(f: TemplateFieldRule): string {
  if (f.type === 'undefined') {
    const parts: string[] = [];
    if (f.allowNull) parts.push('may be null');
    if (f.containsText !== undefined) parts.push(`contains "${f.containsText}"`);
    if (f.matchesPattern !== undefined) parts.push(`matches /${f.matchesPattern}/`);
    if (f.excludesPattern !== undefined) parts.push(`excludes /${f.excludesPattern}/`);
    if (f.oneOf !== undefined && f.oneOf.length > 0) parts.push(`one of ${f.oneOf.join(', ')}`);
    if (f.allowEmpty) parts.push('may be empty');
    return parts.length === 0 ? '(present, value is undefined)' : `(usually undefined, or a string — ${parts.join(', ')})`;
  }
  const parts = [`any ${f.type}`];
  if (f.allowEmpty) parts.push('may be empty');
  if (f.allowUndefined) parts.push('may be undefined');
  if (f.allowNull) parts.push('may be null');
  if (!f.allowEmpty && !f.allowUndefined && !f.allowNull) parts.push('non-empty');
  return `(${parts.join(', ')})`;
}

function ExactValueInput({ field, onChange }: { field: TemplateFieldRule; onChange: (value: string | number | boolean | null) => void }) {
  if (field.type === 'boolean') {
    return (
      <Select value={String(field.exactValue ?? false)} onValueChange={(value) => onChange(value === 'true')}>
        <SelectTrigger size="sm" className="w-24">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="true">true</SelectItem>
          <SelectItem value="false">false</SelectItem>
        </SelectContent>
      </Select>
    );
  }
  if (field.type === 'null') {
    return <span className="text-xs text-muted-foreground">null</span>;
  }
  return (
    <Input
      type={field.type === 'number' ? 'number' : 'text'}
      value={field.exactValue === null || field.exactValue === undefined ? '' : String(field.exactValue)}
      onChange={(e) => onChange(field.type === 'number' ? Number(e.target.value) : e.target.value)}
      className="h-7 w-full max-w-[16rem] font-mono text-xs"
    />
  );
}
