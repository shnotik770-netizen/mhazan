"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  classifyCheck,
  createCheck,
  createDeptExpenseRequest,
  deleteCheck,
  issueCheck,
  updateCheck,
  updateCheckStatus,
  type CheckAllocationInput,
} from "@/app/(app)/checks/actions";
import { SplitAllocationEditor } from "@/components/split-allocation-editor";
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

export function CheckStatusControls({ checkId, status }: { checkId: string; status: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function setStatus(next: "UNPAID" | "CLEARED" | "CANCELLED") {
    startTransition(async () => {
      await updateCheckStatus(checkId, next);
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
      {status === "UNPAID" && (
        <>
          <button disabled={isPending} onClick={() => setStatus("CLEARED")} className="text-xs text-primary underline">
            סמן כנפרע
          </button>
          <button disabled={isPending} onClick={() => setStatus("CANCELLED")} className="text-xs text-danger underline">
            בטל
          </button>
        </>
      )}
    </div>
  );
}

// "Confirm executed" is exactly marking a transfer CLEARED — the same
// status transition, framed for the overdue-transfer verification queue.
export function VerifyTransferButton({ checkId }: { checkId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <button
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          await updateCheckStatus(checkId, "CLEARED");
          router.refresh();
        })
      }
      className="rounded bg-primary text-primary-foreground text-xs px-3 py-1 disabled:opacity-50"
    >
      אשר שההעברה בוצעה
    </button>
  );
}

export function NewCheckForm({
  bankAccounts,
  departments,
  categories,
}: {
  bankAccounts: BankAccount[];
  departments: Department[];
  categories: Category[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"CHECK" | "TRANSFER">("CHECK");
  const [bankAccountId, setBankAccountId] = useState("");
  const [payee, setPayee] = useState("");
  const [amount, setAmount] = useState(0);
  const [dueDate, setDueDate] = useState("");
  const [checkNumber, setCheckNumber] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [internalBeneficiary, setInternalBeneficiary] = useState("");
  const [notes, setNotes] = useState("");
  const [skipDepartmentLedger, setSkipDepartmentLedger] = useState(false);
  const [isSplitting, setIsSplitting] = useState(false);
  const [allocations, setAllocations] = useState<CheckAllocationInput[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function reset() {
    setPaymentMethod("CHECK");
    setBankAccountId("");
    setPayee("");
    setAmount(0);
    setDueDate("");
    setCheckNumber("");
    setDepartmentId("");
    setCategoryId("");
    setInternalBeneficiary("");
    setNotes("");
    setSkipDepartmentLedger(false);
    setIsSplitting(false);
    setAllocations([]);
    setError(null);
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await createCheck({
        paymentMethod,
        bankAccountId,
        payee,
        amount,
        dueDate: dueDate || null,
        checkNumber: checkNumber || null,
        departmentId: departmentId || null,
        categoryId: categoryId || null,
        internalBeneficiary: internalBeneficiary || null,
        notes: notes || null,
        skipDepartmentLedger,
        allocations: isSplitting ? allocations : [],
      });
      if (result.error) {
        setError(result.error);
      } else {
        reset();
        setOpen(false);
        router.refresh();
      }
    });
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold"
      >
        + צ׳ק / העברה חדשה
      </button>
    );
  }

  return (
    <div className="card p-4 space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
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
        <input
          type="number"
          value={amount || ""}
          onChange={(e) => setAmount(Number(e.target.value) || 0)}
          placeholder="סכום"
          className="rounded border border-border bg-transparent px-2 py-1 text-sm"
        />
        <input
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          className="rounded border border-border bg-transparent px-2 py-1 text-sm"
          title="ניתן להשאיר ריק"
        />
        {paymentMethod === "CHECK" && (
          <input
            value={checkNumber}
            onChange={(e) => setCheckNumber(e.target.value)}
            placeholder="מספר צ׳ק (ניתן להשאיר ריק)"
            className="rounded border border-border bg-transparent px-2 py-1 text-sm"
          />
        )}
        {paymentMethod === "TRANSFER" && (
          <input
            value={internalBeneficiary}
            onChange={(e) => setInternalBeneficiary(e.target.value)}
            placeholder="מוטב פנימי בתוך הספק (אופציונלי)"
            className="rounded border border-border bg-transparent px-2 py-1 text-sm"
          />
        )}
        {!isSplitting && (
          <select
            value={departmentId}
            onChange={(e) => setDepartmentId(e.target.value)}
            className="rounded border border-border bg-transparent px-2 py-1 text-sm"
          >
            <option value="">מחלקה (ריק = ימתין לסיווג)</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        )}
        <select
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          className="rounded border border-border bg-transparent px-2 py-1 text-sm"
        >
          <option value="">קטגוריה (אופציונלי)</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="הערות"
          className="rounded border border-border bg-transparent px-2 py-1 text-sm"
        />
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-1 text-sm">
          <input type="checkbox" checked={isSplitting} onChange={(e) => setIsSplitting(e.target.checked)} />
          פצל בין מחלקות
        </label>
        <label className="flex items-center gap-1 text-sm">
          <input
            type="checkbox"
            checked={skipDepartmentLedger}
            onChange={(e) => setSkipDepartmentLedger(e.target.checked)}
          />
          כבר נכלל בחישוב הישן (לא לכלול במאזן הפנימי של המחלקה)
        </label>
      </div>

      {isSplitting && (
        <SplitAllocationEditor
          departments={departments}
          totalAmount={amount}
          allocations={allocations}
          onChange={setAllocations}
        />
      )}

      <div className="flex items-center gap-2">
        <button
          disabled={isPending || !bankAccountId || !payee || amount <= 0}
          onClick={submit}
          className="rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold disabled:opacity-50"
        >
          שמור
        </button>
        <button
          type="button"
          onClick={() => {
            reset();
            setOpen(false);
          }}
          className="text-sm text-muted"
        >
          ביטול
        </button>
        {error && <span className="text-sm text-danger">{error}</span>}
      </div>
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
        <input
          type="number"
          value={amount || ""}
          onChange={(e) => setAmount(Number(e.target.value) || 0)}
          placeholder="סכום"
          className="rounded border border-border bg-transparent px-2 py-1 text-sm"
        />
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

// Finance admin's finalization step for a request that's missing a check
// number and/or a due date.
export function IssueCheckRow({
  checkId,
  currentCheckNumber,
  currentDueDate,
  amount,
  departments,
}: {
  checkId: string;
  currentCheckNumber: string | null;
  currentDueDate: string | null;
  amount: number;
  departments: Department[];
}) {
  const router = useRouter();
  const [checkNumber, setCheckNumber] = useState(currentCheckNumber ?? "");
  const [dueDate, setDueDate] = useState(currentDueDate ?? "");
  const [isSplitting, setIsSplitting] = useState(false);
  const [allocations, setAllocations] = useState<CheckAllocationInput[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await issueCheck(checkId, {
        checkNumber: checkNumber || null,
        dueDate: dueDate || null,
        allocations: isSplitting ? allocations : [],
      });
      if (result.error) setError(result.error);
      else router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <input
          value={checkNumber}
          onChange={(e) => setCheckNumber(e.target.value)}
          placeholder="מספר צ׳ק"
          className="w-24 rounded border border-border bg-transparent px-2 py-1 text-xs"
        />
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
          onClick={submit}
          className="rounded bg-primary text-primary-foreground text-xs px-3 py-1 disabled:opacity-50"
        >
          הנפק
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
  departments,
}: {
  checkId: string;
  payee: string;
  amount: number;
  dueDate: string | null;
  checkNumber: string | null;
  departmentId: string | null;
  notes: string | null;
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
      <input
        type="number"
        value={editAmount || ""}
        onChange={(e) => setEditAmount(Number(e.target.value) || 0)}
        placeholder="סכום"
        className="rounded border border-border bg-transparent px-2 py-1 text-xs"
      />
      <input
        type="date"
        value={editDueDate}
        onChange={(e) => setEditDueDate(e.target.value)}
        className="rounded border border-border bg-transparent px-2 py-1 text-xs"
      />
      <input
        value={editCheckNumber}
        onChange={(e) => setEditCheckNumber(e.target.value)}
        placeholder="מספר צ׳ק"
        className="rounded border border-border bg-transparent px-2 py-1 text-xs"
      />
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
