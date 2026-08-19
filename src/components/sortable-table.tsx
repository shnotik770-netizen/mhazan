"use client";

import { useEffect, useMemo, useRef, useState } from "react";

// Shared "Excel-style" column header behavior: click to sort (asc → desc →
// none), and an optional dropdown with a checkbox list of the column's
// distinct values to filter by. One hook computes the processed rows, one
// component renders the header cell — every table wires its own column
// list against its own row shape, so this makes no assumption about what
// a "row" looks like beyond what each column's accessor functions return.
export type ColumnDef<T> = {
  key: string;
  label: string;
  // Omit to make the column display-only (no sort arrow).
  sortValue?: (row: T) => string | number | null;
  // Omit to make the column not filterable (no funnel icon/dropdown).
  filterValue?: (row: T) => string;
};

export type SortState = { key: string; dir: "asc" | "desc" } | null;

export function useSortFilter<T>(rows: T[], columns: ColumnDef<T>[]) {
  const [sort, setSort] = useState<SortState>(null);
  const [filters, setFilters] = useState<Record<string, Set<string>>>({});

  function toggleSort(key: string) {
    setSort((prev) => {
      if (!prev || prev.key !== key) return { key, dir: "asc" };
      if (prev.dir === "asc") return { key, dir: "desc" };
      return null;
    });
  }

  function setColumnFilter(key: string, values: Set<string> | null) {
    setFilters((prev) => {
      const next = { ...prev };
      if (!values || values.size === 0) delete next[key];
      else next[key] = values;
      return next;
    });
  }

  const filtered = useMemo(() => {
    const activeKeys = Object.keys(filters);
    if (activeKeys.length === 0) return rows;
    return rows.filter((row) =>
      activeKeys.every((key) => {
        const col = columns.find((c) => c.key === key);
        if (!col?.filterValue) return true;
        return filters[key].has(col.filterValue(row));
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, filters]);

  const sorted = useMemo(() => {
    if (!sort) return filtered;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.sortValue) return filtered;
    const withKey = filtered.map((row) => ({ row, v: col.sortValue!(row) }));
    withKey.sort((a, b) => {
      if (a.v == null && b.v == null) return 0;
      if (a.v == null) return 1;
      if (b.v == null) return -1;
      if (a.v < b.v) return sort.dir === "asc" ? -1 : 1;
      if (a.v > b.v) return sort.dir === "asc" ? 1 : -1;
      return 0;
    });
    return withKey.map((x) => x.row);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, sort]);

  return { rows: sorted, sort, toggleSort, filters, setColumnFilter, hasActiveFilters: Object.keys(filters).length > 0, clearAll: () => { setFilters({}); setSort(null); } };
}

export function SortFilterTh<T>({
  col,
  allRows,
  sort,
  toggleSort,
  activeFilter,
  setColumnFilter,
}: {
  col: ColumnDef<T>;
  allRows: T[];
  sort: SortState;
  toggleSort: (key: string) => void;
  activeFilter: Set<string> | undefined;
  setColumnFilter: (key: string, values: Set<string> | null) => void;
  }) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const options = useMemo(() => {
    if (!col.filterValue) return [];
    return Array.from(new Set(allRows.map((r) => col.filterValue!(r)))).sort((a, b) => a.localeCompare(b, "he"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allRows]);

  // A table wrapped in overflow-x-auto (every data table on this site is)
  // implicitly clips overflow-y too — a dropdown positioned absolute
  // relative to its <th> gets cut off or garbled on narrow screens where
  // the table scrolls. Anchoring it as position:fixed from the trigger
  // button's actual screen coordinates escapes that clipping entirely.
  useEffect(() => {
    if (!open || !buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const panelWidth = 208; // matches w-52 below
    const left = Math.min(Math.max(8, rect.left), window.innerWidth - panelWidth - 8);
    setCoords({ top: rect.bottom + 4, left });
  }, [open]);

  const isSorted = sort?.key === col.key;
  const isFiltered = Boolean(activeFilter && activeFilter.size > 0);

  return (
    <th className="select-none">
      <div className="flex items-center gap-1">
        {col.sortValue ? (
          <button
            type="button"
            onClick={() => toggleSort(col.key)}
            className="flex items-center gap-1 hover:text-foreground"
            title="מיין"
          >
            {col.label}
            <span className={`text-[10px] ${isSorted ? "text-primary" : "text-muted/50"}`}>
              {isSorted ? (sort!.dir === "asc" ? "▲" : "▼") : "▲▼"}
            </span>
          </button>
        ) : (
          <span>{col.label}</span>
        )}
        {col.filterValue && (
          <button
            ref={buttonRef}
            type="button"
            onClick={() => setOpen((o) => !o)}
            className={`text-xs ${isFiltered ? "text-primary" : "text-muted/50"} hover:text-foreground`}
            title="סנן"
          >
            ⏷
          </button>
        )}
      </div>
      {open && col.filterValue && coords && (
        <>
          {/* Invisible full-screen catcher so clicking anywhere outside the
              dropdown closes it, without needing a global click listener. */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            className="fixed z-50 w-52 rounded-lg border border-border bg-surface p-2 shadow-lg text-right font-normal"
            style={{ top: coords.top, left: coords.left }}
            onClick={(e) => e.stopPropagation()}
          >
          <div className="flex items-center justify-between mb-1 text-xs">
            <button
              type="button"
              className="text-primary underline"
              onClick={() => {
                setColumnFilter(col.key, null);
                setOpen(false);
              }}
            >
              נקה סינון
            </button>
            <button type="button" className="text-muted" onClick={() => setOpen(false)}>
              ✕
            </button>
          </div>
          {isFiltered && (
            <p className="mb-1 text-[11px] text-muted">
              {allRows.filter((r) => activeFilter!.has(col.filterValue!(r))).length} מתוך {allRows.length} שורות
            </p>
          )}
          <div className="max-h-48 overflow-y-auto space-y-1">
            {options.map((opt) => {
              const checked = !activeFilter || activeFilter.has(opt);
              return (
                <label key={opt} className="flex items-center gap-1.5 text-xs font-normal cursor-pointer">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => {
                      const next = new Set(activeFilter ?? options);
                      if (e.target.checked) next.add(opt);
                      else next.delete(opt);
                      setColumnFilter(col.key, next.size === options.length ? null : next);
                    }}
                  />
                  <span className="truncate">{opt || "(ריק)"}</span>
                </label>
              );
            })}
          </div>
          </div>
        </>
      )}
    </th>
  );
}
