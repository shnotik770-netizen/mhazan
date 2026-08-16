"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createPaymentSpread, type CheckAllocationInput } from "@/app/(app)/checks/actions";
import { SplitAllocationEditor } from "@/components/split-allocation-editor";
import { MiniCalculator } from "@/components/mini-calculator";
import type { Tables } from "@/lib/supabase/database.types";

type Department = Tables<"departments">;
type BankAccount = Tables<"bank_accounts"> & { departments: { name: string } | null };

type SpreadRow = { date: string; amount: number; departmentId: string; allocations: CheckAllocationInput[] };

export function PaymentSpreadForm({
  bankAccounts,
  departments,
}: {
  bankAccounts: BankAccount[];
  departments: Department[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [payee, setPayee] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"CHECK" | "TRANSFER">("CHECK");
  const [internalBeneficiary, setInternalBeneficiary] = useState("");
  const [notes, setNotes] = useState("");
  const [bankAccountId, setBankAccountId] = useState("");
  const [involvesMultipleDepartments, setInvolvesMultipleDepartments] = useState(false);
  const [rows, setRows] = useState<SpreadRow[]>([
    { date: "", amount: 0, departmentId: "", allocations: [] },
  ]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function updateRow(i: number, patch: Partial<SpreadRow>) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  function addRow() {
    setRows((prev) => [...prev, { date: "", amount: 0, departmentId: "", allocations: [] }]);
  }

  function removeRow(i: number) {
    setRows((prev) => prev.filter((_, idx) => idx !== i));
  }

  function submit() {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await createPaymentSpread({
        payee,
        paymentMethod,
        internalBeneficiary: internalBeneficiary || null,
        notes: notes || null,
        bankAccountId,
        rows: rows.map((r) => ({
          date: r.date || null,
          amount: r.amount,
          departmentId: involvesMultipleDepartments ? null : r.departmentId || null,
          allocations: involvesMultipleDepartments ? r.allocations : [],
        })),
      });
      if (result.error) {
        setError(result.error);
      } else {
        setMessage("הפריסה נוצרה בהצלחה");
        setPayee("");
        setRows([{ date: "", amount: 0, departmentId: "", allocations: [] }]);
        router.refresh();
      }
    });
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="rounded-lg border border-border px-4 py-2 text-sm font-semibold">
        + פריסת צ׳קים / העברות לספק
      </button>
    );
  }

  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">פריסת צ׳קים / העברות לספק</h2>
        <button onClick={() => setOpen(false)} className="text-sm text-muted">
          סגור
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <input
          value={payee}
          onChange={(e) => setPayee(e.target.value)}
          placeholder="שם הספק"
          list="supplier-names"
          className="rounded border border-border bg-transparent px-2 py-1 text-sm"
        />
        <select
          value={paymentMethod}
          onChange={(e) => setPaymentMethod(e.target.value as "CHECK" | "TRANSFER")}
          className="rounded border border-border bg-transparent px-2 py-1 text-sm"
        >
          <option value="CHECK">צ׳קים</option>
          <option value="TRANSFER">העברות בנקאיות</option>
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
        {paymentMethod === "TRANSFER" && (
          <input
            value={internalBeneficiary}
            onChange={(e) => setInternalBeneficiary(e.target.value)}
            placeholder="מוטב פנימי בתוך הספק (אופציונלי)"
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

      <label className="flex items-center gap-1 text-sm">
        <input
          type="checkbox"
          checked={involvesMultipleDepartments}
          onChange={(e) => setInvolvesMultipleDepartments(e.target.checked)}
        />
        הפריסה הזו מכילה כמה מחלקות (לחלק כל תשלום בנפרד בין המחלקות)
      </label>

      <div className="space-y-2">
        <p className="text-sm font-medium">תשלומים (הזנה ידנית לכל תשלום — ללא חלוקה אוטומטית)</p>
        {rows.map((row, i) => (
          <div key={i} className="border-t border-border pt-2 space-y-1">
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={row.date}
                onChange={(e) => updateRow(i, { date: e.target.value })}
                className="rounded border border-border bg-transparent px-2 py-1 text-sm"
                title="ניתן להשאיר ריק"
              />
              <input
                type="number"
                value={row.amount || ""}
                onChange={(e) => updateRow(i, { amount: Number(e.target.value) || 0 })}
                placeholder="סכום"
                className="w-28 rounded border border-border bg-transparent px-2 py-1 text-sm"
              />
              <MiniCalculator onApply={(v) => updateRow(i, { amount: v })} />
              {!involvesMultipleDepartments && (
                <select
                  value={row.departmentId}
                  onChange={(e) => updateRow(i, { departmentId: e.target.value })}
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
              <button type="button" onClick={() => removeRow(i)} className="text-xs text-danger">
                הסר
              </button>
            </div>
            {involvesMultipleDepartments && (
              <SplitAllocationEditor
                departments={departments}
                totalAmount={row.amount}
                allocations={row.allocations}
                onChange={(allocations) => updateRow(i, { allocations })}
              />
            )}
          </div>
        ))}
        <button type="button" onClick={addRow} className="text-sm text-primary underline">
          + הוסף תשלום
        </button>
      </div>

      <div className="flex items-center gap-2">
        <button
          disabled={isPending || !payee || !bankAccountId}
          onClick={submit}
          className="rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold disabled:opacity-50"
        >
          צור פריסה
        </button>
        {error && <span className="text-sm text-danger">{error}</span>}
        {message && <span className="text-sm text-success">{message}</span>}
      </div>
    </div>
  );
}
