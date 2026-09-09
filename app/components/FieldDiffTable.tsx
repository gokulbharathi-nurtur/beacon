import type { FieldDiff } from '@/lib/types';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';

/**
 * Presentation for a template diff's per-event findings. Every `FieldDiff` kind renders
 * the same way — matched-vs-expected field, kind badge, expected/actual values.
 */

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

export function fmt(value: unknown): string {
  if (value === undefined) return '—';
  if (typeof value === 'string') return value === '' ? '(empty string)' : value;
  return JSON.stringify(value);
}

/** Item-level diffs (from array itemFields) carry an `[index]` segment in their path. */
export function splitFieldDiffs(fieldDiffs: FieldDiff[]): { topLevel: FieldDiff[]; itemLevel: FieldDiff[] } {
  return {
    topLevel: fieldDiffs.filter((fd) => !fd.path.includes('[')),
    itemLevel: fieldDiffs.filter((fd) => fd.path.includes('[')),
  };
}

export function FieldDiffTable({ diffs }: { diffs: FieldDiff[] }) {
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

const TONE_TEXT: Record<string, string> = {
  good: 'text-status-good',
  critical: 'text-status-critical',
  info: 'text-status-info',
  warning: 'text-amber-700 dark:text-status-warning',
  serious: 'text-orange-700 dark:text-status-serious',
  muted: 'text-muted-foreground',
};

export function StatTile({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded-sm bg-card px-3.5 py-3 ring-1 ring-foreground/10">
      <div className={`text-2xl font-semibold ${TONE_TEXT[tone]}`}>{value}</div>
      <div className="mt-0.5 text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

export function Section({
  icon,
  title,
  hint,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
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
