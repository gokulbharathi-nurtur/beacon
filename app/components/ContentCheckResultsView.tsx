import { CircleCheck } from 'lucide-react';
import type { ContentCheckResultRow } from '@/lib/db/schema';
import { FieldDiffTable, StatTile } from './FieldDiffTable';

/** Renders one content check's results grouped by verdict — pass/fail/no_rule/
 * no_page_load_event — reusing FieldDiffTable to show *why* a fail happened (it already
 * produces the same FieldDiff[] vocabulary via compareFieldsAgainstObject). */
export function ContentCheckResultsView({ results }: { results: ContentCheckResultRow[] }) {
  const pass = results.filter((r) => r.status === 'pass');
  const fail = results.filter((r) => r.status === 'fail');
  const noEvent = results.filter((r) => r.status === 'no_page_load_event');
  const noRule = results.filter((r) => r.status === 'no_rule');

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Pass" value={pass.length} tone="good" />
        <StatTile label="Fail" value={fail.length} tone="critical" />
        <StatTile label="No page_loaded event" value={noEvent.length} tone="warning" />
        <StatTile label="No matching row" value={noRule.length} tone="muted" />
      </div>

      {fail.length > 0 && (
        <Section
          title="Failing pages"
          hint="A page_loaded event fired, but its page.content_group/content_id/content_type didn't match the reference table."
        >
          <div className="space-y-3">
            {fail.map((r) => (
              <FailCard key={r.id} result={r} />
            ))}
          </div>
        </Section>
      )}

      {noEvent.length > 0 && (
        <Section
          title="No page_loaded event captured"
          hint="The page loaded but never pushed a page_loaded event, so there was nothing to check its content against."
        >
          <PageList results={noEvent} />
        </Section>
      )}

      {noRule.length > 0 && (
        <Section
          title="No matching reference row (sample)"
          hint="These discovered pages didn't match any pattern in the reference table — the table may not cover this part of the site yet."
        >
          <PageList results={noRule} />
        </Section>
      )}

      {pass.length > 0 && (
        <details className="group rounded-lg ring-1 ring-border">
          <summary className="flex cursor-pointer items-center gap-2 px-4 py-2.5 text-sm font-semibold">
            <CircleCheck className="size-4 text-status-good" />
            Pass ({pass.length})
          </summary>
          <div className="border-t border-border">
            <PageList results={pass} showPattern />
          </div>
        </details>
      )}
    </div>
  );
}

function FailCard({ result }: { result: ContentCheckResultRow }) {
  return (
    <div className="overflow-hidden rounded-lg ring-1 ring-status-critical/25">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 bg-status-critical/10 px-3 py-1.5 text-sm">
        {result.matchedPattern && <span className="font-mono text-xs text-muted-foreground">{result.matchedPattern}</span>}
        <a
          href={result.pageUrl}
          target="_blank"
          rel="noreferrer"
          className="truncate text-xs underline underline-offset-2"
        >
          {result.pageUrl}
        </a>
      </div>
      <FieldDiffTable diffs={result.fieldDiffs ?? []} />
    </div>
  );
}

function PageList({ results, showPattern }: { results: ContentCheckResultRow[]; showPattern?: boolean }) {
  return (
    <ul className="divide-y divide-border rounded-lg ring-1 ring-border">
      {results.map((r) => (
        <li key={r.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 px-3 py-2 text-sm">
          {showPattern && r.matchedPattern && (
            <span className="font-mono text-xs text-muted-foreground">{r.matchedPattern}</span>
          )}
          <a
            href={r.pageUrl}
            target="_blank"
            rel="noreferrer"
            className="truncate text-xs text-muted-foreground underline underline-offset-2"
          >
            {r.pageUrl}
          </a>
        </li>
      ))}
    </ul>
  );
}

function Section({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      <p className="mt-0.5 mb-2 text-xs text-muted-foreground">{hint}</p>
      {children}
    </div>
  );
}
