"use client";

import type { FocusEventHandler, KeyboardEventHandler } from "react";
import { expandTwoDigitYear, todayIso } from "@/lib/format";

// Ctrl+; (a common "insert today" shortcut in spreadsheets) fills today's
// date, since native <input type="date"> pickers are otherwise several
// clicks away from "today." Also auto-corrects a 2-digit-year typo (see
// expandTwoDigitYear) the instant it's typed, instead of silently saving
// a date a couple thousand years off. `onBlur`/`onKeyDown` are optional
// passthroughs for callers that already need their own (e.g. save-on-blur,
// Enter-to-commit) — both run alongside this component's own handling
// rather than replacing it.
export function DateInput({
  value,
  onChange,
  onBlur,
  onKeyDown,
  className,
  title,
  required,
}: {
  value: string;
  onChange: (value: string) => void;
  onBlur?: FocusEventHandler<HTMLInputElement>;
  onKeyDown?: KeyboardEventHandler<HTMLInputElement>;
  className?: string;
  title?: string;
  required?: boolean;
}) {
  return (
    <input
      type="date"
      value={value}
      required={required}
      title={title ?? "Ctrl+; למילוי תאריך היום"}
      onChange={(e) => onChange(expandTwoDigitYear(e.target.value))}
      onBlur={onBlur}
      onKeyDown={(e) => {
        if (e.ctrlKey && e.key === ";") {
          e.preventDefault();
          onChange(todayIso());
          return;
        }
        onKeyDown?.(e);
      }}
      className={className ?? "rounded border border-border bg-transparent px-2 py-1 text-sm"}
    />
  );
}
