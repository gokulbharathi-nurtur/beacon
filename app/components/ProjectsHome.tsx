'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Loader2, Plus, Search } from 'lucide-react';
import { extractApiErrorMessage } from '@/lib/apiError';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type MatchResponse = { project: { id: string; name: string } | null; hostname: string | null };

export function ProjectsHome() {
  const router = useRouter();

  // Quick-run box
  const [quickUrl, setQuickUrl] = useState('');
  const [matching, setMatching] = useState(false);
  const [match, setMatch] = useState<MatchResponse | null>(null);

  // New-project form
  const [showNew, setShowNew] = useState(false);
  const [name, setName] = useState('');
  const [hostnames, setHostnames] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runMatch(e: React.FormEvent) {
    e.preventDefault();
    if (!quickUrl.trim()) return;
    setMatching(true);
    setMatch(null);
    try {
      const res = await fetch(`/api/projects/match?url=${encodeURIComponent(quickUrl.trim())}`);
      const body: MatchResponse = await res.json();
      if (body.project) {
        router.push(`/projects/${body.project.id}?url=${encodeURIComponent(quickUrl.trim())}`);
        return;
      }
      setMatch(body);
      // Pre-fill the new-project form with the unmatched hostname.
      if (body.hostname) {
        setShowNew(true);
        setName((n) => n || body.hostname!);
        setHostnames((h) => h || body.hostname!);
      }
    } catch {
      setError('Lookup failed — is the server reachable?');
    } finally {
      setMatching(false);
    }
  }

  async function createProject(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const list = hostnames
      .split(/[\s,]+/)
      .map((h) => h.trim())
      .filter(Boolean);
    if (!name.trim() || list.length === 0) {
      setError('A name and at least one hostname are required.');
      return;
    }
    setCreating(true);
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), hostnames: list }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(extractApiErrorMessage(body, 'Failed to create project.'));
        setCreating(false);
        return;
      }
      const dest = quickUrl.trim()
        ? `/projects/${body.id}?url=${encodeURIComponent(quickUrl.trim())}`
        : `/projects/${body.id}`;
      router.push(dest);
    } catch {
      setError('Failed to create project — is the server reachable?');
      setCreating(false);
    }
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardContent>
          <form onSubmit={runMatch} className="space-y-3">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Quick run</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Paste any page URL — we&apos;ll take you to its project (matched by hostname).
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="quick-url">Page URL</Label>
              <Input
                id="quick-url"
                type="url"
                placeholder="https://www.example.com/some-page/"
                value={quickUrl}
                onChange={(e) => setQuickUrl(e.target.value)}
              />
            </div>
            {match && !match.project && (
              <p className="text-xs text-muted-foreground">
                No project owns <span className="font-mono text-foreground">{match.hostname}</span> yet — create one
                below.
              </p>
            )}
            <Button type="submit" disabled={matching || !quickUrl.trim()}>
              {matching ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
              {matching ? 'Looking up…' : 'Go'}
              {!matching && <ArrowRight className="size-4" />}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          {!showNew ? (
            <button
              type="button"
              onClick={() => setShowNew(true)}
              className="flex w-full items-center justify-center gap-2 py-6 text-sm text-muted-foreground hover:text-foreground"
            >
              <Plus className="size-4" />
              New project
            </button>
          ) : (
            <form onSubmit={createProject} className="space-y-3">
              <h3 className="text-sm font-semibold text-foreground">New project</h3>
              <div className="space-y-1.5">
                <Label htmlFor="project-name">Name</Label>
                <Input
                  id="project-name"
                  placeholder="Linley &amp; Simpson"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="project-hostnames">Hostnames</Label>
                <Input
                  id="project-hostnames"
                  placeholder="www.linleyandsimpson.co.uk, linleyandsimpson2.q.starberry.com"
                  value={hostnames}
                  onChange={(e) => setHostnames(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Comma- or space-separated. A URL is matched to this project when its hostname is in this list.
                </p>
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <div className="flex items-center gap-3">
                <Button type="submit" disabled={creating}>
                  {creating && <Loader2 className="size-4 animate-spin" />}
                  {creating ? 'Creating…' : 'Create project'}
                </Button>
                <button
                  type="button"
                  onClick={() => setShowNew(false)}
                  className="text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
