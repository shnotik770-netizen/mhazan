"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { UnifiedCheckForm } from "@/components/unified-check-form";
import { NewManualEntryButton } from "@/components/manual-entries-client";
import { Modal } from "@/components/modal";
import { ExpectedIncomeBatchForm } from "@/components/expected-income-batch-form";
import { getQuickActionRefData } from "@/app/(app)/quick-actions-actions";

type RefData = Awaited<ReturnType<typeof getQuickActionRefData>>;
// Inter-department transfer is intentionally NOT its own key here — it's a
// toggle inside the "manual_entry" modal (see NewManualEntryFormMulti)
// instead of a separate quick action/button, so the list below doesn't
// carry a near-duplicate entry alongside plain manual entry.
type ModalActionKey = "payment_request" | "expected_income" | "manual_entry" | "manual_entry_paste";

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
const GROUP_INFO: Record<ActionGroup, { title: string; dotClass: string }> = {
  create: { title: "פעולות יומיומיות", dotClass: "bg-primary" },
  checks: { title: "צ׳קים ותשלומים", dotClass: "bg-warning" },
  reports: { title: "דוחות וצפי", dotClass: "bg-success" },
  admin: { title: "ניהול מערכת", dotClass: "bg-muted" },
};

type ActionDef =
  | { key: ModalActionKey; label: string; type: "modal"; group: ActionGroup }
  | { key: string; label: string; type: "link"; href: string; group: ActionGroup };

const ACTIONS: ActionDef[] = [
  { key: "payment_request", label: "דרישת תשלום חדשה", type: "modal", group: "create" },
  { key: "expected_income", label: "הכנסה צפויה חדשה", type: "modal", group: "create" },
  { key: "manual_entry", label: "הכנסה / הוצאה ידנית", type: "modal", group: "create" },
  { key: "manual_entry_paste", label: "הדבקת רשימת הכנסות / הוצאות", type: "modal", group: "create" },
  { key: "paste_income", label: "הכנסות מנדרים", type: "link", href: "/incomes/new", group: "create" },
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
          isAdmin
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
          isAdmin
          open
          onOpenChange={(v) => !v && setActiveAction(null)}
          hideTrigger
          initialMode="paste"
        />
      )}
    </>
  );

  return { openAction, pendingKey, modals };
}

const GROUP_ORDER: ActionGroup[] = ["create", "checks", "reports", "admin"];

// A single search screen for every quick action — grouped sections like the
// dashboard panel used to render inline, but in a modal with a search box on
// top, autofocused so typing starts filtering immediately. This is now the
// one place both the floating "+" and the dashboard's "פעולות מהירות" panel
// open into, instead of each having its own separate UI (a speed-dial list
// vs. an inline expanding grid) for what's really the same job: finding one
// action out of 18+ quickly.
function ActionsSearchModal({
  onClose,
  openAction,
  pendingKey,
}: {
  onClose: () => void;
  openAction: (key: ModalActionKey) => void;
  pendingKey: ModalActionKey | null;
}) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const normalizedQuery = query.trim().toLowerCase();
  const filtered = normalizedQuery ? ACTIONS.filter((a) => a.label.toLowerCase().includes(normalizedQuery)) : ACTIONS;

  function handleModalAction(key: ModalActionKey) {
    openAction(key);
    onClose();
  }

  return (
    <Modal onClose={onClose}>
      <div className="card p-4 space-y-3 flex flex-col max-h-[80vh]">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold" style={{ fontFamily: "var(--font-display)" }}>
            חיפוש פעולה
          </h2>
          <button type="button" onClick={onClose} className="text-muted hover:text-foreground">
            ✕
          </button>
        </div>
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="הקלידו כדי לחפש פעולה..."
          className="rounded-lg border border-border bg-transparent px-3 py-2 text-sm w-full"
        />
        <div className="overflow-y-auto space-y-3 -mx-1 px-1">
          {GROUP_ORDER.map((group) => {
            const groupActions = filtered.filter((a) => a.group === group);
            if (groupActions.length === 0) return null;
            const { title, dotClass } = GROUP_INFO[group];
            return (
              <div key={group}>
                <h3 className="text-xs font-semibold text-muted mb-1">{title}</h3>
                <div className="space-y-0.5">
                  {groupActions.map((a) =>
                    a.type === "link" ? (
                      <Link
                        key={a.key}
                        href={a.href}
                        onClick={onClose}
                        className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm hover:bg-background"
                      >
                        <span className={`h-2 w-2 rounded-full shrink-0 ${dotClass}`} />
                        {a.label}
                      </Link>
                    ) : (
                      <button
                        key={a.key}
                        type="button"
                        disabled={pendingKey === a.key}
                        onClick={() => handleModalAction(a.key)}
                        className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm hover:bg-background text-right w-full disabled:opacity-60"
                      >
                        <span className={`h-2 w-2 rounded-full shrink-0 ${dotClass}`} />
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
      </div>
    </Modal>
  );
}

export function QuickActionsFab() {
  const [searchOpen, setSearchOpen] = useState(false);
  const { openAction, pendingKey, modals } = useQuickActionsState();

  return (
    <>
      <button
        type="button"
        onClick={() => setSearchOpen(true)}
        className="fixed bottom-6 right-6 z-40 h-14 w-14 rounded-full bg-primary text-primary-foreground text-2xl font-bold shadow-lg flex items-center justify-center no-print"
        aria-label="חיפוש פעולות"
        title="חיפוש פעולות"
      >
        +
      </button>

      {searchOpen && <ActionsSearchModal onClose={() => setSearchOpen(false)} openAction={openAction} pendingKey={pendingKey} />}
      {modals}
    </>
  );
}

// A single entry point into ActionsSearchModal from the dashboard — same
// modal the floating "+" opens, so there's one consistent way to find any
// of the 18+ actions instead of two different UIs doing the same job.
export function QuickActionsPanel() {
  const { openAction, pendingKey, modals } = useQuickActionsState();
  const [searchOpen, setSearchOpen] = useState(false);

  return (
    <div className="card p-4">
      <button
        type="button"
        onClick={() => setSearchOpen(true)}
        className="flex items-center justify-between gap-3 w-full text-right"
      >
        <h2 className="font-semibold">פעולות מהירות</h2>
        <span className="text-sm text-primary">חיפוש פעולה ←</span>
      </button>

      {searchOpen && <ActionsSearchModal onClose={() => setSearchOpen(false)} openAction={openAction} pendingKey={pendingKey} />}
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
