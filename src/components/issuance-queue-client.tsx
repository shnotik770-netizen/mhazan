"use client";

import { Fragment, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  groupChecksIntoSpread,
  mergeChecks,
  updateCheckDueDate,
  bulkAssignCheckNumbers,
  recordCancelledCheckNumber,
  type CheckAllocationInput,
} from "@/app/(app)/checks/actions";
import { EditDeleteCheckRow, IssueCheckRow } from "@/components/checks-client";
import { Modal } from "@/components/modal";
import { RowActionsMenu } from "@/components/row-actions-menu";
import { useSortFilter, SortFilterTh, type ColumnDef } from "@/components/sortable-table";
import { groupByBank, bankColorFor, BankGroupHeading } from "@/components/bank-grouping";
import { formatCurrency, formatDate } from "@/lib/format";
import type { Tables } from "@/lib/supabase/database.types";

type Department = Tables<"departments">;
type BankAccount = { id: string; bank_name: string; account_number: string };

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
  bank_account_id: string | null;
  bank_name: string | null;
  account_number: string | null;
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

type QuickRow = {
  id: string;
  payee: string;
  amount: number;
  dueDate: string;
  checkNumber: string;
  include: boolean;
  isSkip: boolean;
  bankAccountId: string;
  bankName: string;
  accountNumber: string;
};

let nextSkipKey = 1;

function blankSkipRow(bankAccountId: string, bankName: string, accountNumber: string): QuickRow {
  return {
    id: `skip-${nextSkipKey++}`,
    payee: "דילוג — צ׳ק תקול",
    amount: 0,
    dueDate: "",
    checkNumber: "",
    include: true,
    isSkip: true,
    bankAccountId,
    bankName,
    accountNumber,
  };
}

// Recomputes sequential numbers forward from the first row that already
// has one typed in (the "anchor") — rows before the anchor are untouched,
// so a correction mid-list only renumbers what comes after it. A skip row
// always consumes the next number (a real, physical check blank was
// burned); an unchecked real row consumes none and shows no number at all
// — its physical blank was never used, so nothing after it should skip a
// number on its account. Runs independently per bank account: checks from
// different accounts are physically different checkbooks, so one
// account's typed-in number must never bleed a sequence into another
// account's checks just because they sit next to each other in the list.
function recomputeSequence(rows: QuickRow[]): QuickRow[] {
  const indicesByAccount = new Map<string, number[]>();
  rows.forEach((r, i) => {
    const list = indicesByAccount.get(r.bankAccountId) ?? [];
    list.push(i);
    indicesByAccount.set(r.bankAccountId, list);
  });

  const result = [...rows];
  for (const indices of indicesByAccount.values()) {
    const anchorPos = indices.findIndex((i) => {
      const r = rows[i];
      return r.checkNumber.trim() !== "" && !Number.isNaN(Number(r.checkNumber));
    });
    if (anchorPos === -1) continue;
    let next = Number(rows[indices[anchorPos]].checkNumber) + 1;
    for (let p = anchorPos + 1; p < indices.length; p++) {
      const i = indices[p];
      const r = rows[i];
      if (r.isSkip || r.include) {
        result[i] = { ...r, checkNumber: String(next) };
        next += 1;
      } else {
        result[i] = { ...r, checkNumber: "" };
      }
    }
  }
  return result;
}

// Selecting several pending-issuance rows lets an admin either merge them
// into a single check/transfer (summed amount, per-department amounts
// preserved as a split) or group them into a spread to the same payee —
// covers the "several requests to one supplier, handle together" case
// without retyping anything.
export function IssuanceQueueTable({
  rows,
  departments,
  bankAccounts,
  allocationsByCheck,
}: {
  rows: QueueRow[];
  departments: Department[];
  bankAccounts: BankAccount[];
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

  const searched = rows.filter((r) => {
    if (!query.trim()) return true;
    const q = query.trim().toLowerCase();
    return (r.payee ?? "").toLowerCase().includes(q);
  });

  const columns: ColumnDef<QueueRow>[] = [
    { key: "payee", label: "מוטב", sortValue: (r) => r.payee ?? "", filterValue: (r) => r.payee ?? "" },
    { key: "amount", label: "סכום", sortValue: (r) => Number(r.amount) },
    { key: "created_at", label: "תאריך הזנה", sortValue: (r) => r.created_at ?? "" },
    { key: "due_date", label: "תאריך", sortValue: (r) => r.due_date ?? "" },
    { key: "department", label: "מחלקה", sortValue: (r) => r.department_name ?? "", filterValue: (r) => r.department_name ?? "בהמתנה" },
    {
      key: "payment_method",
      label: "אמצעי",
      sortValue: (r) => r.payment_method ?? "",
      filterValue: (r) => (r.payment_method === "TRANSFER" ? "העברה" : "צ׳ק"),
    },
  ];
  const { rows: filteredRows, sort, toggleSort, filters, setColumnFilter } = useSortFilter(searched, columns);

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
        isSkip: false,
        bankAccountId: r.bank_account_id ?? "",
        bankName: r.bank_name ?? "",
        accountNumber: r.account_number ?? "",
      })),
    );
    setQuickError(null);
    setQuickOpen(true);
  }

  function updateQuickNumber(idx: number, value: string) {
    setQuickRows((prev) => recomputeSequence(prev.map((r, i) => (i === idx ? { ...r, checkNumber: value } : r))));
  }

  function toggleQuickInclude(idx: number) {
    setQuickRows((prev) => recomputeSequence(prev.map((r, i) => (i === idx ? { ...r, include: !r.include } : r))));
  }

  // "עד כאן הונפק": everything before this row was already issued by hand
  // outside this run — uncheck this row and every row after it, leaving
  // the earlier rows (already accounted for) as they were. Unchecked rows
  // consume no number (see recomputeSequence), so this also frees up the
  // rest of the sequence instead of reserving it for nothing.
  function markIssuedFromHere(idx: number) {
    setQuickRows((prev) => {
      const bankAccountId = prev[idx]?.bankAccountId;
      return recomputeSequence(
        prev.map((r, i) => (i >= idx && r.bankAccountId === bankAccountId && !r.isSkip ? { ...r, include: false } : r)),
      );
    });
  }

  // "דלג על מספר (צ׳ק תקול)": the physical check blank meant for THIS row
  // got ruined — insert a marker right before it that consumes this row's
  // number instead (unlike an unchecked row, which consumes none), bumping
  // this row and everything after it forward by one so the sequence still
  // lines up with the actual numbered blanks. Recorded as a cancelled check
  // on submit for the audit trail.
  function insertSkipAfter(idx: number) {
    setQuickRows((prev) => {
      const anchorRow = prev[idx]?.isSkip ? undefined : prev[idx];
      const bankAccountId = anchorRow?.bankAccountId || prev.find((r) => !r.isSkip)?.bankAccountId || "";
      const bankName = anchorRow?.bankName || prev.find((r) => !r.isSkip)?.bankName || "";
      const accountNumber = anchorRow?.accountNumber || prev.find((r) => !r.isSkip)?.accountNumber || "";
      const sameAccountIndices = prev
        .map((r, i) => ({ r, i }))
        .filter(({ r }) => r.bankAccountId === bankAccountId);
      const anchorIdx = sameAccountIndices.find(
        ({ r }) => r.checkNumber.trim() !== "" && !Number.isNaN(Number(r.checkNumber)),
      )?.i;
      const skipRow = blankSkipRow(bankAccountId, bankName, accountNumber);
      const next = [...prev];
      if (idx === anchorIdx) {
        // The row being skipped currently holds the starting number typed
        // by the admin — hand it to the skip marker so it stays the anchor
        // recomputeSequence cascades forward from, instead of stranding it
        // with no number ahead of the (still-empty) real row.
        skipRow.checkNumber = next[idx].checkNumber;
        next[idx] = { ...next[idx], checkNumber: "" };
      }
      next.splice(idx, 0, skipRow);
      return recomputeSequence(next);
    });
  }

  function removeSkipRow(idx: number) {
    setQuickRows((prev) => recomputeSequence(prev.filter((_, i) => i !== idx)));
  }

  function submitQuickIssuance() {
    const assignments = quickRows
      .filter((r) => !r.isSkip && r.include && r.checkNumber.trim())
      .map((r) => ({ checkId: r.id, checkNumber: r.checkNumber.trim() }));
    const skips = quickRows.filter((r) => r.isSkip && r.checkNumber.trim());
    if (assignments.length === 0 && skips.length === 0) {
      setQuickError("יש להזין לפחות מספר צ׳ק אחד");
      return;
    }
    setQuickError(null);
    startQuickTransition(async () => {
      const [assignResult, skipResults] = await Promise.all([
        assignments.length > 0 ? bulkAssignCheckNumbers(assignments) : Promise.resolve({ outcomes: [] }),
        Promise.all(skips.map((s) => recordCancelledCheckNumber(s.bankAccountId, s.checkNumber))),
      ]);
      const failed = assignResult.outcomes.filter((o) => !o.success);
      const skipFailed = skipResults.filter((r) => r.error);
      if (failed.length > 0 || skipFailed.length > 0) {
        const parts = [
          ...failed.map((f) => f.reason),
          ...skipFailed.map((f) => f.error),
        ];
        setQuickError(`חלק מהפעולות נכשלו: ${parts.join("; ")}`);
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
      {groupByBank(filteredRows).map(([bankLabel, bankRows]) => (
        <div key={bankLabel} className={`mb-4 border-r-4 ${bankColorFor(bankLabel).border} pr-3`}>
          <BankGroupHeading label={bankLabel} count={bankRows.length} unit="צ׳קים להנפקה" />
          <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th></th>
                {columns.map((col) => (
                  <SortFilterTh
                    key={col.key}
                    col={col}
                    allRows={searched}
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
          {bankRows.map((c) => (
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
                <RowActionsMenu>
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
                  <EditDeleteCheckRow
                    checkId={c.id!}
                    payee={c.payee ?? ""}
                    amount={Number(c.amount)}
                    dueDate={c.due_date}
                    checkNumber={c.check_number}
                    departmentId={c.department_id}
                    notes={c.notes}
                    paymentMethod={c.payment_method ?? undefined}
                    bankAccountId={c.bank_account_id}
                    bankAccounts={bankAccounts}
                    existingAllocations={
                      (allocationsByCheck.get(c.id!) ?? []).map((a) => ({
                        departmentId: a.departmentId,
                        amount: a.amount,
                      })) as CheckAllocationInput[]
                    }
                    departments={departments}
                  />
                </RowActionsMenu>
              </td>
            </tr>
          ))}
        </tbody>
          </table>
          </div>
        </div>
      ))}
      {filteredRows.length === 0 && <p className="text-center text-muted py-4">אין תוצאות</p>}

      {quickOpen && (
        <Modal onClose={() => setQuickOpen(false)}>
          <div className="card p-0 overflow-hidden">
            <div className="flex items-center justify-between p-4 pb-3 border-b border-border">
              <h2 className="font-semibold">הנפקה מהירה — מספור רציף</h2>
              <button type="button" onClick={() => setQuickOpen(false)} className="text-sm text-muted">
                סגור
              </button>
            </div>

            <div className="p-4 space-y-3">
              <p className="text-xs text-muted">
                כל הצ׳קים שכבר נקבע להם תאריך אך חסר מספר. הזנת מספר לצ׳ק הראשון תמלא אוטומטית מספור רציף לשאר; תיקון
                מספר באמצע הרשימה ימספר מחדש רק את מה שאחריו. ביטול סימון ה־V מוציא צ׳ק מההנפקה ולא מצמיד לו מספר כלל;
                &quot;דלג על מספר&quot; שומר מספר לצ׳ק פגום שלא ינופק, כדי שהרצף יתאים לפנקס בפועל.
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
                    {groupByBank(
                      quickRows.map((r, idx) => ({ ...r, idx, bank_name: r.bankName, account_number: r.accountNumber })),
                    ).map(([bankLabel, groupRows]) => (
                      <Fragment key={bankLabel}>
                        <tr className="bg-background/60">
                          <td colSpan={6} className="py-1.5">
                            <BankGroupHeading label={bankLabel} count={groupRows.length} unit="צ׳קים להנפקה" />
                          </td>
                        </tr>
                        {groupRows.map((r) => {
                          const i = r.idx;
                          return r.isSkip ? (
                            <tr key={r.id} className="bg-warning-bg/40">
                              <td></td>
                              <td className="text-warning text-xs">דילוג — צ׳ק תקול (מבוטל)</td>
                              <td>—</td>
                              <td>—</td>
                              <td>
                                <input
                                  value={r.checkNumber}
                                  onChange={(e) => updateQuickNumber(i, e.target.value)}
                                  className="w-28 rounded border border-border bg-transparent px-2 py-1 text-sm"
                                />
                              </td>
                              <td>
                                <button
                                  type="button"
                                  onClick={() => removeSkipRow(i)}
                                  className="text-xs text-danger underline whitespace-nowrap"
                                >
                                  הסר דילוג
                                </button>
                              </td>
                            </tr>
                          ) : (
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
                                  placeholder={r.include ? "" : "לא ינופק"}
                                  className="w-28 rounded border border-border bg-transparent px-2 py-1 text-sm disabled:opacity-50"
                                />
                              </td>
                              <td className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => markIssuedFromHere(i)}
                                  className="text-xs text-muted underline whitespace-nowrap"
                                  title="מבטל את הסימון משורה זו והלאה"
                                >
                                  עד כאן הונפק
                                </button>
                                <button
                                  type="button"
                                  onClick={() => insertSkipAfter(i)}
                                  className="text-xs text-muted underline whitespace-nowrap"
                                  title="שומר את המספר הבא כפגום/מבוטל ולא מקצה אותו לאף דרישה"
                                >
                                  דלג על מספר
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </Fragment>
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
            </div>

            {/* sticky (not a flex-shrink trick) — works within the modal
                backdrop's own natural scroll, so the button stays reachable
                without depending on a bounded-height container that may not
                actually get bounded in every browser. */}
            <div className="sticky bottom-0 flex items-center gap-2 p-4 pt-3 border-t border-border bg-surface">
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
