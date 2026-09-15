"use client";

import type { FocusEvent, KeyboardEventHandler } from "react";
import { expandTwoDigitYear, todayIso } from "@/lib/format";

// Ctrl+; (a common "insert today" shortcut in spreadsheets) fills today's
// date, since native <input type="date"> pickers are otherwise several
// clicks away from "today." On a Hebrew keyboard layout the same physical
// key needs Shift to produce ":" (unlike a US layout, where ";" is
// unshifted), and the browser reports that as e.key === ":" — so both keys
// are accepted rather than only the US-layout one.
//
// The 2-digit-year correction (see expandTwoDigitYear) is applied on BLUR,
// not on every keystroke: the browser fills a date input's year segment
// digit-by-digit as a 4-character shifting buffer ("2" -> "0002", "0" ->
// "0020", "2" -> "0202", "6" -> "2026"), and several of those in-progress
// states are themselves a 1-3 digit year. Correcting mid-typing rewrites
// the controlled value on every keystroke, which resets that buffer and
// corrupts whatever the user is still in the middle of typing (observed:
// typing "2026" landing on "2006"). Blur only fires once editing is done,
// so it catches the real mistake (a genuinely 2-digit year left in place)
// without interfering with a still-in-progress 4-digit entry.
//
// `onBlur` hands the caller the FINAL, already-corrected value directly
// (not the raw FocusEvent) — a caller that needs "the settled value once
// editing is done" (e.g. save-on-blur, cascading a date into later rows)
// would otherwise read `value` from its own closure or `e.target.value`,
// both of which are the PRE-correction value: the correction is applied
// here via `onChange`, which schedules a React state update that hasn't
// landed yet by the time a synchronously-called onBlur callback runs.
// Passing the corrected value as an argument sidesteps that stale-closure
// trap entirely. `onKeyDown` is a plain passthrough, run alongside this
// component's own handling rather than replacing it.
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
  onBlur?: (value: string, e: FocusEvent<HTMLInputElement>) => void;
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
      onChange={(e) => onChange(e.target.value)}
      onBlur={(e) => {
        const corrected = expandTwoDigitYear(e.target.value);
        if (corrected !== e.target.value) onChange(corrected);
        onBlur?.(corrected, e);
      }}
      onKeyDown={(e) => {
        if (e.ctrlKey && (e.key === ";" || e.key === ":")) {
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
