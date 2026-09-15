'use client';

import { Plus, Trash2 } from 'lucide-react';
import type { InteractionStep } from '@/lib/types';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const NEW_STEP: InteractionStep = { action: 'click', target: { by: 'text', value: '' }, label: '' };

/**
 * Controlled editor for a click template's interaction steps. v1: every step is a click;
 * the target is matched by visible text (default) or a raw CSS selector.
 */
export function StepsEditor({
  value,
  onChange,
}: {
  value: InteractionStep[];
  onChange: (next: InteractionStep[]) => void;
}) {
  function patch(
    idx: number,
    next: { label?: string; target?: Partial<InteractionStep['target']> }
  ) {
    onChange(
      value.map((step, i) =>
        i !== idx
          ? step
          : {
              ...step,
              ...(next.label !== undefined ? { label: next.label } : {}),
              target: { ...step.target, ...next.target },
            }
      )
    );
  }

  return (
    <div className="space-y-2">
      <Label>Steps to run — clicked in order</Label>
      <p className="text-xs text-muted-foreground">
        The cookie banner is accepted automatically first. Use the scan above to pick from the page&apos;s own
        buttons and links, or add a step by hand (match by visible text, or a CSS selector).
      </p>

      {value.length === 0 && (
        <p className="rounded-sm border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
          No steps yet. Scan the page and add the elements to click, or add one manually below.
        </p>
      )}

      <div className="space-y-2">
        {value.map((step, idx) => (
          <div key={idx} className="rounded-sm border border-border bg-muted/30 p-3">
            <div className="flex items-start gap-2">
              <span className="mt-2 shrink-0 text-xs font-medium text-muted-foreground">{idx + 1}</span>
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Select
                    value={step.target.by}
                    onValueChange={(by) => patch(idx, { target: { by: by as 'text' | 'css' } })}
                  >
                    <SelectTrigger size="sm" className="w-36">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="text">Match by text</SelectItem>
                      <SelectItem value="css">CSS selector</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    value={step.target.value}
                    onChange={(e) => patch(idx, { target: { value: e.target.value } })}
                    placeholder={step.target.by === 'css' ? '.property-cta__call' : 'Book a viewing'}
                    className="h-8 min-w-0 flex-1 font-mono text-xs"
                  />
                </div>
                <Input
                  value={step.label ?? ''}
                  onChange={(e) => patch(idx, { label: e.target.value })}
                  placeholder="Label (optional) — e.g. Open the viewing form"
                  className="h-8 text-xs"
                />
              </div>
              <button
                type="button"
                onClick={() => onChange(value.filter((_, i) => i !== idx))}
                className="mt-1.5 shrink-0 text-muted-foreground hover:text-destructive"
                aria-label={`Remove step ${idx + 1}`}
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={() => onChange([...value, { ...NEW_STEP }])}
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <Plus className="size-3.5" />
        Add step
      </button>
    </div>
  );
}

/** Read-only summary of steps — used on the run form and run detail. */
export function StepsSummary({ steps }: { steps: InteractionStep[] }) {
  return (
    <ol className="space-y-1 text-xs text-muted-foreground">
      {steps.map((step, idx) => (
        <li key={idx}>
          {idx + 1}. Click{' '}
          <span className="font-mono text-foreground">
            {step.label?.trim() ? step.label : step.target.value}
          </span>{' '}
          <span className="opacity-70">({step.target.by === 'css' ? 'CSS' : 'text'})</span>
        </li>
      ))}
    </ol>
  );
}

/** Drops blank labels and empty-valued steps — call before persisting. */
export function cleanSteps(steps: InteractionStep[]): InteractionStep[] {
  return steps
    .filter((s) => s.target.value.trim() !== '')
    .map((s) => ({
      action: 'click' as const,
      target: { by: s.target.by, value: s.target.value.trim() },
      ...(s.label?.trim() ? { label: s.label.trim() } : {}),
    }));
}
