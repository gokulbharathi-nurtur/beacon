"use client"

import * as React from "react"
import { Combobox as ComboboxPrimitive } from "@base-ui/react/combobox"
import { ChevronDownIcon, CheckIcon } from "lucide-react"

import { cn } from "@/lib/utils"

export interface ComboboxOption {
  value: string
  label: string
}

/**
 * Searchable single-select. Type to filter; nothing is selected until the user picks an
 * option. Styled to match the plain <Select> trigger/popup.
 */
export function Combobox({
  options,
  value,
  onValueChange,
  placeholder = "Search…",
  emptyText = "No matches.",
  id,
  className,
}: {
  options: ComboboxOption[]
  value: string | null
  onValueChange: (value: string | null) => void
  placeholder?: string
  emptyText?: string
  id?: string
  className?: string
}) {
  const labelFor = React.useCallback(
    (v: string) => options.find((o) => o.value === v)?.label ?? "",
    [options]
  )

  return (
    <ComboboxPrimitive.Root
      items={options.map((o) => o.value)}
      value={value}
      onValueChange={(v) => onValueChange(v)}
      itemToStringLabel={labelFor}
    >
      <div className={cn("relative", className)}>
        <ComboboxPrimitive.Input
          id={id}
          placeholder={placeholder}
          className="flex h-8 w-full items-center justify-between rounded-sm border border-input bg-transparent py-2 pr-8 pl-2.5 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30"
        />
        <ComboboxPrimitive.Icon className="absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground">
          <ChevronDownIcon className="size-4" />
        </ComboboxPrimitive.Icon>
      </div>
      <ComboboxPrimitive.Portal>
        <ComboboxPrimitive.Positioner sideOffset={4} className="isolate z-50">
          <ComboboxPrimitive.Popup className="max-h-[min(var(--available-height),20rem)] w-[var(--anchor-width)] min-w-36 overflow-y-auto rounded-sm bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10">
            <ComboboxPrimitive.Empty className="px-2 py-1.5 text-sm text-muted-foreground">
              {emptyText}
            </ComboboxPrimitive.Empty>
            <ComboboxPrimitive.List>
              {(itemValue: string) => (
                <ComboboxPrimitive.Item
                  key={itemValue}
                  value={itemValue}
                  className="relative flex w-full cursor-default items-center gap-1.5 rounded-sm py-1 pr-8 pl-1.5 text-sm outline-hidden select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground"
                >
                  <ComboboxPrimitive.ItemIndicator className="absolute right-2 flex size-4 items-center justify-center">
                    <CheckIcon className="size-4" />
                  </ComboboxPrimitive.ItemIndicator>
                  {labelFor(itemValue)}
                </ComboboxPrimitive.Item>
              )}
            </ComboboxPrimitive.List>
          </ComboboxPrimitive.Popup>
        </ComboboxPrimitive.Positioner>
      </ComboboxPrimitive.Portal>
    </ComboboxPrimitive.Root>
  )
}
