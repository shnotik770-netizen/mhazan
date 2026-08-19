"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createExpectedIncome,
  deleteExpectedIncome,
  updateBankBalance,
  updateExpectedIncome,
  updateExpectedIncomeStatus,
} from "@/app/(app)/forecast/actions";
import { DateInput } from "@/components/date-input";
import { Modal } from "@/components/modal";
import { formatCurrency, formatDate, todayIso, daysAgoLabel } from "@/lib/format";
import type { Tables } from "@/lib/supabase/database.types";

type ExpectedIncome = Tables<"expected_incomes">;
type BankAccountOption = { id: string; bank_name: string; account_number: string };

// When early_by_days is set, the money is known to typically land that many
// days before expected_date — so "needs confirmation" should open that much
// earlier too, instead of waiting for the nominal date itself to pass.
function dueDateIso(income: Pick<ExpectedIncome, "expected_date" | "early_by_days">): string {
  if (!income.early_by_days) return income.expected_date;
  const d = new Date(`${income.expected_date}T00:00:00`);
  d.setDate(d.getDate() - income.early_by_days);
  return d.toISOString().slice(0, 10);
}

export function BankBalancePanel({
  bankAccountId,
  currentBalance,
  balanceAsOf,
}: {
  bankAccountId: string;
  currentBalance: number;
  balanceAsOf: string | null;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(currentBalance));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await updateBankBalance(bankAccountId, Number(value) || 0);
      if (result.error) setError(result.error);
      else {
        setEditing(false);
        router.refresh();
      }
    });
  }

  return (
    <div className="card p-4">
      <p className="text-sm text-muted mb-1">יתרת פתיחה נוכחית בבנק</p>
      {!editing ? (
        <div className="flex items-center gap-3">
          <p className="text-2xl font-bold">{formatCurrency(currentBalance)}</p>
          <span className="text-xs text-muted">{daysAgoLabel(balanceAsOf)}</span>
          <button onClick={() => setEditing(true)} className="text-xs text-primary underline">
            עדכון יתרה
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <input
            type="number"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="rounded border border-border bg-transparent px-2 py-1 text-sm w-40"
          />
          <button
            disabled={isPending}
            onClick={save}
            className="rounded bg-primary text-primary-foreground text-xs px-3 py-1.5 disabled:opacity-50"
          >
            שמור
          </button>
          <button onClick={() => setEditing(false)} className="text-xs text-muted">
            ביטול
          </button>
        </div>
      )}
      {error && <p className="text-xs text-danger mt-1">{error}</p>}
      <p className="text-xs text-muted mt-2">
        עדכון כאן קובע ידנית את יתרת הבנק שממנה מחושבת התחזית למטה — לשימוש כשהיתרה בפועל שונה מסך ההכנסות/הוצאות
        שנרשמו במערכת.
      </p>
    </div>
  );
}

export function ExpectedIncomeManager({
  bankAccountId,
  bankAccounts,
  expectedIncomes,
}: {
  bankAccountId: string;
  bankAccounts: BankAccountOption[];
  expectedIncomes: ExpectedIncome[];
}) {
  const needsConfirmationCount = expectedIncomes.filter(
    (e) => e.status === "PENDING" && dueDateIso(e) <= todayIso(),
  ).length;

  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-semibold">הכנסות עתידיות צפויות (הערכה, לא מדוייקת)</h2>
          <p className="text-xs text-muted">
            לדוגמה: סיכומי חברת אשראי או מקורות אחרים שידוע כי יגיעו בתאריך משוער. מופיע בתחזית בלבד — לא משפיע על
            היתרה או ההכנסות בפועל, עד שמסמנים שאכן התקבל. כל עוד לא סומן, ההכנסה נשארת בתחזית גם אחרי שהתאריך עבר.
          </p>
        </div>
        <AddExpectedIncomeButton bankAccountId={bankAccountId} bankAccounts={bankAccounts} />
      </div>

      {needsConfirmationCount > 0 && (
        <p className="text-sm font-medium text-warning bg-warning-bg rounded-lg px-3 py-2">
          ⚠ {needsConfirmationCount} הכנסות צפויות עברו את התאריך שלהן וטרם סומנו — האם התקבלו בפועל? (ראו שורות
          מסומנות למטה)
        </p>
      )}

      {expectedIncomes.length > 0 && (
        <div className="overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>תאריך</th>
              <th>תיאור</th>
              <th>סכום</th>
              <th>סטטוס</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {expectedIncomes.map((e) => (
              <ExpectedIncomeRow key={e.id} income={e} bankAccounts={bankAccounts} />
            ))}
          </tbody>
        </table>
        </div>
      )}
    </div>
  );
}

function AddExpectedIncomeButton({
  bankAccountId,
  bankAccounts,
}: {
  bankAccountId: string;
  bankAccounts: BankAccountOption[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold whitespace-nowrap"
      >
        + הכנסה צפויה חדשה
      </button>
      {open && (
        <Modal onClose={() => setOpen(false)}>
          <div className="card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">הכנסה צפויה חדשה</h2>
              <button type="button" onClick={() => setOpen(false)} className="text-sm text-muted">
                סגור
              </button>
            </div>
            <ExpectedIncomeForm
              bankAccountId={bankAccountId}
              bankAccounts={bankAccounts}
              onSaved={() => setOpen(false)}
            />
          </div>
        </Modal>
      )}
    </>
  );
}

function ExpectedIncomeForm({
  bankAccountId,
  bankAccounts,
  onSaved,
}: {
  bankAccountId: string;
  bankAccounts: BankAccountOption[];
  onSaved: () => void;
}) {
  const router = useRouter();
  const [targetAccountId, setTargetAccountId] = useState(bankAccountId);
  const [amount, setAmount] = useState(0);
  const [expectedDate, setExpectedDate] = useState("");
  const [description, setDescription] = useState("");
  const [repeats, setRepeats] = useState(false);
  const [repeatMonths, setRepeatMonths] = useState("");
  const [earlyByDays, setEarlyByDays] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit() {
    setError(null);
    if (repeats && (!repeatMonths || Number(repeatMonths) < 2)) {
      setError("יש להזין מספר חודשים תקין (2 ומעלה), או לבטל את הישנות ההכנסה");
      return;
    }
    startTransition(async () => {
      const result = await createExpectedIncome({
        bankAccountId: targetAccountId,
        amount,
        expectedDate,
        description: description || null,
        repeatMonths: repeats ? Number(repeatMonths) : 1,
        earlyByDays: earlyByDays ? Number(earlyByDays) : 0,
      });
      if (result.error) setError(result.error);
      else {
        router.refresh();
        onSaved();
      }
    });
  }

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <select
          value={targetAccountId}
          onChange={(e) => setTargetAccountId(e.target.value)}
          className="rounded border border-border bg-transparent px-2 py-1 text-sm"
        >
          <option value="">חשבון בנק...</option>
          {bankAccounts.map((b) => (
            <option key={b.id} value={b.id}>
              {b.bank_name} ({b.account_number})
            </option>
          ))}
        </select>
        <input
          type="number"
          value={amount || ""}
          onChange={(e) => setAmount(Number(e.target.value) || 0)}
          placeholder="סכום משוער"
          className="rounded border border-border bg-transparent px-2 py-1 text-sm"
        />
        <DateInput value={expectedDate} onChange={setExpectedDate} required />
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="תיאור / מקור"
          className="rounded border border-border bg-transparent px-2 py-1 text-sm"
        />
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <label className="flex items-center gap-1 text-xs text-muted whitespace-nowrap">
          <input
            type="checkbox"
            checked={repeats}
            onChange={(e) => {
              setRepeats(e.target.checked);
              if (!e.target.checked) setRepeatMonths("");
            }}
          />
          חוזר כל חודש (לא הכנסה חד-פעמית)
        </label>
        {repeats && (
          <input
            type="number"
            min="2"
            value={repeatMonths}
            onChange={(e) => setRepeatMonths(e.target.value)}
            placeholder="כמה חודשים"
            className="rounded border border-border bg-transparent px-2 py-1 text-sm w-28"
          />
        )}
      </div>
      <div className="flex items-center gap-1">
        <input
          type="number"
          min="0"
          value={earlyByDays}
          onChange={(e) => setEarlyByDays(e.target.value)}
          placeholder="0"
          className="rounded border border-border bg-transparent px-2 py-1 text-sm w-16"
        />
        <label className="text-xs text-muted whitespace-nowrap">ימים לפני התאריך זה בדרך כלל כבר קורה</label>
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
      <button
        disabled={isPending || amount <= 0 || !expectedDate || !targetAccountId}
        onClick={submit}
        className="rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold disabled:opacity-50"
      >
        הוספה
      </button>
    </div>
  );
}

function ExpectedIncomeRow({ income, bankAccounts }: { income: ExpectedIncome; bankAccounts: BankAccountOption[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [bankAccountId, setBankAccountId] = useState(income.bank_account_id);
  const [amount, setAmount] = useState(String(income.amount));
  const [expectedDate, setExpectedDate] = useState(income.expected_date);
  const [description, setDescription] = useState(income.description ?? "");
  const [earlyByDays, setEarlyByDays] = useState(String(income.early_by_days));
  const [error, setError] = useState<string | null>(null);
  const isPast = dueDateIso(income) <= todayIso();

  function setStatus(status: "PENDING" | "CONFIRMED" | "NOT_RECEIVED") {
    const updateBalance = status === "CONFIRMED" && confirm("ההכנסה סומנה כהתקבלה. האם לעדכן בהתאם את יתרת חשבון הבנק?");
    startTransition(async () => {
      await updateExpectedIncomeStatus(income.id, status, updateBalance);
      router.refresh();
    });
  }

  function remove() {
    if (!confirm("למחוק את ההכנסה הצפויה?")) return;
    startTransition(async () => {
      await deleteExpectedIncome(income.id);
      router.refresh();
    });
  }

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await updateExpectedIncome(income.id, {
        bankAccountId,
        amount: Number(amount) || 0,
        expectedDate,
        description: description || null,
        earlyByDays: Number(earlyByDays) || 0,
      });
      if (result.error) setError(result.error);
      else {
        setEditing(false);
        router.refresh();
      }
    });
  }

  const needsConfirmation = isPast && income.status === "PENDING";

  if (editing) {
    return (
      <tr>
        <td colSpan={5}>
          <div className="flex flex-wrap items-center gap-2 py-1">
            <select
              value={bankAccountId}
              onChange={(e) => setBankAccountId(e.target.value)}
              className="rounded border border-border bg-transparent px-2 py-1 text-sm"
            >
              {bankAccounts.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.bank_name} ({b.account_number})
                </option>
              ))}
            </select>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="rounded border border-border bg-transparent px-2 py-1 text-sm w-28"
            />
            <DateInput value={expectedDate} onChange={setExpectedDate} required />
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="תיאור / מקור"
              className="rounded border border-border bg-transparent px-2 py-1 text-sm"
            />
            <div className="flex items-center gap-1">
              <input
                type="number"
                min="0"
                value={earlyByDays}
                onChange={(e) => setEarlyByDays(e.target.value)}
                className="rounded border border-border bg-transparent px-2 py-1 text-sm w-16"
              />
              <label className="text-xs text-muted whitespace-nowrap">ימים מראש</label>
            </div>
            <button disabled={isPending} onClick={save} className="rounded bg-primary text-primary-foreground text-xs px-3 py-1 disabled:opacity-50">
              שמור
            </button>
            <button disabled={isPending} onClick={() => setEditing(false)} className="text-xs text-muted">
              ביטול
            </button>
          </div>
          {error && <p className="text-xs text-danger">{error}</p>}
        </td>
      </tr>
    );
  }

  return (
    <tr className={needsConfirmation ? "bg-warning-bg/40" : undefined}>
      <td>
        {formatDate(income.expected_date)}
        {income.early_by_days > 0 && <div className="text-xs text-muted">מגיע כ-{income.early_by_days} ימים לפני</div>}
      </td>
      <td>{income.description ?? "—"}</td>
      <td>{formatCurrency(Number(income.amount))}</td>
      <td>
        <span
          className={`badge ${
            income.status === "CONFIRMED"
              ? "bg-success-bg text-success"
              : income.status === "NOT_RECEIVED"
                ? "bg-danger-bg text-danger"
                : "bg-warning-bg text-warning"
          }`}
        >
          {income.status === "CONFIRMED" ? "התקבל" : income.status === "NOT_RECEIVED" ? "לא התקבל" : "ממתין"}
        </span>
      </td>
      <td>
        <div className="flex items-center gap-2">
          {isPast && income.status === "PENDING" && (
            <>
              <button disabled={isPending} onClick={() => setStatus("CONFIRMED")} className="text-xs text-success underline">
                סמן כהתקבל
              </button>
              <button disabled={isPending} onClick={() => setStatus("NOT_RECEIVED")} className="text-xs text-danger underline">
                סמן שלא התקבל
              </button>
            </>
          )}
          <button disabled={isPending} onClick={() => setEditing(true)} className="text-xs text-primary underline">
            עריכה
          </button>
          <button disabled={isPending} onClick={remove} className="text-xs text-muted underline">
            מחיקה
          </button>
        </div>
      </td>
    </tr>
  );
}
