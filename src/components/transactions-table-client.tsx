"use client";

import { useSortFilter, SortFilterTh, type ColumnDef } from "@/components/sortable-table";
import { formatCurrency, formatDate } from "@/lib/format";

export type UnifiedRow = {
  id: string;
  date: string | null;
  direction: "INCOME" | "EXPENSE";
  description: string;
  amount: number;
  departmentId: string | null;
  departmentName: string | null;
  categoryId: string | null;
  categoryName: string | null;
  sourceKey: "INCOME" | "CHECK" | "TRANSFER" | "MANUAL";
  source: string;
  status: string | null;
};

export function TransactionsTable({ rows }: { rows: UnifiedRow[] }) {
  const columns: ColumnDef<UnifiedRow>[] = [
    { key: "date", label: "תאריך", sortValue: (r) => r.date ?? "" },
    {
      key: "direction",
      label: "סוג",
      sortValue: (r) => (r.direction === "INCOME" ? 0 : 1),
      filterValue: (r) => (r.direction === "INCOME" ? "הכנסה" : "הוצאה"),
    },
    { key: "source", label: "מקור", sortValue: (r) => r.source, filterValue: (r) => r.source },
    { key: "description", label: "תיאור", sortValue: (r) => r.description },
    { key: "category", label: "קטגוריה", sortValue: (r) => r.categoryName ?? "", filterValue: (r) => r.categoryName ?? "—" },
    { key: "department", label: "מחלקה", sortValue: (r) => r.departmentName ?? "", filterValue: (r) => r.departmentName ?? "—" },
    { key: "status", label: "סטטוס", sortValue: (r) => r.status ?? "", filterValue: (r) => r.status ?? "—" },
    { key: "amount", label: "סכום", sortValue: (r) => r.amount },
  ];
  const { rows: sorted, sort, toggleSort, filters, setColumnFilter } = useSortFilter(rows, columns);

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
        {sorted.map((r) => (
          <tr key={r.id}>
            <td>{r.date ? formatDate(r.date) : <span className="text-muted">ללא תאריך</span>}</td>
            <td>
              <span className={r.direction === "INCOME" ? "text-success" : "text-danger"}>
                {r.direction === "INCOME" ? "הכנסה" : "הוצאה"}
              </span>
            </td>
            <td>{r.source}</td>
            <td>{r.description}</td>
            <td>{r.categoryName ?? "—"}</td>
            <td>{r.departmentName ?? "—"}</td>
            <td>{r.status ?? "—"}</td>
            <td className={r.direction === "INCOME" ? "text-success" : "text-danger"}>{formatCurrency(r.amount)}</td>
          </tr>
        ))}
        {sorted.length === 0 && (
          <tr>
            <td colSpan={8} className="text-center text-muted py-6">
              אין תנועות התואמות את הסינון
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}
