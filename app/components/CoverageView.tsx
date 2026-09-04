import { CircleCheck, CircleHelp, MousePointerClick, TriangleAlert } from 'lucide-react';
import type { SweepFindingRow, SweepRow } from '@/lib/db/schema';
import { FieldDiffTable, Section, StatTile, splitFieldDiffs } from './FieldDiffTable';

/** Renders sweep findings grouped by page pattern (page type), then by kind — the
 * "page type × element × event × verdict" matrix as a hierarchical breakdown rather than a
 * literal grid, which stays readable at any finding count and reuses the same
 * FieldDiffTable/Section primitives DiffView and AuditView already established. */
export function CoverageView({ sweep, findings }: { sweep: SweepRow; findings: SweepFindingRow[] }) {
  const coverageGaps = findings.filter((f) => f.kind === 'coverage_gap');
  const silent = findings.filter((f) => f.kind === 'silent_element');
  const violations = findings.filter((f) => f.kind === 'schema_violation');
  const clean = findings.filter((f) => f.kind === 'clean');

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Clean" value={clean.length} tone="good" />
        <StatTile label="Silent elements" value={silent.length} tone="serious" />
        <StatTile label="Schema violations" value={violations.length} tone="critical" />
        <StatTile label="Coverage gaps" value={coverageGaps.length} tone="warning" />
      </div>

      <p className="text-xs text-muted-foreground">
        {sweep.pagesSweptCount} page{sweep.pagesSweptCount === 1 ? '' : 's'} swept
        {sweep.elementsSweptCount !== null && `, ${sweep.elementsSweptCount} element${sweep.elementsSweptCount === 1 ? '' : 's'} driven`}
        {sweep.totalUrlsDiscovered !== null && ` — ${sweep.totalUrlsDiscovered} URLs discovered via ${sweep.pageSource}`}
        {sweep.bucketCount !== null && `, grouped into ${sweep.bucketCount} page type${sweep.bucketCount === 1 ? '' : 's'}`}.
      </p>

      {coverageGaps.length > 0 && (
        <Section
          icon={<CircleHelp className="size-4 text-status-warning" />}
          title="Coverage gaps"
          hint="Catalog events the analytics package supports but this sweep never observed anywhere on the site — possibly tracking that was never wired up, possibly a feature this site doesn't use."
        >
          <ul className="flex flex-wrap gap-2">
            {coverageGaps.map((f) => (
              <li key={f.id} className="rounded-md bg-status-warning/10 px-3 py-1.5 font-mono text-sm ring-1 ring-status-warning/20">
                {f.eventName}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {silent.length > 0 && (
        <Section
          icon={<MousePointerClick className="size-4 text-status-serious" />}
          title="Silent elements"
          hint="An interactive element was clicked and fired nothing — the single most common analytics bug, found automatically."
        >
          <PageGroupedList findings={silent} tone="serious" render={(f) => <ElementLine finding={f} />} />
        </Section>
      )}

      {violations.length > 0 && (
        <Section
          icon={<TriangleAlert className="size-4 text-status-critical" />}
          title="Schema violations"
          hint="An event fired but its payload doesn't match the shape the analytics package produces."
        >
          <PageGroupedList findings={violations} tone="critical" render={(f) => <ViolationBlock finding={f} />} />
        </Section>
      )}

      {clean.length > 0 && (
        <details className="group rounded-lg ring-1 ring-border">
          <summary className="flex cursor-pointer items-center gap-2 px-4 py-2.5 text-sm font-semibold">
            <CircleCheck className="size-4 text-status-good" />
            Clean ({clean.length})
          </summary>
          <div className="border-t border-border">
            <PageGroupedList findings={clean} tone="good" render={(f) => <ElementLine finding={f} showEvent />} nested />
          </div>
        </details>
      )}
    </div>
  );
}

function groupByPagePattern(findings: SweepFindingRow[]): Map<string, SweepFindingRow[]> {
  const groups = new Map<string, SweepFindingRow[]>();
  for (const finding of findings) {
    const key = finding.pagePattern ?? '(unknown page)';
    const list = groups.get(key);
    if (list) list.push(finding);
    else groups.set(key, [finding]);
  }
  return groups;
}

const TONE_RING: Record<string, string> = {
  serious: 'ring-status-serious/25',
  critical: 'ring-status-critical/25',
  good: 'ring-border',
};

const TONE_BG: Record<string, string> = {
  serious: 'bg-status-serious/10',
  critical: 'bg-status-critical/10',
  good: 'bg-muted/50',
};

function PageGroupedList({
  findings,
  tone,
  render,
  nested,
}: {
  findings: SweepFindingRow[];
  tone: 'serious' | 'critical' | 'good';
  render: (finding: SweepFindingRow) => React.ReactNode;
  nested?: boolean;
}) {
  const groups = groupByPagePattern(findings);
  return (
    <div className={nested ? 'divide-y divide-border' : 'space-y-3'}>
      {[...groups.entries()].map(([pattern, group]) => (
        <div key={pattern} className={nested ? '' : `overflow-hidden rounded-lg ring-1 ${TONE_RING[tone]}`}>
          <div className={`px-3 py-1.5 font-mono text-sm ${nested ? 'bg-muted/30' : TONE_BG[tone]}`}>
            {pattern} <span className="text-xs text-muted-foreground">({group.length})</span>
          </div>
          <ul className="divide-y divide-border">
            {group.map((f) => (
              <li key={f.id} className="px-3 py-2 text-sm">
                {render(f)}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function ElementLine({ finding, showEvent }: { finding: SweepFindingRow; showEvent?: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <span className="font-medium">{finding.elementLabel ?? 'Page load'}</span>
      {finding.elementSelector && <span className="font-mono text-xs text-muted-foreground">{finding.elementSelector}</span>}
      {showEvent && finding.eventName && (
        <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">{finding.eventName}</span>
      )}
      <a href={finding.pageUrl ?? undefined} target="_blank" rel="noreferrer" className="truncate text-xs text-muted-foreground underline underline-offset-2">
        {finding.pageUrl}
      </a>
    </div>
  );
}

function ViolationBlock({ finding }: { finding: SweepFindingRow }) {
  const { topLevel, itemLevel } = splitFieldDiffs(finding.fieldDiffs ?? []);
  return (
    <div className="space-y-2">
      <ElementLine finding={finding} showEvent />
      {(finding.fieldDiffs ?? []).length === 0 ? (
        <p className="text-xs text-status-critical">Event name not recognized by the catalog.</p>
      ) : (
        <div className="overflow-hidden rounded-md ring-1 ring-border">
          {topLevel.length > 0 && <FieldDiffTable diffs={topLevel} />}
          {itemLevel.length > 0 && <FieldDiffTable diffs={itemLevel} />}
        </div>
      )}
    </div>
  );
}
