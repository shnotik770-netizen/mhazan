import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { formatCurrency, formatDate } from "@/lib/format";

type UnifiedRow = {
  id: string;
  date: string | null;
  direction: "INCOME" | "EXPENSE";
  description: string;
  amount: number;
  departmentName: string | null;
  source: string;
  status: string | null;
};

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; department?: string; start?: string; end?: string; q?: string }>;
}) {
  const { type: typeParam, department: departmentParam, start, end, q } = await searchParams;
  const type = typeParam === "INCOME" || typeParam === "EXPENSE" ? typeParam : "ALL";
  const search = (q ?? "").trim().toLowerCase();

  const user = await requireUser();
  const isAdmin = user.profile.role === "FINANCE_ADMIN";
  const supabase = await createClient();

  const [{ data: departments }, { data: grants }] = await Promise.all([
    supabase.from("departments").select("*").order("name"),
    supabase.from("user_department_access").select("department_id").eq("user_id", user.id),
  ]);
  const grantedIds = new Set((grants ?? []).map((g) => g.department_id));
  const myDepartments = isAdmin ? (departments ?? []) : (departments ?? []).filter((d) => grantedIds.has(d.id));

  let incomesQuery = supabase
    .from("incomes")
    .select("id, date, amount, donor_name, order_ref, notes, categories(name), departments:owner_department_id(name)")
    .order("date", { ascending: false })
    .limit(300);
  let checksQuery = supabase
    .from("checks")
    .select("id, due_date, amount, payee, notes, status, department_id, spread_id, departments(name)")
    .neq("status", "CANCELLED")
    .order("due_date", { ascending: false, nullsFirst: false })
    .limit(300);
  let manualQuery = supabase
    .from("manual_department_entries")
    .select("id, entry_date, amount, direction, notes, status, departments(name)")
    .eq("status", "APPROVED")
    .order("entry_date", { ascending: false })
    .limit(300);

  if (start) {
    incomesQuery = incomesQuery.gte("date", start);
    checksQuery = checksQuery.gte("due_date", start);
    manualQuery = manualQuery.gte("entry_date", start);
  }
  if (end) {
    incomesQuery = incomesQuery.lte("date", end);
    checksQuery = checksQuery.lte("due_date", end);
    manualQuery = manualQuery.lte("entry_date", end);
  }
  if (departmentParam) {
    incomesQuery = incomesQuery.eq("owner_department_id", departmentParam);
    checksQuery = checksQuery.eq("department_id", departmentParam);
    manualQuery = manualQuery.eq("department_id", departmentParam);
  }

  const [{ data: incomes }, { data: checks }, { data: manualEntries }] = await Promise.all([
    type === "EXPENSE" ? Promise.resolve({ data: [] }) : incomesQuery,
    type === "INCOME" ? Promise.resolve({ data: [] }) : checksQuery,
    Promise.resolve(manualQuery),
  ]);

  const unified: UnifiedRow[] = [];

  for (const row of (incomes ?? []) as unknown as {
    id: string;
    date: string;
    amount: number;
    donor_name: string | null;
    order_ref: string | null;
    notes: string | null;
    categories: { name: string } | null;
    departments: { name: string } | null;
  }[]) {
    unified.push({
      id: `income-${row.id}`,
      date: row.date,
      direction: "INCOME",
      description: [row.categories?.name, row.donor_name, row.order_ref ? `(הוראה ${row.order_ref})` : null]
        .filter(Boolean)
        .join(" — "),
      amount: Number(row.amount),
      departmentName: row.departments?.name ?? null,
      source: "הכנסה",
      status: null,
    });
  }

  for (const row of (checks ?? []) as unknown as {
    id: string;
    due_date: string | null;
    amount: number;
    payee: string;
    notes: string | null;
    status: string;
    department_id: string | null;
    spread_id: string | null;
    departments: { name: string } | null;
  }[]) {
    if (type === "INCOME") continue;
    unified.push({
      id: `check-${row.id}`,
      date: row.due_date,
      direction: "EXPENSE",
      description: `${row.payee}${row.spread_id ? " (פריסה)" : ""}`,
      amount: Number(row.amount),
      departmentName: row.departments?.name ?? (row.department_id ? null : "ממתין לסיווג"),
      source: "צ׳ק / העברה",
      status: row.status,
    });
  }

  for (const row of (manualEntries ?? []) as unknown as {
    id: string;
    entry_date: string | null;
    amount: number;
    direction: "INCOME" | "EXPENSE";
    notes: string | null;
    status: string;
    departments: { name: string } | null;
  }[]) {
    if (type !== "ALL" && type !== row.direction) continue;
    unified.push({
      id: `manual-${row.id}`,
      date: row.entry_date,
      direction: row.direction,
      description: row.notes ?? "רישום ידני",
      amount: Number(row.amount),
      departmentName: row.departments?.name ?? null,
      source: "רישום ידני",
      status: null,
    });
  }

  const filtered = unified
    .filter((r) => !search || r.description.toLowerCase().includes(search) || (r.departmentName ?? "").toLowerCase().includes(search))
    .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));

  const totalIncome = filtered.filter((r) => r.direction === "INCOME").reduce((sum, r) => sum + r.amount, 0);
  const totalExpense = filtered.filter((r) => r.direction === "EXPENSE").reduce((sum, r) => sum + r.amount, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">כל התנועות</h1>
        <p className="text-sm text-muted">
          תצוגה מאוחדת של הכנסות, צ׳קים/העברות ורישומים ידניים — ללא סינון או עם סינון לפי הצורך
        </p>
      </div>

      <form className="card p-4 flex flex-wrap items-end gap-3" method="get">
        <div>
          <label className="block text-sm font-medium mb-1">סוג</label>
          <select name="type" defaultValue={type} className="rounded-lg border border-border bg-transparent px-3 py-2 text-sm">
            <option value="ALL">הכל</option>
            <option value="INCOME">הכנסות</option>
            <option value="EXPENSE">הוצאות</option>
          </select>
        </div>
        {myDepartments.length > 0 && (
          <div>
            <label className="block text-sm font-medium mb-1">מחלקה</label>
            <select
              name="department"
              defaultValue={departmentParam ?? ""}
              className="rounded-lg border border-border bg-transparent px-3 py-2 text-sm"
            >
              <option value="">כל המחלקות</option>
              {myDepartments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label className="block text-sm font-medium mb-1">מתאריך</label>
          <input type="date" name="start" defaultValue={start} className="rounded-lg border border-border bg-transparent px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">עד תאריך</label>
          <input type="date" name="end" defaultValue={end} className="rounded-lg border border-border bg-transparent px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">חיפוש חופשי</label>
          <input
            name="q"
            defaultValue={q}
            placeholder="שם, תיאור, מחלקה..."
            className="rounded-lg border border-border bg-transparent px-3 py-2 text-sm"
          />
        </div>
        <button type="submit" className="rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold">
          סנן
        </button>
        <a href="/transactions" className="text-sm text-muted underline">
          נקה סינון
        </a>
      </form>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card p-4">
          <p className="text-sm text-muted mb-1">סה״כ הכנסות בתצוגה</p>
          <p className="text-xl font-bold text-success">{formatCurrency(totalIncome)}</p>
        </div>
        <div className="card p-4">
          <p className="text-sm text-muted mb-1">סה״כ הוצאות בתצוגה</p>
          <p className="text-xl font-bold text-danger">{formatCurrency(totalExpense)}</p>
        </div>
        <div className="card p-4">
          <p className="text-sm text-muted mb-1">נטו</p>
          <p className={`text-xl font-bold ${totalIncome - totalExpense >= 0 ? "text-success" : "text-danger"}`}>
            {formatCurrency(totalIncome - totalExpense)}
          </p>
        </div>
      </div>

      <div className="card p-4 overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>תאריך</th>
              <th>סוג</th>
              <th>מקור</th>
              <th>תיאור</th>
              <th>מחלקה</th>
              <th>סטטוס</th>
              <th>סכום</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id}>
                <td>{r.date ? formatDate(r.date) : <span className="text-muted">ללא תאריך</span>}</td>
                <td>
                  <span className={r.direction === "INCOME" ? "text-success" : "text-danger"}>
                    {r.direction === "INCOME" ? "הכנסה" : "הוצאה"}
                  </span>
                </td>
                <td>{r.source}</td>
                <td>{r.description}</td>
                <td>{r.departmentName ?? "—"}</td>
                <td>{r.status ?? "—"}</td>
                <td className={r.direction === "INCOME" ? "text-success" : "text-danger"}>
                  {formatCurrency(r.amount)}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center text-muted py-6">
                  אין תנועות התואמות את הסינון
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <p className="text-xs text-muted mt-2">
          מוצגות עד 300 תנועות אחרונות מכל סוג (הכנסות / צ׳קים-העברות / רישומים ידניים) — לצמצום התוצאות יש להשתמש
          בסינון למעלה.
        </p>
      </div>
    </div>
  );
}
