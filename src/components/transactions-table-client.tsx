"use client";

import { useState } from "react";
import { useSortFilter, SortFilterTh, type ColumnDef } from "@/components/sortable-table";
import { formatCurrency, formatDate } from "@/lib/format";
import { InvoiceFlagToggle } from "@/components/invoice-flag-toggle-client";
import { Modal } from "@/components/modal";
import { RowActionsMenu, rowActionButtonClass } from "@/components/row-actions-menu";
import { CancelAndReplaceCheckButton, CancelCheckButton } from "@/components/checks-client";
import { EditExpenseForm, type ExpenseRow, type Option } from "@/components/expenses-client";
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
  // entries, where the concept doesn't apply.
  checkId: string | null;
  bankAccountId: string | null;
  hasInvoice: boolean | null;
  // Exactly one of these is set, matching sourceKey — the full raw data
  // an admin's edit form needs, which the display columns above don't
  // carry (e.g. the composed `description` isn't the raw donor/payee name).
  incomeEdit: IncomeEditRow | null;
  expenseEdit: ExpenseRow | null;
};

function invoiceLabel(r: UnifiedRow): string {
  if (r.hasInvoice === null) return "—";
  return r.hasInvoice ? "יש חשבונית" : "אין חשבונית";
}

type BankAccount = { id: string; bank_name: string; account_number: string };

export function TransactionsTable({
  rows,
  isAdmin,
  departments,
  categories,
  bankAccounts,
}: {
  rows: UnifiedRow[];
  isAdmin: boolean;
  departments: Option[];
  categories: Option[];
  bankAccounts: BankAccount[];
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
    { key: "status", label: "סטטוס", sortValue: (r) => r.status ?? "", filterValue: (r) => r.status ?? "—" },
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
              <td>{r.status ?? "—"}</td>
              <td>
                {r.hasInvoice === null ? (
                  "—"
                ) : isAdmin && r.checkId ? (
                  <InvoiceFlagToggle checkId={r.checkId} hasInvoice={r.hasInvoice} />
                ) : r.hasInvoice ? (
                  "יש חשבונית"
                ) : (
                  "אין חשבונית"
                )}
              </td>
              <td className={r.direction === "INCOME" ? "text-success" : "text-danger"}>{formatCurrency(r.amount)}</td>
              {isAdmin && (
                <td>
                  <RowActionsMenu>
                    <button type="button" onClick={() => setEditRow(r)} className={rowActionButtonClass("primary")}>
                      עריכה
                    </button>
                    {r.checkId && r.status !== "CANCELLED" && (
                      <>
                        <CancelCheckButton checkId={r.checkId} variant="menu" />
                        <CancelAndReplaceCheckButton
                          checkId={r.checkId}
                          payee={r.expenseEdit?.payeeName ?? ""}
                          amount={r.amount}
                          currentPaymentMethod={r.expenseEdit?.paymentMethod ?? null}
                          currentDueDate={r.date}
                          currentBankAccountId={r.bankAccountId}
                          bankAccounts={bankAccounts}
                          variant="menu"
                        />
                      </>
                    )}
                  </RowActionsMenu>
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
      {editRow && editRow.expenseEdit && (
        <Modal onClose={() => setEditRow(null)}>
          <EditExpenseForm
            row={editRow.expenseEdit}
            departments={departments}
            categories={categories}
            onClose={() => setEditRow(null)}
          />
        </Modal>
      )}
    </>
  );
}
