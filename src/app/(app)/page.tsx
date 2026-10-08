import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { todayIso } from "@/lib/format";
import { NewManualEntryButton, PendingManualEntriesTable } from "@/components/manual-entries-client";
import { UnifiedCheckForm } from "@/components/unified-check-form";
import { QuickActionsPanel } from "@/components/quick-actions-fab";
import { BankAccountsTable, LedgerBalancesTable } from "@/components/dashboard-tables-client";
import { getBankAccountLedgerData } from "@/lib/bank-account-ledger-data";
import { BankAccountLedgerTable } from "@/components/bank-account-ledger-client";

// Days remaining in the current calendar month, today included — the
// horizon get_cash_flow_forecast needs to project a bank account's balance
// all the way to month-end in one call.
function daysUntilEndOfMonth(): number {
  const now = new Date();
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  now.setHours(0, 0, 0, 0);
  lastDay.setHours(0, 0, 0, 0);
  return Math.max(0, Math.round((lastDay.getTime() - now.getTime()) / 86400000));
}

export default async function DashboardPage() {
  const user = await requireUser();
  const isAdmin = user.profile.role === "FINANCE_ADMIN";
  const supabase = await createClient();

  const [
    { data: bankAccounts },
    { data: pendingSummary },
    { data: ledgerBalances },
    { data: departments },
    { data: categories },
    { data: grants },
    { data: pendingManualEntries },
    { data: suppliers },
    bankAccountLedgerPairs,
  ] = await Promise.all([
    supabase.from("bank_accounts").select("*, departments!bank_accounts_department_id_fkey(name)").order("bank_name"),
    supabase.from("v_pending_queue_summary").select("*"),
    supabase.from("v_inter_department_balances").select("*"),
    supabase.from("departments").select("*"),
    supabase.from("categories").select("id, name, department_id").order("name"),
    supabase.from("user_department_access").select("department_id").eq("user_id", user.id),
    isAdmin
      ? supabase
          .from("manual_department_entries")
          .select("*, departments(name), bank_accounts(bank_name, account_number)")
          .eq("status", "PENDING")
          .order("created_at")
      : Promise.resolve({ data: null }),
    supabase.from("suppliers").select("name").order("name"),
    getBankAccountLedgerData(),
  ]);
  const supplierNames = (suppliers ?? []).map((s) => s.name);

  const grantedIds = new Set((grants ?? []).map((g) => g.department_id));
  const myDepartments = isAdmin ? (departments ?? []) : (departments ?? []).filter((d) => grantedIds.has(d.id));

  const deptName = (id: string | null) => departments?.find((d) => d.id === id)?.name ?? "—";

  // A department that owns its own bank account already gets any cross-
  // account debt tracked precisely (with full transaction detail) by the
  // "חוב בין חשבונות בנק" table below — including it here too would show
  // the same debt twice. This simpler table is for the departments that
  // share another department's account and have no such account-level
  // tracking of their own.
  const departmentsWithOwnAccount = new Set((bankAccounts ?? []).map((b) => b.department_id).filter((id): id is string => Boolean(id)));
  const internalLedgerBalances = (ledgerBalances ?? []).filter(
    (row) =>
      !(row.debtor_department_id && departmentsWithOwnAccount.has(row.debtor_department_id)) &&
      !(row.creditor_department_id && departmentsWithOwnAccount.has(row.creditor_department_id)),
  );

  const totalPending = (pendingSummary ?? []).reduce((sum, p) => sum + Number(p.pending_count ?? 0), 0);
  const pendingCountFor = (source: string) =>
    Number((pendingSummary ?? []).find((p) => p.source === source)?.pending_count ?? 0);

  // Projects each bank account's balance forward from its own (often
  // stale) current_balance to today and to month-end, using the same
  // get_cash_flow_forecast the /forecast page itself relies on. Rows are
  // already ordered by date ascending, so the last one at/before today is
  // today's running balance, and the very last one is month-end's.
  const today = todayIso();
  const horizonDays = daysUntilEndOfMonth();
  const forecastByAccount = new Map<string, { todayBalance: number; endOfMonthBalance: number }>();
  await Promise.all(
    (bankAccounts ?? []).map(async (b) => {
      const { data: forecast } = await supabase.rpc("get_cash_flow_forecast", {
        p_bank_account_id: b.id,
        p_horizon_days: horizonDays,
      });
      const dated = (forecast ?? []).filter((r) => r.category !== "UNDATED");
      const todayRows = dated.filter((r) => r.forecast_date <= today);
      const currentBalance = Number(b.current_balance);
      forecastByAccount.set(b.id, {
        todayBalance: todayRows.length > 0 ? Number(todayRows[todayRows.length - 1].running_balance) : currentBalance,
        endOfMonthBalance: dated.length > 0 ? Number(dated[dated.length - 1].running_balance) : currentBalance,
      });
    }),
  );

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">דשבורד מרכז חב״ד עפולה</h1>
          <p className="text-sm text-muted">
            שלום {user.profile.full_name ?? user.email} — סקירה כללית של המצב הפיננסי
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {isAdmin && (
            <UnifiedCheckForm
              bankAccounts={bankAccounts ?? []}
              departments={departments ?? []}
              categories={(categories ?? []).map((c) => ({ id: c.id, name: c.name, departmentId: c.department_id }))}
              supplierNames={supplierNames}
            />
          )}
          {myDepartments.length > 0 && (
            <NewManualEntryButton
              departments={myDepartments}
              bankAccounts={bankAccounts ?? []}
              categories={categories ?? []}
              isAdmin={isAdmin}
            />
          )}
        </div>
      </div>

      {isAdmin && <QuickActionsPanel />}

      {totalPending > 0 && (
        <div className="space-y-2">
          {pendingCountFor("CHECK") + pendingCountFor("BANK_TRANSACTION") > 0 && (
            <Link
              href="/expenses"
              className="block card px-4 py-3 bg-warning-bg border-warning/30 text-sm font-medium"
            >
              ⚠ ישנם {pendingCountFor("CHECK") + pendingCountFor("BANK_TRANSACTION")} צ׳קים / תנועות בנק
              הדורשים סיווג מחלקה — לחצו לסיווג
            </Link>
          )}
          {pendingCountFor("CATEGORY") > 0 && (
            <Link
              href="/categories"
              className="block card px-4 py-3 bg-warning-bg border-warning/30 text-sm font-medium"
            >
              ⚠ ישנן {pendingCountFor("CATEGORY")} קטגוריות הדורשות שיוך למחלקה — לחצו לשיוך
            </Link>
          )}
        </div>
      )}

      {isAdmin && (pendingManualEntries ?? []).length > 0 && (
        <div className="card p-4 border-warning/40 overflow-x-auto">
          <h2 className="font-semibold mb-1">
            ⚠ {pendingManualEntries!.length} רישומים ידניים ממתינים לאישור
          </h2>
          <PendingManualEntriesTable
            entries={pendingManualEntries!.map((e) => {
              const row = e as unknown as {
                departments: { name: string } | null;
                bank_accounts: { bank_name: string; account_number: string } | null;
              };
              return {
                id: e.id,
                departmentName: row.departments?.name ?? "—",
                direction: e.direction,
                amount: Number(e.amount),
                entryDate: e.entry_date,
                notes: e.notes,
                bankAccountLabel: row.bank_accounts ? `${row.bank_accounts.bank_name} (${row.bank_accounts.account_number})` : null,
              };
            })}
          />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="space-y-4">
          <div className="card p-4 overflow-x-auto">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold">מאזן בנקים</h2>
              <Link href="/forecast" className="text-sm text-primary">
                תחזית תזרים ←
              </Link>
            </div>
            <BankAccountsTable
              showForecast
              accounts={(bankAccounts ?? []).map((b) => ({
                id: b.id,
                departmentName: (b as { departments: { name: string } | null }).departments?.name ?? null,
                bank_name: b.bank_name,
                account_number: b.account_number,
                current_balance: Number(b.current_balance),
                balance_as_of: b.balance_as_of,
                todayBalance: forecastByAccount.get(b.id)?.todayBalance,
                endOfMonthBalance: forecastByAccount.get(b.id)?.endOfMonthBalance,
              }))}
            />
          </div>

          <div className="card p-4 overflow-x-auto">
            <div className="flex items-center justify-between mb-1">
              <h2 className="font-semibold">חוב בין חשבונות בנק</h2>
              <Link href="/ledger" className="text-sm text-primary">
                לדוח המלא ←
              </Link>
            </div>
            <p className="text-sm text-muted mb-3">
              חוב אמיתי בין מחלקות שמנהלות חשבונות בנק נפרדים — לא כולל מחלקות שחולקות אותו חשבון בנק.
            </p>
            <BankAccountLedgerTable pairs={bankAccountLedgerPairs} />
          </div>
        </div>

        <div className="card p-4 overflow-x-auto">
          <div className="flex items-center justify-between mb-1">
            <h2 className="font-semibold">התחשבנות פנימית בין מחלקות</h2>
            <Link href="/ledger" className="text-sm text-primary">
              לדוח המלא ←
            </Link>
          </div>
          <p className="text-sm text-muted mb-3">
            רק מחלקות ללא חשבון בנק משלהן (החולקות חשבון בנק של מחלקה אחרת) — חוב בין מחלקות עם חשבונות נפרדים מופיע למעלה, ב&quot;חוב בין חשבונות בנק&quot;.
          </p>
          <LedgerBalancesTable
            rows={internalLedgerBalances.map((row, i) => ({
              key: String(i),
              debtorName: deptName(row.debtor_department_id),
              creditorName: deptName(row.creditor_department_id),
              amount: Number(row.net_amount),
            }))}
          />
        </div>
      </div>
    </div>
  );
}
