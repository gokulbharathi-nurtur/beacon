'use client';

import { MousePointerClick } from 'lucide-react';
import type { ClickableElement } from '@/lib/capture/discoverClickables';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export function ClickableElementPicker({
  elements,
  selectedSelector,
  onSelect,
}: {
  elements: ClickableElement[];
  selectedSelector: string | null;
  onSelect: (element: ClickableElement) => void;
}) {
  if (elements.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
          <MousePointerClick className="size-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No clickable elements found on this page.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="max-h-[28rem] overflow-auto p-0">
      <ul className="divide-y divide-border">
        {elements.map((el) => {
          const active = el.selector === selectedSelector;
          return (
            <li key={el.selector}>
              <button
                type="button"
                onClick={() => onSelect(el)}
                className={cn(
                  'flex w-full items-center gap-3 px-4 py-3 text-left text-sm transition-colors hover:bg-muted/60',
                  active && 'bg-muted'
                )}
              >
                <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">{el.tag}</span>
                <span className="min-w-0 flex-1 truncate font-medium text-foreground">{el.label}</span>
                {el.href && <span className="max-w-[12rem] shrink-0 truncate text-xs text-muted-foreground">{el.href}</span>}
              </button>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
