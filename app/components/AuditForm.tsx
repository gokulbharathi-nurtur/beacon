'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Loader2 } from 'lucide-react';
import { extractApiErrorMessage } from '@/lib/apiError';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function AuditForm() {
  const router = useRouter();
  const [url, setUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch('/api/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, mode: 'audit' }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(extractApiErrorMessage(body, 'Failed to start audit.'));
        setSubmitting(false);
        return;
      }
      router.push(`/runs/${body.id}`);
    } catch {
      setError('Failed to start audit — is the server reachable?');
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="audit-url">Page URL</Label>
            <Input
              id="audit-url"
              type="url"
              required
              placeholder="https://www.example.com/some-page/"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button type="submit" disabled={submitting}>
            {submitting && <Loader2 className="size-4 animate-spin" />}
            {submitting ? 'Starting…' : 'Audit'}
            {!submitting && <ArrowRight className="size-4" />}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
