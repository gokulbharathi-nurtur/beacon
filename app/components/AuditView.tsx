import { CircleCheck, CircleHelp, CircleX, TriangleAlert } from 'lucide-react';
import type { AuditEventResult, AuditResult } from '@/lib/types';
import { FieldDiffTable, Section, StatTile, splitFieldDiffs } from './FieldDiffTable';

export function AuditView({ audit }: { audit: AuditResult }) {
  const { summary } = audit;
  const violations = audit.events.filter((e) => e.status === 'violations');
  const unknown = audit.events.filter((e) => e.status === 'unknown_event');
  const unchecked = audit.events.filter((e) => e.status === 'unchecked');
  const clean = audit.events.filter((e) => e.status === 'clean');

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Clean" value={summary.clean} tone="good" />
        <StatTile label="With violations" value={summary.violations} tone="serious" />
        <StatTile label="Unknown events" value={summary.unknownEvents} tone="critical" />
        <StatTile label="Unchecked" value={summary.unchecked} tone="muted" />
      </div>

      <p className="text-xs text-muted-foreground">
        Checked against{' '}
        <span className="font-mono">
          {audit.packageName}@{audit.packageVersion}
        </span>
        . No template needed — every event is judged against the canonical catalog.
      </p>

      {unknown.length > 0 && (
        <Section
          icon={<CircleX className="size-4 text-status-critical" />}
          title="Unknown event names"
          hint="Not a name the analytics package can emit — a typo, or tracking that has drifted from the spec."
        >
          <div className="space-y-2">
            {unknown.map((event) => (
              <details
                key={event.index}
                className="rounded-md bg-status-critical/5 px-3 py-2 text-sm ring-1 ring-status-critical/15"
              >
                <summary className="cursor-pointer font-mono">{event.eventName}</summary>
                <pre className="mt-2 overflow-x-auto text-xs text-muted-foreground">
                  {JSON.stringify(event.capturedEvent, null, 2)}
                </pre>
              </details>
            ))}
          </div>
        </Section>
      )}

      {violations.length > 0 && (
        <Section
          icon={<TriangleAlert className="size-4 text-status-serious" />}
          title="Events that break the catalog"
          hint="The event name is real, but its payload does not match the shape the package produces."
        >
          <div className="space-y-3">
            {violations.map((event) => (
              <EventFindings key={event.index} event={event} />
            ))}
          </div>
        </Section>
      )}

      {unchecked.length > 0 && (
        <Section
          icon={<CircleHelp className="size-4 text-muted-foreground" />}
          title="Unchecked events"
          hint="Real event names that the package's own test suite never pushes, so there is no shape to check them against."
        >
          <ul className="space-y-1">
            {unchecked.map((event) => (
              <li key={event.index} className="rounded-md bg-muted/40 px-3 py-2 font-mono text-sm text-muted-foreground">
                {event.eventName}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {clean.length > 0 && (
        <details className="group rounded-lg ring-1 ring-border">
          <summary className="flex cursor-pointer items-center gap-2 px-4 py-2.5 text-sm font-semibold">
            <CircleCheck className="size-4 text-status-good" />
            Clean events ({clean.length})
          </summary>
          <ul className="divide-y divide-border border-t border-border">
            {clean.map((event) => (
              <li key={event.index} className="flex items-center gap-2 px-4 py-2 font-mono text-sm text-muted-foreground">
                {event.eventName}
                <EvidenceNote sampleCount={event.sampleCount} />
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function EventFindings({ event }: { event: AuditEventResult }) {
  const { topLevel, itemLevel } = splitFieldDiffs(event.fieldDiffs);
  return (
    <div className="overflow-hidden rounded-lg ring-1 ring-status-serious/25">
      <div className="flex items-center gap-2 bg-status-serious/10 px-3 py-1.5 font-mono text-sm">
        {event.eventName}
        <EvidenceNote sampleCount={event.sampleCount} />
      </div>
      {topLevel.length > 0 && <FieldDiffTable diffs={topLevel} />}
      {itemLevel.length > 0 && (
        <div className={topLevel.length > 0 ? 'border-t border-border' : undefined}>
          <p className="px-3 pt-2 text-xs font-semibold text-muted-foreground">Item-level issues ({itemLevel.length})</p>
          <FieldDiffTable diffs={itemLevel} />
        </div>
      )}
    </div>
  );
}

/**
 * How much of the catalog entry to trust. Most events were sampled once by the package's
 * suite, which is no evidence at all about which fields are optional — so those entries
 * never report a missing field, and saying so up front stops that reading as a pass.
 */
function EvidenceNote({ sampleCount }: { sampleCount?: number }) {
  if (sampleCount === undefined) return null;
  return (
    <span className="text-xs font-normal text-muted-foreground">
      {sampleCount === 1
        ? '1 catalog sample — shape checked, nothing treated as required'
        : `${sampleCount} catalog samples`}
    </span>
  );
}
