'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowRight, Loader2 } from 'lucide-react';
import type { InteractionStep, TemplateKind } from '@/lib/types';
import { extractApiErrorMessage } from '@/lib/apiError';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Combobox } from '@/components/ui/combobox';
import { StepsSummary } from './StepsEditor';
import { cn } from '@/lib/utils';

export interface RunFormTemplate {
  id: string;
  name: string;
  sourceUrl: string;
  kind: TemplateKind;
  steps: InteractionStep[];
  /** Set only when the template belongs to a *different* project — shown as a suffix so
   * two same-named templates from different projects stay distinguishable. */
  projectName: string | null;
}

export function RunForm({ projectId, templates }: { projectId: string; templates: RunFormTemplate[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [url, setUrl] = useState(searchParams.get('url') ?? '');
  const [name, setName] = useState('');
  const [kind, setKind] = useState<TemplateKind>('pageload');
  const [templateId1, setTemplateId1] = useState('');
  const [templateId2, setTemplateId2] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const kindTemplates = templates.filter((t) => t.kind === kind);
  const selected1 = templates.find((t) => t.id === templateId1);

  function changeKind(next: TemplateKind) {
    if (next === kind) return;
    setKind(next);
    setTemplateId1('');
    setTemplateId2('');
    setError(null);
  }

  const newTemplateHref = url
    ? `/projects/${projectId}/templates/new?url=${encodeURIComponent(url)}`
    : `/projects/${projectId}/templates/new`;

  const optionFor = (t: RunFormTemplate) => ({
    value: t.id,
    label: t.projectName ? `${t.name}  ·  ${t.projectName}` : t.name,
  });

  async function handleRun(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!templateId1) {
      setError('Pick a template to diff against, or record a new one first.');
      return;
    }
    const templateIds = [templateId1, ...(templateId2 && templateId2 !== templateId1 ? [templateId2] : [])];
    setSubmitting(true);
    try {
      const res = await fetch('/api/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, url, mode: 'diff', templateIds, name: name.trim() || undefined }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(extractApiErrorMessage(body, 'Failed to start run.'));
        setSubmitting(false);
        return;
      }
      router.push(`/runs/${body.id}`);
    } catch {
      setError('Failed to start run — is the server reachable?');
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <CardContent>
        <form onSubmit={handleRun} className="space-y-4">
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

          <div className="space-y-1.5">
            <Label htmlFor="run-name">
              Run name <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="run-name"
              placeholder="Auto-named from the URL path if left blank"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Test type</Label>
            <div className="inline-flex rounded-sm bg-muted p-0.75 text-sm">
              {(['pageload', 'click'] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => changeKind(k)}
                  className={cn(
                    'rounded-sm px-3 py-1 font-medium transition-colors',
                    kind === k ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {k === 'pageload' ? 'Page load' : 'Click'}
                </button>
              ))}
            </div>
          </div>

          {kindTemplates.length === 0 ? (
            <div className="space-y-1.5">
              <Label>Template</Label>
              <p className="text-sm text-muted-foreground">
                No {kind === 'click' ? 'click' : 'page-load'} templates saved yet.{' '}
                <Link
                  href={`${newTemplateHref}${url ? '&' : '?'}kind=${kind}`}
                  className="text-primary underline underline-offset-2"
                >
                  Record one first
                </Link>
                .
              </p>
            </div>
          ) : (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="template">Template</Label>
                <Combobox
                  id="template"
                  options={kindTemplates.map(optionFor)}
                  value={templateId1 || null}
                  onValueChange={(value) => {
                    setTemplateId1(value ?? '');
                    if (value && value === templateId2) setTemplateId2('');
                  }}
                  placeholder="Search templates…"
                  emptyText="No templates match."
                />
              </div>

              {selected1?.kind === 'click' && selected1.steps.length > 0 && (
                <div className="rounded-sm border border-border bg-muted/30 p-3">
                  <p className="mb-1 text-xs font-medium text-muted-foreground">This run will reproduce:</p>
                  <StepsSummary steps={selected1.steps} />
                </div>
              )}

              {templateId1 && (
                <div className="space-y-1.5">
                  <Label htmlFor="template2">
                    Second template <span className="text-muted-foreground">(optional)</span>
                  </Label>
                  <Combobox
                    id="template2"
                    options={kindTemplates.filter((t) => t.id !== templateId1).map(optionFor)}
                    value={templateId2 || null}
                    onValueChange={(value) => setTemplateId2(value ?? '')}
                    placeholder="Compare against a second template too…"
                    emptyText="No templates match."
                  />
                </div>
              )}
            </>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex items-center gap-4 pt-1">
            <Button type="submit" disabled={submitting || kindTemplates.length === 0}>
              {submitting && <Loader2 className="size-4 animate-spin" />}
              {submitting ? 'Starting…' : 'Run'}
              {!submitting && <ArrowRight className="size-4" />}
            </Button>
            <Link
              href={`${newTemplateHref}${url ? '&' : '?'}kind=${kind}`}
              className="text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground"
            >
              Record new template instead
            </Link>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
