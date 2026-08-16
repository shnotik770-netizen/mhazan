"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  classifyCheck,
  convertPendingCheckToSpread,
  createDeptExpenseRequest,
  deleteCheck,
  issueCheck,
  updateCheck,
  updateCheckStatus,
  type CheckAllocationInput,
} from "@/app/(app)/checks/actions";
import { SplitAllocationEditor } from "@/components/split-allocation-editor";
import { MiniCalculator } from "@/components/mini-calculator";
import type { Tables } from "@/lib/supabase/database.types";

type Department = Tables<"departments">;
type Category = Tables<"categories">;
type BankAccount = Tables<"bank_accounts"> & { departments: { name: string } | null };

export function ClassifyCheckRow({
  checkId,
  departments,
  categories,
}: {
  checkId: string;
  departments: Department[];
  categories: Category[];
}) {
  const router = useRouter();
  const [departmentId, setDepartmentId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [isPending, startTransition] = useTransition();

  return (
    <div className="flex items-center gap-2">
      <select
        className="rounded border border-border bg-transparent text-sm px-2 py-1"
        value={departmentId}
        onChange={(e) => {
          setDepartmentId(e.target.value);
          setCategoryId("");
        }}
      >
        <option value="">בחר מחלקה...</option>
        {departments.map((d) => (
          <option key={d.id} value={d.id}>
            {d.name}
          </option>
        ))}
      </select>
      <select
        className="rounded border border-border bg-transparent text-sm px-2 py-1"
        value={categoryId}
        onChange={(e) => setCategoryId(e.target.value)}
      >
        <option value="">קטגוריה (אופציונלי)</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <button
        disabled={!departmentId || isPending}
        onClick={() =>
          startTransition(async () => {
            await classifyCheck(checkId, departmentId, categoryId || null);
            router.refresh();
          })
        }
        className="rounded bg-primary text-primary-foreground text-xs px-3 py-1 disabled:opacity-50"
      >
        סווג
      </button>
    </div>
  );
}

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
export function VerifyTransferButton({
  checkId,
  label,
  captureInternalBeneficiary,
}: {
  checkId: string;
  label?: string;
  captureInternalBeneficiary?: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [internalBeneficiary, setInternalBeneficiary] = useState("");

  function confirm() {
    startTransition(async () => {
      await updateCheckStatus(checkId, "CLEARED", captureInternalBeneficiary ? internalBeneficiary || null : undefined);
      router.refresh();
    });
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
        onClick={confirm}
        className="rounded bg-primary text-primary-foreground text-xs px-3 py-1 disabled:opacity-50"
      >
        {label ?? "אשר שההעברה בוצעה"}
      </button>
    </div>
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
      <h2 className="font-semibold">בקשת הוצאה (צ׳ק / העברה)</h2>
      {!canSetDates && (
        <p className="text-xs text-muted">
          אין לך הרשאה לקבוע תאריך — הבקשה תיכנס כהוצאה ממתינה לאישור עד שמנהל הכספים יקבע תאריך.
        </p>
      )}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <select
          value={departmentId}
          onChange={(e) => setDepartmentId(e.target.value)}
          className="rounded border border-border bg-transparent px-2 py-1 text-sm"
        >
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
        <select
          value={paymentMethod}
          onChange={(e) => setPaymentMethod(e.target.value as "CHECK" | "TRANSFER")}
          className="rounded border border-border bg-transparent px-2 py-1 text-sm"
        >
          <option value="CHECK">צ׳ק</option>
          <option value="TRANSFER">העברה בנקאית</option>
        </select>
        <select
          value={bankAccountId}
          onChange={(e) => setBankAccountId(e.target.value)}
          className="rounded border border-border bg-transparent px-2 py-1 text-sm"
        >
          <option value="">חשבון בנק...</option>
          {bankAccounts.map((b) => (
            <option key={b.id} value={b.id}>
              {b.departments?.name} — {b.bank_name}
            </option>
          ))}
        </select>
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
export function IssueCheckRow({
  checkId,
  currentCheckNumber,
  currentDueDate,
  currentPaymentMethod,
  amount,
  departments,
}: {
  checkId: string;
  currentCheckNumber: string | null;
  currentDueDate: string | null;
  currentPaymentMethod?: string;
  amount: number;
  departments: Department[];
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
  const [spreadRows, setSpreadRows] = useState<SpreadDraftRow[]>([
    { date: "", amount, checkNumber: "", departmentId: "" },
  ]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

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
    return (
      <div className="flex flex-col gap-1 min-w-[260px]">
        <p className="text-xs text-muted">פריסה לכמה תשלומים — הסכומים המקוריים לא מחושבים אוטומטית</p>
        {spreadRows.map((row, i) => (
          <div key={i} className="flex items-center gap-1">
            <input
              type="date"
              value={row.date}
              onChange={(e) =>
                setSpreadRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, date: e.target.value } : r)))
              }
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
            <select
              value={row.departmentId}
              onChange={(e) =>
                setSpreadRows((prev) =>
                  prev.map((r, idx) => (idx === i ? { ...r, departmentId: e.target.value } : r)),
                )
              }
              className="rounded border border-border bg-transparent px-1 py-0.5 text-xs"
            >
              <option value="">מחלקה</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
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
            onClick={() => setSpreadRows((prev) => [...prev, { date: "", amount: 0, checkNumber: "", departmentId: "" }])}
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
export function EditDeleteCheckRow({
  checkId,
  payee,
  amount,
  dueDate,
  checkNumber,
  departmentId,
  notes,
  paymentMethod,
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
      });
      if (result.error) setError(result.error);
      else {
        setEditing(false);
        router.refresh();
      }
    });
  }

  function remove() {
    if (!confirm(`למחוק את הצ׳ק/העברה למוטב "${payee}"?`)) return;
    startTransition(async () => {
      const result = await deleteCheck(checkId);
      if (result.error) setError(result.error);
      else router.refresh();
    });
  }

  if (!editing) {
    return (
      <div className="flex items-center gap-2">
        <button onClick={() => setEditing(true)} className="text-xs text-primary underline">
          עריכה
        </button>
        <button disabled={isPending} onClick={remove} className="text-xs text-danger underline">
          מחיקה
        </button>
        {error && <p className="text-xs text-danger">{error}</p>}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1 min-w-[220px]">
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
      <select
        value={editDepartmentId}
        onChange={(e) => setEditDepartmentId(e.target.value)}
        className="rounded border border-border bg-transparent px-2 py-1 text-xs"
      >
        <option value="">מחלקה (ריק = ימתין לסיווג)</option>
        {departments.map((d) => (
          <option key={d.id} value={d.id}>
            {d.name}
          </option>
        ))}
      </select>
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
  );
}
