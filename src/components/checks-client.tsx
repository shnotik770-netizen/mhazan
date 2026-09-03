"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  cancelAndReplaceCheck,
  convertPendingCheckToSpread,
  createDeptExpenseRequest,
  deleteCheck,
  issueCheck,
  updateCheck,
  updateCheckDueDate,
  updateCheckStatus,
  type CheckAllocationInput,
} from "@/app/(app)/checks/actions";
import { SplitAllocationEditor } from "@/components/split-allocation-editor";
import { MiniCalculator } from "@/components/mini-calculator";
import { SearchableSelect } from "@/components/searchable-select";
import { DateInput } from "@/components/date-input";
import { Modal } from "@/components/modal";
import { rowActionButtonClass } from "@/components/row-actions-menu";
import { formatCurrency, toLocalISODate } from "@/lib/format";
import type { Tables } from "@/lib/supabase/database.types";

type Department = Tables<"departments">;
type BankAccount = Tables<"bank_accounts"> & { departments: { name: string } | null };
// The cancel/reissue flow only ever needs to display and pick a bank
// account by name+number — every call site (issuance queue, overdue
// tables, the unified transactions view) already has this much without
// needing the full row shape (balance, department, etc.) that BankAccount
// above carries for the request forms.
type MinimalBankAccount = { id: string; bank_name: string; account_number: string };


export function CheckStatusControls({
  checkId,
  status,
  paymentMethod,
}: {
  checkId: string;
  status: string;
  paymentMethod?: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [internalBeneficiary, setInternalBeneficiary] = useState("");

  function setStatus(next: "UNPAID" | "CLEARED" | "CANCELLED", withBeneficiary?: string) {
    startTransition(async () => {
      await updateCheckStatus(checkId, next, withBeneficiary !== undefined ? withBeneficiary || null : undefined);
      setConfirming(false);
      router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-1">
      <span
        className={`badge ${
          status === "CLEARED"
            ? "bg-success-bg text-success"
            : status === "CANCELLED"
              ? "bg-danger-bg text-danger"
              : "bg-warning-bg text-warning"
        }`}
      >
        {status === "CLEARED" ? "נפרע" : status === "CANCELLED" ? "בוטל" : "לא נפרע"}
      </span>
      {status === "UNPAID" && !confirming && (
        <>
          <button
            disabled={isPending}
            onClick={() => (paymentMethod === "TRANSFER" ? setConfirming(true) : setStatus("CLEARED"))}
            className="text-xs text-primary underline"
          >
            סמן כנפרע
          </button>
          <button disabled={isPending} onClick={() => setStatus("CANCELLED")} className="text-xs text-danger underline">
            בטל
          </button>
        </>
      )}
      {status === "UNPAID" && confirming && (
        <div className="flex items-center gap-1">
          <input
            value={internalBeneficiary}
            onChange={(e) => setInternalBeneficiary(e.target.value)}
            placeholder="מוטב פנימי בתוך הספק (אופציונלי)"
            className="w-40 rounded border border-border bg-transparent px-1 py-0.5 text-xs"
            autoFocus
          />
          <button
            disabled={isPending}
            onClick={() => setStatus("CLEARED", internalBeneficiary)}
            className="text-xs text-primary underline"
          >
            אשר
          </button>
          <button onClick={() => setConfirming(false)} className="text-xs text-muted">
            ✕
          </button>
        </div>
      )}
    </div>
  );
}

// "Confirm executed" is exactly marking a transfer CLEARED — the same
// status transition, framed for the overdue-transfer verification queue.
// For transfers, this is also where the internal beneficiary within the
// supplier gets recorded (moved here from check/transfer creation).
//
// A transfer's recorded due_date is when it was *planned* to go out — by
// the time an admin gets around to confirming it, the bank may show it
// actually went out on a different day. Rather than silently keeping the
// planned date (which would then be wrong in every report/forecast that
// reads it), the confirm flow itself asks: if a due date exists, the
// button first shows a plain question with two choices instead of
// clearing immediately, so a same-day confirm stays a single click while
// a different actual date gets one extra step to correct it.
export function VerifyTransferButton({
  checkId,
  label,
  currentDueDate,
  captureInternalBeneficiary,
}: {
  checkId: string;
  label?: string;
  currentDueDate?: string | null;
  captureInternalBeneficiary?: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [internalBeneficiary, setInternalBeneficiary] = useState("");
  const [askingDate, setAskingDate] = useState(false);
  const [actualDate, setActualDate] = useState(currentDueDate ?? "");

  function finish(newDueDate?: string) {
    startTransition(async () => {
      if (newDueDate && newDueDate !== currentDueDate) {
        await updateCheckDueDate(checkId, newDueDate);
      }
      await updateCheckStatus(checkId, "CLEARED", captureInternalBeneficiary ? internalBeneficiary || null : undefined);
      router.refresh();
    });
  }

  function clickConfirm() {
    if (currentDueDate) setAskingDate(true);
    else finish();
  }

  if (askingDate) {
    return (
      <div className="flex flex-col gap-1">
        <p className="text-xs text-muted">
          התאריך הרשום הוא {currentDueDate} — אם ההעברה בוצעה בפועל בתאריך אחר, עדכנו כאן:
        </p>
        <div className="flex items-center gap-1">
          <input
            type="date"
            value={actualDate}
            onChange={(e) => setActualDate(e.target.value)}
            className="rounded border border-border bg-transparent px-2 py-1 text-xs"
          />
          <button
            disabled={isPending}
            onClick={() => finish(actualDate)}
            className="rounded bg-primary text-primary-foreground text-xs px-3 py-1 disabled:opacity-50"
          >
            אישור
          </button>
          <button disabled={isPending} onClick={() => setAskingDate(false)} className="text-xs text-muted">
            ביטול
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1">
      {captureInternalBeneficiary && (
        <input
          value={internalBeneficiary}
          onChange={(e) => setInternalBeneficiary(e.target.value)}
          placeholder="מוטב פנימי בתוך הספק (אופציונלי)"
          className="w-40 rounded border border-border bg-transparent px-1 py-0.5 text-xs"
        />
      )}
      <button
        disabled={isPending}
        onClick={clickConfirm}
        className="rounded bg-primary text-primary-foreground text-xs px-3 py-1 disabled:opacity-50"
      >
        {label ?? "אשר שההעברה בוצעה"}
      </button>
    </div>
  );
}

// Marks a check/transfer CANCELLED without deleting it — it stays in the
// system with status "בוטל" for the audit trail, distinct from deleteCheck
// which removes the row entirely. Shared between the /expenses page (inside
// a RowActionsMenu, variant="menu") and the /checks page's own tables
// (a plain inline text link, variant="link"), so the exact same confirm
// wording and behavior applies everywhere a check/transfer can be cancelled.
export function CancelCheckButton({ checkId, variant = "menu" }: { checkId: string; variant?: "menu" | "link" }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function cancel() {
    if (!confirm('לבטל את הצ׳ק/העברה? הפעולה תסמן אותו כמבוטל — הוא יישאר ברשימה עם סטטוס "בוטל" ולא יימחק.')) return;
    startTransition(async () => {
      const result = await updateCheckStatus(checkId, "CANCELLED");
      if (result.error) setError(result.error);
      else router.refresh();
    });
  }

  if (variant === "link") {
    return (
      <span className="inline-flex items-center gap-1">
        <button type="button" disabled={isPending} onClick={cancel} className="text-xs text-danger underline">
          בטל
        </button>
        {error && <span className="text-xs text-danger">{error}</span>}
      </span>
    );
  }

  return (
    <div className="flex w-full flex-col items-end gap-0.5">
      <button type="button" disabled={isPending} onClick={cancel} className={rowActionButtonClass("warning")}>
        ביטול
      </button>
      {error && <span className="px-3 text-xs text-danger">{error}</span>}
    </div>
  );
}

// Cancels an existing check/transfer and immediately files its replacement
// in one action, prefilled from the original (payee, amount, department) —
// used when the original just needs different payment mechanics (e.g. a
// bounced check reissued as a transfer, or a new date), not a re-entry of
// a request that's otherwise identical.
export function CancelAndReplaceCheckButton({
  checkId,
  payee,
  amount,
  currentPaymentMethod,
  currentDueDate,
  currentBankAccountId,
  bankAccounts = [],
  variant = "link",
}: {
  checkId: string;
  payee: string;
  amount: number;
  currentPaymentMethod?: string | null;
  currentDueDate?: string | null;
  currentBankAccountId?: string | null;
  bankAccounts?: MinimalBankAccount[];
  variant?: "link" | "menu";
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"CHECK" | "TRANSFER">(
    currentPaymentMethod === "TRANSFER" ? "TRANSFER" : "CHECK",
  );
  const [dueDate, setDueDate] = useState(currentDueDate ?? "");
  const [checkNumber, setCheckNumber] = useState("");
  const [newAmount, setNewAmount] = useState(String(amount));
  const [bankAccountId, setBankAccountId] = useState(currentBankAccountId ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await cancelAndReplaceCheck(checkId, {
        paymentMethod,
        dueDate: dueDate || null,
        checkNumber: paymentMethod === "CHECK" ? checkNumber || null : null,
        amount: Number(newAmount) || undefined,
        bankAccountId: bankAccountId || undefined,
      });
      if (result.error) setError(result.error);
      else {
        setOpen(false);
        router.refresh();
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={variant === "menu" ? rowActionButtonClass("warning") : "text-xs text-warning underline"}
      >
        {variant === "menu" ? "ביטול והחלפה בדרישה חדשה" : "בטל והחלף"}
      </button>
      {open && (
        <Modal onClose={() => setOpen(false)}>
          <div className="card p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div>
                <h2 className="text-lg font-bold" style={{ fontFamily: "var(--font-display)" }}>
                  ביטול והחלפה בדרישת תשלום חדשה
                </h2>
                <p className="text-xs text-muted mt-0.5">
                  &quot;{payee}&quot; ({formatCurrency(amount)}) יסומן כמבוטל, ובמקומו תיפתח מיד דרישת תשלום חדשה
                  לאותה מחלקה — ניתן לשנות כאן את הסכום, חשבון הבנק, אמצעי התשלום ו/או התאריך.
                </p>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="text-muted hover:text-foreground">
                ✕
              </button>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">סכום</label>
                  <input
                    type="number"
                    value={newAmount}
                    onChange={(e) => setNewAmount(e.target.value)}
                    className="w-full rounded-lg border border-border bg-transparent px-3 py-2 text-sm"
                  />
                </div>
                {bankAccounts.length > 0 && (
                  <div>
                    <label className="block text-sm font-medium mb-1">חשבון בנק</label>
                    <select
                      value={bankAccountId}
                      onChange={(e) => setBankAccountId(e.target.value)}
                      className="w-full rounded-lg border border-border bg-transparent px-3 py-2 text-sm"
                    >
                      {bankAccounts.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.bank_name} ({b.account_number})
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">אמצעי תשלום חדש</label>
                <div className="flex items-center gap-4 text-sm">
                  <label className="flex items-center gap-1">
                    <input
                      type="radio"
                      checked={paymentMethod === "CHECK"}
                      onChange={() => setPaymentMethod("CHECK")}
                    />
                    צ׳ק
                  </label>
                  <label className="flex items-center gap-1">
                    <input
                      type="radio"
                      checked={paymentMethod === "TRANSFER"}
                      onChange={() => setPaymentMethod("TRANSFER")}
                    />
                    העברה
                  </label>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">תאריך חדש</label>
                <DateInput value={dueDate} onChange={setDueDate} />
              </div>
              {paymentMethod === "CHECK" && (
                <div>
                  <label className="block text-sm font-medium mb-1">מספר צ׳ק (אופציונלי — אפשר להשלים אח״כ ב&quot;צ׳קים להנפקה&quot;)</label>
                  <input
                    value={checkNumber}
                    onChange={(e) => setCheckNumber(e.target.value)}
                    className="w-full rounded-lg border border-border bg-transparent px-3 py-2 text-sm"
                  />
                </div>
              )}
            </div>
            {error && <p className="text-xs text-danger">{error}</p>}
            <div className="flex items-center gap-2 pt-2 border-t border-border">
              <button
                disabled={isPending}
                onClick={submit}
                className="rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold disabled:opacity-50"
              >
                {isPending ? "מבצע..." : "בטל וצור דרישה חדשה"}
              </button>
              <button type="button" onClick={() => setOpen(false)} className="text-sm text-muted">
                ביטול
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}

// Simple request form for a department manager who has been granted
// access to (at most) a handful of departments: amount always allowed,
// due date only if the finance admin gave them that permission.
export function DeptExpenseRequestForm({
  departments,
  bankAccounts,
  canSetDates,
}: {
  departments: Department[];
  bankAccounts: BankAccount[];
  canSetDates: boolean;
}) {
  const router = useRouter();
  const [paymentMethod, setPaymentMethod] = useState<"CHECK" | "TRANSFER">("CHECK");
  const [departmentId, setDepartmentId] = useState(departments[0]?.id ?? "");
  const [bankAccountId, setBankAccountId] = useState("");
  const [payee, setPayee] = useState("");
  const [amount, setAmount] = useState(0);
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit() {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await createDeptExpenseRequest({
        paymentMethod,
        departmentId,
        bankAccountId,
        payee,
        amount,
        dueDate: canSetDates && dueDate ? dueDate : null,
        notes: notes || null,
      });
      if (result.error) {
        setError(result.error);
      } else {
        setMessage("הבקשה נשלחה");
        setPayee("");
        setAmount(0);
        setDueDate("");
        setNotes("");
        router.refresh();
      }
    });
  }

  return (
    <div className="card p-4 space-y-3">
      <h2 className="font-semibold">דרישת תשלום (צ׳ק / העברה)</h2>
      {!canSetDates && (
        <p className="text-xs text-muted">
          אין לך הרשאה לקבוע תאריך — הבקשה תיכנס כדרישת תשלום ממתינה לאישור עד שמנהל הכספים יקבע תאריך.
        </p>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
        {departments.length === 1 ? (
          <div className="flex items-center rounded border border-border bg-background px-2 py-1 text-sm text-muted">
            מחלקה: {departments[0].name}
          </div>
        ) : (
          <SearchableSelect
            value={departmentId}
            onChange={setDepartmentId}
            options={departments.map((d) => ({ id: d.id, label: d.name }))}
            required
            className="rounded border border-border bg-transparent px-2 py-1 text-sm"
          />
        )}
        <select
          value={paymentMethod}
          onChange={(e) => setPaymentMethod(e.target.value as "CHECK" | "TRANSFER")}
          className="rounded border border-border bg-transparent px-2 py-1 text-sm"
        >
          <option value="CHECK">צ׳ק</option>
          <option value="TRANSFER">העברה בנקאית</option>
        </select>
        <SearchableSelect
          value={bankAccountId}
          onChange={setBankAccountId}
          options={bankAccounts.map((b) => ({ id: b.id, label: `${b.departments?.name ?? ""} — ${b.bank_name}` }))}
          placeholder="חשבון בנק..."
          className="rounded border border-border bg-transparent px-2 py-1 text-sm"
        />
        <input
          value={payee}
          onChange={(e) => setPayee(e.target.value)}
          placeholder="מוטב"
          list="supplier-names"
          className="rounded border border-border bg-transparent px-2 py-1 text-sm"
        />
        <div className="flex flex-col gap-1">
          <input
            type="number"
            value={amount || ""}
            onChange={(e) => setAmount(Number(e.target.value) || 0)}
            placeholder="סכום"
            className="rounded border border-border bg-transparent px-2 py-1 text-sm"
          />
          <MiniCalculator onApply={setAmount} />
        </div>
        {canSetDates && (
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="rounded border border-border bg-transparent px-2 py-1 text-sm"
          />
        )}
        <input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="הערות"
          className="rounded border border-border bg-transparent px-2 py-1 text-sm"
        />
      </div>
      <div className="flex items-center gap-2">
        <button
          disabled={isPending || !departmentId || !bankAccountId || !payee || amount <= 0}
          onClick={submit}
          className="rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold disabled:opacity-50"
        >
          שלח בקשה
        </button>
        {error && <span className="text-sm text-danger">{error}</span>}
        {message && <span className="text-sm text-success">{message}</span>}
      </div>
    </div>
  );
}

// The direct, one-step approval action for a "דרישת תשלום" waiting for
// approval: set a date (plus, for a check, optionally a check number) and
// click once. No split/spread chooser here — the department was already
// fixed when the request was created, so approval is just "when" (and
// "which check number", if already known).
export function ApprovePaymentRequestRow({
  checkId,
  paymentMethod,
  currentDueDate,
  currentCheckNumber,
}: {
  checkId: string;
  paymentMethod?: string;
  currentDueDate?: string | null;
  currentCheckNumber?: string | null;
}) {
  const router = useRouter();
  const isCheck = paymentMethod !== "TRANSFER";
  const [dueDate, setDueDate] = useState(currentDueDate ?? "");
  const [checkNumber, setCheckNumber] = useState(currentCheckNumber ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function approve() {
    setError(null);
    startTransition(async () => {
      const result = await issueCheck(checkId, {
        checkNumber: isCheck ? checkNumber || null : null,
        dueDate: dueDate || null,
        allocations: [],
      });
      if (result.error) setError(result.error);
      else router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-1">
      <input
        type="date"
        value={dueDate}
        onChange={(e) => setDueDate(e.target.value)}
        title={isCheck ? "ניתן להשאיר ריק — יעבור לצ׳קים ממתינים להנפקה" : "נדרש כדי לדעת מתי לבצע את ההעברה"}
        className="rounded border border-border bg-transparent px-2 py-1 text-xs"
      />
      {isCheck && (
        <input
          value={checkNumber}
          onChange={(e) => setCheckNumber(e.target.value)}
          placeholder="מספר צ׳ק (אופציונלי)"
          className="w-32 rounded border border-border bg-transparent px-2 py-1 text-xs"
        />
      )}
      <button
        disabled={isPending || (!isCheck && !dueDate)}
        onClick={approve}
        className="rounded bg-primary text-primary-foreground text-xs px-3 py-1 disabled:opacity-50"
      >
        אשר
      </button>
      {error && <span className="text-xs text-danger">{error}</span>}
    </div>
  );
}

type SpreadDraftRow = {
  date: string;
  amount: number;
  checkNumber: string;
  departmentId: string;
};

// Finance admin's finalization step for a request that's missing a check
// number and/or a due date. Clicking "הנפק" with the fields already
// complete (date, plus a check number for CHECK payment method) saves
// immediately — the row then drops out of the issuance queue and shows up
// among the regular unpaid checks/transfers awaiting clearance. If the
// fields aren't complete yet, it asks how to proceed instead of silently
// saving a half-filled row: issue as one payment (optionally split across
// departments), or turn it into a spread of several payments.
// Spread amounts round down to the nearest ROUND_UNIT (checks are
// typically written in round numbers) — every row but the last gets the
// rounded base amount, and the last row absorbs whatever's left so the
// total still matches exactly.
const SPREAD_ROUND_UNIT = 5;

function addMonths(iso: string, months: number): string {
  const d = new Date(iso + "T00:00:00");
  d.setMonth(d.getMonth() + months);
  return toLocalISODate(d);
}

function computeAutoSpreadAmounts(total: number, count: number): number[] {
  const n = Math.max(1, Math.floor(count) || 1);
  if (n === 1) return [Math.round(total * 100) / 100];
  const base = Math.max(0, Math.floor(total / n / SPREAD_ROUND_UNIT) * SPREAD_ROUND_UNIT);
  const lastAmount = Math.round((total - base * (n - 1) + Number.EPSILON) * 100) / 100;
  return [...Array(n - 1).fill(base), lastAmount];
}

export function IssueCheckRow({
  checkId,
  currentCheckNumber,
  currentDueDate,
  currentPaymentMethod,
  currentDepartmentId,
  amount,
  departments,
  hasExistingDepartmentSplit,
}: {
  checkId: string;
  currentCheckNumber: string | null;
  currentDueDate: string | null;
  currentPaymentMethod?: string;
  currentDepartmentId?: string | null;
  amount: number;
  departments: Department[];
  hasExistingDepartmentSplit?: boolean;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"collapsed" | "choose" | "single" | "spread">("collapsed");
  const [paymentMethod, setPaymentMethod] = useState<"CHECK" | "TRANSFER">(
    currentPaymentMethod === "TRANSFER" ? "TRANSFER" : "CHECK",
  );
  const [checkNumber, setCheckNumber] = useState(currentCheckNumber ?? "");
  const [dueDate, setDueDate] = useState(currentDueDate ?? "");
  const [isSplitting, setIsSplitting] = useState(false);
  const [allocations, setAllocations] = useState<CheckAllocationInput[]>([]);
  // A check that already belongs to one plain department (the common case
  // — not a multi-department split) must keep that department when it's
  // turned into a spread, so every generated row starts pre-filled with it
  // instead of a blank picker that's easy to miss and silently loses the
  // department association.
  const [spreadRows, setSpreadRows] = useState<SpreadDraftRow[]>([
    { date: "", amount, checkNumber: "", departmentId: currentDepartmentId ?? "" },
  ]);
  const [spreadCount, setSpreadCount] = useState(2);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function applyAutoSpread() {
    const amounts = computeAutoSpreadAmounts(amount, spreadCount);
    setSpreadRows((prev) =>
      amounts.map((rowAmount, i) => ({
        date: prev[i]?.date ?? "",
        amount: rowAmount,
        checkNumber: "",
        departmentId: prev[i]?.departmentId ?? currentDepartmentId ?? "",
      })),
    );
  }

  const isComplete = Boolean(dueDate) && (paymentMethod !== "CHECK" || Boolean(checkNumber));

  function submitSingle() {
    setError(null);
    startTransition(async () => {
      const result = await issueCheck(checkId, {
        checkNumber: checkNumber || null,
        dueDate: dueDate || null,
        paymentMethod,
        allocations: isSplitting ? allocations : [],
      });
      if (result.error) setError(result.error);
      else {
        setMode("collapsed");
        router.refresh();
      }
    });
  }

  function submitSpread() {
    setError(null);
    startTransition(async () => {
      const result = await convertPendingCheckToSpread(
        checkId,
        spreadRows
          .filter((r) => r.amount > 0)
          .map((r) => ({
            date: r.date || null,
            amount: r.amount,
            checkNumber: r.checkNumber || null,
            departmentId: r.departmentId || null,
            allocations: [],
          })),
      );
      if (result.error) setError(result.error);
      else {
        setMode("collapsed");
        router.refresh();
      }
    });
  }

  function handleIssueClick() {
    if (isComplete) {
      submitSingle();
    } else {
      setMode("choose");
    }
  }

  if (mode === "collapsed") {
    return (
      <button
        disabled={isPending}
        onClick={handleIssueClick}
        className="rounded bg-primary text-primary-foreground text-xs px-3 py-1 disabled:opacity-50"
      >
        הנפק
      </button>
    );
  }

  if (mode === "choose") {
    return (
      <div className="flex flex-col gap-1">
        <p className="text-xs text-muted">חסרים פרטים — איך להנפיק?</p>
        <div className="flex flex-wrap gap-1">
          <button onClick={() => setMode("single")} className="rounded border border-border text-xs px-2 py-1">
            צ׳ק / העברה בודדת
          </button>
          <button
            onClick={() => {
              setIsSplitting(true);
              setMode("single");
            }}
            className="rounded border border-border text-xs px-2 py-1"
          >
            פיצול בין מחלקות
          </button>
          <button onClick={() => setMode("spread")} className="rounded border border-border text-xs px-2 py-1">
            פריסה לכמה תשלומים
          </button>
          <button onClick={() => setMode("collapsed")} className="text-xs text-muted">
            ביטול
          </button>
        </div>
      </div>
    );
  }

  if (mode === "spread") {
    const roundedAmounts = spreadRows.map((r) => r.amount);
    const lastAmount = roundedAmounts[roundedAmounts.length - 1] ?? 0;
    const baseAmount = roundedAmounts.length > 1 ? roundedAmounts[0] : 0;
    const roundingLeftover =
      roundedAmounts.length > 1 ? Math.round((lastAmount - baseAmount) * 100) / 100 : 0;
    return (
      <div className="flex flex-col gap-1 min-w-[280px]">
        {hasExistingDepartmentSplit && (
          <p className="text-xs text-warning">
            הצ׳ק המקורי מפוצל בין כמה מחלקות — הפיצול יישמר באופן יחסי בכל תשלום בפריסה, ללא צורך לבחור מחלקה כאן.
          </p>
        )}
        <div className="flex items-center gap-1">
          <span className="text-xs text-muted">לכמה תשלומים לפרוס:</span>
          <input
            type="number"
            min={1}
            value={spreadCount}
            onChange={(e) => setSpreadCount(Number(e.target.value) || 1)}
            className="w-16 rounded border border-border bg-transparent px-1 py-0.5 text-xs"
          />
          <button type="button" onClick={applyAutoSpread} className="rounded border border-border text-xs px-2 py-1">
            חשב פריסה אוטומטית
          </button>
        </div>
        {roundingLeftover > 0 && (
          <p className="text-xs text-muted">
            כל תשלום מעוגל ל-{formatCurrency(baseAmount)}; {formatCurrency(roundingLeftover)} שנותרו מהעיגול נוספו
            לתשלום האחרון ({formatCurrency(lastAmount)}).
          </p>
        )}
        <p className="text-xs text-muted">
          קביעת תאריך לתשלום הראשון תמלא אוטומטית את שאר התשלומים בהמשך הסדרה (חודש אחרי חודש) — אפשר לשנות כל שורה בנפרד.
        </p>
        {spreadRows.map((row, i) => (
          <div key={i} className="flex items-center gap-1">
            <input
              type="date"
              value={row.date}
              onChange={(e) => {
                const value = e.target.value;
                setSpreadRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, date: value } : r)));
              }}
              onBlur={(e) => {
                const value = e.target.value;
                // Cascading into the rest of the series only happens once
                // the first payment's date is actually finished (on blur),
                // not on every keystroke while it's still being typed —
                // every row stays freely editable afterward regardless.
                if (i === 0 && value) {
                  setSpreadRows((prev) => prev.map((r, idx) => (idx === 0 ? r : { ...r, date: addMonths(value, idx) })));
                }
              }}
              className="rounded border border-border bg-transparent px-1 py-0.5 text-xs"
            />
            <input
              type="number"
              value={row.amount || ""}
              onChange={(e) =>
                setSpreadRows((prev) =>
                  prev.map((r, idx) => (idx === i ? { ...r, amount: Number(e.target.value) || 0 } : r)),
                )
              }
              placeholder="סכום"
              className="w-20 rounded border border-border bg-transparent px-1 py-0.5 text-xs"
            />
            {paymentMethod === "CHECK" && (
              <input
                value={row.checkNumber}
                onChange={(e) =>
                  setSpreadRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, checkNumber: e.target.value } : r)))
                }
                placeholder="מס׳ צ׳ק"
                className="w-20 rounded border border-border bg-transparent px-1 py-0.5 text-xs"
              />
            )}
            <SearchableSelect
              value={row.departmentId}
              onChange={(id) =>
                setSpreadRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, departmentId: id } : r)))
              }
              options={departments.map((d) => ({ id: d.id, label: d.name }))}
              placeholder="מחלקה"
              className="rounded border border-border bg-transparent px-1 py-0.5 text-xs"
            />
            {spreadRows.length > 1 && (
              <button
                onClick={() => setSpreadRows((prev) => prev.filter((_, idx) => idx !== i))}
                className="text-xs text-danger"
              >
                ✕
              </button>
            )}
          </div>
        ))}
        <div className="flex items-center gap-2">
          <button
            onClick={() =>
              setSpreadRows((prev) => [
                ...prev,
                { date: "", amount: 0, checkNumber: "", departmentId: currentDepartmentId ?? "" },
              ])
            }
            className="text-xs text-primary underline"
          >
            + תשלום
          </button>
          <button
            disabled={isPending}
            onClick={submitSpread}
            className="rounded bg-primary text-primary-foreground text-xs px-3 py-1 disabled:opacity-50"
          >
            שמור פריסה
          </button>
          <button onClick={() => setMode("choose")} className="text-xs text-muted">
            חזרה
          </button>
        </div>
        {error && <p className="text-xs text-danger">{error}</p>}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={paymentMethod}
          onChange={(e) => setPaymentMethod(e.target.value as "CHECK" | "TRANSFER")}
          className="rounded border border-border bg-transparent px-1 py-0.5 text-xs"
        >
          <option value="CHECK">צ׳ק</option>
          <option value="TRANSFER">העברה</option>
        </select>
        {paymentMethod === "CHECK" && (
          <input
            value={checkNumber}
            onChange={(e) => setCheckNumber(e.target.value)}
            placeholder="מספר צ׳ק"
            className="w-24 rounded border border-border bg-transparent px-2 py-1 text-xs"
          />
        )}
        <input
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          className="rounded border border-border bg-transparent px-2 py-1 text-xs"
        />
        <label className="flex items-center gap-1 text-xs">
          <input type="checkbox" checked={isSplitting} onChange={(e) => setIsSplitting(e.target.checked)} />
          פצל
        </label>
        <button
          disabled={isPending}
          onClick={submitSingle}
          className="rounded bg-primary text-primary-foreground text-xs px-3 py-1 disabled:opacity-50"
        >
          הנפק
        </button>
        <button onClick={() => setMode("choose")} className="text-xs text-muted">
          חזרה
        </button>
      </div>
      {isSplitting && (
        <SplitAllocationEditor
          departments={departments}
          totalAmount={amount}
          allocations={allocations}
          onChange={setAllocations}
        />
      )}
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}

// Admin-only edit/delete for an existing check or transfer, inline in the
// full checks table row.
// Just the "עריכה" action — its own button plus the edit form, opened as a
// real Modal (native <dialog>, its own top layer) rather than inline inside
// a RowActionsMenu dropdown: SearchableSelect's own Radix Popover silently
// failed to open when nested inside the RowActionsMenu's Radix DropdownMenu,
// two floating layers competing for the same focus/dismiss handling. Split
// out from EditDeleteCheckRow so a table that only wants editing (finance
// admin only, same as every write here) can use just this, without also
// pulling in cancel/cancel-and-replace/delete.
export function EditCheckButton({
  checkId,
  payee,
  amount,
  dueDate,
  checkNumber,
  departmentId,
  notes,
  paymentMethod,
  existingAllocations,
  departments,
}: {
  checkId: string;
  payee: string;
  amount: number;
  dueDate: string | null;
  checkNumber: string | null;
  departmentId: string | null;
  notes: string | null;
  paymentMethod?: string;
  existingAllocations?: CheckAllocationInput[];
  departments: Department[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [editPayee, setEditPayee] = useState(payee);
  const [editAmount, setEditAmount] = useState(amount);
  const [editDueDate, setEditDueDate] = useState(dueDate ?? "");
  const [editCheckNumber, setEditCheckNumber] = useState(checkNumber ?? "");
  const [editDepartmentId, setEditDepartmentId] = useState(departmentId ?? "");
  const [editNotes, setEditNotes] = useState(notes ?? "");
  const [editPaymentMethod, setEditPaymentMethod] = useState<"CHECK" | "TRANSFER">(
    paymentMethod === "TRANSFER" ? "TRANSFER" : "CHECK",
  );
  const [isSplitting, setIsSplitting] = useState((existingAllocations ?? []).length > 0);
  const [allocations, setAllocations] = useState<CheckAllocationInput[]>(existingAllocations ?? []);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await updateCheck(checkId, {
        payee: editPayee,
        amount: editAmount,
        dueDate: editDueDate || null,
        checkNumber: editCheckNumber || null,
        departmentId: editDepartmentId || null,
        notes: editNotes || null,
        paymentMethod: editPaymentMethod,
        allocations: isSplitting ? allocations : [],
      });
      if (result.error) setError(result.error);
      else {
        setEditing(false);
        router.refresh();
      }
    });
  }

  return (
    <>
      <button onClick={() => setEditing(true)} className={rowActionButtonClass("primary")}>
        עריכה
      </button>
      {editing && (
        <Modal onClose={() => setEditing(false)}>
          <div className="card flex flex-col gap-2 p-4 min-w-[280px]">
            <input
              value={editPayee}
              onChange={(e) => setEditPayee(e.target.value)}
              placeholder="מוטב"
              list="supplier-names"
              className="rounded border border-border bg-transparent px-2 py-1 text-xs"
            />
            <select
              value={editPaymentMethod}
              onChange={(e) => setEditPaymentMethod(e.target.value as "CHECK" | "TRANSFER")}
              className="rounded border border-border bg-transparent px-2 py-1 text-xs"
            >
              <option value="CHECK">צ׳ק</option>
              <option value="TRANSFER">העברה</option>
            </select>
            <input
              type="number"
              value={editAmount || ""}
              onChange={(e) => setEditAmount(Number(e.target.value) || 0)}
              placeholder="סכום"
              className="rounded border border-border bg-transparent px-2 py-1 text-xs"
            />
            <MiniCalculator onApply={setEditAmount} />
            <input
              type="date"
              value={editDueDate}
              onChange={(e) => setEditDueDate(e.target.value)}
              className="rounded border border-border bg-transparent px-2 py-1 text-xs"
            />
            {editPaymentMethod === "CHECK" && (
              <input
                value={editCheckNumber}
                onChange={(e) => setEditCheckNumber(e.target.value)}
                placeholder="מספר צ׳ק"
                className="rounded border border-border bg-transparent px-2 py-1 text-xs"
              />
            )}
            <label className="flex items-center gap-1 text-xs">
              <input type="checkbox" checked={isSplitting} onChange={(e) => setIsSplitting(e.target.checked)} />
              פצל בין מחלקות
            </label>
            {!isSplitting ? (
              <SearchableSelect
                value={editDepartmentId}
                onChange={setEditDepartmentId}
                options={departments.map((d) => ({ id: d.id, label: d.name }))}
                placeholder="מחלקה (ריק = ימתין לסיווג)"
                className="rounded border border-border bg-transparent px-2 py-1 text-xs"
              />
            ) : (
              <SplitAllocationEditor
                departments={departments}
                totalAmount={editAmount}
                allocations={allocations}
                onChange={setAllocations}
              />
            )}
            <input
              value={editNotes}
              onChange={(e) => setEditNotes(e.target.value)}
              placeholder="הערות"
              className="rounded border border-border bg-transparent px-2 py-1 text-xs"
            />
            <div className="flex items-center gap-2">
              <button
                disabled={isPending}
                onClick={save}
                className="rounded bg-primary text-primary-foreground text-xs px-3 py-1 disabled:opacity-50"
              >
                שמור
              </button>
              <button onClick={() => setEditing(false)} className="text-xs text-muted">
                ביטול
              </button>
            </div>
            {error && <p className="text-xs text-danger">{error}</p>}
          </div>
        </Modal>
      )}
    </>
  );
}

export function EditDeleteCheckRow({
  checkId,
  payee,
  amount,
  dueDate,
  checkNumber,
  departmentId,
  notes,
  paymentMethod,
  bankAccountId,
  bankAccounts = [],
  existingAllocations,
  departments,
}: {
  checkId: string;
  payee: string;
  amount: number;
  dueDate: string | null;
  checkNumber: string | null;
  departmentId: string | null;
  notes: string | null;
  paymentMethod?: string;
  bankAccountId?: string | null;
  bankAccounts?: MinimalBankAccount[];
  existingAllocations?: CheckAllocationInput[];
  departments: Department[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function remove() {
    if (!confirm(`למחוק את הצ׳ק/העברה למוטב "${payee}"?`)) return;
    startTransition(async () => {
      const result = await deleteCheck(checkId);
      if (result.error) setError(result.error);
      else router.refresh();
    });
  }

  return (
    <>
      <EditCheckButton
        checkId={checkId}
        payee={payee}
        amount={amount}
        dueDate={dueDate}
        checkNumber={checkNumber}
        departmentId={departmentId}
        notes={notes}
        paymentMethod={paymentMethod}
        existingAllocations={existingAllocations}
        departments={departments}
      />
      <CancelCheckButton checkId={checkId} variant="menu" />
      <CancelAndReplaceCheckButton
        checkId={checkId}
        payee={payee}
        amount={amount}
        currentPaymentMethod={paymentMethod}
        currentDueDate={dueDate}
        currentBankAccountId={bankAccountId}
        bankAccounts={bankAccounts}
        variant="menu"
      />
      <button disabled={isPending} onClick={remove} className={rowActionButtonClass("danger")}>
        מחיקה
      </button>
      {error && <p className="px-3 py-1 text-xs text-danger">{error}</p>}
    </>
  );
}
