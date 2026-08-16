"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createPaymentSpread, type CheckAllocationInput } from "@/app/(app)/checks/actions";
import { SplitAllocationEditor } from "@/components/split-allocation-editor";
import { MiniCalculator } from "@/components/mini-calculator";
import type { Tables } from "@/lib/supabase/database.types";

type Department = Tables<"departments">;
type BankAccount = Tables<"bank_accounts"> & { departments: { name: string } | null };

type SpreadRow = {
  date: string;
  amount: number;
  checkNumber: string;
  departmentId: string;
  allocations: CheckAllocationInput[];
};

function blankSpreadRow(): SpreadRow {
  return { date: "", amount: 0, checkNumber: "", departmentId: "", allocations: [] };
}

function addMonths(iso: string, months: number): string {
  const d = new Date(iso + "T00:00:00");
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

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
  const [rows, setRows] = useState<SpreadRow[]>([blankSpreadRow()]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Setup helper: instead of adding/filling rows one at a time, declare the
  // departments involved + the total planned expense + how many checks it's
  // being spread into (+ optional first date/check number), and generate
  // the row skeletons in one go. Amounts and per-row department allocations
  // are still left for manual entry/adjustment afterward.
  const [helperOpen, setHelperOpen] = useState(false);
  const [helperDepartmentIds, setHelperDepartmentIds] = useState<string[]>([]);
  const [helperTotal, setHelperTotal] = useState(0);
  const [helperCount, setHelperCount] = useState(1);
  const [helperFirstDate, setHelperFirstDate] = useState("");
  const [helperFirstCheckNumber, setHelperFirstCheckNumber] = useState("");

  function toggleHelperDepartment(id: string) {
    setHelperDepartmentIds((prev) => (prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id]));
  }

  function generateRowsFromHelper() {
    const count = Math.max(1, Math.floor(helperCount) || 1);
    const base = Math.floor((helperTotal / count) * 100) / 100;
    const remainder = Math.round((helperTotal - base * count) * 100) / 100;
    const firstCheckNumberNum = Number(helperFirstCheckNumber);
    const hasSequentialCheckNumber = helperFirstCheckNumber !== "" && !isNaN(firstCheckNumberNum);

    const generated: SpreadRow[] = Array.from({ length: count }, (_, i) => ({
      date: helperFirstDate ? addMonths(helperFirstDate, i) : "",
      amount: i === count - 1 ? base + remainder : base,
      checkNumber: hasSequentialCheckNumber ? String(firstCheckNumberNum + i) : "",
      departmentId: "",
      allocations: helperDepartmentIds.map((id) => ({ departmentId: id, amount: 0 })),
    }));

    if (helperDepartmentIds.length > 0) setInvolvesMultipleDepartments(true);
    setRows(generated);
  }

  function updateRow(i: number, patch: Partial<SpreadRow>) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  function addRow() {
    setRows((prev) => [...prev, blankSpreadRow()]);
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
          checkNumber: r.checkNumber || null,
          departmentId: involvesMultipleDepartments ? null : r.departmentId || null,
          allocations: involvesMultipleDepartments ? r.allocations : [],
        })),
      });
      if (result.error) {
        setError(result.error);
      } else {
        setMessage("הפריסה נוצרה בהצלחה");
        setPayee("");
        setRows([blankSpreadRow()]);
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

      {!helperOpen ? (
        <button type="button" onClick={() => setHelperOpen(true)} className="text-sm text-primary underline">
          עזר להגדרת הפריסה
        </button>
      ) : (
        <div className="card bg-background p-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">עזר להגדרת הפריסה</p>
            <button type="button" onClick={() => setHelperOpen(false)} className="text-xs text-muted">
              סגור
            </button>
          </div>
          <div>
            <p className="text-xs text-muted mb-1">מחלקות מעורבות בפריסה</p>
            <div className="flex flex-wrap gap-2">
              {departments.map((d) => (
                <label key={d.id} className="flex items-center gap-1 text-xs">
                  <input
                    type="checkbox"
                    checked={helperDepartmentIds.includes(d.id)}
                    onChange={() => toggleHelperDepartment(d.id)}
                  />
                  {d.name}
                </label>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <input
              type="number"
              value={helperTotal || ""}
              onChange={(e) => setHelperTotal(Number(e.target.value) || 0)}
              placeholder="סה״כ סכום מתוכנן"
              className="rounded border border-border bg-transparent px-2 py-1 text-sm"
            />
            <input
              type="number"
              min={1}
              value={helperCount || ""}
              onChange={(e) => setHelperCount(Number(e.target.value) || 1)}
              placeholder="למספר צ׳קים/העברות לפרוס"
              className="rounded border border-border bg-transparent px-2 py-1 text-sm"
            />
            <input
              type="date"
              value={helperFirstDate}
              onChange={(e) => setHelperFirstDate(e.target.value)}
              title="תאריך הצ׳ק הראשון (אופציונלי)"
              className="rounded border border-border bg-transparent px-2 py-1 text-sm"
            />
            <input
              value={helperFirstCheckNumber}
              onChange={(e) => setHelperFirstCheckNumber(e.target.value)}
              placeholder="מספר הצ׳ק הראשון (אופציונלי)"
              className="rounded border border-border bg-transparent px-2 py-1 text-sm"
            />
          </div>
          <p className="text-xs text-muted">
            {helperCount > 0 && helperTotal > 0
              ? `כל תשלום: ${(Math.floor((helperTotal / Math.max(1, helperCount)) * 100) / 100).toLocaleString()} (התאריך והמספר יעלו אוטומטית מהראשון, אם הוזנו)`
              : "הזן סכום כולל ומספר תשלומים כדי לראות חישוב"}
          </p>
          <button
            type="button"
            onClick={generateRowsFromHelper}
            className="rounded bg-primary text-primary-foreground text-xs px-3 py-1.5"
          >
            צור שורות תשלום
          </button>
        </div>
      )}

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
              {paymentMethod === "CHECK" && (
                <input
                  value={row.checkNumber}
                  onChange={(e) => updateRow(i, { checkNumber: e.target.value })}
                  placeholder="מס׳ צ׳ק (אופציונלי)"
                  className="w-28 rounded border border-border bg-transparent px-2 py-1 text-sm"
                />
              )}
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
