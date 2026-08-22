import { createClient } from "@/lib/supabase/server";
import { formatCurrency } from "@/lib/format";
import { DepartmentTransactionsTable } from "@/components/department-report-table-client";

type CombinedRow = {
  id: string;
  date: string | null;
  type: string;
  description: string;
  amount: number;
  spreadTotal?: number | null;
  status?: string | null;
  isOld: boolean;
  kind: "check" | "income" | "manual";
};

// Deliberately minimal: a department manager just wants to know how much
// came in, how much went out, and therefore how much the department owes
// (or is owed by) the account it actually runs through — usually the
// central "פעילות מרכזית" account, or its own account if it has one. One
// mixed list of every transaction, newest first, no filters, no tabs.
export async function DepartmentReport({
  departmentId,
  departmentName,
  isAdmin,
}: {
  departmentId: string;
  departmentName: string;
  isAdmin: boolean;
}) {
  const supabase = await createClient();

  const [{ data: incomes }, { data: expenses }, { data: manualEntries }] = await Promise.all([
    supabase
      .from("incomes")
      .select("id, date, amount, donor_name, payment_method, skip_department_ledger, categories(name)")
      .eq("owner_department_id", departmentId)
      .order("date", { ascending: false }),
    supabase
      .from("v_check_department_amounts")
      .select("check_id, due_date, amount, payee, payment_method, skip_department_ledger, spread_id, status")
      .eq("department_id", departmentId)
      .neq("status", "CANCELLED")
      .order("due_date", { ascending: false }),
    supabase
      .from("manual_department_entries")
      .select(
        "id, entry_date, amount, direction, notes, recurring_schedule_id, bank_accounts(department_id, departments(name))",
      )
      .eq("department_id", departmentId)
      .eq("status", "APPROVED")
      .order("entry_date", { ascending: false }),
  ]);

  const incomeRows: CombinedRow[] = (incomes ?? []).map((r) => {
    const category = (r as unknown as { categories: { name: string } | null }).categories?.name;
    return {
      id: r.id,
      date: r.date,
      type: "הכנסה" + (category ? ` — ${category}` : "") + (r.payment_method ? ` (${r.payment_method})` : ""),
      description: r.donor_name || "—",
      amount: Number(r.amount),
      isOld: r.skip_department_ledger,
      kind: "income",
    };
  });

  // Several checks/transfers under one spread_id (a split payment plan,
  // or several requests merged into one payee's schedule) should read as
  // one recurring commitment, not unrelated rows — so each row in a spread
  // carries the group's total, not just its own installment. Only rows
  // still counted toward the balance participate in that group total.
  const allExpenses = expenses ?? [];
  const spreadTotals = new Map<string, { total: number; count: number }>();
  for (const r of allExpenses) {
    if (!r.spread_id || r.skip_department_ledger) continue;
    const g = spreadTotals.get(r.spread_id) ?? { total: 0, count: 0 };
    g.total += Number(r.amount);
    g.count += 1;
    spreadTotals.set(r.spread_id, g);
  }

  const expenseRows: CombinedRow[] = allExpenses.map((r) => {
    const group = r.spread_id ? spreadTotals.get(r.spread_id) : undefined;
    return {
      id: r.check_id as string,
      date: r.due_date,
      type: r.payment_method === "TRANSFER" ? "הוצאה — העברה" : "הוצאה — צ׳ק",
      description: r.payee ?? "הוצאה",
      amount: -Number(r.amount),
      spreadTotal: group && group.count > 1 ? group.total : null,
      status: r.status,
      isOld: Boolean(r.skip_department_ledger),
      kind: "check",
    };
  });

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
    const directionLabel = e.direction === "INCOME" ? "הכנסה" : "הוצאה";
    const kindLabel = e.recurring_schedule_id ? "קבוע (אושר)" : "ידני";
    return {
      id: e.id,
      date: e.entry_date,
      type: `${directionLabel} — ${kindLabel}`,
      description: e.notes ? `${label} (${e.notes})` : label,
      amount: e.direction === "INCOME" ? Number(e.amount) : -Number(e.amount),
      isOld: false,
      kind: "manual",
    };
  });

  const allRows = [...incomeRows, ...expenseRows, ...manualRows].sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));

  // "Old" rows (skip_department_ledger) still appear in the list, tagged,
  // but never count toward the department's balance — that's the whole
  // point of the flag.
  const countedRows = allRows.filter((r) => !r.isOld);
  const totalIncome = countedRows.filter((r) => r.amount > 0).reduce((sum, r) => sum + r.amount, 0);
  const totalExpense = countedRows.filter((r) => r.amount < 0).reduce((sum, r) => sum + -r.amount, 0);
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
        <DepartmentTransactionsTable rows={allRows} isAdmin={isAdmin} />
      </div>
    </div>
  );
}
