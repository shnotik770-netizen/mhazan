"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { submitIncomeBatch, type IncomeBatchRow } from "@/app/(app)/incomes/actions";
import type { Tables } from "@/lib/supabase/database.types";

type BankAccount = Tables<"bank_accounts"> & { departments: { name: string } | null };
type Category = Tables<"categories"> & { departments: { name: string } | null };

type ParsedRow = IncomeBatchRow & { raw: string };

function parsePastedText(text: string): string[][] {
  return text
    .trim()
    .split("\n")
    .map((line) => line.split(/\t|,(?!\d{3})/).map((c) => c.trim()))
    .filter((cols) => cols.some((c) => c.length > 0));
}

function guessCategory(text: string, categories: Category[]): string {
  const normalized = text.trim().toLowerCase();
  if (!normalized) return "";
  const exact = categories.find((c) => c.name.toLowerCase() === normalized);
  if (exact) return exact.id;
  const partial = categories.find(
    (c) => c.name.toLowerCase().includes(normalized) || normalized.includes(c.name.toLowerCase()),
  );
  return partial?.id ?? "";
}

export function PasteIncomeForm({
  bankAccounts,
  categories,
}: {
  bankAccounts: BankAccount[];
  categories: Category[];
}) {
  const router = useRouter();
  const [bankAccountId, setBankAccountId] = useState("");
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  const validCount = useMemo(() => rows.filter((r) => r.categoryId && r.amount > 0).length, [rows]);

  function handlePaste(text: string) {
    const parsed = parsePastedText(text);
    const nextRows: ParsedRow[] = parsed.map((cols) => {
      const [date, categoryText, donorName, amountText, receiptNumber, notes] = cols;
      const amount = Number(String(amountText ?? "").replace(/[^\d.-]/g, "")) || 0;
      return {
        raw: cols.join(" | "),
        date: date ?? "",
        categoryId: guessCategory(categoryText ?? "", categories),
        donorName: donorName ?? "",
        amount,
        receiptNumber: receiptNumber ?? "",
        notes: notes ?? "",
      };
    });
    setRows(nextRows);
    setMessage(null);
  }

  function updateRow(index: number, patch: Partial<ParsedRow>) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  function handleSubmit() {
    setMessage(null);
    startTransition(async () => {
      const result = await submitIncomeBatch(bankAccountId, rows);
      if (result.error) {
        setMessage({ type: "error", text: result.error });
      } else {
        setMessage({ type: "success", text: `נשמרו ${result.count} שורות הכנסה בהצלחה` });
        setRows([]);
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="card p-4">
        <label className="block text-sm font-medium mb-1">
          לאיזה חשבון בנק / מחלקה נכנס הכסף בפועל?
        </label>
        <select
          className="w-full rounded-lg border border-border bg-transparent px-3 py-2 text-sm"
          value={bankAccountId}
          onChange={(e) => setBankAccountId(e.target.value)}
        >
          <option value="">בחר חשבון בנק...</option>
          {bankAccounts.map((b) => (
            <option key={b.id} value={b.id}>
              {b.departments?.name} — {b.bank_name} ({b.account_number})
            </option>
          ))}
        </select>
      </div>

      <div className="card p-4">
        <label className="block text-sm font-medium mb-1">
          הדבק כאן שורות מאקסל (תאריך, קטגוריה, שם תורם, סכום, מס׳ קבלה, הערות)
        </label>
        <textarea
          className="w-full h-28 rounded-lg border border-border bg-transparent px-3 py-2 text-sm font-mono"
          placeholder="הדבק כאן (Ctrl+V) שורות מודבקות מגיליון אקסל..."
          onPaste={(e) => {
            const text = e.clipboardData.getData("text");
            if (text) {
              e.preventDefault();
              handlePaste(text);
            }
          }}
          onChange={(e) => handlePaste(e.target.value)}
        />
      </div>

      {rows.length > 0 && (
        <div className="card p-4 overflow-x-auto">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold">
              תצוגה מקדימה — {rows.length} שורות ({validCount} תקינות)
            </h3>
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th>תאריך</th>
                <th>קטגוריה</th>
                <th>שם תורם</th>
                <th>סכום</th>
                <th>מס׳ קבלה</th>
                <th>הערות</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} className={!row.categoryId || row.amount <= 0 ? "bg-warning-bg" : ""}>
                  <td>
                    <input
                      className="w-32 bg-transparent border-b border-border text-sm"
                      value={row.date}
                      onChange={(e) => updateRow(i, { date: e.target.value })}
                      placeholder="YYYY-MM-DD"
                    />
                  </td>
                  <td>
                    <select
                      className="bg-transparent border-b border-border text-sm max-w-48"
                      value={row.categoryId}
                      onChange={(e) => updateRow(i, { categoryId: e.target.value })}
                    >
                      <option value="">לא זוהתה — בחר ידנית</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} ({c.departments?.name})
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input
                      className="w-32 bg-transparent border-b border-border text-sm"
                      value={row.donorName}
                      onChange={(e) => updateRow(i, { donorName: e.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      className="w-24 bg-transparent border-b border-border text-sm"
                      type="number"
                      value={row.amount || ""}
                      onChange={(e) => updateRow(i, { amount: Number(e.target.value) || 0 })}
                    />
                  </td>
                  <td>
                    <input
                      className="w-20 bg-transparent border-b border-border text-sm"
                      value={row.receiptNumber}
                      onChange={(e) => updateRow(i, { receiptNumber: e.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      className="w-32 bg-transparent border-b border-border text-sm"
                      value={row.notes}
                      onChange={(e) => updateRow(i, { notes: e.target.value })}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {message && (
        <div
          className={`card px-4 py-3 text-sm ${
            message.type === "error" ? "bg-danger-bg text-danger" : "bg-success-bg text-success"
          }`}
        >
          {message.text}
        </div>
      )}

      <button
        disabled={isPending || !bankAccountId || validCount === 0}
        onClick={handleSubmit}
        className="rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold disabled:opacity-50"
      >
        {isPending ? "שומר..." : `שמור ${validCount} שורות הכנסה`}
      </button>
    </div>
  );
}
