"use client";

import { useState } from "react";
import { useSortFilter, SortFilterTh, type ColumnDef } from "@/components/sortable-table";
import { formatCurrency, formatDate } from "@/lib/format";
import { Modal } from "@/components/modal";
import { RowActionsMenu, rowActionButtonClass } from "@/components/row-actions-menu";
import { type Option } from "@/components/expenses-client";
import { EditIncomeForm, type IncomeEditRow } from "@/components/income-edit-form-client";

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
  // Only checks/transfers carry an invoice flag — null for incomes/manual
  // entries, where the concept doesn't apply. Shown here read-only: editing
  // it, like cancel/cancel-and-replace and expense editing generally, lives
  // only on the dedicated "הוצאות" page now — this screen keeps editing for
  // incomes only.
  hasInvoice: boolean | null;
  // True for an income whose amount was auto-converted from USD to ILS —
  // rendered as a badge, same as in a department report.
  convertedFromUsd?: boolean;
  // Set only for an income row — the full raw data EditIncomeForm needs,
  // which the display columns above don't carry (e.g. the composed
  // `description` isn't the raw donor name).
  incomeEdit: IncomeEditRow | null;
};

function invoiceLabel(r: UnifiedRow): string {
  if (r.hasInvoice === null) return "—";
  return r.hasInvoice ? "יש חשבונית" : "אין חשבונית";
}

export function TransactionsTable({
  rows,
  isAdmin,
  categories,
}: {
  rows: UnifiedRow[];
  isAdmin: boolean;
  categories: Option[];
}) {
  const [editRow, setEditRow] = useState<UnifiedRow | null>(null);
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
    {
      key: "status",
      label: "סטטוס",
      sortValue: (r) => (r.convertedFromUsd ? "הומר מדולר" : (r.status ?? "")),
      filterValue: (r) => (r.convertedFromUsd ? "הומר מדולר" : (r.status ?? "—")),
    },
    { key: "invoice", label: "חשבונית", sortValue: (r) => invoiceLabel(r), filterValue: (r) => invoiceLabel(r) },
    { key: "amount", label: "סכום", sortValue: (r) => r.amount },
  ];
  const { rows: sorted, sort, toggleSort, filters, setColumnFilter } = useSortFilter(rows, columns);

  return (
    <>
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
            {isAdmin && <th></th>}
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
              <td>
                {r.convertedFromUsd ? (
                  <span className="badge bg-background text-muted">הומר מדולר</span>
                ) : (
                  (r.status ?? "—")
                )}
              </td>
              <td>{invoiceLabel(r)}</td>
              <td className={r.direction === "INCOME" ? "text-success" : "text-danger"}>{formatCurrency(r.amount)}</td>
              {isAdmin && (
                <td>
                  {r.incomeEdit && (
                    <RowActionsMenu>
                      <button type="button" onClick={() => setEditRow(r)} className={rowActionButtonClass("primary")}>
                        עריכה
                      </button>
                    </RowActionsMenu>
                  )}
                </td>
              )}
            </tr>
          ))}
          {sorted.length === 0 && (
            <tr>
              <td colSpan={isAdmin ? 10 : 9} className="text-center text-muted py-6">
                אין תנועות התואמות את הסינון
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {editRow && editRow.incomeEdit && (
        <Modal onClose={() => setEditRow(null)}>
          <EditIncomeForm row={editRow.incomeEdit} categories={categories} onClose={() => setEditRow(null)} />
        </Modal>
      )}
    </>
  );
}
