import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { getAccessibleBankAccountIds } from "@/lib/bank-access";
import { formatCurrency, todayIso } from "@/lib/format";
import { monthLabel } from "@/lib/department-report-data";
import { computeMonthlyForecast, daysUntilMonthsEnd, monthsFromToday } from "@/lib/forecast-monthly";
import { PrintButton } from "@/components/print-button";
import { AutoPrintOnLoad } from "@/components/auto-print-on-load";

// A dedicated, print-only view for "הנפקת PDF" on the main forecast page —
// deliberately a separate, much simpler page rather than reusing the
// interactive /forecast page itself: that page's simulation panel and
// per-day drill-downs are built for on-screen exploration of one account,
// not a formal exported document, and "כל החשבונות" here needs every
// account laid out one after another, which the single-account page has no
// way to do at all.
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

  const monthsList = monthsFromToday(months);
  const horizonDays = daysUntilMonthsEnd(months);

  const accountReports = await Promise.all(
    accounts.map(async (b) => {
      const { data: forecast } = await supabase.rpc("get_cash_flow_forecast", {
        p_bank_account_id: b.id,
        p_horizon_days: horizonDays,
      });
      const rows = computeMonthlyForecast(forecast ?? [], Number(b.current_balance), monthsList);
      return {
        id: b.id,
        departmentName: (b as unknown as { departments: { name: string } | null }).departments?.name ?? null,
        bankName: b.bank_name,
        accountNumber: b.account_number,
        rows,
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
          צפי יתרה — {months} {months === 1 ? "חודש" : "חודשים"} קדימה
        </h1>
        <p className="text-sm text-muted text-center">הופק בתאריך {todayIso()}</p>
      </div>

      {accountReports.length === 0 && <p className="text-sm text-muted text-center py-6">אין חשבונות בנק להצגה.</p>}

      {accountReports.map((a) => (
        <div key={a.id} className="card p-4">
          <h2 className="font-semibold mb-3">
            {a.departmentName ? `${a.departmentName} — ` : ""}
            {a.bankName} ({a.accountNumber})
          </h2>
          <table className="data-table">
            <thead>
              <tr>
                <th>חודש</th>
                <th>יתרת פתיחה</th>
                <th>הכנסות צפויות</th>
                <th>הוצאות צפויות</th>
                <th>יתרת סגירה</th>
              </tr>
            </thead>
            <tbody>
              {a.rows.map((r) => (
                <tr key={r.month}>
                  <td>{monthLabel(r.month)}</td>
                  <td>{formatCurrency(r.opening)}</td>
                  <td className="text-success">{formatCurrency(r.income)}</td>
                  <td className="text-danger">{formatCurrency(r.expense)}</td>
                  <td className={`font-semibold ${r.closing < 0 ? "text-danger" : ""}`}>{formatCurrency(r.closing)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
