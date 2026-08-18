import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { formatCurrency, formatDate } from "@/lib/format";
import { SettleBalancesButton } from "@/components/settle-balances-button";
import { DepartmentReport, computeReportRange, type ReportRangeKey } from "@/components/department-report";
import { NewManualEntryForm } from "@/components/manual-entries-client";

export default async function LedgerPage({
  searchParams,
}: {
  searchParams: Promise<{ department?: string; range?: string; start?: string; end?: string }>;
}) {
  const { department: departmentParam, range: rangeParam, start: startParam, end: endParam } = await searchParams;
  const range = (["month", "2months", "3months", "custom"].includes(rangeParam ?? "") ? rangeParam : "month") as ReportRangeKey;

  const user = await requireUser();
  const isAdmin = user.profile.role === "FINANCE_ADMIN";
  const supabase = await createClient();

  const [{ data: balances }, { data: departments }, { data: openEntries }, { data: bankAccounts }, { data: grants }] =
    await Promise.all([
      supabase.from("v_inter_department_balances").select("*"),
      supabase.from("departments").select("*").order("name"),
      supabase
        .from("inter_department_ledger")
        .select("*, from_dept:from_department_id(name), to_dept:to_department_id(name)")
        .eq("status", "OPEN")
        .order("created_at", { ascending: false })
        .limit(100),
      supabase.from("bank_accounts").select("*").order("bank_name"),
      supabase.from("user_department_access").select("department_id").eq("user_id", user.id),
    ]);

  const grantedIds = new Set((grants ?? []).map((g) => g.department_id));
  const myDepartments = isAdmin ? (departments ?? []) : (departments ?? []).filter((d) => grantedIds.has(d.id));

  const deptName = (id: string | null) => departments?.find((d) => d.id === id)?.name ?? "—";

  // Only a department this user is actually granted (or any, if admin) can
  // be selected here — same boundary /reports/[departmentId] enforces via
  // redirect, just checked directly since this renders inline instead.
  const selectedDepartment =
    departmentParam && myDepartments.some((d) => d.id === departmentParam)
      ? myDepartments.find((d) => d.id === departmentParam)!
      : null;
  const { start, end } = computeReportRange(range, startParam, endParam);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">דוחות מחלקות</h1>
        <p className="text-sm text-muted">בחרו מחלקה כדי לראות את הדוח שלה, ולהוסיף לה הכנסה/הוצאה ידנית ישירות.</p>
      </div>

      <form className="card p-4 flex flex-wrap items-end gap-3 no-print" method="get">
        <div>
          <label className="block text-sm font-medium mb-1">מחלקה</label>
          <select name="department" defaultValue={departmentParam ?? ""} className="rounded-lg border border-border bg-transparent px-3 py-2 text-sm">
            <option value="">בחר מחלקה...</option>
            {myDepartments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold">
          הצג דוח
        </button>
      </form>

      {selectedDepartment && (
        <div className="space-y-4">
          <h2 className="text-lg font-bold">דוח — {selectedDepartment.name}</h2>
          <DepartmentReport
            departmentId={selectedDepartment.id}
            departmentName={selectedDepartment.name}
            isAdmin={isAdmin}
            range={range}
            start={start}
            end={end}
          />
          <NewManualEntryForm departments={[selectedDepartment]} bankAccounts={bankAccounts ?? []} allDepartments={departments ?? []} />
        </div>
      )}

      <div>
        <h2 className="text-lg font-bold mb-3">התחשבנות פנימית בין מחלקות</h2>
        <p className="text-sm text-muted mb-3">
          מציג כמה כל מחלקה חייבת למחלקה אחרת, בשל הכנסות שנכנסו לחשבון בנק של מחלקה אחרת מבעלת הקטגוריה.
        </p>

        <div className="card p-4 overflow-x-auto">
          <h3 className="font-semibold mb-3">מטריצת יתרות נטו</h3>
          <table className="data-table">
            <thead>
              <tr>
                <th>חייב</th>
                <th>זכאי</th>
                <th>סכום נטו</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {(balances ?? []).map((row, i) => (
                <tr key={i}>
                  <td>{deptName(row.debtor_department_id)}</td>
                  <td>{deptName(row.creditor_department_id)}</td>
                  <td className="font-semibold">{formatCurrency(Number(row.net_amount))}</td>
                  <td>
                    <SettleBalancesButton
                      deptA={row.debtor_department_id!}
                      deptB={row.creditor_department_id!}
                      debtorName={deptName(row.debtor_department_id)}
                      creditorName={deptName(row.creditor_department_id)}
                    />
                  </td>
                </tr>
              ))}
              {(balances ?? []).length === 0 && (
                <tr>
                  <td colSpan={4} className="text-center text-muted py-6">
                    אין יתרות פתוחות בין מחלקות
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="card p-4 overflow-x-auto mt-4">
          <h3 className="font-semibold mb-3">תנועות פתוחות (לפני נטו)</h3>
          <table className="data-table">
            <thead>
              <tr>
                <th>תאריך</th>
                <th>ממחלקה (חייב)</th>
                <th>למחלקה (זכאי)</th>
                <th>סכום</th>
              </tr>
            </thead>
            <tbody>
              {(openEntries ?? []).map((e) => {
                const row = e as unknown as {
                  id: string;
                  created_at: string;
                  amount: number;
                  from_dept: { name: string } | null;
                  to_dept: { name: string } | null;
                };
                return (
                  <tr key={row.id}>
                    <td>{formatDate(row.created_at)}</td>
                    <td>{row.from_dept?.name}</td>
                    <td>{row.to_dept?.name}</td>
                    <td>{formatCurrency(Number(row.amount))}</td>
                  </tr>
                );
              })}
              {(openEntries ?? []).length === 0 && (
                <tr>
                  <td colSpan={4} className="text-center text-muted py-6">
                    אין תנועות פתוחות
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
