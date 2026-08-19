import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { formatCurrency, formatDate, daysAgoLabel } from "@/lib/format";
import { BankBalancePanel, ExpectedIncomeManager } from "@/components/forecast-client";
import { ForecastDailyTable } from "@/components/forecast-daily-table-client";
import { ForecastDayLookup } from "@/components/forecast-day-lookup-client";
import { ForecastFilterBar } from "@/components/forecast-filter-bar-client";

// Days from today through the last day of the given "YYYY-MM" month —
// turns the user-facing "עד חודש" choice into the p_horizon_days the
// forecast RPCs actually take, so there's one control instead of two
// (a day-count horizon and a separate month cutoff meant the same thing).
function daysUntilEndOfMonth(monthStr: string): number {
  const [y, m] = monthStr.split("-").map(Number);
  const lastDayOfMonth = new Date(y, m, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  lastDayOfMonth.setHours(0, 0, 0, 0);
  const diffDays = Math.round((lastDayOfMonth.getTime() - today.getTime()) / 86400000);
  return Math.max(1, diffDays);
}

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(monthStr: string): string {
  return new Intl.DateTimeFormat("he-IL", { month: "long", year: "numeric" }).format(new Date(`${monthStr}-01T00:00:00`));
}

export default async function ForecastPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string; account?: string; department?: string; upto?: string }>;
}) {
  const { mode: modeParam, account, department, upto } = await searchParams;
  const mode = modeParam === "department" ? "department" : "bank";
  const currentMonth = monthKey(new Date());
  const uptoMonthOptions = Array.from({ length: 12 }, (_, i) => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() + i);
    return monthKey(d);
  });
  const uptoMonth = upto && uptoMonthOptions.includes(upto) ? upto : currentMonth;
  const horizonDays = daysUntilEndOfMonth(uptoMonth);

  const user = await requireUser();
  const isAdmin = user.profile.role === "FINANCE_ADMIN";
  const supabase = await createClient();
  const [{ data: bankAccounts }, { data: departments }] = await Promise.all([
    supabase.from("bank_accounts").select("*, departments!bank_accounts_department_id_fkey(name)").order("bank_name"),
    supabase.from("departments").select("*").order("name"),
  ]);

  const selectedAccountId = account ?? bankAccounts?.[0]?.id ?? "";
  const selectedAccount = bankAccounts?.find((b) => b.id === selectedAccountId);
  const selectedDepartmentId = department ?? departments?.[0]?.id ?? "";
  const selectedDepartment = departments?.find((d) => d.id === selectedDepartmentId);

  const expectedIncomesResult =
    mode === "bank" && selectedAccountId
      ? await supabase
          .from("expected_incomes")
          .select("*")
          .eq("bank_account_id", selectedAccountId)
          .order("expected_date")
      : null;
  const expectedIncomes = expectedIncomesResult?.data ?? [];

  const { data: forecast, error } =
    mode === "bank"
      ? selectedAccountId
        ? await supabase.rpc("get_cash_flow_forecast", {
            p_bank_account_id: selectedAccountId,
            p_horizon_days: horizonDays,
          })
        : { data: [], error: null }
      : selectedDepartmentId
        ? await supabase.rpc("get_department_cash_flow_forecast", {
            p_department_id: selectedDepartmentId,
            p_horizon_days: horizonDays,
          })
        : { data: [], error: null };

  // Group the flat per-item forecast rows into a per-day breakdown by
  // category (checks / transfers / recurring / expected income) — the
  // per-item list further down stays for anyone who wants to see exactly
  // what's behind a day's total.
  const dailyBreakdown = (() => {
    const byDate = new Map<
      string,
      {
        checks: number;
        transfers: number;
        recurring: number;
        income: number;
        overdue: number;
        total: number;
        runningBalance: number;
      }
    >();
    for (const row of forecast ?? []) {
      const d = row.forecast_date!;
      const entry =
        byDate.get(d) ??
        { checks: 0, transfers: 0, recurring: 0, income: 0, overdue: 0, total: 0, runningBalance: 0 };
      const change = Number(row.expected_change);
      if (row.category === "CHECK") entry.checks += change;
      else if (row.category === "TRANSFER") entry.transfers += change;
      else if (row.category === "RECURRING") entry.recurring += change;
      else if (row.category === "INCOME") entry.income += change;
      // "OVERDUE" — still-unpaid checks/transfers whose due date already
      // passed: kept separate from the regular checks/transfers bucket so
      // the current month's card can show them as their own line, distinct
      // from newly-scheduled expenses.
      else if (row.category === "OVERDUE") entry.overdue += change;
      entry.total += change;
      entry.runningBalance = Number(row.running_balance);
      byDate.set(d, entry);
    }
    return [...byDate.entries()].sort(([a], [b]) => (a < b ? -1 : 1));
  })();

  // Every calendar month touched by the horizon, from the current month
  // onward — used both to size the monthly cards and to drive the "עד
  // חודש" cumulative selector on the daily table below.
  const monthsInHorizon = (() => {
    const months: string[] = [];
    const cursor = new Date();
    cursor.setDate(1);
    const horizonEnd = new Date();
    horizonEnd.setDate(horizonEnd.getDate() + horizonDays);
    while (cursor <= horizonEnd) {
      months.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`);
      cursor.setMonth(cursor.getMonth() + 1);
    }
    return months;
  })();

  // One box per month covered by the horizon: that month's forecasted
  // income/expenses, plus the balance it closes with — starting from the
  // account's current balance for the present month, or carried forward
  // from the previous month's closing balance for months further out.
  const monthlyCards =
    mode === "bank" && selectedAccount
      ? (() => {
          const startBalance = Number(selectedAccount.current_balance);
          let openingBalance = startBalance;
          return monthsInHorizon.map((month) => {
            const monthRows = dailyBreakdown.filter(([date]) => date.startsWith(month));
            const income = monthRows.reduce((sum, [, d]) => sum + d.income, 0);
            const expense = monthRows.reduce((sum, [, d]) => sum + d.checks + d.transfers + d.recurring, 0);
            // Only ever lands in the current month, since overdue rows are
            // attributed to today's date — kept as a separate line rather
            // than folded into "expense" above.
            const oldExpense = monthRows.reduce((sum, [, d]) => sum + d.overdue, 0);
            const opening = openingBalance;
            const closing = monthRows.length > 0 ? monthRows[monthRows.length - 1][1].runningBalance : opening;
            openingBalance = closing;
            return { month, opening, income, expense, oldExpense, closing };
          });
        })()
      : [];

  // Actual recorded income per month, for the bank account's department —
  // a look back at real history alongside the forward-looking forecast.
  const monthlyIncome =
    mode === "bank" && selectedAccount
      ? (async () => {
          const twelveMonthsAgo = new Date();
          twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 11);
          twelveMonthsAgo.setDate(1);
          const { data: incomeRows } = await supabase
            .from("incomes")
            .select("date, amount")
            .eq("bank_account_id", selectedAccount.id)
            .gte("date", twelveMonthsAgo.toISOString().slice(0, 10))
            .order("date");
          const byMonth = new Map<string, number>();
          for (const r of incomeRows ?? []) {
            const key = r.date.slice(0, 7);
            byMonth.set(key, (byMonth.get(key) ?? 0) + Number(r.amount));
          }
          return [...byMonth.entries()].sort(([a], [b]) => (a < b ? -1 : 1));
        })()
      : Promise.resolve([]);
  const monthlyIncomeRows = await monthlyIncome;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">תחזית תזרים מזומנים</h1>
        <p className="text-sm text-muted">
          {mode === "bank"
            ? "יתרה צפויה = יתרת בנק נוכחית − צ׳קים בחוץ − הוראות קבע עתידיות + צפי הכנסות"
            : "שינוי נטו צפוי למחלקה: הוצאות ידועות עם תאריך + הוראות קבע, ללא זיקה לחשבון בנק ספציפי"}
        </p>
      </div>

      <div className="flex gap-2">
        <Link
          href="/forecast?mode=bank"
          className={`rounded-lg px-4 py-2 text-sm font-semibold ${mode === "bank" ? "bg-primary text-primary-foreground" : "border border-border"}`}
        >
          תחזית בנק
        </Link>
        <Link
          href="/forecast?mode=department"
          className={`rounded-lg px-4 py-2 text-sm font-semibold ${mode === "department" ? "bg-primary text-primary-foreground" : "border border-border"}`}
        >
          תחזית מחלקה
        </Link>
      </div>

      <ForecastFilterBar
        mode={mode}
        bankAccountOptions={(bankAccounts ?? []).map((b) => ({
          id: b.id,
          label: `${(b as { departments: { name: string } | null }).departments?.name ?? ""} — ${b.bank_name} (${b.account_number})`,
        }))}
        departmentOptions={(departments ?? []).map((d) => ({ id: d.id, label: d.name }))}
        selectedAccountId={selectedAccountId}
        selectedDepartmentId={selectedDepartmentId}
        uptoMonth={uptoMonth}
        uptoMonthOptions={uptoMonthOptions.map((m) => ({ value: m, label: monthLabel(m) }))}
      />

      {mode === "bank" && selectedAccount && isAdmin && (
        <BankBalancePanel
          bankAccountId={selectedAccount.id}
          currentBalance={Number(selectedAccount.current_balance)}
          balanceAsOf={selectedAccount.balance_as_of}
        />
      )}
      {mode === "bank" && selectedAccount && !isAdmin && (
        <div className="card p-4">
          <p className="text-sm text-muted mb-1">יתרת פתיחה נוכחית</p>
          <p className="text-2xl font-bold">{formatCurrency(Number(selectedAccount.current_balance))}</p>
          <p className="text-xs text-muted">{daysAgoLabel(selectedAccount.balance_as_of)}</p>
        </div>
      )}

      {mode === "bank" && selectedAccount && isAdmin && (
        <ExpectedIncomeManager bankAccountId={selectedAccount.id} expectedIncomes={expectedIncomes} />
      )}

      {mode === "department" && selectedDepartment && (
        <div className="card p-4">
          <p className="text-sm text-muted mb-1">מחלקה</p>
          <p className="text-2xl font-bold">{selectedDepartment.name}</p>
        </div>
      )}

      {error && <div className="card p-4 bg-danger-bg text-danger text-sm">{error.message}</div>}

      {mode === "bank" && selectedAccount && (
        <ForecastDayLookup rows={dailyBreakdown} startingBalance={Number(selectedAccount.current_balance)} />
      )}

      {mode === "bank" && monthlyCards.length > 0 && (
        <div>
          <h2 className="font-semibold mb-2">מצב חזוי לפי חודשים</h2>
          <div className="flex flex-col gap-3">
            {monthlyCards.map((c) => (
              <div key={c.month} className="card p-4 space-y-1">
                <p className="font-semibold">
                  {new Intl.DateTimeFormat("he-IL", { month: "long", year: "numeric" }).format(
                    new Date(`${c.month}-01T00:00:00`),
                  )}
                </p>
                <p className="text-xs text-muted">
                  יתרת פתיחה: <span className="font-medium text-foreground">{formatCurrency(c.opening)}</span>
                </p>
                <p className="text-xs text-success">הכנסות: {formatCurrency(c.income)}</p>
                <p className="text-xs text-danger">הוצאות: {formatCurrency(Math.abs(c.expense))}</p>
                {c.oldExpense !== 0 && (
                  <p className="text-xs text-warning">
                    הוצאות ישנות שלא נפדו מחודשים קודמים: {formatCurrency(Math.abs(c.oldExpense))}
                  </p>
                )}
                <p className="text-sm font-semibold pt-1 border-t border-border">
                  יתרת סגירה:{" "}
                  <span className={c.closing < 0 ? "text-danger" : "text-success"}>{formatCurrency(c.closing)}</span>
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {mode === "bank" && monthlyIncomeRows.length > 0 && (
        <div className="card p-4 overflow-x-auto">
          <h2 className="font-semibold mb-2">הכנסות בפועל לפי חודש (12 חודשים אחרונים)</h2>
          <table className="data-table">
            <thead>
              <tr>
                <th>חודש</th>
                <th>סה״כ הכנסות</th>
              </tr>
            </thead>
            <tbody>
              {monthlyIncomeRows.map(([month, total]) => (
                <tr key={month}>
                  <td>{month}</td>
                  <td className="font-semibold text-success">{formatCurrency(total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ForecastDailyTable rows={dailyBreakdown} mode={mode} />

      <details className="card p-4">
        <summary className="cursor-pointer font-semibold">פירוט מלא לפי פריט</summary>
        <div className="overflow-x-auto mt-3">
          <table className="data-table">
            <thead>
              <tr>
                <th>תאריך</th>
                <th>מקור</th>
                <th>שינוי צפוי</th>
                <th>{mode === "bank" ? "יתרה חזויה" : "שינוי נטו מצטבר"}</th>
              </tr>
            </thead>
            <tbody>
              {(forecast ?? []).map((row, i) => (
                <tr key={i}>
                  <td>{formatDate(row.forecast_date!)}</td>
                  <td>{row.source}</td>
                  <td className={Number(row.expected_change) < 0 ? "text-danger" : "text-success"}>
                    {formatCurrency(Number(row.expected_change))}
                  </td>
                  <td className="font-semibold">{formatCurrency(Number(row.running_balance))}</td>
                </tr>
              ))}
              {(forecast ?? []).length === 0 && (
                <tr>
                  <td colSpan={4} className="text-center text-muted py-6">
                    אין תנועות צפויות בטווח שנבחר
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
