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
// that nothing in the system requires knowing where it's buried. With that
// many entries, a flat grid reads as noise, so every action also carries a
// `group` — QuickActionsPanel renders one labeled, color-accented section
// per group (plus a search box), and the floating list tints each row with
// its group's color so the grouping still reads even without headers there.
type ActionGroup = "create" | "checks" | "reports" | "admin";

// Literal class strings (not built from a shared "color name" at runtime)
// so Tailwind's static scan actually picks them up.
const GROUP_INFO: Record<ActionGroup, { title: string; borderClass: string; dotClass: string }> = {
  create: { title: "פעולות יומיומיות", borderClass: "border-t-primary", dotClass: "bg-primary" },
  checks: { title: "צ׳קים ותשלומים", borderClass: "border-t-warning", dotClass: "bg-warning" },
  reports: { title: "דוחות וצפי", borderClass: "border-t-success", dotClass: "bg-success" },
  admin: { title: "ניהול מערכת", borderClass: "border-t-muted", dotClass: "bg-muted" },
};

type ActionDef =
  | { key: ModalActionKey; label: string; type: "modal"; group: ActionGroup }
  | { key: string; label: string; type: "link"; href: string; group: ActionGroup };

const ACTIONS: ActionDef[] = [
  { key: "payment_request", label: "דרישת תשלום חדשה", type: "modal", group: "create" },
  { key: "expected_income", label: "הכנסה צפויה חדשה", type: "modal", group: "create" },
  { key: "manual_entry", label: "הכנסה / הוצאה ידנית", type: "modal", group: "create" },
  { key: "manual_entry_paste", label: "הדבקת רשימת הכנסות / הוצאות", type: "modal", group: "create" },
  { key: "inter_department_transfer", label: "העברה בין מחלקות", type: "modal", group: "create" },
  { key: "paste_income", label: "הדבק הכנסות", type: "link", href: "/incomes/new", group: "create" },
  { key: "quick_issuance", label: "הנפקה מהירה", type: "link", href: "/checks#issuance-queue", group: "checks" },
  { key: "due_checks", label: "צ׳קים והעברות שהגיע תאריכם", type: "link", href: "/checks#due-checks", group: "checks" },
  { key: "checks", label: "צ׳קים והעברות", type: "link", href: "/checks", group: "checks" },
  { key: "forecast", label: "מעבר לתחזית", type: "link", href: "/forecast", group: "reports" },
  { key: "transactions", label: "כל התנועות", type: "link", href: "/transactions", group: "reports" },
  { key: "expenses", label: "הוצאות", type: "link", href: "/expenses", group: "reports" },
  { key: "ledger", label: "דוחות מחלקות", type: "link", href: "/ledger", group: "reports" },
  { key: "recurring_schedules", label: "הרשאות וחיובים קבועים", type: "link", href: "/recurring-schedules", group: "admin" },
  { key: "categories", label: "ניהול קטגוריות", type: "link", href: "/categories", group: "admin" },
  { key: "departments", label: "ניהול מחלקות", type: "link", href: "/departments", group: "admin" },
  { key: "suppliers", label: "ניהול ספקים", type: "link", href: "/suppliers", group: "admin" },
  { key: "audit_log", label: "יומן ביקורת", type: "link", href: "/audit-log", group: "admin" },
  { key: "settings", label: "הגדרות מערכת", type: "link", href: "/settings", group: "admin" },
];

function useQuickActionsState() {
  const [activeAction, setActiveAction] = useState<ModalActionKey | null>(null);
  const [refData, setRefData] = useState<RefData | null>(null);
  // Which single button is mid-fetch, not a blanket "something is loading"
  // flag — the ref data is fetched once, lazily, on whichever action the
  // admin happens to click first, and only that one button should visibly
  // react. A shared boolean here used to disable/dim every other modal
  // button on the panel at the same time, which read as several buttons
  // reacting to one click.
  const [pendingKey, setPendingKey] = useState<ModalActionKey | null>(null);

  async function openAction(key: ModalActionKey) {
    if (!refData) {
      setPendingKey(key);
      try {
        setRefData(await getQuickActionRefData());
      } finally {
        setPendingKey(null);
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
          categories={refData.categories.map((c) => ({ id: c.id, name: c.name, departmentId: c.department_id }))}
          supplierNames={refData.supplierNames}
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

  return { openAction, pendingKey, modals };
}

export function QuickActionsFab() {
  const [menuOpen, setMenuOpen] = useState(false);
  const { openAction, pendingKey, modals } = useQuickActionsState();

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
                  className="flex items-center gap-2 rounded-full bg-surface border border-border shadow-lg px-4 py-2 text-sm font-medium hover:bg-background whitespace-nowrap"
                >
                  <span className={`h-2 w-2 rounded-full shrink-0 ${GROUP_INFO[a.group].dotClass}`} />
                  {a.label}
                </Link>
              ) : (
                <button
                  key={a.key}
                  type="button"
                  disabled={pendingKey === a.key}
                  onClick={() => handleClick(a)}
                  className="flex items-center gap-2 rounded-full bg-surface border border-border shadow-lg px-4 py-2 text-sm font-medium hover:bg-background whitespace-nowrap disabled:opacity-60"
                >
                  <span className={`h-2 w-2 rounded-full shrink-0 ${GROUP_INFO[a.group].dotClass}`} />
                  {pendingKey === a.key ? "…" : a.label}
                </button>
              ),
            )}
          </div>
        )}
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          className={`h-14 w-14 rounded-full bg-primary text-primary-foreground text-2xl font-bold shadow-lg flex items-center justify-center transition-transform ${menuOpen ? "rotate-45" : ""}`}
          aria-label="פעולות מהירות"
          title="פעולות מהירות"
        >
          +
        </button>
      </div>

      {modals}
    </>
  );
}

const GROUP_ORDER: ActionGroup[] = ["create", "checks", "reports", "admin"];

// The same actions rendered as a proper button grid on the dashboard, for
// admins who'd rather see them up front than discover the floating button.
// Grouped into labeled, color-accented sections (rather than one flat grid)
// so 18+ actions still read at a glance, with a search box on top for
// jumping straight to one by name instead of scanning every section.
export function QuickActionsPanel() {
  const { openAction, pendingKey, modals } = useQuickActionsState();
  const [query, setQuery] = useState("");

  const normalizedQuery = query.trim().toLowerCase();
  const filtered = normalizedQuery
    ? ACTIONS.filter((a) => a.label.toLowerCase().includes(normalizedQuery))
    : ACTIONS;

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <h2 className="font-semibold">פעולות מהירות</h2>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="חיפוש פעולה..."
          className="rounded-lg border border-border bg-transparent px-3 py-1.5 text-sm w-full sm:w-56"
        />
      </div>

      <div className="space-y-4">
        {GROUP_ORDER.map((group) => {
          const groupActions = filtered.filter((a) => a.group === group);
          if (groupActions.length === 0) return null;
          const { title, borderClass } = GROUP_INFO[group];
          return (
            <div key={group}>
              <h3 className="text-xs font-semibold text-muted mb-2">{title}</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {groupActions.map((a) =>
                  a.type === "link" ? (
                    <Link
                      key={a.key}
                      href={a.href}
                      className={`rounded-xl border-t-2 border border-border ${borderClass} bg-background hover:bg-surface transition-colors px-4 py-4 text-sm font-semibold text-center`}
                    >
                      {a.label}
                    </Link>
                  ) : (
                    <button
                      key={a.key}
                      type="button"
                      disabled={pendingKey === a.key}
                      onClick={() => openAction(a.key)}
                      className={`rounded-xl border-t-2 border border-border ${borderClass} bg-background hover:bg-surface transition-colors px-4 py-4 text-sm font-semibold text-center disabled:opacity-60`}
                    >
                      {pendingKey === a.key ? "…" : a.label}
                    </button>
                  ),
                )}
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && <p className="text-sm text-muted text-center py-4">אין פעולה שתואמת את החיפוש</p>}
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
