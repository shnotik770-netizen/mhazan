"use client";

import { useEffect, useRef, useState } from "react";

export type SearchableOption = { id: string; label: string };

// A type-ahead picker instead of a native <select> — on a long options list
// (departments, bank accounts) a native select pops open as a full list
// covering the screen; this filters as you type, like the payee
// autocomplete, and only ever shows a short filtered list under the input.
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
  const [query, setQuery] = useState(selected?.label ?? "");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{ top: number; left: number; width: number } | null>(null);

  // Resync the displayed text when `value` changes from outside (e.g. a
  // parent resetting the form) — adjusted during render, per React's
  // guidance, instead of in an effect that would cause an extra render.
  const [syncedValue, setSyncedValue] = useState(value);
  if (value !== syncedValue) {
    setSyncedValue(value);
    setQuery(selected?.label ?? "");
  }

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery(selected?.label ?? "");
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [selected]);

  const filtered = query.trim()
    ? options.filter((o) => o.label.toLowerCase().includes(query.trim().toLowerCase()))
    : options;

  // Same fix as the table filter dropdowns: a list positioned `absolute`
  // relative to this input gets clipped or garbled whenever an ancestor
  // scrolls (a modal's own overflow-y-auto, a table's overflow-x-auto) —
  // especially on mobile. Anchoring it as position:fixed from the input's
  // real screen coordinates escapes that clipping entirely, and it's
  // recomputed on every keystroke since the input can move as validation
  // text above/below it appears or the page scrolls to keep it in view.
  useEffect(() => {
    if (!open || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const left = Math.min(Math.max(8, rect.left), window.innerWidth - rect.width - 8);
    setCoords({ top: rect.bottom + 4, left, width: rect.width });
  }, [open, query, filtered.length]);

  function pick(option: SearchableOption) {
    onChange(option.id);
    setQuery(option.label);
    setOpen(false);
  }

  return (
    <div ref={containerRef} className="relative">
      <input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          if (e.target.value === "") onChange("");
        }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        required={required && !value}
        className={className ?? "rounded border border-border bg-transparent px-2 py-1 text-sm"}
      />
      {open && coords && (
        <div
          className="fixed z-50 overflow-hidden rounded-lg border border-border bg-surface shadow-lg"
          style={{ top: coords.top, left: coords.left, width: Math.max(coords.width, 180) }}
        >
          {query.trim() && (
            <p className="border-b border-border px-3 py-1 text-xs text-muted">
              {filtered.length} מתוך {options.length} תוצאות
            </p>
          )}
          {filtered.length > 0 ? (
            <ul className="max-h-56 overflow-y-auto">
              {filtered.map((o) => (
                <li key={o.id}>
                  <button
                    type="button"
                    onClick={() => pick(o)}
                    className="block w-full px-3 py-1.5 text-right text-sm hover:bg-background"
                  >
                    {o.label}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-3 py-2 text-sm text-muted">אין תוצאות</p>
          )}
        </div>
      )}
    </div>
  );
}
