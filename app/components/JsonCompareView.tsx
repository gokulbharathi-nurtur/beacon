import { CircleCheck } from 'lucide-react';
import type { DiffResult } from '@/lib/types';
import { buildExpectedJson } from '@/lib/diff/buildExpectedJson';
import { JsonTree, buildHighlightMap } from './JsonTree';

export function JsonCompareView({ diff }: { diff: DiffResult }) {
  const mismatched = diff.matchedEvents.filter((m) => m.status === 'mismatched');
  const clean = diff.matchedEvents.filter((m) => m.status === 'clean');

  return (
    <div className="space-y-4">
      {diff.missingEvents.map((m, i) => (
        <EventCard key={`missing-${i}`} eventName={m.eventName} occurrenceIndex={m.occurrenceIndex} tone="critical">
          <Panel label="Expected">
            <JsonTree value={buildExpectedJson(m.templateEvent)} placeholderAware />
          </Panel>
          <Panel label="Actual" note="Not captured — this event didn't fire." />
        </EventCard>
      ))}

      {diff.unexpectedEvents.map((u, i) => (
        <EventCard key={`unexpected-${i}`} eventName={u.eventName} occurrenceIndex={u.occurrenceIndex} tone="info">
          <Panel label="Expected" note="Not in the template — this event wasn't expected." />
          <Panel label="Actual">
            <JsonTree value={u.capturedEvent} />
          </Panel>
        </EventCard>
      ))}

      {mismatched.map((m, i) => {
        const highlights = buildHighlightMap(m.fieldDiffs);
        return (
          <EventCard key={`mismatched-${i}`} eventName={m.eventName} occurrenceIndex={m.occurrenceIndex} tone="serious">
            <Panel label="Expected">
              <JsonTree value={buildExpectedJson(m.templateEvent)} highlights={highlights} placeholderAware />
            </Panel>
            <Panel label="Actual">
              <JsonTree value={m.capturedEvent} highlights={highlights} />
            </Panel>
          </EventCard>
        );
      })}

      {clean.length > 0 && (
        <details className="group rounded-lg ring-1 ring-border">
          <summary className="flex cursor-pointer items-center gap-2 px-4 py-2.5 text-sm font-semibold">
            <CircleCheck className="size-4 text-status-good" />
            Clean events ({clean.length})
          </summary>
          <div className="space-y-4 border-t border-border p-4">
            {clean.map((m, i) => (
              <EventCard key={`clean-${i}`} eventName={m.eventName} occurrenceIndex={m.occurrenceIndex} tone="good">
                <Panel label="Expected">
                  <JsonTree value={buildExpectedJson(m.templateEvent)} placeholderAware />
                </Panel>
                <Panel label="Actual">
                  <JsonTree value={m.capturedEvent} />
                </Panel>
              </EventCard>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

const TONE_RING: Record<string, string> = {
  critical: 'ring-status-critical/25',
  info: 'ring-status-info/25',
  serious: 'ring-status-serious/30',
  good: 'ring-status-good/25',
};
const TONE_HEADER: Record<string, string> = {
  critical: 'bg-status-critical/10',
  info: 'bg-status-info/10',
  serious: 'bg-status-serious/10',
  good: 'bg-status-good/10',
};

function EventCard({
  eventName,
  occurrenceIndex,
  tone,
  children,
}: {
  eventName: string;
  occurrenceIndex: number;
  tone: 'critical' | 'info' | 'serious' | 'good';
  children: React.ReactNode;
}) {
  return (
    <div className={`overflow-hidden rounded-lg ring-1 ${TONE_RING[tone]}`}>
      <div className={`px-4 py-1.5 font-mono text-sm ${TONE_HEADER[tone]}`}>
        {eventName} <span className="text-xs text-muted-foreground">occurrence #{occurrenceIndex}</span>
      </div>
      <div className="grid grid-cols-1 divide-y divide-border sm:grid-cols-2 sm:divide-x sm:divide-y-0">{children}</div>
    </div>
  );
}

function Panel({ label, children, note }: { label: string; children?: React.ReactNode; note?: string }) {
  return (
    <div className="min-w-0 p-3">
      <p className="mb-1.5 text-xs font-medium text-muted-foreground">{label}</p>
      {children ? (
        <div className="max-h-96 overflow-auto rounded-md bg-muted/40 py-1.5">{children}</div>
      ) : (
        <p className="rounded-md bg-muted/40 p-2 text-xs text-muted-foreground italic">{note}</p>
      )}
    </div>
  );
}
