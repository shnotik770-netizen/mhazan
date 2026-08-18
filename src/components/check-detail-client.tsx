"use client";

import { useEffect, useState } from "react";
import {
  getCheckSpreadDetail,
  getExpensesByPayee,
  type CheckAllocationInput,
  type CheckSpreadDetail,
  type PayeeExpenseRow,
} from "@/app/(app)/checks/actions";
import { EditDeleteCheckRow } from "@/components/checks-client";
import { Modal } from "@/components/modal";
import { formatCurrency, formatDate } from "@/lib/format";
import type { Tables } from "@/lib/supabase/database.types";

function statusLabel(status: string) {
  if (status === "CLEARED") return "נפרע";
  if (status === "CANCELLED") return "בוטל";
  return "לא נפרע";
}

// A small "פרטים" link next to a check row — opens the full picture: if
// the check is part of a spread (several checks under one spread_id,
// whether from splitting one request or merging several), every sibling
// check and its department split, not just the row that was clicked.
export function CheckDetailLink({ checkId }: { checkId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="text-xs text-primary underline whitespace-nowrap">
        פרטים
      </button>
      {open && <CheckDetailModal checkId={checkId} onClose={() => setOpen(false)} />}
    </>
  );
}

function CheckDetailModal({ checkId, onClose }: { checkId: string; onClose: () => void }) {
  const [detail, setDetail] = useState<CheckSpreadDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const result = await getCheckSpreadDetail(checkId);
      if (cancelled) return;
      if (result.error) setError(result.error);
      else setDetail(result.detail ?? null);
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [checkId]);

  const isSpread = (detail?.spreadRows.length ?? 0) > 1;
  const total = detail?.spreadRows.reduce((sum, r) => sum + r.amount, 0) ?? 0;

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
                <p className="text-xs text-muted">
                  פריסה של {detail.spreadRows.length} תשלומים לספק זה — סה״כ {formatCurrency(total)}
                </p>
              )}
              <table className="data-table">
                <thead>
                  <tr>
                    <th>מס׳ צ׳ק</th>
                    <th>סכום</th>
                    <th>תאריך</th>
                    <th>סטטוס</th>
                    <th>מחלקה</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.spreadRows.map((r) => (
                    <tr key={r.id} className={r.id === checkId ? "bg-primary/5" : ""}>
                      <td>{r.check_number ?? "—"}</td>
                      <td>{formatCurrency(r.amount)}</td>
                      <td>{r.due_date ? formatDate(r.due_date) : "—"}</td>
                      <td>{statusLabel(r.status)}</td>
                      <td>
                        {r.departmentName ? (
                          r.departmentName
                        ) : r.allocations.length > 0 ? (
                          <span className="text-xs">
                            מפוצל:{" "}
                            {r.allocations.map((a) => `${a.departmentName ?? "?"} (${formatCurrency(a.amount)})`).join(", ")}
                          </span>
                        ) : (
                          <span className="text-warning">בהמתנה</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}

// Payee name rendered as a link — opens every approved expense for that
// payee across the whole system, not just the current table/section.
export function PayeeLink({ payee }: { payee: string }) {
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
      {open && <PayeeExpensesModal payee={payee} onClose={() => setOpen(false)} />}
    </>
  );
}

function PayeeExpensesModal({ payee, onClose }: { payee: string; onClose: () => void }) {
  const [rows, setRows] = useState<PayeeExpenseRow[]>([]);
  const [departments, setDepartments] = useState<Tables<"departments">[]>([]);
  const [allocationsByCheck, setAllocationsByCheck] = useState<Record<string, CheckAllocationInput[]>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const result = await getExpensesByPayee(payee);
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
  }, [payee]);

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
              <table className="data-table">
                <thead>
                  <tr>
                    <th>תאריך</th>
                    <th>סכום</th>
                    <th>אמצעי</th>
                    <th>מס׳ צ׳ק</th>
                    <th>מחלקה</th>
                    <th>קטגוריה</th>
                    <th>סטטוס</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
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
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={8} className="text-center text-muted py-4">
                        אין הוצאות
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
