'use client';

import { MoreHorizontal, X } from 'lucide-react';
import type { FieldClassification, LeafType } from '@/lib/types';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

export interface FieldRulesValue {
  allowEmpty?: boolean;
  expectedCount?: number;
  containsText?: string;
  matchesPattern?: string;
  excludesPattern?: string;
  oneOf?: string[];
}

type RuleOption = 'allowEmpty' | 'expectedCount' | 'containsText' | 'matchesPattern' | 'excludesPattern' | 'oneOf';

const OPTIONS_BY_TYPE: Partial<Record<LeafType, RuleOption[]>> = {
  string: ['allowEmpty', 'containsText', 'matchesPattern', 'excludesPattern', 'oneOf'],
  array: ['allowEmpty', 'expectedCount'],
};

const RULE_LABELS: Record<RuleOption, string> = {
  allowEmpty: 'Allow empty',
  expectedCount: 'Expected count',
  containsText: 'Contains text',
  matchesPattern: 'Matches pattern (regex)',
  excludesPattern: "Doesn't match pattern (regex)",
  oneOf: 'One of a set of values',
};

function isValidRegex(pattern: string): boolean {
  try {
    new RegExp(pattern);
    return true;
  } catch {
    return false;
  }
}

function isActive(opt: RuleOption, value: FieldRulesValue): boolean {
  if (opt === 'allowEmpty') return !!value.allowEmpty;
  if (opt === 'expectedCount') return value.expectedCount !== undefined;
  if (opt === 'containsText') return value.containsText !== undefined;
  if (opt === 'matchesPattern') return value.matchesPattern !== undefined;
  if (opt === 'excludesPattern') return value.excludesPattern !== undefined;
  return value.oneOf !== undefined;
}

function removePatch(opt: RuleOption): FieldRulesValue {
  if (opt === 'allowEmpty') return { allowEmpty: false };
  if (opt === 'expectedCount') return { expectedCount: undefined };
  if (opt === 'containsText') return { containsText: undefined };
  if (opt === 'matchesPattern') return { matchesPattern: undefined };
  if (opt === 'excludesPattern') return { excludesPattern: undefined };
  return { oneOf: undefined };
}

function addPatch(opt: RuleOption): FieldRulesValue {
  if (opt === 'allowEmpty') return { allowEmpty: true };
  if (opt === 'expectedCount') return { expectedCount: 1 };
  if (opt === 'containsText') return { containsText: '' };
  if (opt === 'matchesPattern') return { matchesPattern: '' };
  if (opt === 'excludesPattern') return { excludesPattern: '' };
  return { oneOf: [] };
}

/**
 * Compact per-field editor for the optional structural refinements (allow empty, exact
 * array count, string contains/matches-pattern/excludes-pattern/one-of-a-set) — active
 * ones show as removable, editable chips; a "..." menu adds whichever type-applicable
 * options aren't already active, and offers a "Remove" entry for whichever are — an
 * alternative to the chip's own small ✕, both do the same thing. Keeps the field-rule
 * table from growing a new column every time we add another optional check.
 */
export function FieldRulesMenu({
  type,
  classification,
  value,
  onChange,
}: {
  type: LeafType;
  classification: FieldClassification;
  value: FieldRulesValue;
  onChange: (patch: FieldRulesValue) => void;
}) {
  const available = classification === 'structural' ? (OPTIONS_BY_TYPE[type] ?? []) : [];
  if (available.length === 0) {
    return <span className="text-xs text-muted-foreground">n/a</span>;
  }

  const addable = available.filter((opt) => !isActive(opt, value));
  const removable = available.filter((opt) => isActive(opt, value));

  return (
    <div className="flex flex-wrap items-center gap-1">
      {value.allowEmpty && <Chip label="may be empty" onRemove={() => onChange({ allowEmpty: false })} />}

      {value.expectedCount !== undefined && (
        <ChipWithInput
          prefix="count ="
          onRemove={() => onChange({ expectedCount: undefined })}
          input={
            <input
              type="number"
              min={0}
              value={value.expectedCount}
              onChange={(e) => onChange({ expectedCount: Math.max(0, Number(e.target.value)) })}
              className="w-10 rounded bg-transparent text-foreground outline-none"
            />
          }
        />
      )}

      {value.containsText !== undefined && (
        <ChipWithInput
          prefix="contains"
          onRemove={() => onChange({ containsText: undefined })}
          input={
            <input
              type="text"
              value={value.containsText}
              placeholder="text…"
              onChange={(e) => onChange({ containsText: e.target.value })}
              className="w-20 rounded bg-transparent text-foreground outline-none placeholder:text-muted-foreground/60"
            />
          }
        />
      )}

      {value.matchesPattern !== undefined && (
        <PatternChip
          prefix="matches /"
          value={value.matchesPattern}
          onChange={(v) => onChange({ matchesPattern: v })}
          onRemove={() => onChange({ matchesPattern: undefined })}
        />
      )}

      {value.excludesPattern !== undefined && (
        <PatternChip
          prefix="excludes /"
          value={value.excludesPattern}
          onChange={(v) => onChange({ excludesPattern: v })}
          onRemove={() => onChange({ excludesPattern: undefined })}
        />
      )}

      {value.oneOf !== undefined && (
        <OneOfChip value={value.oneOf} onChange={(v) => onChange({ oneOf: v })} onRemove={() => onChange({ oneOf: undefined })} />
      )}

      {(addable.length > 0 || removable.length > 0) && (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="ghost" size="icon-xs" className="text-muted-foreground">
                <MoreHorizontal className="size-3.5" />
              </Button>
            }
          />
          <DropdownMenuContent align="start">
            {addable.map((opt) => (
              <DropdownMenuItem key={opt} onClick={() => onChange(addPatch(opt))}>
                {RULE_LABELS[opt]}…
              </DropdownMenuItem>
            ))}
            {addable.length > 0 && removable.length > 0 && <DropdownMenuSeparator />}
            {removable.map((opt) => (
              <DropdownMenuItem key={opt} variant="destructive" onClick={() => onChange(removePatch(opt))}>
                Remove: {RULE_LABELS[opt]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}

function Chip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-muted py-0.5 pr-1 pl-2 text-xs text-muted-foreground">
      {label}
      <button type="button" onClick={onRemove} className="rounded-full p-0.5 hover:text-foreground">
        <X className="size-3" />
      </button>
    </span>
  );
}

function ChipWithInput({
  prefix,
  input,
  onRemove,
  invalid,
}: {
  prefix: string;
  input: React.ReactNode;
  onRemove: () => void;
  invalid?: boolean;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full bg-muted py-0.5 pr-1 pl-2 text-xs text-muted-foreground',
        invalid && 'ring-1 ring-status-critical'
      )}
    >
      {prefix}
      {input}
      <button type="button" onClick={onRemove} className="rounded-full p-0.5 hover:text-foreground">
        <X className="size-3" />
      </button>
    </span>
  );
}

/** A contains-style chip whose input is a regex source — flags invalid syntax immediately, before save. */
function PatternChip({
  prefix,
  value,
  onChange,
  onRemove,
}: {
  prefix: string;
  value: string;
  onChange: (value: string) => void;
  onRemove: () => void;
}) {
  const invalid = value !== '' && !isValidRegex(value);
  return (
    <div className="flex flex-col gap-0.5">
      <ChipWithInput
        prefix={prefix}
        onRemove={onRemove}
        invalid={invalid}
        input={
          <>
            <input
              type="text"
              value={value}
              placeholder="pattern…"
              onChange={(e) => onChange(e.target.value)}
              className="w-24 rounded bg-transparent font-mono text-foreground outline-none placeholder:font-sans placeholder:text-muted-foreground/60"
            />
            <span>/</span>
          </>
        }
      />
      {invalid && <span className="pl-2 text-[0.65rem] text-status-critical">invalid regex</span>}
    </div>
  );
}

/** A comma-separated list of allowed values, e.g. "sales, lettings" — parsed to string[] on change. */
function OneOfChip({ value, onChange, onRemove }: { value: string[]; onChange: (value: string[]) => void; onRemove: () => void }) {
  const text = value.join(', ');
  return (
    <ChipWithInput
      prefix="one of"
      onRemove={onRemove}
      input={
        <input
          type="text"
          value={text}
          placeholder="sales, lettings…"
          onChange={(e) => onChange(e.target.value.split(',').map((v) => v.trim()))}
          className="w-32 rounded bg-transparent text-foreground outline-none placeholder:text-muted-foreground/60"
        />
      }
    />
  );
}
