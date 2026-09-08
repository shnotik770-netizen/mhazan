"use client";

import { useState } from "react";
import Link from "next/link";
import { UnifiedCheckForm } from "@/components/unified-check-form";
import { InterDepartmentTransferForm, NewManualEntryButton } from "@/components/manual-entries-client";
import { Modal } from "@/components/modal";
import { ExpectedIncomeBatchForm } from "@/components/expected-income-batch-form";
import { getQuickActionRefData } from "@/app/(app)/quick-actions-actions";

type RefData = Awaited<ReturnType<typeof getQuickActionRefData>>;
type ModalActionKey = "payment_request" | "expected_income" | "manual_entry" | "manual_entry_paste" | "inter_department_transfer";

// Every quick action shows up in two places — the floating "+" speed-dial
// (QuickActionsFab) and a plain button grid on the dashboard
// (QuickActionsPanel) — both built on the same ACTIONS list and the same
// useQuickActionsState() below, so a new action only needs to be added
// once here. A "link" action just navigates; a "modal" action opens the
// matching form via openAction(). Both components are only ever rendered
// for a finance admin (gated at each call site), so nothing here needs its
// own role check.
//
// Includes every screen an admin might otherwise only stumble onto via
// "הגדרות" (categories/departments/suppliers/audit log all live there, with
// no other link to them) plus every standalone action button that
// otherwise exists on just one specific page — the point of this list is
// that nothing in the system requires knowing where it's buried.
type ActionDef =
  | { key: ModalActionKey; label: string; type: "modal" }
  | { key: string; label: string; type: "link"; href: string };

const ACTIONS: ActionDef[] = [
  { key: "payment_request", label: "דרישת תשלום חדשה", type: "modal" },
  { key: "expected_income", label: "הכנסה צפויה חדשה", type: "modal" },
  { key: "manual_entry", label: "הכנסה / הוצאה ידנית", type: "modal" },
  { key: "manual_entry_paste", label: "הדבקת רשימת הכנסות / הוצאות", type: "modal" },
  { key: "inter_department_transfer", label: "העברה בין מחלקות", type: "modal" },
  { key: "paste_income", label: "הדבק הכנסות", type: "link", href: "/incomes/new" },
  { key: "quick_issuance", label: "הנפקה מהירה", type: "link", href: "/checks#issuance-queue" },
  { key: "forecast", label: "מעבר לתחזית", type: "link", href: "/forecast" },
  { key: "due_checks", label: "צ׳קים והעברות שהגיע תאריכם", type: "link", href: "/checks#due-checks" },
  { key: "checks", label: "צ׳קים והעברות", type: "link", href: "/checks" },
  { key: "transactions", label: "כל התנועות", type: "link", href: "/transactions" },
  { key: "expenses", label: "הוצאות", type: "link", href: "/expenses" },
  { key: "ledger", label: "דוחות מחלקות", type: "link", href: "/ledger" },
  { key: "recurring_schedules", label: "הרשאות וחיובים קבועים", type: "link", href: "/recurring-schedules" },
  { key: "categories", label: "ניהול קטגוריות", type: "link", href: "/categories" },
  { key: "departments", label: "ניהול מחלקות", type: "link", href: "/departments" },
  { key: "suppliers", label: "ניהול ספקים", type: "link", href: "/suppliers" },
  { key: "audit_log", label: "יומן ביקורת", type: "link", href: "/audit-log" },
  { key: "settings", label: "הגדרות מערכת", type: "link", href: "/settings" },
];

function useQuickActionsState() {
  const [activeAction, setActiveAction] = useState<ModalActionKey | null>(null);
  const [refData, setRefData] = useState<RefData | null>(null);
  const [loading, setLoading] = useState(false);

  async function openAction(key: ModalActionKey) {
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

  const modals = (
    <>
      {activeAction === "payment_request" && refData && (
        <UnifiedCheckForm
          bankAccounts={refData.bankAccounts}
          departments={refData.departments}
          open
          onOpenChange={(v) => !v && setActiveAction(null)}
          hideTrigger
        />
      )}
      {activeAction === "expected_income" && refData && (
        <QuickExpectedIncomeForm bankAccounts={refData.bankAccounts} onClose={() => setActiveAction(null)} />
      )}
      {activeAction === "manual_entry" && refData && (
        <NewManualEntryButton
          departments={refData.departments}
          bankAccounts={refData.bankAccounts}
          categories={refData.categories}
          open
          onOpenChange={(v) => !v && setActiveAction(null)}
          hideTrigger
        />
      )}
      {activeAction === "manual_entry_paste" && refData && (
        <NewManualEntryButton
          departments={refData.departments}
          bankAccounts={refData.bankAccounts}
          categories={refData.categories}
          open
          onOpenChange={(v) => !v && setActiveAction(null)}
          hideTrigger
          initialMode="paste"
        />
      )}
      {activeAction === "inter_department_transfer" && refData && (
        <Modal onClose={() => setActiveAction(null)}>
          <div className="p-4">
            <InterDepartmentTransferForm departments={refData.departments} onSaved={() => setActiveAction(null)} />
          </div>
        </Modal>
      )}
    </>
  );

  return { openAction, loading, modals };
}

export function QuickActionsFab() {
  const [menuOpen, setMenuOpen] = useState(false);
  const { openAction, loading, modals } = useQuickActionsState();

  function handleClick(action: ActionDef) {
    setMenuOpen(false);
    if (action.type === "modal") openAction(action.key);
  }

  return (
    <>
      <div className="fixed bottom-6 right-6 z-40 flex flex-col items-end gap-2 no-print">
        {menuOpen && (
          <div className="flex flex-col items-end gap-2 mb-1 max-h-[70vh] overflow-y-auto py-1 px-0.5">
            {ACTIONS.map((a) =>
              a.type === "link" ? (
                <Link
                  key={a.key}
                  href={a.href}
                  onClick={() => setMenuOpen(false)}
                  className="rounded-full bg-surface border border-border shadow-lg px-4 py-2 text-sm font-medium hover:bg-background whitespace-nowrap"
                >
                  {a.label}
                </Link>
              ) : (
                <button
                  key={a.key}
                  type="button"
                  onClick={() => handleClick(a)}
                  className="rounded-full bg-surface border border-border shadow-lg px-4 py-2 text-sm font-medium hover:bg-background whitespace-nowrap"
                >
                  {a.label}
                </button>
              ),
            )}
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

      {modals}
    </>
  );
}

// The same actions rendered as a proper button grid on the dashboard, for
// admins who'd rather see them up front than discover the floating button.
export function QuickActionsPanel() {
  const { openAction, loading, modals } = useQuickActionsState();

  return (
    <div className="card p-4">
      <h2 className="font-semibold mb-3">פעולות מהירות</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {ACTIONS.map((a) =>
          a.type === "link" ? (
            <Link
              key={a.key}
              href={a.href}
              className="rounded-xl border border-border bg-background hover:bg-surface transition-colors px-4 py-4 text-sm font-semibold text-center"
            >
              {a.label}
            </Link>
          ) : (
            <button
              key={a.key}
              type="button"
              disabled={loading}
              onClick={() => openAction(a.key)}
              className="rounded-xl border border-border bg-background hover:bg-surface transition-colors px-4 py-4 text-sm font-semibold text-center disabled:opacity-60"
            >
              {a.label}
            </button>
          ),
        )}
      </div>
      {modals}
    </div>
  );
}

function QuickExpectedIncomeForm({ bankAccounts, onClose }: { bankAccounts: RefData["bankAccounts"]; onClose: () => void }) {
  return (
    <Modal onClose={onClose}>
      <div className="card p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div>
            <h2 className="text-lg font-bold" style={{ fontFamily: "var(--font-display)" }}>
              הכנסה צפויה חדשה
            </h2>
            <p className="text-xs text-muted mt-0.5">
              הערכה בלבד — מופיעה בתחזית, לא משפיעה על היתרה או ההכנסות בפועל עד שמסמנים שהתקבלה. אפשר להוסיף כמה
              שורות ברצף.
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-muted hover:text-foreground">
            ✕
          </button>
        </div>
        <ExpectedIncomeBatchForm bankAccounts={bankAccounts} onSaved={onClose} />
      </div>
    </Modal>
  );
}
