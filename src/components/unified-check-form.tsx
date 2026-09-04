"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createCheck, createPaymentSpread, type CheckAllocationInput } from "@/app/(app)/checks/actions";
import { SplitAllocationEditor } from "@/components/split-allocation-editor";
import { MiniCalculator } from "@/components/mini-calculator";
import { SearchableSelect } from "@/components/searchable-select";
import { Modal } from "@/components/modal";
import { addMonthsToDate, todayIso } from "@/lib/format";
import type { Tables } from "@/lib/supabase/database.types";

type Department = Tables<"departments">;
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

// A single button/flow for issuing a check or transfer that covers three
// cases the app used to split across separate buttons: one plain
// check/transfer, one check/transfer split across departments, and several
// checks/transfers to the same payee (a "spread"). With one row it behaves
// like a simple new-check form; adding rows turns it into a spread — the
// admin never has to pick which flow to start in.
export function UnifiedCheckForm({
  bankAccounts,
  departments,
  open: controlledOpen,
  onOpenChange,
  hideTrigger = false,
}: {
  bankAccounts: BankAccount[];
  departments: Department[];
  // Uncontrolled by default (renders its own "+ דרישת תשלום חדשה" button,
  // as used on the checks page). Passing `open`/`onOpenChange` lets an
  // external trigger (the quick-actions FAB) drive it instead, with
  // `hideTrigger` suppressing the built-in button so it doesn't also show
  // up wherever the controlled instance is mounted.
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  hideTrigger?: boolean;
}) {
  const router = useRouter();
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;
  const [payee, setPayee] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"CHECK" | "TRANSFER">("CHECK");
  const [bankAccountId, setBankAccountId] = useState("");
  const [notes, setNotes] = useState("");
  const [skipDepartmentLedger, setSkipDepartmentLedger] = useState(false);
  const [hasInvoice, setHasInvoice] = useState(false);
  const [markCleared, setMarkCleared] = useState(false);
  const [isSplitting, setIsSplitting] = useState(false);
  const [rows, setRows] = useState<Row[]>([blankRow()]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const [spreadCount, setSpreadCount] = useState(2);

  const isSpread = rows.length > 1;

  function resetFields() {
    setPayee("");
    setNotes("");
    setSkipDepartmentLedger(false);
    setHasInvoice(false);
    setMarkCleared(false);
    setIsSplitting(false);
    setRows([blankRow()]);
    setError(null);
    setSpreadCount(2);
  }

  function reset() {
    resetFields();
    setPaymentMethod("CHECK");
    setBankAccountId("");
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

  // Splits the amount and date already entered in the first payment row
  // evenly across N payment rows — the remainder from rounding goes on the
  // last row, and each row's date advances one month from the first, so a
  // spread is a single click instead of retyping the total (already known
  // from row 1) and then every date by hand. Check number and department
  // still default blank/carried-over per row, same as before.
  function generateSpreadRows() {
    const total = rows[0].amount;
    const startDate = rows[0].date || todayIso();
    const count = Math.max(2, Math.floor(spreadCount) || 2);
    const base = Math.floor((total / count) * 100) / 100;
    const remainder = Math.round((total - base * count) * 100) / 100;
    setRows(
      Array.from({ length: count }, (_, i) => ({
        ...blankRow(),
        amount: i === count - 1 ? base + remainder : base,
        date: addMonthsToDate(startDate, i),
        departmentId: rows[0].departmentId,
      })),
    );
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
          categoryId: null,
          internalBeneficiary: null,
          notes: notes || null,
          skipDepartmentLedger,
          hasInvoice,
          allocations: isSplitting ? row.allocations : [],
          markCleared: paymentMethod === "TRANSFER" ? markCleared : undefined,
        });
        if (result.error) {
          setError(result.error);
        } else {
          setMessage("נשמר בהצלחה — ניתן להזין דרישת תשלום נוספת");
          resetFields();
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
        hasInvoice,
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
        setMessage("נשמר בהצלחה — ניתן להזין דרישת תשלום נוספת");
        resetFields();
        router.refresh();
      }
    });
  }

  if (!open) {
    if (hideTrigger) return null;
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold"
      >
        + דרישת תשלום חדשה
      </button>
    );
  }

  return (
    <Modal
      onClose={() => {
        reset();
        setMessage(null);
        setOpen(false);
      }}
    >
      <div className="card p-5 space-y-5">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div>
            <h2 className="text-lg font-bold" style={{ fontFamily: "var(--font-display)" }}>
              {isSpread ? "פריסת צ׳קים / העברות לספק" : "דרישת תשלום חדשה"}
            </h2>
            <p className="text-xs text-muted mt-0.5">{payee ? `לתשלום עבור: ${payee}` : "בחר/י מוטב ופרטי תשלום"}</p>
          </div>
          <button
            type="button"
            onClick={() => {
              reset();
              setMessage(null);
              setOpen(false);
            }}
            className="text-sm text-muted hover:text-foreground"
          >
            סגור ✕
          </button>
        </div>

        {/* פרטי התשלום וסכום — הכל בקופסה אחת: מי, מאיפה, כמה ולאיזו מחלקה */}
        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-muted">
            פרטי התשלום{isSpread ? " (כל תשלום בנפרד)" : ""}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value as "CHECK" | "TRANSFER")}
              className="rounded-lg border border-border bg-transparent px-3 py-2 text-sm"
            >
              <option value="CHECK">צ׳ק</option>
              <option value="TRANSFER">העברה בנקאית</option>
            </select>
            <SearchableSelect
              value={bankAccountId}
              onChange={setBankAccountId}
              options={bankAccounts.map((b) => ({ id: b.id, label: `${b.departments?.name ?? ""} — ${b.bank_name}` }))}
              placeholder="חשבון בנק..."
              className="rounded-lg border border-border bg-transparent px-3 py-2 text-sm"
            />
            <input
              value={payee}
              onChange={(e) => setPayee(e.target.value)}
              placeholder="מוטב"
              list="supplier-names"
              className="rounded-lg border border-border bg-transparent px-3 py-2 text-sm md:col-span-2"
            />
          </div>
          <div className="space-y-2">
            {rows.map((row, i) => (
              <div key={i} className="rounded-lg border border-border p-3 space-y-2">
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
                  {!isSplitting && (
                    <SearchableSelect
                      value={row.departmentId}
                      onChange={(id) => updateRow(i, { departmentId: id })}
                      options={departments.map((d) => ({ id: d.id, label: d.name }))}
                      placeholder="מחלקה (ברירת מחדל: מחלקת חשבון הבנק)"
                      className="rounded border border-border bg-transparent px-2 py-1 text-sm"
                    />
                  )}
                  {paymentMethod === "CHECK" && (
                    <input
                      value={row.checkNumber}
                      onChange={(e) => updateRow(i, { checkNumber: e.target.value })}
                      placeholder="מספר צ׳ק (ניתן להשאיר ריק)"
                      className="w-32 rounded border border-border bg-transparent px-2 py-1 text-sm"
                    />
                  )}
                  {i === 0 && (
                    <input
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="הערות"
                      className="flex-1 min-w-[8rem] rounded border border-border bg-transparent px-2 py-1 text-sm"
                    />
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
          </div>
        </section>

        {/* הגדרות איך הסכום נספר — נפרד מהפריסה בפועל של הצ׳קים */}
        <section className="rounded-lg bg-background p-3 space-y-2">
          <h3 className="text-sm font-semibold">מחלקה וספירה במאזן</h3>
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-1 text-sm">
              <input type="checkbox" checked={isSplitting} onChange={(e) => setIsSplitting(e.target.checked)} />
              פצל בין מחלקות (מתוך הסכום של כל תשלום)
            </label>
            <label className="flex items-center gap-1 text-sm">
              <input type="checkbox" checked={hasInvoice} onChange={(e) => setHasInvoice(e.target.checked)} />
              יש חשבונית
            </label>
            {paymentMethod === "TRANSFER" && !isSpread && (
              <label className="flex items-center gap-1 text-sm">
                <input type="checkbox" checked={markCleared} onChange={(e) => setMarkCleared(e.target.checked)} />
                ההעברה כבר בוצעה בפועל
              </label>
            )}
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
        </section>

        {/* פריסה בפועל לכמה תשלומים — נפרד מחישוב הסכום/מחלקה */}
        <section className="rounded-lg bg-background p-3 space-y-2">
          <h3 className="text-sm font-semibold">פריסה לכמה תשלומים לאותו מוטב</h3>
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={addRow} className="text-sm text-primary underline">
              + הוסף תשלום נוסף לאותו מוטב
            </button>
            <span className="text-xs text-muted">
              או פריסה אוטומטית של הסכום והתאריך שכבר הוזנו למעלה, לכמה תשלומים ברצף חודשי:
            </span>
            <input
              type="number"
              min={2}
              value={spreadCount || ""}
              onChange={(e) => setSpreadCount(Number(e.target.value) || 2)}
              placeholder="למספר תשלומים"
              className="w-28 rounded border border-border bg-transparent px-2 py-1 text-sm"
            />
            <button
              type="button"
              disabled={rows[0].amount <= 0 || spreadCount < 2}
              onClick={generateSpreadRows}
              className="rounded bg-primary text-primary-foreground text-xs px-3 py-1.5 disabled:opacity-50"
            >
              פריסה
            </button>
          </div>
        </section>

        <div className="flex items-center gap-2 border-t border-border pt-3">
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
    </Modal>
  );
}
