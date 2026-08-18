"use client";

import { formatCurrency, formatDate } from "@/lib/format";
import { useSortFilter, SortFilterTh, type ColumnDef } from "@/components/sortable-table";

type BalanceRow = {
  debtorName: string;
  creditorName: string;
  netAmount: number;
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
          <tr key={i}>
            <td>{row.debtorName}</td>
            <td>{row.creditorName}</td>
            <td className="font-semibold">{formatCurrency(row.netAmount)}</td>
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

type OpenEntryRow = {
  id: string;
  createdAt: string;
  amount: number;
  fromName: string;
  toName: string;
};

export function LedgerOpenEntriesTable({ rows }: { rows: OpenEntryRow[] }) {
  const columns: ColumnDef<OpenEntryRow>[] = [
    { key: "date", label: "תאריך", sortValue: (r) => r.createdAt },
    { key: "from", label: "ממחלקה (חייב)", sortValue: (r) => r.fromName, filterValue: (r) => r.fromName },
    { key: "to", label: "למחלקה (זכאי)", sortValue: (r) => r.toName, filterValue: (r) => r.toName },
    { key: "amount", label: "סכום", sortValue: (r) => r.amount },
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
        {filtered.map((row) => (
          <tr key={row.id}>
            <td>{formatDate(row.createdAt)}</td>
            <td>{row.fromName}</td>
            <td>{row.toName}</td>
            <td>{formatCurrency(row.amount)}</td>
          </tr>
        ))}
        {filtered.length === 0 && (
          <tr>
            <td colSpan={4} className="text-center text-muted py-6">
              אין תנועות פתוחות
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}
