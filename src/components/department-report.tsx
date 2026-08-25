import { formatCurrency } from "@/lib/format";
import { getDepartmentReportData } from "@/lib/department-report-data";
import { DepartmentTransactionsSection } from "@/components/department-transactions-section-client";
import { DepartmentMonthlyCashFlow } from "@/components/department-monthly-cashflow-client";

// Three sections, top to bottom: today's actual state (the "מצב נוכחי"
// cards, past-only), known future commitments (checks/transfers already in
// the system with a date that hasn't come yet), then full transaction
// history — each of the latter two filterable by month or an exact date,
// with its own income/expense/net summary for whatever's currently shown.
export async function DepartmentReport({
  departmentId,
  departmentName,
  isAdmin,
}: {
  departmentId: string;
  departmentName: string;
  isAdmin: boolean;
}) {
  const { totalIncome, totalExpense, net, pastRows, futureRows, pastMonths, futureMonths, monthlyFlow } =
    await getDepartmentReportData(departmentId);

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
          <h2 className="font-semibold">מצב נוכחי — {departmentName}</h2>
          <a
            href={`/reports/${departmentId}/export`}
            className="rounded-lg border border-border px-3 py-1.5 text-sm font-semibold no-print"
          >
            ייצוא לאקסל ⇩
          </a>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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

      <DepartmentTransactionsSection
        title="תנועות עתידיות ידועות"
        rows={futureRows}
        isAdmin={isAdmin}
        departmentId={departmentId}
        monthOptions={futureMonths}
        defaultSortDir="asc"
      />
      <DepartmentMonthlyCashFlow rows={monthlyFlow} />

      <DepartmentTransactionsSection
        title="תנועות עד היום"
        rows={pastRows}
        isAdmin={isAdmin}
        departmentId={departmentId}
        monthOptions={pastMonths}
        defaultSortDir="desc"
      />
    </div>
  );
}
