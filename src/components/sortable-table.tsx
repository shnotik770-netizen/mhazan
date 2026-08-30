"use client";

import { useMemo, useRef, useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { usePortalContainer } from "@/lib/use-portal-container";

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
  // Extra class on the <th> — currently only used to narrow a column for
  // print (see globals.css's print-narrow-col rule).
  thClassName?: string;
};

export type SortState = { key: string; dir: "asc" | "desc" } | null;

export function useSortFilter<T>(rows: T[], columns: ColumnDef<T>[], initialSort: SortState = null) {
  const [sort, setSort] = useState<SortState>(initialSort);
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
  const filterTriggerRef = useRef<HTMLButtonElement>(null);
  const container = usePortalContainer(filterTriggerRef);
  const options = useMemo(() => {
    if (!col.filterValue) return [];
    return Array.from(new Set(allRows.map((r) => col.filterValue!(r)))).sort((a, b) => a.localeCompare(b, "he"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allRows]);

  const isSorted = sort?.key === col.key;
  const isFiltered = Boolean(activeFilter && activeFilter.size > 0);

  return (
    <th className={`select-none ${col.thClassName ?? ""}`}>
      <div className="flex items-center gap-1">
        {col.sortValue ? (
          <button
            type="button"
            onClick={() => toggleSort(col.key)}
            className="flex items-center gap-1 rounded px-1 py-0.5 hover:bg-background hover:text-foreground"
            title="מיין"
          >
            {col.label}
            <span className={`sort-indicator text-[10px] ${isSorted ? "text-primary" : "text-muted/50"}`}>
              {isSorted ? (sort!.dir === "asc" ? "▲" : "▼") : "▲▼"}
            </span>
          </button>
        ) : (
          <span>{col.label}</span>
        )}
        {col.filterValue && (
          <Popover.Root open={open} onOpenChange={setOpen}>
            <Popover.Trigger asChild>
              <button
                ref={filterTriggerRef}
                type="button"
                className={`filter-trigger inline-flex h-6 w-6 items-center justify-center rounded transition-colors hover:bg-background hover:text-foreground ${
                  isFiltered ? "text-primary" : "text-muted/60"
                }`}
                title="סנן"
                aria-label={`סנן לפי ${col.label}`}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 5h16l-6 8v6l-4-2v-4z" />
                </svg>
              </button>
            </Popover.Trigger>
            <Popover.Portal container={container}>
              <Popover.Content
                dir="rtl"
                align="start"
                sideOffset={6}
                collisionPadding={8}
                className="popover-panel z-50 w-56 rounded-xl border border-border bg-surface p-2.5 text-right font-normal shadow-lg"
              >
                <div className="mb-1.5 flex items-center justify-between">
                  <button
                    type="button"
                    className="text-xs font-medium text-primary underline"
                    onClick={() => setColumnFilter(col.key, null)}
                  >
                    נקה סינון
                  </button>
                  <Popover.Close className="rounded p-0.5 text-muted hover:bg-background hover:text-foreground" aria-label="סגור">
                    ✕
                  </Popover.Close>
                </div>
                {isFiltered && (
                  <p className="mb-1.5 text-[11px] text-muted">
                    {allRows.filter((r) => activeFilter!.has(col.filterValue!(r))).length} מתוך {allRows.length} שורות
                  </p>
                )}
                <div className="max-h-52 space-y-0.5 overflow-y-auto">
                  {options.map((opt) => {
                    const checked = !activeFilter || activeFilter.has(opt);
                    return (
                      <label
                        key={opt}
                        className="flex items-center gap-2 rounded-lg px-1.5 py-1 text-xs font-normal hover:bg-background cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            const next = new Set(activeFilter ?? options);
                            if (e.target.checked) next.add(opt);
                            else next.delete(opt);
                            setColumnFilter(col.key, next.size === options.length ? null : next);
                          }}
                          className="h-4 w-4 accent-[var(--primary)]"
                        />
                        <span className="truncate">{opt || "(ריק)"}</span>
                      </label>
                    );
                  })}
                </div>
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>
        )}
      </div>
    </th>
  );
}
