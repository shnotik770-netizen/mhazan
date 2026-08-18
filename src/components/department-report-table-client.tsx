"use client";

import { formatCurrency, formatDate } from "@/lib/format";
import { useSortFilter, SortFilterTh, type ColumnDef } from "@/components/sortable-table";

type Row = { id: string; date: string | null; description: string; amount: number };

export function DepartmentTransactionsTable({ rows }: { rows: Row[] }) {
  const columns: ColumnDef<Row>[] = [
    { key: "date", label: "תאריך", sortValue: (r) => r.date ?? "" },
    { key: "description", label: "תיאור", sortValue: (r) => r.description, filterValue: (r) => r.description },
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
        {filtered.map((r) => (
          <tr key={r.id}>
            <td>{r.date ? formatDate(r.date) : "—"}</td>
            <td>{r.description}</td>
            <td className={r.amount >= 0 ? "text-success" : "text-danger"}>{formatCurrency(r.amount)}</td>
          </tr>
        ))}
        {filtered.length === 0 && (
          <tr>
            <td colSpan={3} className="text-center text-muted py-6">
              אין תנועות
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}
