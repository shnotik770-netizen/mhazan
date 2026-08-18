"use client";

import { formatCurrency } from "@/lib/format";
import { useSortFilter, SortFilterTh, type ColumnDef } from "@/components/sortable-table";

type BalanceRow = {
  debtorName: string;
  creditorName: string;
  netAmount: number;
  // True when the creditor side is the central/hub department — i.e. this
  // row is money owed TO us, not by us — so it can be flagged clearly.
  owedToHub: boolean;
};

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
            <td className={row.owedToHub ? "text-danger font-semibold" : undefined}>{row.debtorName}</td>
            <td>{row.creditorName}</td>
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
