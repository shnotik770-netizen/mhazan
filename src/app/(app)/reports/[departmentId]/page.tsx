import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { formatCurrency, formatDate } from "@/lib/format";
import { PrintButton } from "@/components/print-button";
import { LedgerFlagToggle } from "@/components/ledger-flag-toggle-client";

type RangeKey = "month" | "2months" | "3months" | "custom";

function computeRange(range: RangeKey, start?: string, end?: string) {
  const today = new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  if (range === "custom" && start && end) return { start, end };
  const months = range === "2months" ? 2 : range === "3months" ? 3 : 1;
  const from = new Date(today);
  from.setMonth(from.getMonth() - months);
  return { start: iso(from), end: iso(today) };
}

export default async function DepartmentReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ departmentId: string }>;
  searchParams: Promise<{ range?: string; start?: string; end?: string }>;
}) {
  const { departmentId } = await params;
  const { range: rangeParam, start: startParam, end: endParam } = await searchParams;
  const range = (["month", "2months", "3months", "custom"].includes(rangeParam ?? "") ? rangeParam : "month") as RangeKey;

  const user = await requireUser();
  const isAdmin = user.profile.role === "FINANCE_ADMIN";
  const supabase = await createClient();

  if (!isAdmin) {
    const { data: grant } = await supabase
      .from("user_department_access")
      .select("department_id")
      .eq("user_id", user.id)
      .eq("department_id", departmentId)
      .maybeSingle();
    if (!grant) redirect("/");
  }

  const { data: department } = await supabase.from("departments").select("*").eq("id", departmentId).single();
  if (!department) redirect("/");

  const { start, end } = computeRange(range, startParam, endParam);

  const [
    { data: incomes },
    { data: expenses },
    { data: manualEntries },
    // Real-time totals are NEVER filtered by the range selector below —
    // the top summary always reflects the true current state plus what's
    // already known about the future, regardless of which historical
    // window the detail tables happen to be browsing.
    { data: allTimeIncomes },
    { data: allTimeExpenses },
    { data: allTimeManualEntries },
    { data: forecast },
  ] = await Promise.all([
    supabase
      .from("incomes")
      .select("*, categories(name)")
      .eq("owner_department_id", departmentId)
      .gte("date", start)
      .lte("date", end)
      .order("date"),
    supabase
      .from("v_check_department_amounts")
      .select("*")
      .eq("department_id", departmentId)
      .neq("status", "CANCELLED")
      .gte("due_date", start)
      .lte("due_date", end)
      .order("due_date"),
    supabase
      .from("manual_department_entries")
      .select("*")
      .eq("department_id", departmentId)
      .eq("status", "APPROVED")
      .gte("entry_date", start)
      .lte("entry_date", end)
      .order("entry_date"),
    supabase.from("incomes").select("amount, skip_department_ledger").eq("owner_department_id", departmentId),
    supabase
      .from("v_check_department_amounts")
      .select("amount, skip_department_ledger")
      .eq("department_id", departmentId)
      .neq("status", "CANCELLED"),
    supabase
      .from("manual_department_entries")
      .select("amount, direction")
      .eq("department_id", departmentId)
      .eq("status", "APPROVED"),
    supabase.rpc("get_department_cash_flow_forecast", { p_department_id: departmentId, p_horizon_days: 30 }),
  ]);

  // Rows tagged "old" (skip_department_ledger) stay visible in the lists
  // below for the historical record, but are excluded from every total —
  // they're already accounted for under the old system and shouldn't count
  // toward the department's balance again.
  const currentIncome =
    (allTimeIncomes ?? []).filter((i) => !i.skip_department_ledger).reduce((sum, i) => sum + Number(i.amount), 0) +
    (allTimeManualEntries ?? []).filter((e) => e.direction === "INCOME").reduce((sum, e) => sum + Number(e.amount), 0);
  const currentExpense =
    (allTimeExpenses ?? []).filter((e) => !e.skip_department_ledger).reduce((sum, e) => sum + Number(e.amount), 0) +
    (allTimeManualEntries ?? []).filter((e) => e.direction === "EXPENSE").reduce((sum, e) => sum + Number(e.amount), 0);
  const forecastNet = (forecast ?? []).reduce((sum, f) => sum + Number(f.expected_change), 0);

  const totalIncome =
    (incomes ?? []).filter((i) => !i.skip_department_ledger).reduce((sum, i) => sum + Number(i.amount), 0) +
    (manualEntries ?? []).filter((e) => e.direction === "INCOME").reduce((sum, e) => sum + Number(e.amount), 0);
  const totalExpense =
    (expenses ?? []).filter((e) => !e.skip_department_ledger).reduce((sum, e) => sum + Number(e.amount), 0) +
    (manualEntries ?? []).filter((e) => e.direction === "EXPENSE").reduce((sum, e) => sum + Number(e.amount), 0);

  const rangeLabel =
    range === "month"
      ? "החודש האחרון"
      : range === "2months"
        ? "החודשיים האחרונים"
        : range === "3months"
          ? "3 החודשים האחרונים"
          : `${formatDate(start)} — ${formatDate(end)}`;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-bold">דוח מחלקתי — {department.name}</h1>
          <p className="text-sm text-muted">מצב עדכני לרגע זה + צפי — לא מושפע מסינון הטווח למטה</p>
        </div>
        <div className="flex items-center gap-2 no-print">
          <Link href={`/forecast?mode=department&department=${departmentId}`} className="text-sm text-primary">
            תחזית מחלקתית מלאה ←
          </Link>
          <Link href="/" className="text-sm text-primary">
            ← חזרה לדשבורד
          </Link>
          <PrintButton />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="card p-4">
          <p className="text-sm text-muted mb-1">הכנסות עד היום (מצטבר)</p>
          <p className="text-2xl font-bold text-success">{formatCurrency(currentIncome)}</p>
        </div>
        <div className="card p-4">
          <p className="text-sm text-muted mb-1">הוצאות עד היום (מצטבר)</p>
          <p className="text-2xl font-bold text-danger">{formatCurrency(currentExpense)}</p>
        </div>
        <div className="card p-4">
          <p className="text-sm text-muted mb-1">מצב נוכחי נטו</p>
          <p className={`text-2xl font-bold ${currentIncome - currentExpense >= 0 ? "text-success" : "text-danger"}`}>
            {formatCurrency(currentIncome - currentExpense)}
          </p>
        </div>
        <div className="card p-4">
          <p className="text-sm text-muted mb-1">צפי שינוי ל-30 יום קדימה</p>
          <p className={`text-2xl font-bold ${forecastNet >= 0 ? "text-success" : "text-danger"}`}>
            {formatCurrency(forecastNet)}
          </p>
        </div>
      </div>

      <form className="card p-4 flex flex-wrap items-end gap-3 no-print" method="get">
        <div>
          <label className="block text-sm font-medium mb-1">טווח לפירוט הטבלאות למטה</label>
          <select name="range" defaultValue={range} className="rounded-lg border border-border bg-transparent px-3 py-2 text-sm">
            <option value="month">החודש האחרון</option>
            <option value="2months">החודשיים האחרונים</option>
            <option value="3months">3 החודשים האחרונים</option>
            <option value="custom">טווח תאריכים מותאם</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">מתאריך</label>
          <input type="date" name="start" defaultValue={start} className="rounded-lg border border-border bg-transparent px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">עד תאריך</label>
          <input type="date" name="end" defaultValue={end} className="rounded-lg border border-border bg-transparent px-3 py-2 text-sm" />
        </div>
        <button type="submit" className="rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold">
          עדכן פירוט
        </button>
      </form>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card p-4">
          <p className="text-sm text-muted mb-1">הכנסות בטווח ({rangeLabel})</p>
          <p className="text-xl font-bold text-success">{formatCurrency(totalIncome)}</p>
        </div>
        <div className="card p-4">
          <p className="text-sm text-muted mb-1">הוצאות בטווח ({rangeLabel})</p>
          <p className="text-xl font-bold text-danger">{formatCurrency(totalExpense)}</p>
        </div>
        <div className="card p-4">
          <p className="text-sm text-muted mb-1">נטו בטווח</p>
          <p className={`text-xl font-bold ${totalIncome - totalExpense >= 0 ? "text-success" : "text-danger"}`}>
            {formatCurrency(totalIncome - totalExpense)}
          </p>
        </div>
      </div>

      <div className="card p-4 overflow-x-auto">
        <h2 className="font-semibold mb-3">הכנסות ({rangeLabel})</h2>
        <table className="data-table">
          <thead>
            <tr>
              <th>תאריך</th>
              <th>קטגוריה</th>
              <th>תורם</th>
              <th>סכום</th>
              <th>תג</th>
              {isAdmin && <th></th>}
            </tr>
          </thead>
          <tbody>
            {(incomes ?? []).map((row) => {
              const r = row as unknown as {
                id: string;
                date: string;
                amount: number;
                donor_name: string | null;
                categories: { name: string } | null;
                skip_department_ledger: boolean;
              };
              return (
                <tr key={r.id}>
                  <td>{formatDate(r.date)}</td>
                  <td>{r.categories?.name}</td>
                  <td>{r.donor_name ?? "—"}</td>
                  <td>{formatCurrency(Number(r.amount))}</td>
                  <td>
                    {r.skip_department_ledger && <span className="badge bg-background text-muted">הכנסה ישנה</span>}
                  </td>
                  {isAdmin && (
                    <td>
                      <LedgerFlagToggle id={r.id} kind="income" skipDepartmentLedger={r.skip_department_ledger} />
                    </td>
                  )}
                </tr>
              );
            })}
            {(incomes ?? []).length === 0 && (
              <tr>
                <td colSpan={isAdmin ? 6 : 5} className="text-center text-muted py-6">
                  אין הכנסות בטווח שנבחר
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="card p-4 overflow-x-auto">
        <h2 className="font-semibold mb-3">הוצאות — צ׳קים / העברות ({rangeLabel})</h2>
        <table className="data-table">
          <thead>
            <tr>
              <th>תאריך</th>
              <th>מוטב</th>
              <th>אמצעי</th>
              <th>סטטוס</th>
              <th>סכום</th>
              <th>תג</th>
              {isAdmin && <th></th>}
            </tr>
          </thead>
          <tbody>
            {(expenses ?? []).map((row, i) => (
              <tr key={i}>
                <td>{row.due_date ? formatDate(row.due_date) : "—"}</td>
                <td>{row.payee}</td>
                <td>{row.payment_method === "TRANSFER" ? "העברה" : "צ׳ק"}</td>
                <td>{row.status === "CLEARED" ? "נפרע" : "לא נפרע"}</td>
                <td>{formatCurrency(Number(row.amount))}</td>
                <td>
                  {row.skip_department_ledger && <span className="badge bg-background text-muted">הוצאה ישנה</span>}
                </td>
                {isAdmin && (
                  <td>
                    <LedgerFlagToggle
                      id={row.check_id as string}
                      kind="check"
                      skipDepartmentLedger={Boolean(row.skip_department_ledger)}
                    />
                  </td>
                )}
              </tr>
            ))}
            {(expenses ?? []).length === 0 && (
              <tr>
                <td colSpan={isAdmin ? 7 : 6} className="text-center text-muted py-6">
                  אין הוצאות בטווח שנבחר
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {(manualEntries ?? []).length > 0 && (
        <div className="card p-4 overflow-x-auto">
          <h2 className="font-semibold mb-3">רישומים ידניים מאושרים ({rangeLabel})</h2>
          <table className="data-table">
            <thead>
              <tr>
                <th>תאריך</th>
                <th>סוג</th>
                <th>סכום</th>
                <th>הערות</th>
              </tr>
            </thead>
            <tbody>
              {manualEntries!.map((e) => (
                <tr key={e.id}>
                  <td>{e.entry_date ? formatDate(e.entry_date) : "—"}</td>
                  <td>{e.direction === "INCOME" ? "הכנסה" : "הוצאה"}</td>
                  <td>{formatCurrency(Number(e.amount))}</td>
                  <td>{e.notes ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
