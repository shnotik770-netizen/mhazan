"use client";

import { useEffect, useRef, useState } from "react";

// A single "⌄" button that opens a dropdown of row actions (details, edit,
// cancel, delete, ...) instead of spreading them out as separate text links
// across the row — same fixed-position-escapes-overflow-clipping trick as
// the column filter dropdown, since every data table on this site scrolls
// horizontally. Stays open after clicking an action inside it (only the
// outside-click catcher or the ✕ closes it) so an action's own pending/error
// state next to its button doesn't get yanked out from under the user mid-flight.
export function RowActionsMenu({ children, label = "פעולות" }: { children: React.ReactNode; label?: string }) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open || !buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const panelWidth = 176; // matches w-44 below
    const left = Math.min(Math.max(8, rect.right - panelWidth), window.innerWidth - panelWidth - 8);
    setCoords({ top: rect.bottom + 4, left });
  }, [open]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="rounded p-1 text-muted hover:text-foreground hover:bg-background"
        title={label}
        aria-label={label}
        aria-expanded={open}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && coords && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            className="fixed z-50 w-44 rounded-lg border border-border bg-surface p-2 shadow-lg text-right"
            style={{ top: coords.top, left: coords.left }}
          >
            <div className="flex items-center justify-end mb-1">
              <button type="button" className="text-xs text-muted" onClick={() => setOpen(false)}>
                ✕
              </button>
            </div>
            <div className="flex flex-col items-start gap-1.5">{children}</div>
          </div>
        </>
      )}
    </>
  );
}
