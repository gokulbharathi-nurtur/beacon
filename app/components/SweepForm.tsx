'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Loader2 } from 'lucide-react';
import { extractApiErrorMessage } from '@/lib/apiError';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function SweepForm() {
  const router = useRouter();
  const [baseUrl, setBaseUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch('/api/sweeps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ baseUrl }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(extractApiErrorMessage(body, 'Failed to start sweep.'));
        setSubmitting(false);
        return;
      }
      router.push(`/coverage/${body.id}`);
    } catch {
      setError('Failed to start sweep — is the server reachable?');
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="sweep-base-url">Site URL</Label>
            <Input
              id="sweep-base-url"
              type="url"
              required
              placeholder="https://www.example.com/"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button type="submit" disabled={submitting}>
            {submitting && <Loader2 className="size-4 animate-spin" />}
            {submitting ? 'Starting…' : 'Sweep'}
            {!submitting && <ArrowRight className="size-4" />}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
