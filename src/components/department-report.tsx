import { createClient } from "@/lib/supabase/server";
import { formatCurrency } from "@/lib/format";
import { DepartmentTransactionsTable } from "@/components/department-report-table-client";

type CombinedRow = {
  id: string;
  date: string | null;
  description: string;
  amount: number;
};

// Deliberately minimal: a department manager just wants to know how much
// came in, how much went out, and therefore how much the department owes
// (or is owed by) the account it actually runs through — usually the
// central "פעילות מרכזית" account, or its own account if it has one. One
// mixed list of every transaction, newest first, no filters, no tabs.
export async function DepartmentReport({
  departmentId,
  departmentName,
}: {
  departmentId: string;
  departmentName: string;
}) {
  const supabase = await createClient();

  const [{ data: incomes }, { data: expenses }, { data: manualEntries }] = await Promise.all([
    supabase
      .from("incomes")
      .select("id, date, amount, donor_name, skip_department_ledger, categories(name)")
      .eq("owner_department_id", departmentId)
      .order("date", { ascending: false }),
    supabase
      .from("v_check_department_amounts")
      .select("check_id, due_date, amount, payee, skip_department_ledger")
      .eq("department_id", departmentId)
      .neq("status", "CANCELLED")
      .order("due_date", { ascending: false }),
    supabase
      .from("manual_department_entries")
      .select("id, entry_date, amount, direction, notes, bank_accounts(department_id, departments(name))")
      .eq("department_id", departmentId)
      .eq("status", "APPROVED")
      .order("entry_date", { ascending: false }),
  ]);

  const incomeRows: CombinedRow[] = (incomes ?? [])
    .filter((r) => !r.skip_department_ledger)
    .map((r) => ({
      id: r.id,
      date: r.date,
      description: r.donor_name || (r as unknown as { categories: { name: string } | null }).categories?.name || "הכנסה",
      amount: Number(r.amount),
    }));

  const expenseRows: CombinedRow[] = (expenses ?? [])
    .filter((r) => !r.skip_department_ledger)
    .map((r) => ({
      id: r.check_id as string,
      date: r.due_date,
      description: r.payee ?? "הוצאה",
      amount: -Number(r.amount),
    }));

  const manualRows: CombinedRow[] = (manualEntries ?? []).map((e) => {
    const bankAccount = (e as unknown as { bank_accounts: { department_id: string; departments: { name: string } | null } | null })
      .bank_accounts;
    const isCrossDepartment = bankAccount && bankAccount.department_id !== departmentId;
    const otherDeptName = isCrossDepartment ? bankAccount.departments?.name : null;
    const label = otherDeptName
      ? e.direction === "INCOME"
        ? `העברה מ-${otherDeptName}`
        : `העברה ל-${otherDeptName}`
      : e.direction === "INCOME"
        ? "רישום ידני — הכנסה"
        : "רישום ידני — הוצאה";
    return {
      id: e.id,
      date: e.entry_date,
      description: e.notes ? `${label} (${e.notes})` : label,
      amount: e.direction === "INCOME" ? Number(e.amount) : -Number(e.amount),
    };
  });

  const allRows = [...incomeRows, ...expenseRows, ...manualRows].sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));

  const totalIncome = allRows.filter((r) => r.amount > 0).reduce((sum, r) => sum + r.amount, 0);
  const totalExpense = allRows.filter((r) => r.amount < 0).reduce((sum, r) => sum + -r.amount, 0);
  const net = totalIncome - totalExpense;

  return (
    <div className="space-y-4">
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

      <div className="card p-4 overflow-x-auto">
        <h2 className="font-semibold mb-3">כל התנועות — {departmentName}</h2>
        <DepartmentTransactionsTable rows={allRows} />
      </div>
    </div>
  );
}
