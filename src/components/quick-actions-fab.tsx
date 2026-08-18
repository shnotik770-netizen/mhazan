"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { UnifiedCheckForm } from "@/components/unified-check-form";
import { Modal } from "@/components/modal";
import { DateInput } from "@/components/date-input";
import { getQuickActionRefData } from "@/app/(app)/quick-actions-actions";
import { createExpectedIncome } from "@/app/(app)/forecast/actions";

type RefData = Awaited<ReturnType<typeof getQuickActionRefData>>;
type ActionKey = "payment_request" | "expected_income";

// A floating "+" button (bottom-right, visible on every admin page) that
// opens a small speed-dial of quick-entry actions — reuses the same forms/
// server actions as their full pages instead of duplicating logic, and
// only fetches the reference data (bank accounts/departments/categories)
// the first time it's actually opened. New actions get added to `ACTIONS`
// plus a case in the render switch below.
const ACTIONS: { key: ActionKey; label: string }[] = [
  { key: "payment_request", label: "דרישת תשלום חדשה" },
  { key: "expected_income", label: "הכנסה צפויה חדשה" },
];

export function QuickActionsFab() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeAction, setActiveAction] = useState<ActionKey | null>(null);
  const [refData, setRefData] = useState<RefData | null>(null);
  const [loading, setLoading] = useState(false);

  async function openAction(key: ActionKey) {
    setMenuOpen(false);
    if (!refData) {
      setLoading(true);
      try {
        setRefData(await getQuickActionRefData());
      } finally {
        setLoading(false);
      }
    }
    setActiveAction(key);
  }

  return (
    <>
      <div className="fixed bottom-6 right-6 z-40 flex flex-col items-end gap-2 no-print">
        {menuOpen && (
          <div className="flex flex-col items-end gap-2 mb-1">
            {ACTIONS.map((a) => (
              <button
                key={a.key}
                type="button"
                onClick={() => openAction(a.key)}
                className="rounded-full bg-surface border border-border shadow-lg px-4 py-2 text-sm font-medium hover:bg-background whitespace-nowrap"
              >
                {a.label}
              </button>
            ))}
          </div>
        )}
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          disabled={loading}
          className={`h-14 w-14 rounded-full bg-primary text-primary-foreground text-2xl font-bold shadow-lg flex items-center justify-center transition-transform disabled:opacity-60 ${menuOpen ? "rotate-45" : ""}`}
          aria-label="פעולות מהירות"
          title="פעולות מהירות"
        >
          {loading ? "…" : "+"}
        </button>
      </div>

      {activeAction === "payment_request" && refData && (
        <UnifiedCheckForm
          bankAccounts={refData.bankAccounts}
          departments={refData.departments}
          categories={refData.categories}
          open
          onOpenChange={(v) => !v && setActiveAction(null)}
          hideTrigger
        />
      )}

      {activeAction === "expected_income" && refData && (
        <QuickExpectedIncomeForm bankAccounts={refData.bankAccounts} onClose={() => setActiveAction(null)} />
      )}
    </>
  );
}

function QuickExpectedIncomeForm({ bankAccounts, onClose }: { bankAccounts: RefData["bankAccounts"]; onClose: () => void }) {
  const router = useRouter();
  const [bankAccountId, setBankAccountId] = useState("");
  const [amount, setAmount] = useState(0);
  const [expectedDate, setExpectedDate] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await createExpectedIncome({
        bankAccountId,
        amount,
        expectedDate,
        description: description || null,
      });
      if (result.error) setError(result.error);
      else {
        router.refresh();
        onClose();
      }
    });
  }

  return (
    <Modal onClose={onClose}>
      <div className="card p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div>
            <h2 className="text-lg font-bold" style={{ fontFamily: "var(--font-display)" }}>
              הכנסה צפויה חדשה
            </h2>
            <p className="text-xs text-muted mt-0.5">
              הערכה בלבד — מופיעה בתחזית, לא משפיעה על היתרה או ההכנסות בפועל עד שמסמנים שהתקבלה.
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-muted hover:text-foreground">
            ✕
          </button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium mb-1">חשבון בנק</label>
            <select
              value={bankAccountId}
              onChange={(e) => setBankAccountId(e.target.value)}
              className="w-full rounded-lg border border-border bg-transparent px-3 py-2 text-sm"
            >
              <option value="">בחר חשבון בנק...</option>
              {bankAccounts.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.departments?.name} — {b.bank_name} ({b.account_number})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">סכום משוער</label>
            <input
              type="number"
              value={amount || ""}
              onChange={(e) => setAmount(Number(e.target.value) || 0)}
              className="w-full rounded-lg border border-border bg-transparent px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">תאריך צפוי</label>
            <DateInput value={expectedDate} onChange={setExpectedDate} required />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">תיאור / מקור</label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="לדוגמה: סיכום חברת אשראי"
              className="w-full rounded-lg border border-border bg-transparent px-3 py-2 text-sm"
            />
          </div>
        </div>
        {error && <p className="text-xs text-danger">{error}</p>}
        <div className="flex items-center gap-2 pt-2 border-t border-border">
          <button
            disabled={isPending || !bankAccountId || amount <= 0 || !expectedDate}
            onClick={submit}
            className="rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold disabled:opacity-50"
          >
            {isPending ? "שומר..." : "שמירה"}
          </button>
          <button type="button" onClick={onClose} className="text-sm text-muted">
            ביטול
          </button>
        </div>
      </div>
    </Modal>
  );
}
