"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createManualEntry, reviewManualEntry } from "@/app/(app)/manual-entries/actions";
import { DateInput } from "@/components/date-input";
import type { Tables } from "@/lib/supabase/database.types";

type Department = Tables<"departments">;
type BankAccount = Tables<"bank_accounts">;

export function NewManualEntryForm({
  departments,
  bankAccounts,
  allDepartments,
}: {
  departments: Department[];
  bankAccounts: BankAccount[];
  allDepartments: Department[];
}) {
  const router = useRouter();
  const [departmentId, setDepartmentId] = useState("");
  const [direction, setDirection] = useState<"INCOME" | "EXPENSE">("EXPENSE");
  const [amount, setAmount] = useState(0);
  const [entryDate, setEntryDate] = useState("");
  const [notes, setNotes] = useState("");
  const [bankAccountId, setBankAccountId] = useState("");
  const [counterpartyDepartmentId, setCounterpartyDepartmentId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit() {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await createManualEntry({
        departmentId,
        direction,
        amount,
        entryDate,
        notes: notes || null,
        bankAccountId: bankAccountId || null,
        counterpartyDepartmentId: counterpartyDepartmentId || null,
      });
      if (result.error) {
        setError(result.error);
      } else {
        setMessage(counterpartyDepartmentId ? "נשלחה העברה בין מחלקות לאישור" : "נשלח לאישור");
        setAmount(0);
        setEntryDate("");
        setNotes("");
        setBankAccountId("");
        setCounterpartyDepartmentId("");
        router.refresh();
      }
    });
  }

  if (departments.length === 0) return null;

  return (
    <div className="card p-4 space-y-3">
      <h2 className="font-semibold">רישום ידני של הכנסה / הוצאה</h2>
      <p className="text-xs text-muted">כל רישום ממתין לאישור מנהל כספים לפני שהוא נכנס לדוחות המחלקה.</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2">
        <select
          value={departmentId}
          onChange={(e) => setDepartmentId(e.target.value)}
          className="rounded border border-border bg-transparent px-2 py-1 text-sm"
        >
          <option value="">בחר מחלקה...</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
        <select
          value={direction}
          onChange={(e) => setDirection(e.target.value as "INCOME" | "EXPENSE")}
          className="rounded border border-border bg-transparent px-2 py-1 text-sm"
        >
          <option value="EXPENSE">הוצאה</option>
          <option value="INCOME">הכנסה</option>
        </select>
        <input
          type="number"
          value={amount || ""}
          onChange={(e) => setAmount(Number(e.target.value) || 0)}
          placeholder="סכום"
          className="rounded border border-border bg-transparent px-2 py-1 text-sm"
        />
        <DateInput value={entryDate} onChange={setEntryDate} required />
        <input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="הערות ופירוט"
          className="rounded border border-border bg-transparent px-2 py-1 text-sm"
        />
        <select
          value={bankAccountId}
          onChange={(e) => setBankAccountId(e.target.value)}
          className="rounded border border-border bg-transparent px-2 py-1 text-sm"
        >
          <option value="">חשבון בנק (אופציונלי)</option>
          {bankAccounts.map((b) => (
            <option key={b.id} value={b.id}>
              {b.bank_name} ({b.account_number})
            </option>
          ))}
        </select>
        <select
          value={counterpartyDepartmentId}
          onChange={(e) => setCounterpartyDepartmentId(e.target.value)}
          className="rounded border border-border bg-transparent px-2 py-1 text-sm"
          title="לדוגמה: הוצאה שיוצאת ממחלקה זו אך בפועל מיועדת למחלקה אחרת — תירשם הכנסה תואמת אצל הצד השני"
        >
          <option value="">צד ג׳ / מחלקה מקבלת (אופציונלי)</option>
          {allDepartments
            .filter((d) => d.id !== departmentId)
            .map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
        </select>
      </div>
      {counterpartyDepartmentId && (
        <p className="text-xs text-muted">
          תירשם גם רשומה תואמת (
          {direction === "EXPENSE" ? "הכנסה" : "הוצאה"}) אצל &quot;
          {allDepartments.find((d) => d.id === counterpartyDepartmentId)?.name}&quot; — שני הצדדים יאושרו יחד.
        </p>
      )}
      <div className="flex items-center gap-2">
        <button
          disabled={isPending || !departmentId || amount <= 0 || !entryDate}
          onClick={submit}
          className="rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold disabled:opacity-50"
        >
          שלח
        </button>
        {error && <span className="text-sm text-danger">{error}</span>}
        {message && <span className="text-sm text-success">{message}</span>}
      </div>
    </div>
  );
}

export function ManualEntryApprovalRow({
  entryId,
  departmentName,
  direction,
  amount,
  entryDate,
  notes,
  counterpartyDepartmentName = null,
  bankAccountLabel = null,
  isLinked = false,
}: {
  entryId: string;
  departmentName: string;
  direction: string;
  amount: number;
  entryDate: string | null;
  notes: string | null;
  counterpartyDepartmentName?: string | null;
  bankAccountLabel?: string | null;
  isLinked?: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function decide(decision: "APPROVED" | "REJECTED") {
    startTransition(async () => {
      await reviewManualEntry(entryId, decision);
      router.refresh();
    });
  }

  return (
    <tr>
      <td>{entryDate ?? "—"}</td>
      <td>
        {departmentName}
        {isLinked && <span className="badge bg-background text-muted mr-1">העברה</span>}
      </td>
      <td>{direction === "INCOME" ? "הכנסה" : "הוצאה"}</td>
      <td>{amount}</td>
      <td className="text-xs text-muted">
        {counterpartyDepartmentName ? `↔ ${counterpartyDepartmentName}` : ""}
        {counterpartyDepartmentName && bankAccountLabel ? " · " : ""}
        {bankAccountLabel ?? ""}
        {!counterpartyDepartmentName && !bankAccountLabel ? "—" : ""}
      </td>
      <td>{notes ?? "—"}</td>
      <td>
        <div className="flex items-center gap-2">
          <button
            disabled={isPending}
            onClick={() => decide("APPROVED")}
            className="rounded bg-primary text-primary-foreground text-xs px-3 py-1 disabled:opacity-50"
          >
            אשר
          </button>
          <button
            disabled={isPending}
            onClick={() => decide("REJECTED")}
            className="text-xs text-danger underline"
          >
            דחה
          </button>
        </div>
      </td>
    </tr>
  );
}
