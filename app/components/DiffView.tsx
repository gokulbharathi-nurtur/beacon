import { CircleCheck, CircleX, Sparkles, Hash, TriangleAlert } from 'lucide-react';
import type { DiffResult, FieldDiff } from '@/lib/types';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';

const KIND_LABELS: Record<FieldDiff['kind'], string> = {
  missing_field: 'Missing field',
  type_mismatch: 'Type mismatch',
  value_mismatch: 'Value mismatch',
  structural_violation: 'Structural violation',
  unexpected_field: 'Unexpected field',
  array_count_mismatch: 'Array count mismatch',
  string_contains_mismatch: 'Contains mismatch',
  pattern_mismatch: 'Pattern mismatch',
  value_not_in_set: 'Not an allowed value',
};

const KIND_STYLES: Record<FieldDiff['kind'], string> = {
  missing_field: 'bg-status-critical/10 text-status-critical',
  type_mismatch: 'bg-status-critical/10 text-status-critical',
  value_mismatch: 'bg-status-warning/15 text-amber-700 dark:text-status-warning',
  structural_violation: 'bg-status-serious/15 text-orange-700 dark:text-status-serious',
  unexpected_field: 'bg-status-info/10 text-status-info',
  array_count_mismatch: 'bg-status-warning/15 text-amber-700 dark:text-status-warning',
  string_contains_mismatch: 'bg-status-warning/15 text-amber-700 dark:text-status-warning',
  pattern_mismatch: 'bg-status-warning/15 text-amber-700 dark:text-status-warning',
  value_not_in_set: 'bg-status-warning/15 text-amber-700 dark:text-status-warning',
};

function fmt(value: unknown): string {
  if (value === undefined) return '—';
  if (typeof value === 'string') return value === '' ? '(empty string)' : value;
  return JSON.stringify(value);
}

/** Item-level diffs (from array itemFields) carry an `[index]` segment in their path. */
function splitFieldDiffs(fieldDiffs: FieldDiff[]): { topLevel: FieldDiff[]; itemLevel: FieldDiff[] } {
  return {
    topLevel: fieldDiffs.filter((fd) => !fd.path.includes('[')),
    itemLevel: fieldDiffs.filter((fd) => fd.path.includes('[')),
  };
}

function FieldDiffTable({ diffs }: { diffs: FieldDiff[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Field</TableHead>
          <TableHead>Kind</TableHead>
          <TableHead>Expected</TableHead>
          <TableHead>Actual</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {diffs.map((fd, j) => (
          <TableRow key={j}>
            <TableCell className="whitespace-normal break-all font-mono">{fd.path}</TableCell>
            <TableCell className="whitespace-normal">
              <Badge variant="outline" className={`border-transparent ${KIND_STYLES[fd.kind]}`}>
                {KIND_LABELS[fd.kind]}
              </Badge>
            </TableCell>
            <TableCell className="whitespace-normal break-all font-mono text-xs">{fmt(fd.expectedValue ?? fd.expectedType)}</TableCell>
            <TableCell className="whitespace-normal break-all font-mono text-xs">{fmt(fd.actualValue ?? fd.actualType)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

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
                className="flex items-center gap-2 rounded-md bg-status-critical/5 px-3 py-2 text-sm ring-1 ring-status-critical/15"
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
              <details key={i} className="rounded-md bg-status-info/5 px-3 py-2 text-sm ring-1 ring-status-info/15">
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
              <li key={i} className="rounded-md bg-status-warning/10 px-3 py-2 text-sm ring-1 ring-status-warning/20">
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
                  <div key={i} className="overflow-hidden rounded-lg ring-1 ring-status-serious/25">
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
        <details className="group rounded-lg ring-1 ring-border">
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

const TONE_TEXT: Record<string, string> = {
  good: 'text-status-good',
  critical: 'text-status-critical',
  info: 'text-status-info',
  warning: 'text-amber-700 dark:text-status-warning',
  serious: 'text-orange-700 dark:text-status-serious',
};

function StatTile({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded-xl bg-card px-3.5 py-3 ring-1 ring-foreground/10">
      <div className={`text-2xl font-semibold ${TONE_TEXT[tone]}`}>{value}</div>
      <div className="mt-0.5 text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

function Section({ icon, title, hint, children }: { icon: React.ReactNode; title: string; hint: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
        {icon}
        {title}
      </h3>
      <p className="mt-0.5 mb-2 pl-6 text-xs text-muted-foreground">{hint}</p>
      {children}
    </div>
  );
}
