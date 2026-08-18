"use client";

// Shared by every checks/transfers table across the checks page (issued
// checks, overdue checks/transfers, the issuance queue, etc.) so a given
// bank account always reads with the same color and the same grouping
// behavior no matter which table it shows up in.

// Splits a section's rows into one group per bank account instead of one
// flat list, so it's obvious at a glance which bank each batch is coming
// out of.
export function groupByBank<T extends { bank_name: string | null; account_number: string | null }>(
  rows: T[],
): [string, T[]][] {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const key = `${row.bank_name ?? "?"} (${row.account_number ?? "?"})`;
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
}

// A fixed, high-contrast palette (not just the theme's --primary/--accent,
// which would make every bank look the same) mapped deterministically by
// bank label so the same account always gets the same color across every
// section on the page, without storing a color anywhere.
const BANK_COLORS = [
  { dot: "bg-sky-500", border: "border-sky-500" },
  { dot: "bg-amber-500", border: "border-amber-500" },
  { dot: "bg-emerald-500", border: "border-emerald-500" },
  { dot: "bg-rose-500", border: "border-rose-500" },
  { dot: "bg-violet-500", border: "border-violet-500" },
  { dot: "bg-teal-500", border: "border-teal-500" },
  { dot: "bg-orange-500", border: "border-orange-500" },
  { dot: "bg-pink-500", border: "border-pink-500" },
];

export function bankColorFor(label: string) {
  let hash = 0;
  for (let i = 0; i < label.length; i++) hash = (hash * 31 + label.charCodeAt(i)) >>> 0;
  return BANK_COLORS[hash % BANK_COLORS.length];
}

// Heading for one bank-account group, shared by every grouped checks/
// transfers table so the same bank reads with the same color dot + border
// stripe everywhere on the page.
export function BankGroupHeading({ label, count, unit }: { label: string; count: number; unit: string }) {
  const color = bankColorFor(label);
  return (
    <h3 className="flex items-center gap-2 text-sm font-semibold text-muted mb-1">
      <span className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${color.dot}`} />
      {label} — {count} {unit}
    </h3>
  );
}
