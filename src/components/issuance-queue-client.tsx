"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  groupChecksIntoSpread,
  mergeChecks,
  updateCheckDueDate,
  bulkAssignCheckNumbers,
  type CheckAllocationInput,
} from "@/app/(app)/checks/actions";
import { EditDeleteCheckRow, IssueCheckRow } from "@/components/checks-client";
import { Modal } from "@/components/modal";
import { formatCurrency, formatDate } from "@/lib/format";
import type { Tables } from "@/lib/supabase/database.types";

type Department = Tables<"departments">;

type QueueRow = {
  id: string | null;
  payee: string | null;
  amount: number | null;
  department_id: string | null;
  department_name: string | null;
  payment_method: string | null;
  check_number: string | null;
  due_date: string | null;
  notes: string | null;
  created_at: string | null;
};

type AllocationInfo = { departmentId: string; departmentName: string | null; amount: number };

// Setting a due date is common enough on this table (a check is often
// dated well before its number is known) that it shouldn't require
// opening the full "הנפק" flow or the edit modal — a plain date input
// right in the row saves directly. Saves only on blur (or Enter), not on
// every keystroke — a native date input fires onChange per segment while
// typing, so saving there mid-entry interrupts typing with a save+refresh
// before the date is even finished.
function InlineDueDateCell({ checkId, dueDate }: { checkId: string; dueDate: string | null }) {
  const router = useRouter();
  const [value, setValue] = useState(dueDate ?? "");
  const [isPending, startTransition] = useTransition();

  // Resync if the row's date changes from outside (e.g. a refresh
  // triggered by another action) — adjusted during render, per React's
  // guidance, instead of an effect that would cause an extra render.
  const [syncedDueDate, setSyncedDueDate] = useState(dueDate);
  if (dueDate !== syncedDueDate) {
    setSyncedDueDate(dueDate);
    setValue(dueDate ?? "");
  }

  function commit() {
    if (value === (dueDate ?? "")) return;
    startTransition(async () => {
      await updateCheckDueDate(checkId, value || null);
      router.refresh();
    });
  }

  return (
    <input
      type="date"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          (e.target as HTMLInputElement).blur();
        }
      }}
      className={`rounded border border-border bg-transparent px-2 py-1 text-xs w-32 ${isPending ? "opacity-50" : ""}`}
    />
  );
}

type QuickRow = { id: string; payee: string; amount: number; dueDate: string; checkNumber: string; include: boolean };

// Setting one row's number mid-run renumbers every row AFTER it
// sequentially (leaving earlier rows untouched) — the same "anchor point"
// pattern used for cascading spread dates elsewhere in the app.
function renumberFrom(rows: QuickRow[], fromIdx: number, newValue: string): QuickRow[] {
  const base = Number(newValue);
  const isSequential = newValue.trim() !== "" && !Number.isNaN(base);
  return rows.map((r, i) => {
    if (i < fromIdx) return r;
    if (i === fromIdx) return { ...r, checkNumber: newValue };
    return isSequential ? { ...r, checkNumber: String(base + (i - fromIdx)) } : r;
  });
}

// Selecting several pending-issuance rows lets an admin either merge them
// into a single check/transfer (summed amount, per-department amounts
// preserved as a split) or group them into a spread to the same payee —
// covers the "several requests to one supplier, handle together" case
// without retyping anything.
export function IssuanceQueueTable({
  rows,
  departments,
  allocationsByCheck,
}: {
  rows: QueueRow[];
  departments: Department[];
  allocationsByCheck: Map<string, AllocationInfo[]>;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [choosingMergeMethod, setChoosingMergeMethod] = useState(false);

  const [quickOpen, setQuickOpen] = useState(false);
  const [quickRows, setQuickRows] = useState<QuickRow[]>([]);
  const [quickError, setQuickError] = useState<string | null>(null);
  const [quickPending, startQuickTransition] = useTransition();

  const filteredRows = rows.filter((r) => {
    if (!query.trim()) return true;
    const q = query.trim().toLowerCase();
    return (r.payee ?? "").toLowerCase().includes(q);
  });

  const eligibleForQuickIssuance = filteredRows.filter(
    (r) => r.payment_method === "CHECK" && r.due_date && !r.check_number,
  );

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setChoosingMergeMethod(false);
  }

  function runMerge(forcePaymentMethod?: "CHECK" | "TRANSFER") {
    setError(null);
    startTransition(async () => {
      const result = await mergeChecks([...selected], forcePaymentMethod);
      if (result.error) setError(result.error);
      else {
        setSelected(new Set());
        setChoosingMergeMethod(false);
        router.refresh();
      }
    });
  }

  // Merging requires every selected row to share the same payment method —
  // rather than just failing on a mismatch, offer to convert the whole
  // selection to checks or transfers first (with a clear warning) and then
  // actually merge it.
  function attemptMerge() {
    const methods = new Set([...selected].map((id) => rows.find((r) => r.id === id)?.payment_method));
    if (methods.size > 1) {
      setError(null);
      setChoosingMergeMethod(true);
    } else {
      runMerge();
    }
  }

  function runGroup() {
    setError(null);
    startTransition(async () => {
      const result = await groupChecksIntoSpread([...selected]);
      if (result.error) setError(result.error);
      else {
        setSelected(new Set());
        router.refresh();
      }
    });
  }

  function openQuickIssuance() {
    // Same order the main table is already showing (grouped by payee,
    // entry date) — not re-sorted by due date — so the two lists line up
    // and "row 3 here" means the same check as "row 3 there".
    setQuickRows(
      eligibleForQuickIssuance.map((r) => ({
        id: r.id!,
        payee: r.payee ?? "",
        amount: Number(r.amount ?? 0),
        dueDate: r.due_date ?? "",
        checkNumber: "",
        include: true,
      })),
    );
    setQuickError(null);
    setQuickOpen(true);
  }

  function updateQuickNumber(idx: number, value: string) {
    setQuickRows((prev) => renumberFrom(prev, idx, value));
  }

  function toggleQuickInclude(idx: number) {
    setQuickRows((prev) => prev.map((r, i) => (i === idx ? { ...r, include: !r.include } : r)));
  }

  // "עד כאן הונפק": everything before this row was already issued by hand
  // outside this run — uncheck this row and every row after it, leaving
  // the earlier rows (already accounted for) as they were.
  function markIssuedFromHere(idx: number) {
    setQuickRows((prev) => prev.map((r, i) => (i >= idx ? { ...r, include: false } : r)));
  }

  function submitQuickIssuance() {
    const assignments = quickRows.filter((r) => r.include && r.checkNumber.trim()).map((r) => ({ checkId: r.id, checkNumber: r.checkNumber.trim() }));
    if (assignments.length === 0) {
      setQuickError("יש להזין לפחות מספר צ׳ק אחד");
      return;
    }
    setQuickError(null);
    startQuickTransition(async () => {
      const { outcomes } = await bulkAssignCheckNumbers(assignments);
      const failed = outcomes.filter((o) => !o.success);
      if (failed.length > 0) {
        setQuickError(`${failed.length} מתוך ${assignments.length} נכשלו: ${failed.map((f) => f.reason).join("; ")}`);
      } else {
        setQuickOpen(false);
        setQuickRows([]);
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      {selected.size >= 2 && !choosingMergeMethod && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted">{selected.size} נבחרו</span>
          <button
            disabled={isPending}
            onClick={attemptMerge}
            className="rounded bg-primary text-primary-foreground text-xs px-3 py-1.5 disabled:opacity-50"
          >
            מזג לצ׳ק/העברה אחת
          </button>
          <button
            disabled={isPending}
            onClick={runGroup}
            className="rounded border border-border text-xs px-3 py-1.5 disabled:opacity-50"
          >
            קבץ לפריסה אחת
          </button>
          {error && <span className="text-xs text-danger">{error}</span>}
        </div>
      )}
      {selected.size >= 2 && choosingMergeMethod && (
        <div className="flex items-center gap-2 flex-wrap rounded-lg border border-warning/40 bg-warning-bg px-3 py-2">
          <span className="text-xs text-warning font-medium">
            הנבחרים הם מסוגים שונים (צ׳ק/העברה) — להמיר את כולם לפני המיזוג ל:
          </span>
          <button
            disabled={isPending}
            onClick={() => runMerge("CHECK")}
            className="rounded bg-primary text-primary-foreground text-xs px-3 py-1.5 disabled:opacity-50"
          >
            צ׳ק ומיזוג
          </button>
          <button
            disabled={isPending}
            onClick={() => runMerge("TRANSFER")}
            className="rounded bg-primary text-primary-foreground text-xs px-3 py-1.5 disabled:opacity-50"
          >
            העברה ומיזוג
          </button>
          <button
            disabled={isPending}
            onClick={() => setChoosingMergeMethod(false)}
            className="text-xs text-muted"
          >
            ביטול
          </button>
          {error && <span className="text-xs text-danger">{error}</span>}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="חיפוש לפי מוטב"
          className="w-full max-w-xs rounded-lg border border-border bg-transparent px-3 py-1.5 text-sm"
        />
        {eligibleForQuickIssuance.length > 0 && (
          <button
            type="button"
            onClick={openQuickIssuance}
            className="rounded-lg border border-border px-3 py-1.5 text-sm font-semibold"
            title="צ׳קים עם תאריך שכבר נקבע אך חסר מספר — מספור רציף לכולם בבת אחת"
          >
            הנפקה מהירה ({eligibleForQuickIssuance.length})
          </button>
        )}
      </div>
      <div className="overflow-x-auto">
      <table className="data-table">
        <thead>
          <tr>
            <th></th>
            <th>מוטב</th>
            <th>סכום</th>
            <th>תאריך הזנה</th>
            <th>תאריך</th>
            <th>מחלקה</th>
            <th>אמצעי</th>
            <th>הנפקה</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {filteredRows.map((c) => (
            <tr key={c.id!}>
              <td>
                <input type="checkbox" checked={selected.has(c.id!)} onChange={() => toggle(c.id!)} />
              </td>
              <td>{c.payee}</td>
              <td>{formatCurrency(Number(c.amount))}</td>
              <td className="text-muted text-xs">{c.created_at ? formatDate(c.created_at) : "—"}</td>
              <td>
                <InlineDueDateCell checkId={c.id!} dueDate={c.due_date} />
              </td>
              <td>
                {c.department_name ? (
                  c.department_name
                ) : allocationsByCheck.has(c.id!) ? (
                  <span className="text-xs">
                    מפוצל:{" "}
                    {allocationsByCheck
                      .get(c.id!)!
                      .map((a) => `${a.departmentName ?? "?"} (${formatCurrency(a.amount)})`)
                      .join(", ")}
                  </span>
                ) : (
                  <span className="text-warning">בהמתנה</span>
                )}
              </td>
              <td>{c.payment_method === "TRANSFER" ? "העברה" : "צ׳ק"}</td>
              <td>
                <IssueCheckRow
                  checkId={c.id!}
                  currentCheckNumber={c.check_number}
                  currentDueDate={c.due_date}
                  currentPaymentMethod={c.payment_method ?? undefined}
                  currentDepartmentId={c.department_id}
                  amount={Number(c.amount)}
                  departments={departments}
                  hasExistingDepartmentSplit={allocationsByCheck.has(c.id!)}
                />
              </td>
              <td>
                <EditDeleteCheckRow
                  checkId={c.id!}
                  payee={c.payee ?? ""}
                  amount={Number(c.amount)}
                  dueDate={c.due_date}
                  checkNumber={c.check_number}
                  departmentId={c.department_id}
                  notes={c.notes}
                  paymentMethod={c.payment_method ?? undefined}
                  existingAllocations={
                    (allocationsByCheck.get(c.id!) ?? []).map((a) => ({
                      departmentId: a.departmentId,
                      amount: a.amount,
                    })) as CheckAllocationInput[]
                  }
                  departments={departments}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>

      {quickOpen && (
        <Modal onClose={() => setQuickOpen(false)}>
          <div className="card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">הנפקה מהירה — מספור רציף</h2>
              <button type="button" onClick={() => setQuickOpen(false)} className="text-sm text-muted">
                סגור
              </button>
            </div>
            <p className="text-xs text-muted">
              כל הצ׳קים שכבר נקבע להם תאריך אך חסר מספר. הזנת מספר לצ׳ק הראשון תמלא אוטומטית מספור רציף לשאר; תיקון
              מספר באמצע הרשימה ימספר מחדש רק את מה שאחריו.
            </p>
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th></th>
                    <th>מוטב</th>
                    <th>סכום</th>
                    <th>תאריך</th>
                    <th>מספר צ׳ק</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {quickRows.map((r, i) => (
                    <tr key={r.id}>
                      <td>
                        <input type="checkbox" checked={r.include} onChange={() => toggleQuickInclude(i)} />
                      </td>
                      <td className={r.include ? "" : "text-muted line-through"}>{r.payee}</td>
                      <td className={r.include ? "" : "text-muted line-through"}>{formatCurrency(r.amount)}</td>
                      <td>{r.dueDate ? formatDate(r.dueDate) : "—"}</td>
                      <td>
                        <input
                          value={r.checkNumber}
                          onChange={(e) => updateQuickNumber(i, e.target.value)}
                          disabled={!r.include}
                          className="w-28 rounded border border-border bg-transparent px-2 py-1 text-sm disabled:opacity-50"
                        />
                      </td>
                      <td>
                        <button
                          type="button"
                          onClick={() => markIssuedFromHere(i)}
                          className="text-xs text-muted underline whitespace-nowrap"
                          title="מבטל את הסימון משורה זו והלאה"
                        >
                          עד כאן הונפק
                        </button>
                      </td>
                    </tr>
                  ))}
                  {quickRows.length === 0 && (
                    <tr>
                      <td colSpan={6} className="text-center text-muted py-4">
                        אין צ׳קים מתאימים
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={quickPending}
                onClick={submitQuickIssuance}
                className="rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold disabled:opacity-50"
              >
                {quickPending ? "מנפיק…" : "אישור והנפקה"}
              </button>
              {quickError && <span className="text-sm text-danger">{quickError}</span>}
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
