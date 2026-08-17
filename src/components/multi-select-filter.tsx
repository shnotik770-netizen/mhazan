"use client";

import { useState } from "react";

export type MultiSelectOption = { id: string; label: string };

// A checkbox-pill group standing in for a native multi-select: lets a
// filter bar select several values at once (e.g. several categories or
// several departments), while still submitting as a plain GET form —
// every checked value mirrors into a hidden input sharing `name`, so the
// server sees the usual repeated-query-param array.
export function MultiSelectFilter({
  name,
  label,
  options,
  defaultSelected,
}: {
  name: string;
  label: string;
  options: MultiSelectOption[];
  defaultSelected: string[];
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set(defaultSelected));

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div>
      <span className="block text-sm font-medium mb-1">{label}</span>
      <div className="flex flex-wrap gap-1 max-w-xs">
        {options.map((o) => (
          <label
            key={o.id}
            className={`rounded-full border px-2 py-1 text-xs cursor-pointer select-none ${
              selected.has(o.id) ? "border-primary bg-primary text-primary-foreground" : "border-border"
            }`}
          >
            <input type="checkbox" checked={selected.has(o.id)} onChange={() => toggle(o.id)} className="hidden" />
            {o.label}
          </label>
        ))}
        {options.length === 0 && <span className="text-xs text-muted">אין אפשרויות</span>}
      </div>
      {[...selected].map((id) => (
        <input key={id} type="hidden" name={name} value={id} />
      ))}
    </div>
  );
}
