'use client';

import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import type { FieldDiff } from '@/lib/types';
import { cn } from '@/lib/utils';

const KIND_LINE_STYLES: Record<FieldDiff['kind'], string> = {
  missing_field: 'bg-status-critical/10 border-l-2 border-status-critical',
  type_mismatch: 'bg-status-critical/10 border-l-2 border-status-critical',
  value_mismatch: 'bg-status-warning/15 border-l-2 border-status-warning',
  structural_violation: 'bg-status-serious/15 border-l-2 border-status-serious',
  unexpected_field: 'bg-status-info/10 border-l-2 border-status-info',
  array_count_mismatch: 'bg-status-warning/15 border-l-2 border-status-warning',
  string_contains_mismatch: 'bg-status-warning/15 border-l-2 border-status-warning',
  pattern_mismatch: 'bg-status-warning/15 border-l-2 border-status-warning',
  value_not_in_set: 'bg-status-warning/15 border-l-2 border-status-warning',
  misspelled_field: 'bg-status-critical/10 border-l-2 border-status-critical',
};

const KIND_TAG_STYLES: Record<FieldDiff['kind'], string> = {
  missing_field: 'text-status-critical',
  type_mismatch: 'text-status-critical',
  value_mismatch: 'text-amber-700 dark:text-status-warning',
  structural_violation: 'text-orange-700 dark:text-status-serious',
  unexpected_field: 'text-status-info',
  array_count_mismatch: 'text-amber-700 dark:text-status-warning',
  string_contains_mismatch: 'text-amber-700 dark:text-status-warning',
  pattern_mismatch: 'text-amber-700 dark:text-status-warning',
  value_not_in_set: 'text-amber-700 dark:text-status-warning',
  misspelled_field: 'text-status-critical',
};

const KIND_SHORT_LABELS: Record<FieldDiff['kind'], string> = {
  missing_field: 'missing',
  type_mismatch: 'type',
  value_mismatch: 'value',
  structural_violation: 'invalid',
  unexpected_field: 'unexpected',
  array_count_mismatch: 'count',
  string_contains_mismatch: 'contains',
  pattern_mismatch: 'pattern',
  value_not_in_set: 'not-in-set',
  misspelled_field: 'misspelled',
};

export type HighlightMap = Map<string, FieldDiff>;

export function buildHighlightMap(fieldDiffs: FieldDiff[]): HighlightMap {
  return new Map(fieldDiffs.map((fd) => [fd.path, fd]));
}

/**
 * Renders an object as indented pseudo-JSON with per-leaf-line diff highlighting.
 * A non-empty array is diffed as a single opaque leaf (V1 doesn't diff into array
 * elements — see the template's `array` field type), but is still pretty-printed,
 * expandable inline, for readability — that's display only, not a diffing change.
 * `placeholderAware` renders the buildExpectedJson `"<string>"`-style type
 * placeholders in muted italic instead of as literal values.
 */
export function JsonTree({
  value,
  highlights,
  placeholderAware = false,
}: {
  value: Record<string, unknown>;
  highlights?: HighlightMap;
  placeholderAware?: boolean;
}) {
  return (
    <div className="font-mono text-xs leading-relaxed">
      <Line depth={0}>{'{'}</Line>
      <ObjectEntries obj={value} basePath="" depth={1} highlights={highlights} placeholderAware={placeholderAware} />
      <Line depth={0}>{'}'}</Line>
    </div>
  );
}

function ObjectEntries({
  obj,
  basePath,
  depth,
  highlights,
  placeholderAware,
}: {
  obj: Record<string, unknown>;
  basePath: string;
  depth: number;
  highlights?: HighlightMap;
  placeholderAware: boolean;
}) {
  const entries = Object.entries(obj);
  return (
    <>
      {entries.map(([key, value], i) => {
        const path = basePath ? `${basePath}.${key}` : key;
        const trailingComma = i < entries.length - 1;
        const isPlainObject = value !== null && typeof value === 'object' && !Array.isArray(value);
        const highlight = highlights?.get(path);

        if (isPlainObject) {
          return (
            <div key={path}>
              <Line depth={depth}>
                <KeyLabel k={key} /> {'{'}
              </Line>
              <ObjectEntries
                obj={value as Record<string, unknown>}
                basePath={path}
                depth={depth + 1}
                highlights={highlights}
                placeholderAware={placeholderAware}
              />
              <Line depth={depth}>
                {'}'}
                {trailingComma ? ',' : ''}
              </Line>
            </div>
          );
        }

        if (Array.isArray(value) && value.length > 0) {
          return (
            <ArrayLeaf
              key={path}
              depth={depth}
              keyLabel={key}
              arrayPath={path}
              items={value}
              trailingComma={trailingComma}
              highlight={highlight}
              highlights={highlights}
            />
          );
        }

        const isPlaceholder = placeholderAware && typeof value === 'string' && /^<.*>$/.test(value);

        return (
          <Line key={path} depth={depth} highlightClass={highlight ? KIND_LINE_STYLES[highlight.kind] : undefined}>
            <span className="min-w-0 flex-1 break-all">
              <KeyLabel k={key} /> <ValueText value={value} isPlaceholder={isPlaceholder} />
              {trailingComma ? ',' : ''}
            </span>
            {highlight && (
              <span className={cn('ml-2 shrink-0 text-[0.65rem] font-semibold tracking-wide uppercase', KIND_TAG_STYLES[highlight.kind])}>
                {KIND_SHORT_LABELS[highlight.kind]}
              </span>
            )}
          </Line>
        );
      })}
    </>
  );
}

function ArrayLeaf({
  depth,
  keyLabel,
  arrayPath,
  items,
  trailingComma,
  highlight,
  highlights,
}: {
  depth: number;
  keyLabel: string;
  arrayPath: string;
  items: unknown[];
  trailingComma: boolean;
  highlight?: FieldDiff;
  highlights?: HighlightMap;
}) {
  const [expanded, setExpanded] = useState(false);
  const highlightClass = highlight ? KIND_LINE_STYLES[highlight.kind] : undefined;

  return (
    <div>
      <Line depth={depth} highlightClass={highlightClass}>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex min-w-0 flex-1 items-start gap-0.5 text-left"
        >
          <ChevronRight className={cn('mt-0.5 size-3 shrink-0 text-muted-foreground transition-transform', expanded && 'rotate-90')} />
          <span className="min-w-0 flex-1 break-all">
            <KeyLabel k={keyLabel} />{' '}
            {expanded ? '[' : (
              <span className="text-muted-foreground italic">
                [{items.length} item{items.length === 1 ? '' : 's'}]
              </span>
            )}
            {!expanded && trailingComma ? ',' : ''}
          </span>
        </button>
        {highlight && (
          <span className={cn('ml-2 shrink-0 text-[0.65rem] font-semibold tracking-wide uppercase', KIND_TAG_STYLES[highlight.kind])}>
            {KIND_SHORT_LABELS[highlight.kind]}
          </span>
        )}
      </Line>
      {expanded && (
        <>
          {items.map((item, i) => (
            <Line key={i} depth={depth + 1}>
              <PlainValue
                value={item}
                depth={depth + 1}
                trailingComma={i < items.length - 1}
                arrayPath={arrayPath}
                itemIndex={i}
                subPath=""
                highlights={highlights}
              />
            </Line>
          ))}
          <Line depth={depth}>
            {']'}
            {trailingComma ? ',' : ''}
          </Line>
        </>
      )}
    </div>
  );
}

/**
 * Recursive pretty-printer for array element content. When `arrayPath`/`itemIndex` are
 * given, object leaves are checked against the highlight map at
 * `${arrayPath}[${itemIndex}].${subPath}` — the same path shape item-level FieldDiffs
 * use — so a captured item's specific failing field lights up, same as top-level fields.
 * Nested arrays within an item aren't diffed further (one-level scope cut), so they
 * render plainly regardless of highlights.
 */
function PlainValue({
  value,
  depth,
  trailingComma,
  arrayPath,
  itemIndex,
  subPath,
  highlights,
}: {
  value: unknown;
  depth: number;
  trailingComma: boolean;
  arrayPath?: string;
  itemIndex?: number;
  subPath?: string;
  highlights?: HighlightMap;
}) {
  const canHighlight = arrayPath !== undefined && itemIndex !== undefined;

  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) {
      return (
        <span className="text-foreground">
          {'{}'}
          {trailingComma ? ',' : ''}
        </span>
      );
    }
    return (
      <span className="min-w-0 flex-1 break-all">
        {'{'}
        {entries.map(([key, val], i) => {
          const nextSubPath = subPath ? `${subPath}.${key}` : key;
          const fullPath = canHighlight ? `${arrayPath}[${itemIndex}].${nextSubPath}` : undefined;
          const highlight = fullPath ? highlights?.get(fullPath) : undefined;
          return (
            <div
              key={key}
              className={cn('rounded-sm', highlight && KIND_LINE_STYLES[highlight.kind])}
              style={{ paddingLeft: '1rem' }}
            >
              <span className="min-w-0 flex-1 break-all">
                <KeyLabel k={key} />{' '}
                <PlainValue
                  value={val}
                  depth={depth + 1}
                  trailingComma={i < entries.length - 1}
                  arrayPath={arrayPath}
                  itemIndex={itemIndex}
                  subPath={nextSubPath}
                  highlights={highlights}
                />
              </span>
              {highlight && (
                <span
                  className={cn('ml-2 shrink-0 text-[0.65rem] font-semibold tracking-wide uppercase', KIND_TAG_STYLES[highlight.kind])}
                >
                  {KIND_SHORT_LABELS[highlight.kind]}
                </span>
              )}
            </div>
          );
        })}
        {'}'}
        {trailingComma ? ',' : ''}
      </span>
    );
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return (
        <span className="text-foreground">
          []{trailingComma ? ',' : ''}
        </span>
      );
    }
    return (
      <span className="min-w-0 flex-1 break-all">
        {'['}
        {value.map((item, i) => (
          <div key={i} style={{ paddingLeft: '1rem' }}>
            <PlainValue value={item} depth={depth + 1} trailingComma={i < value.length - 1} />
          </div>
        ))}
        {']'}
        {trailingComma ? ',' : ''}
      </span>
    );
  }

  return (
    <span className="min-w-0 flex-1 break-all">
      <ValueText value={value} isPlaceholder={false} />
      {trailingComma ? ',' : ''}
    </span>
  );
}

function Line({ depth, highlightClass, children }: { depth: number; highlightClass?: string; children: React.ReactNode }) {
  return (
    <div
      className={cn('flex items-start px-1.5 py-px -mx-1.5 rounded-sm', highlightClass)}
      style={{ paddingLeft: `${depth * 1 + 0.375}rem` }}
    >
      {children}
    </div>
  );
}

function KeyLabel({ k }: { k: string }) {
  return <span className="text-muted-foreground">&quot;{k}&quot;:</span>;
}

function ValueText({ value, isPlaceholder }: { value: unknown; isPlaceholder: boolean }) {
  if (isPlaceholder) {
    return <span className="text-muted-foreground italic">{value as string}</span>;
  }
  if (value === null) return <span className="text-muted-foreground">null</span>;
  if (value === undefined) return <span className="text-muted-foreground">—</span>;
  if (typeof value === 'string') return <span className="text-foreground">&quot;{value}&quot;</span>;
  return <span className="text-foreground">{JSON.stringify(value)}</span>;
}
