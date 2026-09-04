'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Upload } from 'lucide-react';
import { extractApiErrorMessage } from '@/lib/apiError';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function ContentMapUpload() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    if (!file) {
      setError('Choose a .csv or .xlsx file first.');
      return;
    }
    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.set('file', file);
      if (name.trim()) formData.set('name', name.trim());

      const res = await fetch('/api/content-maps', { method: 'POST', body: formData });
      const body = await res.json();
      if (!res.ok) {
        setError(extractApiErrorMessage(body, 'Failed to upload reference table.'));
        setSubmitting(false);
        return;
      }
      setSuccess(`Uploaded — ${body.ruleCount} row${body.ruleCount === 1 ? '' : 's'} parsed.`);
      setName('');
      setFile(null);
      // Reruns the server component that lists content maps, so the new one shows up in
      // ContentCheckForm's select immediately without a full page reload.
      router.refresh();
    } catch {
      setError('Failed to upload — is the server reachable?');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Upload reference table</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              A .csv or .xlsx with a &quot;pages&quot; column (one or more URL patterns per row, one per line)
              and any of &quot;content_group&quot;, &quot;content_id&quot;, &quot;content_type&quot; — the values
              the page_loaded event&apos;s <code className="font-mono">page</code> object should carry there.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="content-map-name">Name (optional)</Label>
            <Input
              id="content-map-name"
              placeholder="e.g. Residential site map"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="content-map-file">File</Label>
            <Input
              id="content-map-file"
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
          {success && <p className="text-sm text-status-good">{success}</p>}

          <Button type="submit" disabled={submitting}>
            {submitting && <Loader2 className="size-4 animate-spin" />}
            {submitting ? 'Uploading…' : 'Upload'}
            {!submitting && <Upload className="size-4" />}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
