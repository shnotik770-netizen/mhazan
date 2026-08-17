"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { bulkMarkChecksCleared, getUnpaidChecksForReconciliation } from "@/app/(app)/checks/actions";
import { formatCurrency, formatDate } from "@/lib/format";
import { Modal } from "@/components/modal";
import type { Tables } from "@/lib/supabase/database.types";

type BankAccount = Tables<"bank_accounts"> & { departments: { name: string } | null };
type Candidate = { id: string; check_number: string; amount: number; payee: string; due_date: string | null };

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
// one confirmation instead of one row at a time. It also proactively
// suggests checks whose due date has already passed — the likeliest
// candidates to already be cleared in the bank — so most of the time
// there's nothing to type at all.
export function BankReconciliationPanel({ bankAccounts }: { bankAccounts: BankAccount[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [bankAccountId, setBankAccountId] = useState(bankAccounts[0]?.id ?? "");
  const [rawText, setRawText] = useState("");
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [overdueCandidates, setOverdueCandidates] = useState<Candidate[]>([]);
  const [selectedSuggestions, setSelectedSuggestions] = useState<Set<string>>(new Set());
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!open || !bankAccountId) return;
    let cancelled = false;
    async function loadSuggestions() {
      setLoadingSuggestions(true);
      setSelectedSuggestions(new Set());
      const today = new Date().toISOString().slice(0, 10);
      try {
        const list = await getUnpaidChecksForReconciliation(bankAccountId);
        if (!cancelled) setOverdueCandidates(list.filter((c) => c.due_date && c.due_date <= today));
      } catch {
        if (!cancelled) setOverdueCandidates([]);
      } finally {
        if (!cancelled) setLoadingSuggestions(false);
      }
    }
    loadSuggestions();
    return () => {
      cancelled = true;
    };
  }, [open, bankAccountId]);

  function toggleSuggestion(id: string) {
    setSelectedSuggestions((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

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
    const matchedIds = new Set(matches.filter((m) => m.matched).map((m) => m.matched!.id));
    for (const id of selectedSuggestions) matchedIds.add(id);
    const idsToMark = [...matchedIds];
    startTransition(async () => {
      const result = await bulkMarkChecksCleared(idsToMark);
      if (result.error) {
        setError(result.error);
      } else {
        setMessage(`${result.count} צ׳קים סומנו כנפרעו`);
        setMatches([]);
        setRawText("");
        setSelectedSuggestions(new Set());
        setOverdueCandidates((prev) => prev.filter((c) => !matchedIds.has(c.id)));
        router.refresh();
      }
    });
  }

  const matchedCount = matches.filter((m) => m.matched).length;
  const unmatchedCount = matches.length - matchedCount;
  const totalToConfirm = matchedCount + selectedSuggestions.size;

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="rounded-lg border border-border px-4 py-2 text-sm font-semibold">
        התאמת צ׳קים שנפרעו בבנק
      </button>
    );
  }

  return (
    <Modal onClose={() => setOpen(false)}>
    <div className="card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">התאמת צ׳קים שנפרעו בבנק (לפי מספר צ׳ק + סכום)</h2>
        <button onClick={() => setOpen(false)} className="text-sm text-muted">
          סגור
        </button>
      </div>
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

      <div className="space-y-2">
        <h3 className="text-sm font-semibold">הצעות — צ׳קים שעבר תאריך הפירעון שלהם ועדיין לא נפרעו</h3>
        {loadingSuggestions && <p className="text-xs text-muted">טוען הצעות...</p>}
        {!loadingSuggestions && overdueCandidates.length === 0 && (
          <p className="text-xs text-muted">אין צ׳קים באיחור עבור החשבון הזה</p>
        )}
        {overdueCandidates.length > 0 && (
          <div className="overflow-x-auto max-h-56 overflow-y-auto border border-border rounded-lg">
            <table className="data-table">
              <thead>
                <tr>
                  <th></th>
                  <th>מספר צ׳ק</th>
                  <th>מוטב</th>
                  <th>סכום</th>
                  <th>תאריך פירעון</th>
                </tr>
              </thead>
              <tbody>
                {overdueCandidates.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selectedSuggestions.has(c.id)}
                        onChange={() => toggleSuggestion(c.id)}
                      />
                    </td>
                    <td>{c.check_number}</td>
                    <td>{c.payee}</td>
                    <td>{formatCurrency(c.amount)}</td>
                    <td className="text-warning">{c.due_date ? formatDate(c.due_date) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-muted">
          סמנו את מה שבאמת ירד בבנק — או שלא בטוחים? הדביקו דוח בנק למטה ותתבצע התאמה אוטומטית לפי מספר וסכום.
        </p>
      </div>

      <textarea
        value={rawText}
        onChange={(e) => setRawText(e.target.value)}
        className="w-full h-28 rounded-lg border border-border bg-transparent px-3 py-2 text-sm font-mono"
        placeholder={"מספר צ׳ק, סכום\n1042, 850\n1043, 1200"}
      />
      <button
        disabled={isPending || !bankAccountId || !rawText.trim()}
        onClick={checkMatches}
        className="rounded-lg border border-border px-4 py-2 text-sm font-semibold disabled:opacity-50"
      >
        בדוק התאמות מהדוח שהודבק
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
        </div>
      )}

      {totalToConfirm > 0 && (
        <button
          disabled={isPending}
          onClick={confirm}
          className="rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold disabled:opacity-50"
        >
          אשר וסמן {totalToConfirm} כנפרעו
        </button>
      )}

      {error && <p className="text-sm text-danger">{error}</p>}
      {message && <p className="text-sm text-success">{message}</p>}
    </div>
    </Modal>
  );
}
