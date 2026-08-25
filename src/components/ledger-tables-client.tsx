"use client";

import Link from "next/link";
import { formatCurrency } from "@/lib/format";
import { useSortFilter, SortFilterTh, type ColumnDef } from "@/components/sortable-table";

type BalanceRow = {
  debtorId: string | null;
  debtorName: string;
  creditorId: string | null;
  creditorName: string;
  netAmount: number;
  // True when the creditor side is the central/hub department — i.e. this
  // row is money owed TO us, not by us — so it can be flagged clearly.
  owedToHub: boolean;
};

type NetPositionRow = {
  departmentId: string;
  departmentName: string;
  // Positive = other departments owe this one overall; negative = this
  // department owes overall — a single figure per department instead of
  // the full pairwise breakdown, so "who's in the red" reads at a glance.
  netAmount: number;
};

export function LedgerNetPositionTable({ rows }: { rows: NetPositionRow[] }) {
  const columns: ColumnDef<NetPositionRow>[] = [
    { key: "department", label: "מחלקה", sortValue: (r) => r.departmentName, filterValue: (r) => r.departmentName },
    { key: "amount", label: "סכום שהיא חייבת / חייבים לה", sortValue: (r) => r.netAmount },
  ];
  const { rows: filtered, sort, toggleSort, filters, setColumnFilter } = useSortFilter(rows, columns, {
    key: "amount",
    dir: "asc",
  });

  return (
    <table className="data-table">
      <thead>
        <tr>
          {columns.map((col) => (
            <SortFilterTh
              key={col.key}
              col={col}
              allRows={rows}
              sort={sort}
              toggleSort={toggleSort}
              activeFilter={filters[col.key]}
              setColumnFilter={setColumnFilter}
            />
          ))}
        </tr>
      </thead>
      <tbody>
        {filtered.map((row) => (
          <tr key={row.departmentId}>
            <td>
              <Link href={`/ledger?department=${row.departmentId}`} className="underline decoration-dotted hover:decoration-solid">
                {row.departmentName}
              </Link>
            </td>
            <td className={`font-semibold ${row.netAmount > 0 ? "text-success" : row.netAmount < 0 ? "text-danger" : ""}`}>
              {row.netAmount > 0
                ? `זכאית ${formatCurrency(row.netAmount)}`
                : row.netAmount < 0
                  ? `חייבת ${formatCurrency(-row.netAmount)}`
                  : "מאוזן"}
            </td>
          </tr>
        ))}
        {filtered.length === 0 && (
          <tr>
            <td colSpan={2} className="text-center text-muted py-6">
              אין יתרות פתוחות בין מחלקות
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

export function LedgerBalancesTable({ rows }: { rows: BalanceRow[] }) {
  const columns: ColumnDef<BalanceRow>[] = [
    { key: "debtor", label: "חייב", sortValue: (r) => r.debtorName, filterValue: (r) => r.debtorName },
    { key: "creditor", label: "זכאי", sortValue: (r) => r.creditorName, filterValue: (r) => r.creditorName },
    { key: "amount", label: "סכום נטו", sortValue: (r) => r.netAmount },
  ];
  const { rows: filtered, sort, toggleSort, filters, setColumnFilter } = useSortFilter(rows, columns);

  return (
    <table className="data-table">
      <thead>
        <tr>
          {columns.map((col) => (
            <SortFilterTh
              key={col.key}
              col={col}
              allRows={rows}
              sort={sort}
              toggleSort={toggleSort}
              activeFilter={filters[col.key]}
              setColumnFilter={setColumnFilter}
            />
          ))}
        </tr>
      </thead>
      <tbody>
        {filtered.map((row, i) => (
          <tr key={i} className={row.owedToHub ? "bg-danger-bg" : undefined}>
            <td className={row.owedToHub ? "text-danger font-semibold" : undefined}>
              {row.debtorId ? (
                <Link href={`/ledger?department=${row.debtorId}`} className="underline decoration-dotted hover:decoration-solid">
                  {row.debtorName}
                </Link>
              ) : (
                row.debtorName
              )}
            </td>
            <td>
              {row.creditorId ? (
                <Link href={`/ledger?department=${row.creditorId}`} className="underline decoration-dotted hover:decoration-solid">
                  {row.creditorName}
                </Link>
              ) : (
                row.creditorName
              )}
            </td>
            <td className={`font-semibold ${row.owedToHub ? "text-danger" : ""}`}>{formatCurrency(row.netAmount)}</td>
          </tr>
        ))}
        {filtered.length === 0 && (
          <tr>
            <td colSpan={3} className="text-center text-muted py-6">
              אין יתרות פתוחות בין מחלקות
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}
