import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { getAccessibleBankAccountIds } from "@/lib/bank-access";
import { formatCurrency, formatDate, todayIso } from "@/lib/format";
import { monthLabel } from "@/lib/department-report-data";
import { computeDailyBreakdown, computeMonthlyCards, daysUntilMonthsEnd, monthsInHorizon } from "@/lib/forecast-breakdown";
import { PrintButton } from "@/components/print-button";
import { AutoPrintOnLoad } from "@/components/auto-print-on-load";

// A dedicated, print-only view for "הנפקת PDF" on the main forecast page.
// Deliberately still its own route rather than reusing the interactive
// /forecast page directly — that page's account picker, horizon picker and
// what-if simulation are on-screen controls with no place on a printed
// document, and "כל החשבונות" here needs every account laid out one after
// another, which the single-account page has no way to do — but the actual
// numbers come from the exact same computeDailyBreakdown/computeMonthlyCards
// functions /forecast/page.tsx itself calls, so what prints is the same data
// the live page shows, just without its buttons/controls.
export default async function ForecastPrintPage({
  searchParams,
}: {
  searchParams: Promise<{ months?: string; account?: string }>;
}) {
  const { months: monthsRaw, account: accountParam } = await searchParams;
  const months = Math.min(12, Math.max(1, Number(monthsRaw) || 3));

  const user = await requireUser();
  const isAdmin = user.profile.role === "FINANCE_ADMIN";
  const supabase = await createClient();

  const accessibleAccountIds = await getAccessibleBankAccountIds(supabase, user.id, isAdmin);

  const { data: allBankAccounts } = await supabase
    .from("bank_accounts")
    .select("*, departments!bank_accounts_department_id_fkey(name)")
    .order("bank_name");
  const accessibleAccounts = accessibleAccountIds
    ? (allBankAccounts ?? []).filter((b) => accessibleAccountIds.has(b.id))
    : (allBankAccounts ?? []);
  const accounts =
    accountParam && accountParam !== "all" ? accessibleAccounts.filter((b) => b.id === accountParam) : accessibleAccounts;

  const horizonDays = daysUntilMonthsEnd(months);
  const monthsList = monthsInHorizon(horizonDays);

  const accountReports = await Promise.all(
    accounts.map(async (b) => {
      const { data: forecast } = await supabase.rpc("get_cash_flow_forecast", {
        p_bank_account_id: b.id,
        p_horizon_days: horizonDays,
      });
      const dailyBreakdown = computeDailyBreakdown(forecast ?? []);
      const { monthlyCards, dailyRowsByMonth } = computeMonthlyCards(dailyBreakdown, monthsList, Number(b.current_balance));
      const undatedItems = (forecast ?? []).filter((r) => r.category === "UNDATED");
      return {
        id: b.id,
        departmentName: (b as unknown as { departments: { name: string } | null }).departments?.name ?? null,
        bankName: b.bank_name,
        accountNumber: b.account_number,
        monthlyCards,
        dailyRowsByMonth,
        undatedItems,
      };
    }),
  );

  return (
    <div className="space-y-6">
      <AutoPrintOnLoad />
      <div className="flex items-center justify-between flex-wrap gap-2 no-print">
        <Link href="/forecast" className="text-sm text-primary">
          ← חזרה לתחזית
        </Link>
        <PrintButton />
      </div>

      <div>
        <h1 className="text-xl font-bold print-title text-center">
          תחזית תזרים מזומנים — {months} {months === 1 ? "חודש" : "חודשים"} קדימה
        </h1>
        <p className="text-sm text-muted text-center">הופק בתאריך {todayIso()}</p>
      </div>

      {accountReports.length === 0 && <p className="text-sm text-muted text-center py-6">אין חשבונות בנק להצגה.</p>}

      {accountReports.map((a) => (
        <div key={a.id} className="space-y-3">
          <h2 className="font-bold text-lg border-b border-border pb-1">
            {a.departmentName ? `${a.departmentName} — ` : ""}
            {a.bankName} ({a.accountNumber})
          </h2>

          {a.monthlyCards.map((c) => {
            const rows = a.dailyRowsByMonth.get(c.month) ?? [];
            return (
              <div key={c.month} className="space-y-2">
                <div className="card p-4 space-y-1">
                  <p className="font-semibold">{monthLabel(c.month)}</p>
                  <p className="text-xs text-muted">
                    יתרת פתיחה: <span className="font-medium">{formatCurrency(c.opening)}</span>
                  </p>
                  <p className="text-xs text-success">הכנסות: {formatCurrency(c.income)}</p>
                  <p className="text-xs text-danger">הוצאות: {formatCurrency(Math.abs(c.expense))}</p>
                  {c.oldExpense !== 0 && (
                    <p className="text-xs text-warning">
                      הוצאות מתאריכים קודמים שלא נפרעו: {formatCurrency(Math.abs(c.oldExpense))}
                    </p>
                  )}
                  <p className="text-sm font-semibold pt-1 border-t border-border">
                    יתרת סגירה: <span className={c.closing < 0 ? "text-danger" : "text-success"}>{formatCurrency(c.closing)}</span>
                  </p>
                </div>

                <table className="data-table">
                  <thead>
                    <tr>
                      <th>תאריך</th>
                      <th>צ׳קים</th>
                      <th>העברות</th>
                      <th>חיובים קבועים</th>
                      <th>צפי הכנסה</th>
                      <th>פיגורים (ישנים)</th>
                      <th>סה״כ שינוי יומי</th>
                      <th>יתרה בסוף היום</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(([date, d]) => (
                      <tr key={date}>
                        <td>{formatDate(date)}</td>
                        <td className={d.checks < 0 ? "text-danger" : undefined}>{formatCurrency(d.checks)}</td>
                        <td className={d.transfers < 0 ? "text-danger" : undefined}>{formatCurrency(d.transfers)}</td>
                        <td className={d.recurring < 0 ? "text-danger" : undefined}>{formatCurrency(d.recurring)}</td>
                        <td className="text-success">{formatCurrency(d.income)}</td>
                        <td className={d.overdue < 0 ? "text-warning" : undefined}>
                          {d.overdue !== 0 ? formatCurrency(d.overdue) : "—"}
                        </td>
                        <td className={`font-semibold ${d.total < 0 ? "text-danger" : "text-success"}`}>
                          {formatCurrency(d.total)}
                        </td>
                        <td className="font-semibold">{formatCurrency(d.runningBalance)}</td>
                      </tr>
                    ))}
                    {rows.length === 0 && (
                      <tr>
                        <td colSpan={8} className="text-center text-muted py-3">
                          אין תנועות צפויות בחודש זה
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            );
          })}

          {a.undatedItems.length > 0 && (
            <div className="card p-4">
              <h3 className="font-semibold mb-1 text-warning">צ׳קים/העברות מאושרים ללא תאריך יעד</h3>
              <ul className="text-sm space-y-1">
                {a.undatedItems.map((row, i) => (
                  <li key={i} className="flex items-center justify-between gap-2 border-t border-border/60 pt-1 first:border-t-0 first:pt-0">
                    <span>{row.source}</span>
                    <span className="font-medium text-danger">{formatCurrency(Number(row.expected_change))}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
