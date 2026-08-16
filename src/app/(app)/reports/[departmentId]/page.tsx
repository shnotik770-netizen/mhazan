import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { formatCurrency, formatDate } from "@/lib/format";
import { PrintButton } from "@/components/print-button";

type RangeKey = "month" | "2months" | "3months" | "custom" | "forecast";

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
  searchParams: Promise<{ range?: string; start?: string; end?: string; horizon?: string }>;
}) {
  const { departmentId } = await params;
  const { range: rangeParam, start: startParam, end: endParam, horizon } = await searchParams;
  const range = (["month", "2months", "3months", "custom", "forecast"].includes(rangeParam ?? "")
    ? rangeParam
    : "month") as RangeKey;
  const horizonDays = Number(horizon ?? 30);

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

  const [{ data: incomes }, { data: expenses }, { data: manualEntries }, { data: forecast }] = await Promise.all([
    range === "forecast"
      ? Promise.resolve({ data: [] })
      : supabase
          .from("incomes")
          .select("*, categories(name)")
          .eq("owner_department_id", departmentId)
          .gte("date", start)
          .lte("date", end)
          .order("date"),
    range === "forecast"
      ? Promise.resolve({ data: [] })
      : supabase
          .from("v_check_department_amounts")
          .select("*")
          .eq("department_id", departmentId)
          .neq("status", "CANCELLED")
          .gte("due_date", start)
          .lte("due_date", end)
          .order("due_date"),
    range === "forecast"
      ? Promise.resolve({ data: [] })
      : supabase
          .from("manual_department_entries")
          .select("*")
          .eq("department_id", departmentId)
          .eq("status", "APPROVED")
          .gte("created_at", start)
          .lte("created_at", end + "T23:59:59")
          .order("created_at"),
    range === "forecast"
      ? supabase.rpc("get_department_cash_flow_forecast", {
          p_department_id: departmentId,
          p_horizon_days: horizonDays,
        })
      : Promise.resolve({ data: [] }),
  ]);

  const totalIncome =
    (incomes ?? []).reduce((sum, i) => sum + Number(i.amount), 0) +
    (manualEntries ?? []).filter((e) => e.direction === "INCOME").reduce((sum, e) => sum + Number(e.amount), 0);
  const totalExpense =
    (expenses ?? []).reduce((sum, e) => sum + Number(e.amount), 0) +
    (manualEntries ?? []).filter((e) => e.direction === "EXPENSE").reduce((sum, e) => sum + Number(e.amount), 0);

  const rangeLabel =
    range === "month"
      ? "החודש האחרון"
      : range === "2months"
        ? "החודשיים האחרונים"
        : range === "3months"
          ? "3 החודשים האחרונים"
          : range === "forecast"
            ? `תחזית ל-${horizonDays} יום קדימה`
            : `${formatDate(start)} — ${formatDate(end)}`;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-bold">דוח מחלקתי — {department.name}</h1>
          <p className="text-sm text-muted">{rangeLabel}</p>
        </div>
        <div className="flex items-center gap-2 no-print">
          <Link href="/" className="text-sm text-primary">
            ← חזרה לדשבורד
          </Link>
          <PrintButton />
        </div>
      </div>

      <form className="card p-4 flex flex-wrap items-end gap-3 no-print" method="get">
        <div>
          <label className="block text-sm font-medium mb-1">טווח</label>
          <select name="range" defaultValue={range} className="rounded-lg border border-border bg-transparent px-3 py-2 text-sm">
            <option value="month">החודש האחרון</option>
            <option value="2months">החודשיים האחרונים</option>
            <option value="3months">3 החודשים האחרונים</option>
            <option value="custom">טווח תאריכים מותאם</option>
            <option value="forecast">מצב עתידי (תחזית)</option>
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
        <div>
          <label className="block text-sm font-medium mb-1">אופק תחזית (ימים)</label>
          <select name="horizon" defaultValue={String(horizonDays)} className="rounded-lg border border-border bg-transparent px-3 py-2 text-sm">
            <option value="30">30</option>
            <option value="60">60</option>
            <option value="90">90</option>
          </select>
        </div>
        <button type="submit" className="rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold">
          עדכן דוח
        </button>
      </form>

      {range !== "forecast" && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="card p-4">
            <p className="text-sm text-muted mb-1">סה&quot;כ הכנסות</p>
            <p className="text-2xl font-bold text-success">{formatCurrency(totalIncome)}</p>
          </div>
          <div className="card p-4">
            <p className="text-sm text-muted mb-1">סה&quot;כ הוצאות</p>
            <p className="text-2xl font-bold text-danger">{formatCurrency(totalExpense)}</p>
          </div>
          <div className="card p-4">
            <p className="text-sm text-muted mb-1">נטו</p>
            <p className={`text-2xl font-bold ${totalIncome - totalExpense >= 0 ? "text-success" : "text-danger"}`}>
              {formatCurrency(totalIncome - totalExpense)}
            </p>
          </div>
        </div>
      )}

      {range === "forecast" ? (
        <div className="card p-4 overflow-x-auto">
          <h2 className="font-semibold mb-3">תחזית תזרים מחלקתית</h2>
          <table className="data-table">
            <thead>
              <tr>
                <th>תאריך</th>
                <th>מקור</th>
                <th>שינוי צפוי</th>
                <th>שינוי נטו מצטבר</th>
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
      ) : (
        <>
          <div className="card p-4 overflow-x-auto">
            <h2 className="font-semibold mb-3">הכנסות</h2>
            <table className="data-table">
              <thead>
                <tr>
                  <th>תאריך</th>
                  <th>קטגוריה</th>
                  <th>תורם</th>
                  <th>סכום</th>
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
                  };
                  return (
                    <tr key={r.id}>
                      <td>{formatDate(r.date)}</td>
                      <td>{r.categories?.name}</td>
                      <td>{r.donor_name ?? "—"}</td>
                      <td>{formatCurrency(Number(r.amount))}</td>
                    </tr>
                  );
                })}
                {(incomes ?? []).length === 0 && (
                  <tr>
                    <td colSpan={4} className="text-center text-muted py-6">
                      אין הכנסות בטווח שנבחר
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="card p-4 overflow-x-auto">
            <h2 className="font-semibold mb-3">הוצאות (צ׳קים / העברות)</h2>
            <table className="data-table">
              <thead>
                <tr>
                  <th>תאריך</th>
                  <th>מוטב</th>
                  <th>אמצעי</th>
                  <th>סטטוס</th>
                  <th>סכום</th>
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
                  </tr>
                ))}
                {(expenses ?? []).length === 0 && (
                  <tr>
                    <td colSpan={5} className="text-center text-muted py-6">
                      אין הוצאות בטווח שנבחר
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {(manualEntries ?? []).length > 0 && (
            <div className="card p-4 overflow-x-auto">
              <h2 className="font-semibold mb-3">רישומים ידניים מאושרים</h2>
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
                      <td>{formatDate(e.created_at)}</td>
                      <td>{e.direction === "INCOME" ? "הכנסה" : "הוצאה"}</td>
                      <td>{formatCurrency(Number(e.amount))}</td>
                      <td>{e.notes ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
