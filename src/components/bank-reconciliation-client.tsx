"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { bulkMarkChecksCleared, getUnpaidChecksForReconciliation } from "@/app/(app)/checks/actions";
import { formatCurrency } from "@/lib/format";
import type { Tables } from "@/lib/supabase/database.types";

type BankAccount = Tables<"bank_accounts"> & { departments: { name: string } | null };
type Candidate = { id: string; check_number: string; amount: number; payee: string };

type MatchRow = {
  checkNumber: string;
  amount: number;
  matched: Candidate | null;
};

function normalizeAmount(text: string): number {
  return Number(text.replace(/[^\d.-]/g, "")) || 0;
}

// Dedicated panel for reconciling a bank statement: paste a list of check
// number + amount pairs that show as cleared in the bank, match them
// against unpaid checks on that account, and mark the matches cleared in
// one confirmation instead of one row at a time.
export function BankReconciliationPanel({ bankAccounts }: { bankAccounts: BankAccount[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [bankAccountId, setBankAccountId] = useState(bankAccounts[0]?.id ?? "");
  const [rawText, setRawText] = useState("");
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function checkMatches() {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      try {
        const list = await getUnpaidChecksForReconciliation(bankAccountId);

        const parsed = rawText
          .trim()
          .split("\n")
          .map((line) => line.split(/\t|,/).map((c) => c.trim()))
          .filter((cols) => cols.some((c) => c.length > 0))
          .map((cols) => ({ checkNumber: (cols[0] ?? "").trim(), amount: normalizeAmount(cols[1] ?? "") }));

        const usedIds = new Set<string>();
        const rows: MatchRow[] = parsed.map((p) => {
          const found = list.find(
            (c) => !usedIds.has(c.id) && c.check_number.trim() === p.checkNumber && Math.abs(c.amount - p.amount) < 0.01,
          );
          if (found) usedIds.add(found.id);
          return { ...p, matched: found ?? null };
        });
        setMatches(rows);
      } catch (e) {
        setError(e instanceof Error ? e.message : "שגיאה בהבאת נתונים");
      }
    });
  }

  function confirm() {
    setError(null);
    setMessage(null);
    const matchedIds = matches.filter((m) => m.matched).map((m) => m.matched!.id);
    startTransition(async () => {
      const result = await bulkMarkChecksCleared(matchedIds);
      if (result.error) {
        setError(result.error);
      } else {
        setMessage(`${result.count} צ׳קים סומנו כנפרעו`);
        setMatches([]);
        setRawText("");
        router.refresh();
      }
    });
  }

  const matchedCount = matches.filter((m) => m.matched).length;
  const unmatchedCount = matches.length - matchedCount;

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="rounded-lg border border-border px-4 py-2 text-sm font-semibold">
        התאמת צ׳קים שנפרעו בבנק
      </button>
    );
  }

  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">התאמת צ׳קים שנפרעו בבנק (לפי מספר צ׳ק + סכום)</h2>
        <button onClick={() => setOpen(false)} className="text-sm text-muted">
          סגור
        </button>
      </div>
      <p className="text-xs text-muted">
        הדביקו מתוך דו״ח הבנק רשימת מספרי צ׳קים שירדו + הסכום שלהם (עמודה אחת מספר צ׳ק, עמודה שנייה סכום). המערכת
        תשווה למאגר הצ׳קים הפתוחים לפי מספר צ׳ק וסכום זהה, ותציע לסמן את מה שנמצא כנפרע.
      </p>
      <select
        value={bankAccountId}
        onChange={(e) => setBankAccountId(e.target.value)}
        className="w-full rounded-lg border border-border bg-transparent px-3 py-2 text-sm"
      >
        {bankAccounts.map((b) => (
          <option key={b.id} value={b.id}>
            {b.departments?.name} — {b.bank_name} ({b.account_number})
          </option>
        ))}
      </select>
      <textarea
        value={rawText}
        onChange={(e) => setRawText(e.target.value)}
        className="w-full h-28 rounded-lg border border-border bg-transparent px-3 py-2 text-sm font-mono"
        placeholder={"מספר צ׳ק, סכום\n1042, 850\n1043, 1200"}
      />
      <button
        disabled={isPending || !bankAccountId || !rawText.trim()}
        onClick={checkMatches}
        className="rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold disabled:opacity-50"
      >
        בדוק התאמות
      </button>

      {matches.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm">
            נמצאו <span className="text-success font-semibold">{matchedCount}</span> התאמות
            {unmatchedCount > 0 && (
              <>
                {" "}
                ו־<span className="text-danger font-semibold">{unmatchedCount}</span> ללא התאמה
              </>
            )}
          </p>
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>מספר צ׳ק</th>
                  <th>סכום</th>
                  <th>מוטב</th>
                  <th>סטטוס</th>
                </tr>
              </thead>
              <tbody>
                {matches.map((m, i) => (
                  <tr key={i}>
                    <td>{m.checkNumber}</td>
                    <td>{formatCurrency(m.amount)}</td>
                    <td>{m.matched?.payee ?? "—"}</td>
                    <td>
                      {m.matched ? (
                        <span className="badge bg-success-bg text-success">נמצאה התאמה</span>
                      ) : (
                        <span className="badge bg-danger-bg text-danger">לא נמצא צ׳ק תואם</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            disabled={isPending || matchedCount === 0}
            onClick={confirm}
            className="rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold disabled:opacity-50"
          >
            אשר וסמן {matchedCount} כנפרעו
          </button>
        </div>
      )}

      {error && <p className="text-sm text-danger">{error}</p>}
      {message && <p className="text-sm text-success">{message}</p>}
    </div>
  );
}
