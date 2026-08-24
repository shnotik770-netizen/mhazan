import { createClient } from "@/lib/supabase/server";
import { formatCurrency, todayIso } from "@/lib/format";
import { DepartmentTransactionsSection } from "@/components/department-transactions-section-client";
import { DepartmentMonthlyCashFlow } from "@/components/department-monthly-cashflow-client";

function addMonths(monthKey: string, n: number): string {
  const [y, m] = monthKey.split("-").map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(monthKey: string): string {
  return new Intl.DateTimeFormat("he-IL", { month: "long", year: "numeric" }).format(new Date(`${monthKey}-01T00:00:00`));
}

type CombinedRow = {
  id: string;
  date: string | null;
  type: string;
  description: string;
  amount: number;
  spreadTotal?: number | null;
  status?: string | null;
  isOld: boolean;
  kind: "check" | "income" | "manual" | "commission";
};

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
  const supabase = await createClient();

  const [{ data: incomes }, { data: expenses }, { data: manualEntries }, { data: commissionEntries }] = await Promise.all([
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
    supabase
      .from("credit_commission_entries")
      .select("id, month, qualifying_total, amount")
      .eq("department_id", departmentId)
      .order("month", { ascending: false }),
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

  // One auto-computed row per month this department had qualifying
  // card/Bit/"העברה בקליק" income — 2% of that month's total, kept in sync
  // by a DB trigger on `incomes` rather than editable here.
  const commissionRows: CombinedRow[] = (commissionEntries ?? []).map((c) => ({
    id: c.id,
    date: c.month,
    type: "הוצאה — עמלת אשראי",
    description: `עמלת אשראי (2% על ${formatCurrency(Number(c.qualifying_total))} מהכנסות אשראי/ביט/העברה בקליק ב${monthLabel(c.month.slice(0, 7))})`,
    amount: -Number(c.amount),
    isOld: false,
    kind: "commission",
  }));

  const allRows = [...incomeRows, ...expenseRows, ...manualRows, ...commissionRows].sort((a, b) =>
    (b.date ?? "").localeCompare(a.date ?? ""),
  );

  // Split into what's already happened (or has no date) vs. what's already
  // in the system with a future date (an approved check/transfer not yet
  // due, mostly) — the "current" cards below only ever reflect the former,
  // so they show the account's actual state today rather than a number
  // that silently includes commitments that haven't come due yet.
  const today = todayIso();
  const pastRows = allRows.filter((r) => !r.date || r.date <= today);
  const futureRows = [...allRows.filter((r) => r.date && r.date > today)].sort((a, b) =>
    (a.date ?? "").localeCompare(b.date ?? ""),
  );

  // "Old" rows (skip_department_ledger) still appear in the list, tagged,
  // but never count toward the department's balance — that's the whole
  // point of the flag.
  const pastCounted = pastRows.filter((r) => !r.isOld);
  const totalIncome = pastCounted.filter((r) => r.amount > 0).reduce((sum, r) => sum + r.amount, 0);
  const totalExpense = pastCounted.filter((r) => r.amount < 0).reduce((sum, r) => sum + -r.amount, 0);
  const net = totalIncome - totalExpense;

  const futureMonths = [...new Set(futureRows.filter((r) => r.date).map((r) => r.date!.slice(0, 7)))].sort();
  const pastMonths = [...new Set(pastRows.filter((r) => r.date).map((r) => r.date!.slice(0, 7)))].sort();

  // Monthly cash-flow view: actual history per month, continuing seamlessly
  // into the same forecast the bank/department forecast page shows, so a
  // manager can see "what did we owe at the end of month X" and "what's the
  // running balance expected each month after that" in one continuous
  // table. Only *past* rows feed the history side — future-dated rows
  // already in the system (the list above) are also what the forecast RPC
  // below projects for those same dates, so folding them in here too would
  // double-count them.
  const todayMonth = today.slice(0, 7);
  const historicalByMonth = new Map<string, { income: number; expense: number }>();
  for (const r of pastCounted) {
    if (!r.date) continue;
    const m = r.date.slice(0, 7);
    const g = historicalByMonth.get(m) ?? { income: 0, expense: 0 };
    if (r.amount > 0) g.income += r.amount;
    else g.expense += -r.amount;
    historicalByMonth.set(m, g);
  }

  const { data: forecastRows } = await supabase.rpc("get_department_cash_flow_forecast", {
    p_department_id: departmentId,
    p_horizon_days: 400,
  });
  const forecastByMonth = new Map<string, { income: number; expense: number }>();
  for (const row of forecastRows ?? []) {
    const m = row.forecast_date!.slice(0, 7);
    const g = forecastByMonth.get(m) ?? { income: 0, expense: 0 };
    const change = Number(row.expected_change);
    if (change > 0) g.income += change;
    else g.expense += -change;
    forecastByMonth.set(m, g);
  }

  const touchedMonths = [...new Set([...historicalByMonth.keys(), ...forecastByMonth.keys()])].sort();
  let running = 0;
  const monthlyFlow =
    touchedMonths.length === 0
      ? []
      : (() => {
          const rows: { month: string; income: number; expense: number; opening: number; closing: number; isFuture: boolean }[] = [];
          let cursor = touchedMonths[0];
          const last = touchedMonths[touchedMonths.length - 1];
          while (cursor <= last) {
            const hist = historicalByMonth.get(cursor);
            const fut = forecastByMonth.get(cursor);
            const income = (hist?.income ?? 0) + (fut?.income ?? 0);
            const expense = (hist?.expense ?? 0) + (fut?.expense ?? 0);
            const opening = running;
            const closing = opening + income - expense;
            running = closing;
            rows.push({ month: cursor, income, expense, opening, closing, isFuture: cursor > todayMonth });
            cursor = addMonths(cursor, 1);
          }
          return rows;
        })();

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-semibold mb-3">מצב נוכחי — {departmentName}</h2>
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
        monthOptions={futureMonths}
        defaultSortDir="asc"
      />
      <DepartmentMonthlyCashFlow rows={monthlyFlow} />

      <DepartmentTransactionsSection
        title="תנועות עד היום"
        rows={pastRows}
        isAdmin={isAdmin}
        monthOptions={pastMonths}
        defaultSortDir="desc"
      />
    </div>
  );
}
