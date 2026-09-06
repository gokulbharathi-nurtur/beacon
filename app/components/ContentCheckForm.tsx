'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Loader2 } from 'lucide-react';
import { extractApiErrorMessage } from '@/lib/apiError';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export function ContentCheckForm({ maps }: { maps: { id: string; name: string }[] }) {
  const router = useRouter();
  const [mode, setMode] = useState<'site' | 'page'>('site');
  const [baseUrl, setBaseUrl] = useState('');
  const [contentMapId, setContentMapId] = useState(maps[0]?.id ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!contentMapId) {
      setError('Upload a reference table first.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/content-checks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ baseUrl, contentMapId, mode }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(extractApiErrorMessage(body, 'Failed to start content check.'));
        setSubmitting(false);
        return;
      }
      router.push(`/load-events/content-check/${body.id}`);
    } catch {
      setError('Failed to start content check — is the server reachable?');
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Run a check</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {mode === 'site'
                ? 'Crawls the site, groups discovered pages by which reference row matches them, and compares a sample of each against the expected content_group/content_id/content_type.'
                : 'Checks just this one page against whichever reference row matches its URL, expected values pulled from the same uploaded table.'}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="content-check-scope">Scope</Label>
            <Select value={mode} onValueChange={(value) => setMode((value as 'site' | 'page') ?? 'site')}>
              <SelectTrigger id="content-check-scope" className="w-full">
                <SelectValue placeholder="Whole site">
                  {(value: string | null) => (value === 'page' ? 'This page only' : 'Whole site')}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="site">Whole site</SelectItem>
                <SelectItem value="page">This page only</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="content-check-map">Reference table</Label>
            {maps.length === 0 ? (
              <p className="text-sm text-muted-foreground">Upload a reference table first.</p>
            ) : (
              <Select value={contentMapId} onValueChange={(value) => setContentMapId(value ?? '')}>
                <SelectTrigger id="content-check-map" className="w-full">
                  <SelectValue placeholder="Choose a reference table">
                    {(value: string | null) => maps.find((m) => m.id === value)?.name ?? 'Choose a reference table'}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {maps.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="content-check-url">{mode === 'site' ? 'Site URL' : 'Page URL'}</Label>
            <Input
              id="content-check-url"
              type="url"
              required
              placeholder={mode === 'site' ? 'https://www.example.com/' : 'https://www.example.com/some-page/'}
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button type="submit" disabled={submitting || maps.length === 0}>
            {submitting && <Loader2 className="size-4 animate-spin" />}
            {submitting ? 'Starting…' : 'Check'}
            {!submitting && <ArrowRight className="size-4" />}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
