"use client";

import { formatCurrency, formatDate } from "@/lib/format";
import { useSortFilter, SortFilterTh, type ColumnDef } from "@/components/sortable-table";
import { LedgerFlagToggle } from "@/components/ledger-flag-toggle-client";

type Row = {
  id: string;
  date: string | null;
  type: string;
  description: string;
  amount: number;
  spreadTotal?: number | null;
  status?: string | null;
  isOld: boolean;
  kind: "check" | "income" | "manual";
};

function statusLabel(status: string) {
  if (status === "CLEARED") return "נפרע";
  if (status === "CANCELLED") return "בוטל";
  return "לא נפרע";
}

export function DepartmentTransactionsTable({
  rows,
  isAdmin,
  defaultSortDir = "desc",
}: {
  rows: Row[];
  isAdmin: boolean;
  defaultSortDir?: "asc" | "desc";
}) {
  const columns: ColumnDef<Row>[] = [
    { key: "date", label: "תאריך", sortValue: (r) => r.date ?? "" },
    { key: "type", label: "סוג", sortValue: (r) => r.type, filterValue: (r) => r.type },
    { key: "description", label: "תיאור", sortValue: (r) => r.description, filterValue: (r) => r.description },
    { key: "amount", label: "סכום", sortValue: (r) => r.amount },
    {
      key: "status",
      label: "נפרע?",
      sortValue: (r) => (r.status ? statusLabel(r.status) : ""),
      filterValue: (r) => (r.status ? statusLabel(r.status) : "—"),
    },
  ];
  const { rows: filtered, sort, toggleSort, filters, setColumnFilter } = useSortFilter(rows, columns, {
    key: "date",
    dir: defaultSortDir,
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
          <th></th>
        </tr>
      </thead>
      <tbody>
        {filtered.map((r) => (
          <tr key={r.id} className={r.isOld ? "opacity-60" : undefined}>
            <td>{r.date ? formatDate(r.date) : "—"}</td>
            <td>{r.type}</td>
            <td>
              {r.description}
              {r.spreadTotal != null && (
                <span className="badge bg-background text-muted mr-1">פריסה · סה״כ {formatCurrency(r.spreadTotal)}</span>
              )}
              {r.isOld && <span className="badge bg-warning-bg text-warning mr-1">ישן — לא נכלל במאזן</span>}
            </td>
            <td className={r.amount >= 0 ? "text-success" : "text-danger"}>{formatCurrency(r.amount)}</td>
            <td>
              {r.status ? (
                <span
                  className={`badge ${
                    r.status === "CLEARED"
                      ? "bg-success-bg text-success"
                      : r.status === "CANCELLED"
                        ? "bg-background text-muted"
                        : "bg-warning-bg text-warning"
                  }`}
                >
                  {statusLabel(r.status)}
                </span>
              ) : (
                "—"
              )}
            </td>
            <td>
              {isAdmin && r.kind !== "manual" && <LedgerFlagToggle id={r.id} kind={r.kind} skipDepartmentLedger={r.isOld} />}
            </td>
          </tr>
        ))}
        {filtered.length === 0 && (
          <tr>
            <td colSpan={6} className="text-center text-muted py-6">
              אין תנועות
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}
