"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createExpectedIncomesBatch } from "@/app/(app)/forecast/actions";
import { DateInput } from "@/components/date-input";

type BankAccountOption = {
  id: string;
  bank_name: string;
  account_number: string;
  departments?: { name: string } | null;
};

type DraftRow = {
  key: number;
  bankAccountId: string;
  amount: string;
  expectedDate: string;
  description: string;
  repeats: boolean;
  repeatMonths: string;
};

let rowKeySeq = 0;
function emptyRow(bankAccountId: string): DraftRow {
  return {
    key: ++rowKeySeq,
    bankAccountId,
    amount: "",
    expectedDate: "",
    description: "",
    repeats: false,
    repeatMonths: "",
  };
}

function rowIsFilled(row: DraftRow): boolean {
  return Boolean(row.bankAccountId) && Boolean(row.expectedDate) && Number(row.amount) > 0;
}

// Used both from the dedicated /forecast screen and from the floating
// quick-actions button — an admin often has several expected settlements to
// log at once (e.g. a few credit-company payouts landing on different
// dates/accounts), so this lets them add row after row and save in one go
// instead of reopening the modal per entry.
export function ExpectedIncomeBatchForm({
  bankAccounts,
  defaultBankAccountId = "",
  onSaved,
}: {
  bankAccounts: BankAccountOption[];
  defaultBankAccountId?: string;
  onSaved: () => void;
}) {
  const router = useRouter();
  const [rows, setRows] = useState<DraftRow[]>([emptyRow(defaultBankAccountId)]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function updateRow(key: number, patch: Partial<DraftRow>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function addRow() {
    setRows((prev) => [...prev, emptyRow(defaultBankAccountId)]);
  }

  function removeRow(key: number) {
    setRows((prev) => (prev.length > 1 ? prev.filter((r) => r.key !== key) : prev));
  }

  const filledCount = rows.filter(rowIsFilled).length;

  function submit() {
    setError(null);
    const toSave = rows.filter(rowIsFilled);
    if (toSave.length === 0) {
      setError("יש למלא לפחות שורה אחת (חשבון, תאריך וסכום)");
      return;
    }
    for (const row of toSave) {
      if (row.repeats && (!row.repeatMonths || Number(row.repeatMonths) < 2)) {
        setError("יש להזין מספר חודשים תקין (2 ומעלה) בשורה שסומנה כחוזרת, או לבטל את הישנות ההכנסה");
        return;
      }
    }
    startTransition(async () => {
      const result = await createExpectedIncomesBatch(
        toSave.map((row) => ({
          bankAccountId: row.bankAccountId,
          amount: Number(row.amount) || 0,
          expectedDate: row.expectedDate,
          description: row.description || null,
          repeatMonths: row.repeats ? Number(row.repeatMonths) : 1,
        })),
      );
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
      onSaved();
    });
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {rows.map((row, idx) => (
          <div key={row.key} className="rounded-lg border border-border p-2 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted">שורה {idx + 1}</span>
              {rows.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeRow(row.key)}
                  className="text-xs text-muted hover:text-danger"
                >
                  ✕ הסרה
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <select
                value={row.bankAccountId}
                onChange={(e) => updateRow(row.key, { bankAccountId: e.target.value })}
                className="rounded border border-border bg-transparent px-2 py-1 text-sm"
              >
                <option value="">חשבון בנק...</option>
                {bankAccounts.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.departments?.name ? `${b.departments.name} — ` : ""}
                    {b.bank_name} ({b.account_number})
                  </option>
                ))}
              </select>
              <input
                type="number"
                value={row.amount}
                onChange={(e) => updateRow(row.key, { amount: e.target.value })}
                placeholder="סכום משוער"
                className="rounded border border-border bg-transparent px-2 py-1 text-sm"
              />
              <DateInput value={row.expectedDate} onChange={(v) => updateRow(row.key, { expectedDate: v })} required />
              <input
                value={row.description}
                onChange={(e) => updateRow(row.key, { description: e.target.value })}
                placeholder="תיאור / מקור"
                className="rounded border border-border bg-transparent px-2 py-1 text-sm"
              />
            </div>
            <label className="flex items-center gap-1 text-xs text-muted whitespace-nowrap">
              <input
                type="checkbox"
                checked={row.repeats}
                onChange={(e) =>
                  updateRow(row.key, { repeats: e.target.checked, repeatMonths: e.target.checked ? row.repeatMonths : "" })
                }
              />
              חוזר כל חודש (לא הכנסה חד-פעמית)
            </label>
            {row.repeats && (
              <input
                type="number"
                min="2"
                value={row.repeatMonths}
                onChange={(e) => updateRow(row.key, { repeatMonths: e.target.value })}
                placeholder="כמה חודשים"
                className="rounded border border-border bg-transparent px-2 py-1 text-sm w-28"
              />
            )}
          </div>
        ))}
      </div>

      <button type="button" onClick={addRow} className="text-sm text-primary underline">
        + הוספת שורה נוספת
      </button>

      {error && <p className="text-xs text-danger">{error}</p>}
      <button
        disabled={isPending || filledCount === 0}
        onClick={submit}
        className="rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold disabled:opacity-50"
      >
        {isPending
          ? "שומר..."
          : filledCount > 0
            ? `הוספת ${filledCount} ${filledCount === 1 ? "הכנסה צפויה" : "הכנסות צפויות"}`
            : "הוספה"}
      </button>
    </div>
  );
}
