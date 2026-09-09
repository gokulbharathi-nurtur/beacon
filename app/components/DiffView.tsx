import { CircleCheck, CircleX, Sparkles, Hash, TriangleAlert } from 'lucide-react';
import type { DiffResult } from '@/lib/types';
import { FieldDiffTable, Section, StatTile, splitFieldDiffs } from './FieldDiffTable';

export function DiffView({ diff }: { diff: DiffResult }) {
  const { summary } = diff;
  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <StatTile label="Clean" value={summary.cleanCount} tone="good" />
        <StatTile label="Missing" value={summary.missingCount} tone="critical" />
        <StatTile label="Unexpected" value={summary.unexpectedCount} tone="info" />
        <StatTile label="Count mismatches" value={summary.countMismatchCount} tone="warning" />
        <StatTile label="Field mismatches" value={summary.mismatchedCount} tone="serious" />
      </div>

      {diff.missingEvents.length > 0 && (
        <Section
          icon={<CircleX className="size-4 text-status-critical" />}
          title="Missing events"
          hint="In the template but not seen in this capture."
        >
          <ul className="space-y-1">
            {diff.missingEvents.map((m, i) => (
              <li
                key={i}
                className="flex items-center gap-2 rounded-sm bg-status-critical/5 px-3 py-2 text-sm ring-1 ring-status-critical/15"
              >
                <span className="font-mono">{m.eventName}</span>
                <span className="text-xs text-muted-foreground">occurrence #{m.occurrenceIndex}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {diff.unexpectedEvents.length > 0 && (
        <Section
          icon={<Sparkles className="size-4 text-status-info" />}
          title="Unexpected events"
          hint="Captured but not present in the template."
        >
          <div className="space-y-2">
            {diff.unexpectedEvents.map((u, i) => (
              <details key={i} className="rounded-sm bg-status-info/5 px-3 py-2 text-sm ring-1 ring-status-info/15">
                <summary className="cursor-pointer font-mono">
                  {u.eventName} <span className="text-xs text-muted-foreground">occurrence #{u.occurrenceIndex}</span>
                </summary>
                <pre className="mt-2 overflow-x-auto text-xs text-muted-foreground">{JSON.stringify(u.capturedEvent, null, 2)}</pre>
              </details>
            ))}
          </div>
        </Section>
      )}

      {diff.countMismatches.length > 0 && (
        <Section
          icon={<Hash className="size-4 text-status-warning" />}
          title="Count mismatches"
          hint="Occurrence count differs from what the template expects."
        >
          <ul className="space-y-1">
            {diff.countMismatches.map((c, i) => (
              <li key={i} className="rounded-sm bg-status-warning/10 px-3 py-2 text-sm ring-1 ring-status-warning/20">
                <span className="font-mono">{c.eventName}</span>: expected {c.expectedCount}, got {c.actualCount}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {diff.matchedEvents.some((m) => m.status === 'mismatched') && (
        <Section
          icon={<TriangleAlert className="size-4 text-status-serious" />}
          title="Mismatched events"
          hint="Matched by name/position but one or more fields differ."
        >
          <div className="space-y-3">
            {diff.matchedEvents
              .filter((m) => m.status === 'mismatched')
              .map((m, i) => {
                const { topLevel, itemLevel } = splitFieldDiffs(m.fieldDiffs);
                return (
                  <div key={i} className="overflow-hidden rounded-sm ring-1 ring-status-serious/25">
                    <div className="bg-status-serious/10 px-3 py-1.5 font-mono text-sm">
                      {m.eventName} <span className="text-xs text-muted-foreground">occurrence #{m.occurrenceIndex}</span>
                    </div>
                    {topLevel.length > 0 && <FieldDiffTable diffs={topLevel} />}
                    {itemLevel.length > 0 && (
                      <div className={topLevel.length > 0 ? 'border-t border-border' : undefined}>
                        <p className="px-3 pt-2 text-xs font-semibold text-muted-foreground">
                          Item-level issues ({itemLevel.length})
                        </p>
                        <FieldDiffTable diffs={itemLevel} />
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        </Section>
      )}

      {diff.matchedEvents.some((m) => m.status === 'clean') && (
        <details className="group rounded-sm ring-1 ring-border">
          <summary className="flex cursor-pointer items-center gap-2 px-4 py-2.5 text-sm font-semibold">
            <CircleCheck className="size-4 text-status-good" />
            Clean events ({summary.cleanCount})
          </summary>
          <ul className="divide-y divide-border border-t border-border">
            {diff.matchedEvents
              .filter((m) => m.status === 'clean')
              .map((m, i) => (
                <li key={i} className="px-4 py-2 font-mono text-sm text-muted-foreground">
                  {m.eventName} <span className="text-xs text-muted-foreground/70">#{m.occurrenceIndex}</span>
                </li>
              ))}
          </ul>
        </details>
      )}
    </div>
  );
}

