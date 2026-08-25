"use client";

import { useEffect, useState } from "react";
import {
  getCheckSpreadDetail,
  getCheckStatusHistory,
  getExpensesByPayee,
  type CheckAllocationInput,
  type CheckSpreadDetail,
  type CheckSpreadRow,
  type CheckStatusHistoryRow,
  type PayeeExpenseRow,
} from "@/app/(app)/checks/actions";
import { EditDeleteCheckRow } from "@/components/checks-client";
import { Modal } from "@/components/modal";
import { rowActionButtonClass } from "@/components/row-actions-menu";
import { useSortFilter, SortFilterTh, type ColumnDef } from "@/components/sortable-table";
import { formatCurrency, formatDate } from "@/lib/format";
import type { Tables } from "@/lib/supabase/database.types";

function statusLabel(status: string) {
  if (status === "CLEARED") return "נפרע";
  if (status === "CANCELLED") return "בוטל";
  return "לא נפרע";
}

// A "פרטים" trigger next to a check row — opens the full picture: if the
// check is part of a spread (several checks under one spread_id, whether
// from splitting one request or merging several), every sibling check and
// its department split, not just the row that was clicked. `variant="menu"`
// renders it as a full-width row-action-menu button instead of the default
// small underlined link, for callers that place it inside RowActionsMenu.
export function CheckDetailLink({ checkId, variant = "link" }: { checkId: string; variant?: "link" | "menu" }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={variant === "menu" ? rowActionButtonClass("primary") : "text-xs text-primary underline whitespace-nowrap"}
      >
        פרטים
      </button>
      {open && <CheckDetailModal checkId={checkId} onClose={() => setOpen(false)} />}
    </>
  );
}

function CheckDetailModal({ checkId, onClose }: { checkId: string; onClose: () => void }) {
  const [detail, setDetail] = useState<CheckSpreadDetail | null>(null);
  const [history, setHistory] = useState<CheckStatusHistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const [result, historyRows] = await Promise.all([getCheckSpreadDetail(checkId), getCheckStatusHistory(checkId)]);
      if (cancelled) return;
      if (result.error) setError(result.error);
      else setDetail(result.detail ?? null);
      setHistory(historyRows);
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [checkId]);

  const isSpread = (detail?.spreadRows.length ?? 0) > 1;
  const total = detail?.spreadRows.reduce((sum, r) => sum + r.amount, 0) ?? 0;

  // For a spread, what matters is how much each department gets across the
  // whole spread — not the (usually identical) per-check split repeated on
  // every row — so it's aggregated once here instead of read off each row.
  const totalsByDepartment = new Map<string, number>();
  if (isSpread) {
    for (const r of detail?.spreadRows ?? []) {
      if (r.departmentName) {
        totalsByDepartment.set(r.departmentName, (totalsByDepartment.get(r.departmentName) ?? 0) + r.amount);
      } else if (r.allocations.length > 0) {
        for (const a of r.allocations) {
          const name = a.departmentName ?? "?";
          totalsByDepartment.set(name, (totalsByDepartment.get(name) ?? 0) + a.amount);
        }
      } else {
        totalsByDepartment.set("בהמתנה לסיווג", (totalsByDepartment.get("בהמתנה לסיווג") ?? 0) + r.amount);
      }
    }
  }

  return (
    <Modal onClose={onClose}>
      <div className="card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">
            פרטי {detail?.check.payment_method === "TRANSFER" ? "העברה" : "צ׳ק"}
            {isSpread ? " — פריסה" : ""}
          </h2>
          <button type="button" onClick={onClose} className="text-sm text-muted">
            סגור
          </button>
        </div>
        <div className="space-y-3">
          {loading && <p className="text-sm text-muted">טוען...</p>}
          {error && <p className="text-sm text-danger">{error}</p>}
          {detail && (
            <>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-muted">מוטב: </span>
                  {detail.check.payee}
                </div>
                <div>
                  <span className="text-muted">חשבון בנק: </span>
                  {detail.check.bankName} ({detail.check.accountNumber})
                </div>
                {detail.check.notes && (
                  <div className="col-span-2">
                    <span className="text-muted">הערות: </span>
                    {detail.check.notes}
                  </div>
                )}
              </div>
              {isSpread && (
                <>
                  <p className="text-xs text-muted">
                    פריסה של {detail.spreadRows.length} תשלומים לספק זה — סה״כ {formatCurrency(total)}
                  </p>
                  <div>
                    <p className="text-sm font-semibold mb-1">סיכום לפי מחלקה — כל הפריסה</p>
                    <div className="overflow-x-auto">
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>מחלקה</th>
                            <th>סה״כ בפריסה</th>
                          </tr>
                        </thead>
                        <tbody>
                          {[...totalsByDepartment.entries()].map(([name, sum]) => (
                            <tr key={name}>
                              <td className={name === "בהמתנה לסיווג" ? "text-warning" : undefined}>{name}</td>
                              <td className="font-semibold">{formatCurrency(sum)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  <p className="text-sm font-semibold mb-1">פירוט לפי צ׳ק</p>
                </>
              )}
              <div className="overflow-x-auto">
                <SpreadRowsTable rows={detail.spreadRows} highlightId={checkId} isSpread={isSpread} />
              </div>
              {history.length > 0 && (
                <div>
                  <p className="text-sm font-semibold mb-1">היסטוריית סטטוס</p>
                  <div className="overflow-x-auto">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>מתי</th>
                          <th>שינוי</th>
                          <th>מי</th>
                        </tr>
                      </thead>
                      <tbody>
                        {history.map((h) => (
                          <tr key={h.id}>
                            <td className="text-xs">{new Date(h.changedAt).toLocaleString("he-IL")}</td>
                            <td className="text-xs">
                              {h.oldStatus
                                ? `מ"${statusLabel(h.oldStatus)}" ל"${statusLabel(h.newStatus)}"`
                                : `נוצר כ"${statusLabel(h.newStatus)}"`}
                            </td>
                            <td className="text-xs">{h.changedByName ?? "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}

function SpreadRowsTable({ rows, highlightId, isSpread }: { rows: CheckSpreadRow[]; highlightId: string; isSpread: boolean }) {
  const columns: ColumnDef<CheckSpreadRow>[] = [
    { key: "check_number", label: "מס׳ צ׳ק", sortValue: (r) => r.check_number ?? "" },
    { key: "amount", label: "סכום", sortValue: (r) => r.amount },
    { key: "due_date", label: "תאריך", sortValue: (r) => r.due_date ?? "" },
    { key: "status", label: "סטטוס", sortValue: (r) => statusLabel(r.status), filterValue: (r) => statusLabel(r.status) },
    ...(!isSpread
      ? [
          {
            key: "department",
            label: "מחלקה",
            sortValue: (r: CheckSpreadRow) => r.departmentName ?? "",
            filterValue: (r: CheckSpreadRow) => r.departmentName ?? "—",
          } satisfies ColumnDef<CheckSpreadRow>,
        ]
      : []),
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
          <tr key={r.id} className={r.id === highlightId ? "bg-primary/5" : ""}>
            <td>{r.check_number ?? "—"}</td>
            <td>{formatCurrency(r.amount)}</td>
            <td>{r.due_date ? formatDate(r.due_date) : "—"}</td>
            <td>{statusLabel(r.status)}</td>
            {!isSpread && (
              <td>
                {r.departmentName ? (
                  r.departmentName
                ) : r.allocations.length > 0 ? (
                  <span className="text-xs">
                    מפוצל: {r.allocations.map((a) => `${a.departmentName ?? "?"} (${formatCurrency(a.amount)})`).join(", ")}
                  </span>
                ) : (
                  <span className="text-warning">בהמתנה</span>
                )}
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// Payee name rendered as a link — opens every approved expense for that
// payee. `departmentId`, when passed (e.g. from inside one department's
// report), narrows this to that department only, even for an admin who
// could otherwise see it across the whole system.
export function PayeeLink({ payee, departmentId }: { payee: string; departmentId?: string }) {
  const [open, setOpen] = useState(false);
  if (!payee) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-primary underline decoration-dotted hover:decoration-solid text-right"
      >
        {payee}
      </button>
      {open && <PayeeExpensesModal payee={payee} departmentId={departmentId} onClose={() => setOpen(false)} />}
    </>
  );
}

function PayeeExpensesModal({ payee, departmentId, onClose }: { payee: string; departmentId?: string; onClose: () => void }) {
  const [rows, setRows] = useState<PayeeExpenseRow[]>([]);
  const [departments, setDepartments] = useState<Tables<"departments">[]>([]);
  const [allocationsByCheck, setAllocationsByCheck] = useState<Record<string, CheckAllocationInput[]>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const result = await getExpensesByPayee(payee, departmentId);
      if (cancelled) return;
      setRows(result.rows);
      setDepartments(result.departments);
      setAllocationsByCheck(result.allocationsByCheck);
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [payee, departmentId]);

  const total = rows.reduce((sum, r) => sum + r.amount, 0);
  const spreadTotals = new Map<string, number>();
  for (const r of rows) {
    if (!r.spread_id) continue;
    spreadTotals.set(r.spread_id, (spreadTotals.get(r.spread_id) ?? 0) + r.amount);
  }

  return (
    <Modal onClose={onClose}>
      <div className="card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">כל ההוצאות עבור: {payee}</h2>
          <button type="button" onClick={onClose} className="text-sm text-muted">
            סגור
          </button>
        </div>
        <div className="space-y-3">
          {loading && <p className="text-sm text-muted">טוען...</p>}
          {!loading && (
            <>
              <p className="text-sm text-muted">
                {rows.length} הוצאות — סה״כ {formatCurrency(total)}
              </p>
              <div className="overflow-x-auto">
                <PayeeExpensesTable
                  rows={rows}
                  payee={payee}
                  spreadTotals={spreadTotals}
                  departments={departments}
                  allocationsByCheck={allocationsByCheck}
                />
              </div>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}

function PayeeExpensesTable({
  rows,
  payee,
  spreadTotals,
  departments,
  allocationsByCheck,
}: {
  rows: PayeeExpenseRow[];
  payee: string;
  spreadTotals: Map<string, number>;
  departments: Tables<"departments">[];
  allocationsByCheck: Record<string, CheckAllocationInput[]>;
}) {
  const columns: ColumnDef<PayeeExpenseRow>[] = [
    { key: "due_date", label: "תאריך", sortValue: (r) => r.due_date ?? "" },
    { key: "amount", label: "סכום", sortValue: (r) => r.amount },
    {
      key: "payment_method",
      label: "אמצעי",
      sortValue: (r) => r.payment_method,
      filterValue: (r) => (r.payment_method === "TRANSFER" ? "העברה" : "צ׳ק"),
    },
    { key: "check_number", label: "מס׳ צ׳ק", sortValue: (r) => r.check_number ?? "" },
    { key: "department", label: "מחלקה", sortValue: (r) => r.departmentName ?? "", filterValue: (r) => r.departmentName ?? "בהמתנה" },
    { key: "category", label: "קטגוריה", sortValue: (r) => r.categoryName ?? "", filterValue: (r) => r.categoryName ?? "—" },
    { key: "status", label: "סטטוס", sortValue: (r) => statusLabel(r.status), filterValue: (r) => statusLabel(r.status) },
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
          <th></th>
        </tr>
      </thead>
      <tbody>
        {sorted.map((r) => (
          <tr key={r.id}>
            <td>{r.due_date ? formatDate(r.due_date) : "—"}</td>
            <td>{formatCurrency(r.amount)}</td>
            <td>{r.payment_method === "TRANSFER" ? "העברה" : "צ׳ק"}</td>
            <td>
              {r.check_number ?? "—"}
              {r.spread_id && (
                <span className="badge bg-background text-muted mr-1">
                  פריסה · סה״כ {formatCurrency(spreadTotals.get(r.spread_id) ?? 0)}
                </span>
              )}
            </td>
            <td>{r.departmentName ?? <span className="text-warning">בהמתנה</span>}</td>
            <td>{r.categoryName ?? "—"}</td>
            <td>{statusLabel(r.status)}</td>
            <td className="flex items-center gap-2">
              <CheckDetailLink checkId={r.id} />
              <EditDeleteCheckRow
                checkId={r.id}
                payee={payee}
                amount={r.amount}
                dueDate={r.due_date}
                checkNumber={r.check_number}
                departmentId={r.department_id}
                notes={r.notes}
                paymentMethod={r.payment_method}
                existingAllocations={allocationsByCheck[r.id] ?? []}
                departments={departments}
              />
            </td>
          </tr>
        ))}
        {sorted.length === 0 && (
          <tr>
            <td colSpan={8} className="text-center text-muted py-4">
              {rows.length === 0 ? "אין הוצאות" : "אין תוצאות"}
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}
