"use client";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

// Ctrl+; (a common "insert today" shortcut in spreadsheets) fills today's
// date, since native <input type="date"> pickers are otherwise several
// clicks away from "today."
export function DateInput({
  value,
  onChange,
  className,
  title,
  required,
}: {
  value: string;
  onChange: (value: string) => void;
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
      onKeyDown={(e) => {
        if (e.ctrlKey && e.key === ";") {
          e.preventDefault();
          onChange(todayIso());
        }
      }}
      className={className ?? "rounded border border-border bg-transparent px-2 py-1 text-sm"}
    />
  );
}
