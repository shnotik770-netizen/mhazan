import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { formatCurrency } from "@/lib/format";
import { MultiSelectFilter } from "@/components/multi-select-filter";
import { TransactionsTable, type UnifiedRow } from "@/components/transactions-table-client";

function toArray(value: string | string[] | undefined): string[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

const SOURCE_LABELS: Record<UnifiedRow["sourceKey"], string> = {
  INCOME: "הכנסה",
  CHECK: "צ׳ק",
  TRANSFER: "העברה",
  MANUAL: "רישום ידני",
};

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{
    type?: string;
    department?: string | string[];
    source?: string | string[];
    status?: string | string[];
    start?: string;
    end?: string;
    q?: string;
  }>;
}) {
  const {
    type: typeParam,
    department: departmentParam,
    source: sourceParam,
    status: statusParam,
    start,
    end,
    q,
  } = await searchParams;
  const type = typeParam === "INCOME" || typeParam === "EXPENSE" ? typeParam : "ALL";
  const search = (q ?? "").trim().toLowerCase();
  const departmentFilter = new Set(toArray(departmentParam));
  const sourceFilter = new Set(toArray(sourceParam));
  const statusFilter = new Set(toArray(statusParam));

  const user = await requireUser();
  const isAdmin = user.profile.role === "FINANCE_ADMIN";
  const supabase = await createClient();

  const [{ data: departments }, { data: grants }, { data: categories }] = await Promise.all([
    supabase.from("departments").select("*").order("name"),
    supabase.from("user_department_access").select("department_id").eq("user_id", user.id),
    supabase.from("categories").select("id, name").order("name"),
  ]);
  const grantedIds = new Set((grants ?? []).map((g) => g.department_id));
  const myDepartments = isAdmin ? (departments ?? []) : (departments ?? []).filter((d) => grantedIds.has(d.id));

  let incomesQuery = supabase
    .from("incomes")
    .select(
      "id, date, amount, donor_name, order_ref, notes, category_id, categories(name), owner_department_id, departments:owner_department_id(name), payment_method, type_text, receipt_number, converted_from_usd",
    )
    .order("date", { ascending: false })
    .limit(300);
  let checksQuery = supabase
    .from("checks")
    .select(
      "id, due_date, amount, payee, notes, status, payment_method, department_id, category_id, spread_id, has_invoice, departments(name), categories(name)",
    )
    .neq("status", "CANCELLED")
    .order("due_date", { ascending: false, nullsFirst: false })
    .limit(300);
  let manualQuery = supabase
    .from("manual_department_entries")
    .select("id, entry_date, amount, direction, notes, status, department_id, departments(name)")
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
  if (departmentFilter.size > 0) {
    incomesQuery = incomesQuery.in("owner_department_id", [...departmentFilter]);
    checksQuery = checksQuery.in("department_id", [...departmentFilter]);
    manualQuery = manualQuery.in("department_id", [...departmentFilter]);
  }
  // Status only means something for checks/transfers (UNPAID/CLEARED); if
  // the admin explicitly wants CANCELLED ones too, stop excluding them.
  if (statusFilter.size > 0 && statusFilter.has("CANCELLED")) {
    checksQuery = supabase
      .from("checks")
      .select(
        "id, due_date, amount, payee, notes, status, payment_method, department_id, category_id, spread_id, has_invoice, departments(name), categories(name)",
      )
      .order("due_date", { ascending: false, nullsFirst: false })
      .limit(300);
    if (start) checksQuery = checksQuery.gte("due_date", start);
    if (end) checksQuery = checksQuery.lte("due_date", end);
    if (departmentFilter.size > 0) checksQuery = checksQuery.in("department_id", [...departmentFilter]);
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
    category_id: string | null;
    categories: { name: string } | null;
    owner_department_id: string | null;
    departments: { name: string } | null;
    payment_method: string | null;
    type_text: string | null;
    receipt_number: string | null;
    converted_from_usd: boolean | null;
  }[]) {
    unified.push({
      id: `income-${row.id}`,
      date: row.date,
      direction: "INCOME",
      description: [row.categories?.name, row.donor_name, row.order_ref ? `(הוראה ${row.order_ref})` : null]
        .filter(Boolean)
        .join(" — "),
      amount: Number(row.amount),
      departmentId: row.owner_department_id,
      departmentName: row.departments?.name ?? null,
      categoryId: row.category_id,
      categoryName: row.categories?.name ?? null,
      sourceKey: "INCOME",
      source: SOURCE_LABELS.INCOME,
      status: null,
      hasInvoice: null,
      convertedFromUsd: row.converted_from_usd ?? false,
      incomeEdit: {
        id: row.id,
        date: row.date,
        amount: Number(row.amount),
        donorName: row.donor_name,
        categoryId: row.category_id,
        paymentMethod: row.payment_method,
        typeText: row.type_text,
        receiptNumber: row.receipt_number,
        orderRef: row.order_ref,
        notes: row.notes,
      },
    });
  }

  for (const row of (checks ?? []) as unknown as {
    id: string;
    due_date: string | null;
    amount: number;
    payee: string;
    notes: string | null;
    status: string;
    payment_method: string;
    department_id: string | null;
    category_id: string | null;
    spread_id: string | null;
    has_invoice: boolean;
    departments: { name: string } | null;
    categories: { name: string } | null;
  }[]) {
    if (type === "INCOME") continue;
    const sourceKey = row.payment_method === "TRANSFER" ? "TRANSFER" : "CHECK";
    unified.push({
      id: `check-${row.id}`,
      date: row.due_date,
      direction: "EXPENSE",
      description: `${row.payee}${row.spread_id ? " (פריסה)" : ""}${row.notes ? ` — ${row.notes}` : ""}`,
      amount: Number(row.amount),
      departmentId: row.department_id,
      departmentName: row.departments?.name ?? (row.department_id ? null : "ממתין לסיווג"),
      categoryId: row.category_id,
      categoryName: row.categories?.name ?? null,
      sourceKey,
      source: SOURCE_LABELS[sourceKey],
      status: row.status,
      hasInvoice: row.has_invoice,
      incomeEdit: null,
    });
  }

  for (const row of (manualEntries ?? []) as unknown as {
    id: string;
    entry_date: string | null;
    amount: number;
    direction: "INCOME" | "EXPENSE";
    notes: string | null;
    status: string;
    department_id: string | null;
    departments: { name: string } | null;
  }[]) {
    if (type !== "ALL" && type !== row.direction) continue;
    unified.push({
      id: `manual-${row.id}`,
      date: row.entry_date,
      direction: row.direction,
      description: row.notes ?? "רישום ידני",
      amount: Number(row.amount),
      departmentId: row.department_id,
      departmentName: row.departments?.name ?? null,
      categoryId: null,
      categoryName: null,
      sourceKey: "MANUAL",
      source: SOURCE_LABELS.MANUAL,
      incomeEdit: null,
      status: "APPROVED",
      hasInvoice: null,
    });
  }

  const filtered = unified
    .filter((r) => !search || r.description.toLowerCase().includes(search) || (r.departmentName ?? "").toLowerCase().includes(search))
    .filter((r) => sourceFilter.size === 0 || sourceFilter.has(r.sourceKey))
    .filter((r) => statusFilter.size === 0 || (r.status && statusFilter.has(r.status)))
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

      <details className="card p-4" open>
        <summary className="cursor-pointer font-semibold">סינון</summary>
        <form className="flex flex-wrap items-start gap-4 mt-3" method="get">
          <div>
            <label className="block text-sm font-medium mb-1">סוג</label>
            <select name="type" defaultValue={type} className="rounded-lg border border-border bg-transparent px-3 py-2 text-sm">
              <option value="ALL">הכל</option>
              <option value="INCOME">הכנסות</option>
              <option value="EXPENSE">הוצאות</option>
            </select>
          </div>
          <MultiSelectFilter
            name="source"
            label="מקור"
            options={Object.entries(SOURCE_LABELS).map(([id, label]) => ({ id, label }))}
            defaultSelected={[...sourceFilter]}
          />
          {myDepartments.length > 0 && (
            <MultiSelectFilter
              name="department"
              label="מחלקות"
              options={myDepartments.map((d) => ({ id: d.id, label: d.name }))}
              defaultSelected={[...departmentFilter]}
            />
          )}
          <MultiSelectFilter
            name="status"
            label="סטטוס (צ׳קים/העברות)"
            options={[
              { id: "UNPAID", label: "לא נפרע" },
              { id: "CLEARED", label: "נפרע" },
              { id: "CANCELLED", label: "בוטל" },
            ]}
            defaultSelected={[...statusFilter]}
          />
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
          <div className="flex items-center gap-2 self-end">
            <button type="submit" className="rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold">
              סנן
            </button>
            <a href="/transactions" className="text-sm text-muted underline">
              נקה סינון
            </a>
          </div>
        </form>
      </details>

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
        <TransactionsTable
          rows={filtered}
          isAdmin={isAdmin}
          categories={(categories ?? []).map((c) => ({ id: c.id, name: c.name }))}
        />
        <p className="text-xs text-muted mt-2">
          מוצגות עד 300 תנועות אחרונות מכל סוג (הכנסות / צ׳קים-העברות / רישומים ידניים) — לצמצום התוצאות יש להשתמש
          בסינון למעלה.
        </p>
      </div>
    </div>
  );
}
