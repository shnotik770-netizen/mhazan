"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createExpectedIncome,
  deleteExpectedIncome,
  updateBankBalance,
  updateExpectedIncomeStatus,
} from "@/app/(app)/forecast/actions";
import { DateInput } from "@/components/date-input";
import { formatCurrency, formatDate, todayIso, daysAgoLabel } from "@/lib/format";
import type { Tables } from "@/lib/supabase/database.types";

type ExpectedIncome = Tables<"expected_incomes">;

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
  expectedIncomes,
}: {
  bankAccountId: string;
  expectedIncomes: ExpectedIncome[];
}) {
  const router = useRouter();
  const [amount, setAmount] = useState(0);
  const [expectedDate, setExpectedDate] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await createExpectedIncome({
        bankAccountId,
        amount,
        expectedDate,
        description: description || null,
      });
      if (result.error) setError(result.error);
      else {
        setAmount(0);
        setExpectedDate("");
        setDescription("");
        router.refresh();
      }
    });
  }

  const needsConfirmationCount = expectedIncomes.filter(
    (e) => e.status === "PENDING" && e.expected_date < todayIso(),
  ).length;

  return (
    <div className="card p-4 space-y-3">
      <div>
        <h2 className="font-semibold">הכנסות עתידיות צפויות (הערכה, לא מדוייקת)</h2>
        <p className="text-xs text-muted">
          לדוגמה: סיכומי חברת אשראי או מקורות אחרים שידוע כי יגיעו בתאריך משוער. מופיע בתחזית בלבד — לא משפיע על
          היתרה או ההכנסות בפועל, עד שמסמנים שאכן התקבל. כל עוד לא סומן, ההכנסה נשארת בתחזית גם אחרי שהתאריך עבר.
        </p>
      </div>

      {needsConfirmationCount > 0 && (
        <p className="text-sm font-medium text-warning bg-warning-bg rounded-lg px-3 py-2">
          ⚠ {needsConfirmationCount} הכנסות צפויות עברו את התאריך שלהן וטרם סומנו — האם התקבלו בפועל? (ראו שורות
          מסומנות למטה)
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2">
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
        <button
          disabled={isPending || amount <= 0 || !expectedDate}
          onClick={submit}
          className="rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold disabled:opacity-50"
        >
          הוספה
        </button>
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}

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
              <ExpectedIncomeRow key={e.id} income={e} />
            ))}
          </tbody>
        </table>
        </div>
      )}
    </div>
  );
}

function ExpectedIncomeRow({ income }: { income: ExpectedIncome }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const isPast = income.expected_date < todayIso();

  function setStatus(status: "PENDING" | "CONFIRMED" | "NOT_RECEIVED") {
    startTransition(async () => {
      await updateExpectedIncomeStatus(income.id, status);
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

  const needsConfirmation = isPast && income.status === "PENDING";

  return (
    <tr className={needsConfirmation ? "bg-warning-bg/40" : undefined}>
      <td>{formatDate(income.expected_date)}</td>
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
          <button disabled={isPending} onClick={remove} className="text-xs text-muted underline">
            מחיקה
          </button>
        </div>
      </td>
    </tr>
  );
}
