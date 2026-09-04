'use client';

import { FileText } from 'lucide-react';
import type { FormTarget } from '@/lib/capture/drivers/form';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export function FormPicker({
  forms,
  selectedSelector,
  onSelect,
}: {
  forms: FormTarget[];
  selectedSelector: string | null;
  onSelect: (form: FormTarget) => void;
}) {
  if (forms.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
          <FileText className="size-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No fillable forms found on this page.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="max-h-[28rem] overflow-auto p-0">
      <ul className="divide-y divide-border">
        {forms.map((form) => {
          const active = form.selector === selectedSelector;
          return (
            <li key={form.selector}>
              <button
                type="button"
                onClick={() => onSelect(form)}
                className={cn(
                  'flex w-full items-center gap-3 px-4 py-3 text-left text-sm transition-colors hover:bg-muted/60',
                  active && 'bg-muted'
                )}
              >
                <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
                  {form.fields.length} field{form.fields.length === 1 ? '' : 's'}
                </span>
                <span className="min-w-0 flex-1 truncate font-medium text-foreground">{form.label}</span>
                {!form.submitSelector && <span className="shrink-0 text-xs text-muted-foreground">no submit button found</span>}
              </button>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
