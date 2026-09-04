'use client';

import { useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { extractApiErrorMessage } from '@/lib/apiError';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function ExtractUrlsForm() {
  const [baseUrl, setBaseUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ urlCount: number; patternCount: number; source: string } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/extract-urls?baseUrl=${encodeURIComponent(baseUrl)}`);
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(extractApiErrorMessage(body, 'Failed to extract URLs.'));
        setSubmitting(false);
        return;
      }

      const urlCount = Number(res.headers.get('X-Url-Count') ?? '0');
      const patternCount = Number(res.headers.get('X-Pattern-Count') ?? '0');
      const source = res.headers.get('X-Url-Source') ?? 'unknown';
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = 'page-urls.xlsx';
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);

      setResult({ urlCount, patternCount, source });
    } catch {
      setError('Failed to extract URLs — is the server reachable?');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="extract-urls-base">Site URL</Label>
            <Input
              id="extract-urls-base"
              type="url"
              required
              placeholder="https://www.example.com/"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
          {result && (
            <p className="text-sm text-status-good">
              Downloaded {result.patternCount} page type{result.patternCount === 1 ? '' : 's'} — {result.urlCount}{' '}
              URL{result.urlCount === 1 ? '' : 's'} discovered via {result.source}.
            </p>
          )}

          <Button type="submit" disabled={submitting}>
            {submitting && <Loader2 className="size-4 animate-spin" />}
            {submitting ? 'Crawling…' : 'Extract URLs'}
            {!submitting && <Download className="size-4" />}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
