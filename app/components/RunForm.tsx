'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowRight, Loader2 } from 'lucide-react';
import type { TemplateRow } from '@/lib/db/schema';
import { extractApiErrorMessage } from '@/lib/apiError';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export function RunForm({ templates }: { templates: Pick<TemplateRow, 'id' | 'name' | 'sourceUrl'>[] }) {
  const router = useRouter();
  const [url, setUrl] = useState('');
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRun(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!templateId) {
      setError('Pick a template to diff against, or record a new one first.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, mode: 'diff', templateId }),
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
            <Label htmlFor="template">Template</Label>
            {templates.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No templates saved yet.{' '}
                <Link href="/templates/new" className="text-primary underline underline-offset-2">
                  Record one first
                </Link>
                .
              </p>
            ) : (
              <Select value={templateId} onValueChange={(value) => setTemplateId(value ?? '')}>
                <SelectTrigger id="template" className="w-full">
                  <SelectValue placeholder="Choose a template">
                    {(value: string | null) => templates.find((t) => t.id === value)?.name ?? 'Choose a template'}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {templates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex items-center gap-4 pt-1">
            <Button type="submit" disabled={submitting || templates.length === 0}>
              {submitting && <Loader2 className="size-4 animate-spin" />}
              {submitting ? 'Starting…' : 'Run'}
              {!submitting && <ArrowRight className="size-4" />}
            </Button>
            <Link
              href={url ? `/templates/new?url=${encodeURIComponent(url)}` : '/templates/new'}
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
