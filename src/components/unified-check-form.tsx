"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createCheck, createPaymentSpread, type CheckAllocationInput } from "@/app/(app)/checks/actions";
import { SplitAllocationEditor } from "@/components/split-allocation-editor";
import { MiniCalculator } from "@/components/mini-calculator";
import type { Tables } from "@/lib/supabase/database.types";

type Department = Tables<"departments">;
type Category = Tables<"categories">;
type BankAccount = Tables<"bank_accounts"> & { departments: { name: string } | null };

type Row = {
  date: string;
  amount: number;
  checkNumber: string;
  departmentId: string;
  allocations: CheckAllocationInput[];
};

function blankRow(): Row {
  return { date: "", amount: 0, checkNumber: "", departmentId: "", allocations: [] };
}

function addMonths(iso: string, months: number): string {
  const d = new Date(iso + "T00:00:00");
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

// A single button/flow for issuing a check or transfer that covers three
// cases the app used to split across separate buttons: one plain
// check/transfer, one check/transfer split across departments, and several
// checks/transfers to the same payee (a "spread"). With one row it behaves
// like a simple new-check form; adding rows turns it into a spread — the
// admin never has to pick which flow to start in.
export function UnifiedCheckForm({
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
  const [payee, setPayee] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"CHECK" | "TRANSFER">("CHECK");
  const [bankAccountId, setBankAccountId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [notes, setNotes] = useState("");
  const [skipDepartmentLedger, setSkipDepartmentLedger] = useState(false);
  const [isSplitting, setIsSplitting] = useState(false);
  const [rows, setRows] = useState<Row[]>([blankRow()]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const [helperOpen, setHelperOpen] = useState(false);
  const [helperDepartmentIds, setHelperDepartmentIds] = useState<string[]>([]);
  const [helperTotal, setHelperTotal] = useState(0);
  const [helperCount, setHelperCount] = useState(1);
  const [helperFirstDate, setHelperFirstDate] = useState("");
  const [helperFirstCheckNumber, setHelperFirstCheckNumber] = useState("");

  const isSpread = rows.length > 1;

  function reset() {
    setPayee("");
    setPaymentMethod("CHECK");
    setBankAccountId("");
    setCategoryId("");
    setNotes("");
    setSkipDepartmentLedger(false);
    setIsSplitting(false);
    setRows([blankRow()]);
    setError(null);
    setHelperOpen(false);
    setHelperDepartmentIds([]);
    setHelperTotal(0);
    setHelperCount(1);
    setHelperFirstDate("");
    setHelperFirstCheckNumber("");
  }

  function updateRow(i: number, patch: Partial<Row>) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  function addRow() {
    setRows((prev) => [...prev, blankRow()]);
  }

  function removeRow(i: number) {
    setRows((prev) => (prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev));
  }

  function toggleHelperDepartment(id: string) {
    setHelperDepartmentIds((prev) => (prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id]));
  }

  function generateRowsFromHelper() {
    const count = Math.max(1, Math.floor(helperCount) || 1);
    const base = Math.floor((helperTotal / count) * 100) / 100;
    const remainder = Math.round((helperTotal - base * count) * 100) / 100;
    const firstCheckNumberNum = Number(helperFirstCheckNumber);
    const hasSequentialCheckNumber = helperFirstCheckNumber !== "" && !isNaN(firstCheckNumberNum);

    const generated: Row[] = Array.from({ length: count }, (_, i) => ({
      date: helperFirstDate ? addMonths(helperFirstDate, i) : "",
      amount: i === count - 1 ? base + remainder : base,
      checkNumber: hasSequentialCheckNumber ? String(firstCheckNumberNum + i) : "",
      departmentId: "",
      allocations: helperDepartmentIds.map((id) => ({ departmentId: id, amount: 0 })),
    }));

    if (helperDepartmentIds.length > 0) setIsSplitting(true);
    setRows(generated);
  }

  function submit() {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      if (!isSpread) {
        const row = rows[0];
        const result = await createCheck({
          paymentMethod,
          bankAccountId,
          payee,
          amount: row.amount,
          dueDate: row.date || null,
          checkNumber: row.checkNumber || null,
          departmentId: isSplitting ? null : row.departmentId || null,
          categoryId: categoryId || null,
          internalBeneficiary: null,
          notes: notes || null,
          skipDepartmentLedger,
          allocations: isSplitting ? row.allocations : [],
        });
        if (result.error) {
          setError(result.error);
        } else {
          reset();
          setOpen(false);
          router.refresh();
        }
        return;
      }

      const result = await createPaymentSpread({
        payee,
        paymentMethod,
        internalBeneficiary: null,
        notes: notes || null,
        bankAccountId,
        rows: rows.map((r) => ({
          date: r.date || null,
          amount: r.amount,
          checkNumber: r.checkNumber || null,
          departmentId: isSplitting ? null : r.departmentId || null,
          allocations: isSplitting ? r.allocations : [],
        })),
      });
      if (result.error) {
        setError(result.error);
      } else {
        setMessage("נוצר בהצלחה");
        reset();
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
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">{isSpread ? "פריסת צ׳קים / העברות לספק" : "צ׳ק / העברה חדשה"}</h2>
        <button
          type="button"
          onClick={() => {
            reset();
            setOpen(false);
          }}
          className="text-sm text-muted"
        >
          סגור
        </button>
      </div>

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
        {!isSpread && (
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
        )}
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
        {!isSpread && (
          <label className="flex items-center gap-1 text-sm">
            <input
              type="checkbox"
              checked={skipDepartmentLedger}
              onChange={(e) => setSkipDepartmentLedger(e.target.checked)}
            />
            כבר נכלל בחישוב הישן (לא לכלול במאזן הפנימי של המחלקה)
          </label>
        )}
      </div>

      {!helperOpen ? (
        <button type="button" onClick={() => setHelperOpen(true)} className="text-sm text-primary underline">
          עזר להגדרת פריסה (כמה תשלומים לאותו מוטב)
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
              ? `כל תשלום: ${(Math.floor((helperTotal / Math.max(1, helperCount)) * 100) / 100).toLocaleString()}`
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
        {rows.map((row, i) => (
          <div key={i} className="border-t border-border pt-2 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="date"
                value={row.date}
                onChange={(e) => updateRow(i, { date: e.target.value })}
                className="rounded border border-border bg-transparent px-2 py-1 text-sm"
                title="ניתן להשאיר ריק"
              />
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  value={row.amount || ""}
                  onChange={(e) => updateRow(i, { amount: Number(e.target.value) || 0 })}
                  placeholder="סכום"
                  className="w-28 rounded border border-border bg-transparent px-2 py-1 text-sm"
                />
                <MiniCalculator onApply={(v) => updateRow(i, { amount: v })} />
              </div>
              {paymentMethod === "CHECK" && (
                <input
                  value={row.checkNumber}
                  onChange={(e) => updateRow(i, { checkNumber: e.target.value })}
                  placeholder="מספר צ׳ק (ניתן להשאיר ריק)"
                  className="w-32 rounded border border-border bg-transparent px-2 py-1 text-sm"
                />
              )}
              {!isSplitting && (
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
              {rows.length > 1 && (
                <button type="button" onClick={() => removeRow(i)} className="text-xs text-danger">
                  הסר תשלום
                </button>
              )}
            </div>
            {isSplitting && (
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
          + הוסף תשלום נוסף לאותו מוטב (פריסה)
        </button>
      </div>

      <div className="flex items-center gap-2">
        <button
          disabled={isPending || !bankAccountId || !payee || rows.every((r) => r.amount <= 0)}
          onClick={submit}
          className="rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold disabled:opacity-50"
        >
          שמור
        </button>
        {error && <span className="text-sm text-danger">{error}</span>}
        {message && <span className="text-sm text-success">{message}</span>}
      </div>
    </div>
  );
}
