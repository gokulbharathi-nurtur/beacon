'use client';

import { useMemo, useState } from 'react';
import { Check, Loader2, MousePointerClick, Plus, Search } from 'lucide-react';
import type { InteractionStep } from '@/lib/types';
import { extractApiErrorMessage } from '@/lib/apiError';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface Clickable {
  label: string;
  tag: string;
  role: string | null;
  selector: string;
  href: string | null;
  reason: 'semantic' | 'pointer';
  section: string;
}

/**
 * "Scan this page" → a checklist of the buttons/links/pointer elements found on it, grouped
 * by where they live (Header/Footer/Navigation, or the enclosing module's own classname).
 * Adding one appends a click step (matched by the discovered CSS selector, labelled by its
 * text).
 */
export function ClickableScanner({
  url,
  steps,
  onAdd,
}: {
  url: string;
  steps: InteractionStep[];
  onAdd: (step: InteractionStep) => void;
}) {
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<Clickable[] | null>(null);
  const [query, setQuery] = useState('');

  const addedSelectors = new Set(steps.filter((s) => s.target.by === 'css').map((s) => s.target.value));

  async function scan() {
    if (!url) return;
    setScanning(true);
    setError(null);
    try {
      const res = await fetch('/api/clickables', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(extractApiErrorMessage(body, 'Could not scan the page.'));
        return;
      }
      setItems(body.clickables as Clickable[]);
      setQuery('');
    } catch {
      setError('Could not scan the page — is the server reachable?');
    } finally {
      setScanning(false);
    }
  }

  // Grouped by section, in first-seen order — Header pinned first, Footer pinned last,
  // when present — same visual pattern as the Page-load/Click grouping on the templates
  // list pages.
  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = (items ?? []).filter((it) => !q || it.label.toLowerCase().includes(q));
    const byId = new Map<string, Clickable[]>();
    for (const it of filtered) {
      const bucket = byId.get(it.section);
      if (bucket) bucket.push(it);
      else byId.set(it.section, [it]);
    }
    return [...byId.entries()].sort(([a], [b]) => {
      if (a === 'Header') return -1;
      if (b === 'Header') return 1;
      if (a === 'Footer') return 1;
      if (b === 'Footer') return -1;
      return 0;
    });
  }, [items, query]);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={scan} disabled={!url || scanning}>
          {scanning ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
          {scanning ? 'Scanning page…' : items ? 'Re-scan page' : 'Scan page for clickable elements'}
        </Button>
        {items && items.length > 0 && (
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search scanned elements…"
            className="h-8 max-w-56 text-xs"
          />
        )}
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}

      {items && (
        <div className="max-h-80 overflow-auto rounded-sm border border-border">
          {items.length === 0 ? (
            <p className="p-3 text-xs text-muted-foreground">
              No clickable elements found — the page may render them after an interaction. Add a step by hand below.
            </p>
          ) : groups.length === 0 ? (
            <p className="p-3 text-xs text-muted-foreground">No scanned elements match &quot;{query}&quot;.</p>
          ) : (
            groups.map(([section, sectionItems]) => (
              <div key={section}>
                <p className="sticky top-0 border-b border-border bg-muted/70 px-3 py-1 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
                  {section}
                </p>
                <ul className="divide-y divide-border text-sm">
                  {sectionItems.map((it) => {
                    const added = addedSelectors.has(it.selector);
                    return (
                      <li key={it.selector} className="flex items-center gap-2 px-3 py-1.5">
                        <span
                          className="w-12 shrink-0 rounded-sm bg-muted px-1 py-0.5 text-center text-[10px] uppercase text-muted-foreground"
                          title={it.reason === 'pointer' ? 'styled with cursor: pointer' : it.role ?? it.tag}
                        >
                          {it.tag}
                        </span>
                        <span className="min-w-0 flex-1 truncate" title={it.selector}>
                          {it.label}
                          {it.reason === 'pointer' && (
                            <MousePointerClick className="ml-1 inline size-3 align-[-1px] text-muted-foreground" />
                          )}
                        </span>
                        <button
                          type="button"
                          disabled={added}
                          onClick={() =>
                            onAdd({ action: 'click', target: { by: 'css', value: it.selector }, label: it.label })
                          }
                          className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-60"
                        >
                          {added ? <Check className="size-3.5" /> : <Plus className="size-3.5" />}
                          {added ? 'Added' : 'Add'}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
