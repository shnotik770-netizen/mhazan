"use client";

import { useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { Command as CommandPrimitive } from "cmdk";

export type SearchableOption = { id: string; label: string };

// A type-ahead picker instead of a native <select> — on a long options list
// (departments, bank accounts) a native select pops open as a full list
// covering the screen; this filters as you type, like the payee
// autocomplete, and only ever shows a short filtered list under the input.
// Built on Radix Popover (portaled, real collision detection — never
// anchors to the wrong box the way a hand-rolled `position: fixed`
// calculation could) + cmdk for keyboard navigation (arrow keys / Enter),
// which the previous version didn't have at all.
export function SearchableSelect({
  value,
  onChange,
  options,
  placeholder,
  className,
  required,
}: {
  value: string;
  onChange: (id: string) => void;
  options: SearchableOption[];
  placeholder?: string;
  className?: string;
  required?: boolean;
}) {
  const selected = options.find((o) => o.id === value) ?? null;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  function handleOpenChange(next: boolean) {
    if (next) setQuery(selected?.label ?? "");
    setOpen(next);
  }

  function pick(option: SearchableOption) {
    onChange(option.id);
    setOpen(false);
  }

  const filtered = query.trim()
    ? options.filter((o) => o.label.toLowerCase().includes(query.trim().toLowerCase()))
    : options;

  return (
    <CommandPrimitive shouldFilter={false} className="contents">
      <Popover.Root open={open} onOpenChange={handleOpenChange}>
        <Popover.Anchor asChild>
          <CommandPrimitive.Input
            value={open ? query : (selected?.label ?? "")}
            onValueChange={(v) => {
              setQuery(v);
              if (v === "") onChange("");
            }}
            onFocus={() => handleOpenChange(true)}
            placeholder={placeholder}
            required={required && !value}
            className={className ?? "rounded border border-border bg-transparent px-2 py-1 text-sm"}
          />
        </Popover.Anchor>
        <Popover.Portal>
          <Popover.Content
            dir="rtl"
            align="start"
            sideOffset={6}
            collisionPadding={8}
            onOpenAutoFocus={(e) => e.preventDefault()}
            className="popover-panel z-50 w-[var(--radix-popover-trigger-width)] overflow-hidden rounded-xl border border-border bg-surface shadow-lg"
          >
            {query.trim() && (
              <p className="border-b border-border px-3 py-1.5 text-xs text-muted">
                {filtered.length} מתוך {options.length} תוצאות
              </p>
            )}
            <CommandPrimitive.List className="max-h-60 overflow-y-auto p-1">
              {filtered.length > 0 ? (
                filtered.map((o) => (
                  <CommandPrimitive.Item
                    key={o.id}
                    value={o.id}
                    onSelect={() => pick(o)}
                    className="cursor-pointer rounded-lg px-3 py-2 text-right text-sm data-[selected=true]:bg-background aria-selected:bg-background"
                  >
                    {o.label}
                  </CommandPrimitive.Item>
                ))
              ) : (
                <p className="px-3 py-2 text-sm text-muted">אין תוצאות</p>
              )}
            </CommandPrimitive.List>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </CommandPrimitive>
  );
}
