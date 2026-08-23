"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";

// A single button that opens a dropdown of row actions (details, edit,
// cancel, delete, ...) instead of spreading them out as separate text links
// across the row. Built on Radix's DropdownMenu — it portals the panel to
// <body> and repositions itself against the trigger with real collision
// detection, so it can never end up anchored to the wrong box the way a
// hand-rolled `position: fixed` calculation could (see the `.card`
// transform bug fixed in globals.css). Content isn't restricted to
// DropdownMenu.Item — several actions here carry their own confirm()/async
// pending/error state, so plain buttons styled with `rowActionButtonClass`
// are used instead, staying mounted (and the menu open) through that flow.
export function RowActionsMenu({ children, label = "פעולות" }: { children: React.ReactNode; label?: string }) {
  return (
    <DropdownMenu.Root dir="rtl">
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-transparent text-muted transition-colors hover:border-border hover:bg-background hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 data-[state=open]:border-border data-[state=open]:bg-background data-[state=open]:text-foreground"
          title={label}
          aria-label={label}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="6" r="1.4" fill="currentColor" stroke="none" />
            <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
            <circle cx="12" cy="18" r="1.4" fill="currentColor" stroke="none" />
          </svg>
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          collisionPadding={8}
          className="popover-panel z-50 min-w-[10rem] rounded-xl border border-border bg-surface p-1.5 text-right shadow-lg"
          onCloseAutoFocus={(e) => e.preventDefault()}
        >
          <div className="flex flex-col gap-0.5">{children}</div>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

type Tone = "default" | "primary" | "warning" | "danger";

const TONE_CLASS: Record<Tone, string> = {
  default: "text-foreground",
  primary: "text-primary",
  warning: "text-warning",
  danger: "text-danger",
};

// Shared look for a plain <button> living inside RowActionsMenu — bigger
// touch target and a hover fill instead of the small underlined text links
// this replaced.
export function rowActionButtonClass(tone: Tone = "default"): string {
  return `flex w-full items-center justify-end rounded-lg px-3 py-2 text-sm font-medium transition-colors hover:bg-background disabled:cursor-not-allowed disabled:opacity-50 ${TONE_CLASS[tone]}`;
}
