"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createManualEntry, reviewManualEntry } from "@/app/(app)/manual-entries/actions";
import { DateInput } from "@/components/date-input";
import type { Tables } from "@/lib/supabase/database.types";

type Department = Tables<"departments">;

export function NewManualEntryForm({ departments }: { departments: Department[] }) {
  const router = useRouter();
  const [departmentId, setDepartmentId] = useState(departments[0]?.id ?? "");
  const [direction, setDirection] = useState<"INCOME" | "EXPENSE">("EXPENSE");
  const [amount, setAmount] = useState(0);
  const [entryDate, setEntryDate] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit() {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await createManualEntry({ departmentId, direction, amount, entryDate, notes: notes || null });
      if (result.error) {
        setError(result.error);
      } else {
        setMessage("נשלח לאישור");
        setAmount(0);
        setEntryDate("");
        setNotes("");
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
      </div>
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
}: {
  entryId: string;
  departmentName: string;
  direction: string;
  amount: number;
  entryDate: string | null;
  notes: string | null;
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
      <td>{departmentName}</td>
      <td>{direction === "INCOME" ? "הכנסה" : "הוצאה"}</td>
      <td>{amount}</td>
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
