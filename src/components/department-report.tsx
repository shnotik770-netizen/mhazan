import { formatCurrency, addMonthsToDate, todayIso } from "@/lib/format";
import { getDepartmentReportData } from "@/lib/department-report-data";
import { DepartmentTransactionsSection } from "@/components/department-transactions-section-client";
import { DepartmentMonthlyCashFlow } from "@/components/department-monthly-cashflow-client";
import { MissedStandingOrdersNote } from "@/components/missed-standing-orders-client";

// Top to bottom: today's actual state (the "מצב נוכחי" cards, past-only),
// the full monthly cash-flow history/forecast, full past transaction
// history, then known future commitments last — those are still pending and
// least "final", so they read as an appendix rather than competing with the
// department's actual history for top billing. The two transaction
// sections are each filterable by month or an exact date, with their own
// income/expense/net summary for whatever's currently shown.
export async function DepartmentReport({
  departmentId,
  departmentName,
  isAdmin,
}: {
  departmentId: string;
  departmentName: string;
  isAdmin: boolean;
}) {
  const {
    totalIncome,
    totalExpense,
    net,
    pastRows,
    futureRows,
    pastMonths,
    futureMonths,
    monthlyFlow,
    missedStandingOrders,
  } = await getDepartmentReportData(departmentId);

  return (
    <div className="space-y-4">
      <MissedStandingOrdersNote notes={missedStandingOrders} isAdmin={isAdmin} />

      <div>
        <div className="flex items-center justify-between flex-wrap gap-2 mb-1 print-header-row">
          <h2 className="text-lg font-bold print-title">מצב נוכחי — {departmentName}</h2>
          <a
            href={`/reports/${departmentId}/export`}
            className="rounded-lg border border-border px-3 py-1.5 text-sm font-semibold no-print"
          >
            ייצוא לאקסל ⇩
          </a>
        </div>
        <p className="text-xs text-muted mb-3 print-subtitle">
          לפי תנועות שכבר נרשמו בפועל עד היום בלבד — לא כולל צפי הכנסות עתידי (ראו את &quot;תזרים חודשי מלא&quot; ו-
          &quot;תנועות עתידיות ידועות&quot; למטה לתמונה כוללת).
        </p>
        <div className="summary-cards-grid grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="card p-4">
            <p className="text-sm text-muted mb-1">סה״כ הכנסות</p>
            <p className="text-2xl font-bold text-success">{formatCurrency(totalIncome)}</p>
          </div>
          <div className="card p-4">
            <p className="text-sm text-muted mb-1">סה״כ הוצאות</p>
            <p className="text-2xl font-bold text-danger">{formatCurrency(totalExpense)}</p>
          </div>
          <div className="card p-4">
            <p className="text-sm text-muted mb-1">{net >= 0 ? "זכאית מהחשבון" : "חייבת לחשבון"}</p>
            <p className={`text-2xl font-bold ${net >= 0 ? "text-success" : "text-danger"}`}>{formatCurrency(Math.abs(net))}</p>
          </div>
        </div>
      </div>

      <DepartmentMonthlyCashFlow rows={monthlyFlow} />

      <DepartmentTransactionsSection
        title="תנועות עד היום"
        rows={pastRows}
        isAdmin={isAdmin}
        departmentId={departmentId}
        monthOptions={pastMonths}
        defaultSortDir="desc"
        defaultFromDate={addMonthsToDate(todayIso(), -3)}
      />

      <DepartmentTransactionsSection
        title="תנועות עתידיות ידועות"
        rows={futureRows}
        isAdmin={isAdmin}
        departmentId={departmentId}
        monthOptions={futureMonths}
        defaultSortDir="asc"
        defaultToDate={addMonthsToDate(todayIso(), 4)}
      />
    </div>
  );
}
