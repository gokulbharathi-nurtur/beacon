'use client';

import { Fragment, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Play, RefreshCw, Trash2, Save, ChevronRight } from 'lucide-react';
import type { TemplateRow } from '@/lib/db/schema';
import type { TemplateEvent, TemplateFieldRule } from '@/lib/types';
import { sanitizeTemplateEvents } from '@/lib/diff/sanitizeTemplateEvents';
import { extractApiErrorMessage } from '@/lib/apiError';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card } from '@/components/ui/card';
import { FieldRulesMenu } from './FieldRulesMenu';
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

export function TemplateEditor({ template }: { template: TemplateRow }) {
  const router = useRouter();
  const [name, setName] = useState(template.name);
  const [events, setEvents] = useState<TemplateEvent[]>(template.events);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedItemFields, setExpandedItemFields] = useState<Set<string>>(new Set());

  function updateField(eventIdx: number, fieldIdx: number, patch: Partial<TemplateFieldRule>) {
    setEvents((prev) =>
      prev.map((ev, i) =>
        i !== eventIdx ? ev : { ...ev, fields: ev.fields.map((f, j) => (j !== fieldIdx ? f : { ...f, ...patch })) }
      )
    );
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
    setSaving(true);
    try {
      const res = await fetch(`/api/templates/${template.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), events: sanitizeTemplateEvents(events) }),
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
      router.push('/load-events/templates');
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
        body: JSON.stringify({ url: template.sourceUrl, mode: 'record' }),
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
      });
      router.push(`/load-events/templates/new?${params.toString()}`);
    } catch {
      setError('Failed to start re-record — is the server reachable?');
      setBusy(false);
    }
  }

  async function runAgainst() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: template.sourceUrl, mode: 'diff', templateId: template.id }),
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
      <div>
        <Input
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setDirty(true);
          }}
          className="h-auto max-w-md border-transparent bg-transparent px-0 text-2xl font-semibold tracking-tight shadow-none focus-visible:border-input focus-visible:bg-background focus-visible:px-2.5"
        />
        <p className="mt-1 truncate text-xs text-muted-foreground">{template.sourceUrl}</p>
      </div>

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

      <div className="space-y-4">
        {events.map((ev, eventIdx) => (
          <Card key={`${ev.eventName}-${ev.occurrenceIndex}`} className="gap-0 p-0">
            <div className="border-b border-border bg-muted/50 px-4 py-2 font-mono text-sm">
              {ev.eventName} <span className="text-xs text-muted-foreground">occurrence #{ev.occurrenceIndex}</span>
            </div>
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
                  const canBeExact = f.type !== 'array' && f.type !== 'object' && f.type !== 'undefined';
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
                            <ExactValueInput field={f} onChange={(exactValue) => updateField(eventIdx, fieldIdx, { exactValue })} />
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              {f.type === 'undefined'
                                ? '(present, value is undefined)'
                                : `(any ${f.type}, ${f.allowEmpty ? 'may be empty' : 'non-empty'})`}
                            </span>
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
                                          <span className="text-xs text-muted-foreground">
                                            {itf.type === 'undefined'
                                              ? '(present, value is undefined)'
                                              : `(any ${itf.type}, ${itf.allowEmpty ? 'may be empty' : 'non-empty'})`}
                                          </span>
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
          </Card>
        ))}
      </div>
    </div>
  );
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
