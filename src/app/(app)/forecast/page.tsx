import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { formatCurrency, formatDate } from "@/lib/format";
import { BankBalancePanel, ExpectedIncomeManager } from "@/components/forecast-client";

export default async function ForecastPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string; account?: string; department?: string; horizon?: string }>;
}) {
  const { mode: modeParam, account, department, horizon } = await searchParams;
  const mode = modeParam === "department" ? "department" : "bank";
  const horizonDays = Number(horizon ?? 30);

  const user = await requireUser();
  const isAdmin = user.profile.role === "FINANCE_ADMIN";
  const supabase = await createClient();
  const [{ data: bankAccounts }, { data: departments }] = await Promise.all([
    supabase.from("bank_accounts").select("*, departments(name)").order("bank_name"),
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
      { checks: number; transfers: number; recurring: number; income: number; total: number; runningBalance: number }
    >();
    for (const row of forecast ?? []) {
      const d = row.forecast_date!;
      const entry =
        byDate.get(d) ?? { checks: 0, transfers: 0, recurring: 0, income: 0, total: 0, runningBalance: 0 };
      const change = Number(row.expected_change);
      if (row.category === "CHECK") entry.checks += change;
      else if (row.category === "TRANSFER") entry.transfers += change;
      else if (row.category === "RECURRING") entry.recurring += change;
      else if (row.category === "INCOME") entry.income += change;
      entry.total += change;
      entry.runningBalance = Number(row.running_balance);
      byDate.set(d, entry);
    }
    return [...byDate.entries()].sort(([a], [b]) => (a < b ? -1 : 1));
  })();

  // One box per month covered by the horizon: that month's forecasted
  // income/expenses, plus the balance it closes with — starting from the
  // account's current balance for the present month, or carried forward
  // from the previous month's closing balance for months further out.
  const monthlyCards =
    mode === "bank" && selectedAccount
      ? (() => {
          const startBalance = Number(selectedAccount.current_balance);
          const months: string[] = [];
          const cursor = new Date();
          cursor.setDate(1);
          const horizonEnd = new Date();
          horizonEnd.setDate(horizonEnd.getDate() + horizonDays);
          while (cursor <= horizonEnd) {
            months.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`);
            cursor.setMonth(cursor.getMonth() + 1);
          }

          let openingBalance = startBalance;
          return months.map((month) => {
            const monthRows = dailyBreakdown.filter(([date]) => date.startsWith(month));
            const income = monthRows.reduce((sum, [, d]) => sum + d.income, 0);
            const expense = monthRows.reduce((sum, [, d]) => sum + d.checks + d.transfers + d.recurring, 0);
            const opening = openingBalance;
            const closing = monthRows.length > 0 ? monthRows[monthRows.length - 1][1].runningBalance : opening;
            openingBalance = closing;
            return { month, opening, income, expense, closing };
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

      <form className="card p-4 flex flex-wrap items-end gap-4" method="get">
        <input type="hidden" name="mode" value={mode} />
        {mode === "bank" ? (
          <div>
            <label className="block text-sm font-medium mb-1">חשבון בנק</label>
            <select
              name="account"
              defaultValue={selectedAccountId}
              className="rounded-lg border border-border bg-transparent px-3 py-2 text-sm"
            >
              {(bankAccounts ?? []).map((b) => (
                <option key={b.id} value={b.id}>
                  {(b as { departments: { name: string } | null }).departments?.name} — {b.bank_name} (
                  {b.account_number})
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div>
            <label className="block text-sm font-medium mb-1">מחלקה</label>
            <select
              name="department"
              defaultValue={selectedDepartmentId}
              className="rounded-lg border border-border bg-transparent px-3 py-2 text-sm"
            >
              {(departments ?? []).map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label className="block text-sm font-medium mb-1">טווח ימים</label>
          <select
            name="horizon"
            defaultValue={String(horizonDays)}
            className="rounded-lg border border-border bg-transparent px-3 py-2 text-sm"
          >
            <option value="30">30 יום</option>
            <option value="60">60 יום</option>
            <option value="90">90 יום</option>
          </select>
        </div>
        <button
          type="submit"
          className="rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold"
        >
          עדכן תחזית
        </button>
      </form>

      {mode === "bank" && selectedAccount && isAdmin && (
        <BankBalancePanel bankAccountId={selectedAccount.id} currentBalance={Number(selectedAccount.current_balance)} />
      )}
      {mode === "bank" && selectedAccount && !isAdmin && (
        <div className="card p-4">
          <p className="text-sm text-muted mb-1">יתרת פתיחה נוכחית</p>
          <p className="text-2xl font-bold">{formatCurrency(Number(selectedAccount.current_balance))}</p>
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

      {mode === "bank" && monthlyCards.length > 0 && (
        <div>
          <h2 className="font-semibold mb-2">מצב חזוי לפי חודשים</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
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

      <div className="card p-4 overflow-x-auto">
        <h2 className="font-semibold mb-2">סיכום יומי — כמה כסף אמור לרדת/להיכנס בכל יום</h2>
        <table className="data-table">
          <thead>
            <tr>
              <th>תאריך</th>
              <th>צ׳קים</th>
              <th>העברות</th>
              <th>הוראות קבע</th>
              {mode === "bank" && <th>צפי הכנסה</th>}
              <th>סה״כ שינוי יומי</th>
              <th>{mode === "bank" ? "יתרה בסוף היום" : "יתרה מצטברת בסוף היום"}</th>
            </tr>
          </thead>
          <tbody>
            {dailyBreakdown.map(([date, d]) => (
              <tr key={date}>
                <td>{formatDate(date)}</td>
                <td className={d.checks < 0 ? "text-danger" : undefined}>{formatCurrency(d.checks)}</td>
                <td className={d.transfers < 0 ? "text-danger" : undefined}>{formatCurrency(d.transfers)}</td>
                <td className={d.recurring < 0 ? "text-danger" : undefined}>{formatCurrency(d.recurring)}</td>
                {mode === "bank" && <td className="text-success">{formatCurrency(d.income)}</td>}
                <td className={`font-semibold ${d.total < 0 ? "text-danger" : "text-success"}`}>
                  {formatCurrency(d.total)}
                </td>
                <td className="font-semibold">{formatCurrency(d.runningBalance)}</td>
              </tr>
            ))}
            {dailyBreakdown.length === 0 && (
              <tr>
                <td colSpan={mode === "bank" ? 7 : 6} className="text-center text-muted py-6">
                  אין תנועות צפויות בטווח שנבחר
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

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
