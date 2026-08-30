"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateIncome, lookupUsdIlsRate, type IncomeEditInput } from "@/app/(app)/incomes/actions";
import { DateInput } from "@/components/date-input";
import { SearchableSelect } from "@/components/searchable-select";
import type { Option } from "@/components/expenses-client";

export type IncomeEditRow = {
  id: string;
  date: string | null;
  amount: number;
  donorName: string | null;
  categoryId: string | null;
  paymentMethod: string | null;
  typeText: string | null;
  receiptNumber: string | null;
  orderRef: string | null;
  notes: string | null;
};

// Mirrors EditExpenseForm's shape/flow for checks/manual entries, but for
// an income row's own fields. Department is deliberately not offered here
// — see updateIncome's comment on why category drives it via a DB trigger.
export function EditIncomeForm({
  row,
  categories,
  onClose,
}: {
  row: IncomeEditRow;
  categories: Option[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [date, setDate] = useState(row.date ?? "");
  const [amount, setAmount] = useState(String(row.amount));
  const [donorName, setDonorName] = useState(row.donorName ?? "");
  const [categoryId, setCategoryId] = useState(row.categoryId ?? "");
  const [paymentMethod, setPaymentMethod] = useState(row.paymentMethod ?? "");
  const [typeText, setTypeText] = useState(row.typeText ?? "");
  const [receiptNumber, setReceiptNumber] = useState(row.receiptNumber ?? "");
  const [orderRef, setOrderRef] = useState(row.orderRef ?? "");
  const [notes, setNotes] = useState(row.notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isConverting, setIsConverting] = useState(false);

  // For an old income that was recorded in dollars by mistake (the amount
  // field holds the raw USD number instead of its ILS equivalent) — looks
  // up the same USD-ILS rate the paste-income flow uses for this row's own
  // date, overwrites the amount with the converted value, and appends a
  // note explaining the conversion, so the fix is a single click instead of
  // an admin doing the math and editing two fields by hand.
  function convertFromUsd() {
    const usdAmount = Number(amount);
    if (!usdAmount || usdAmount <= 0) {
      setError("יש להזין קודם את הסכום בדולרים בשדה הסכום");
      return;
    }
    if (!date) {
      setError("יש לבחור תאריך לפני ההמרה");
      return;
    }
    setError(null);
    setIsConverting(true);
    lookupUsdIlsRate(date)
      .then((result) => {
        setIsConverting(false);
        if ("error" in result) {
          setError(result.error);
          return;
        }
        const converted = Math.round(usdAmount * result.rate * 100) / 100;
        const note = `הומר מ-${usdAmount.toFixed(2)}$ לפי שער ${result.rate.toFixed(4)} ליום ${result.asOfDate}`;
        setAmount(String(converted));
        setNotes((prev) => (prev ? `${prev} | ${note}` : note));
      })
      .catch(() => {
        setIsConverting(false);
        setError("שגיאה בשליפת שער דולר-שקל");
      });
  }

  function save() {
    const amountNum = Number(amount);
    if (!amountNum || amountNum <= 0) {
      setError("סכום לא תקין");
      return;
    }
    if (!categoryId) {
      setError("יש לבחור קטגוריה");
      return;
    }
    setError(null);
    const input: IncomeEditInput = {
      date,
      amount: amountNum,
      donorName,
      categoryId,
      paymentMethod,
      typeText,
      receiptNumber,
      orderRef,
      notes,
    };
    startTransition(async () => {
      const result = await updateIncome(row.id, input);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
      onClose();
    });
  }

  return (
    <div className="card p-4 space-y-3">
      <h2 className="font-bold">עריכת הכנסה</h2>

      <datalist id="income-edit-payment-methods">
        <option value="חד פעמי" />
        <option value="הוראת קבע" />
        <option value="אשראי" />
        <option value="העברה" />
        <option value="אחר" />
      </datalist>

      <div>
        <label className="block text-sm text-muted mb-1">שם תורם</label>
        <input
          value={donorName}
          onChange={(e) => setDonorName(e.target.value)}
          className="w-full rounded-lg border border-border bg-transparent px-3 py-2 text-sm"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm text-muted mb-1">סכום</label>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full rounded-lg border border-border bg-transparent px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={convertFromUsd}
            disabled={isConverting}
            className="mt-1 text-xs text-primary underline disabled:opacity-50"
          >
            {isConverting ? "ממיר…" : "הסכום כאן הוא בדולר — המר לשקלים לפי שער התאריך"}
          </button>
        </div>
        <div>
          <label className="block text-sm text-muted mb-1">תאריך</label>
          <DateInput value={date} onChange={setDate} className="w-full rounded-lg border border-border bg-transparent px-3 py-2 text-sm" />
        </div>
      </div>

      <div>
        <label className="block text-sm text-muted mb-1">קטגוריה</label>
        <SearchableSelect
          value={categoryId}
          onChange={setCategoryId}
          options={categories.map((c) => ({ id: c.id, label: c.name }))}
          required
          className="w-full rounded-lg border border-border bg-transparent px-3 py-2 text-sm"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm text-muted mb-1">מקור</label>
          <input
            value={paymentMethod}
            onChange={(e) => setPaymentMethod(e.target.value)}
            list="income-edit-payment-methods"
            placeholder="אשראי / העברה..."
            className="w-full rounded-lg border border-border bg-transparent px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm text-muted mb-1">סוג</label>
          <input
            value={typeText}
            onChange={(e) => setTypeText(e.target.value)}
            placeholder="1/10, הו״ק..."
            className="w-full rounded-lg border border-border bg-transparent px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm text-muted mb-1">מס׳ קבלה</label>
          <input
            value={receiptNumber}
            onChange={(e) => setReceiptNumber(e.target.value)}
            className="w-full rounded-lg border border-border bg-transparent px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm text-muted mb-1">מס׳ הוראה</label>
          <input
            value={orderRef}
            onChange={(e) => setOrderRef(e.target.value)}
            className="w-full rounded-lg border border-border bg-transparent px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm text-muted mb-1">הערות</label>
        <input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="w-full rounded-lg border border-border bg-transparent px-3 py-2 text-sm"
        />
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="flex items-center gap-2 justify-end">
        <button type="button" onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm">
          ביטול
        </button>
        <button
          type="button"
          onClick={save}
          disabled={isPending}
          className="rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold disabled:opacity-50"
        >
          {isPending ? "שומר…" : "שמירה"}
        </button>
      </div>
    </div>
  );
}
