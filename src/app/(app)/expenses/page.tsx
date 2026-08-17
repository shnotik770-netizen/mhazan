import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { ExpensesTable } from "@/components/expenses-client";

export default async function ExpensesPage() {
  const user = await requireUser();
  const isAdmin = user.profile.role === "FINANCE_ADMIN";
  const supabase = await createClient();

  const [{ data: departments }, { data: grants }] = await Promise.all([
    supabase.from("departments").select("*").order("name"),
    supabase.from("user_department_access").select("department_id").eq("user_id", user.id),
  ]);
  const grantedIds = new Set((grants ?? []).map((g) => g.department_id));
  const myDepartmentIds = isAdmin ? null : new Set((departments ?? []).filter((d) => grantedIds.has(d.id)).map((d) => d.id));

  // "הוצאות" = every expense already approved (out of the "דרישות תשלום"
  // stage — i.e. has a due date) regardless of whether it's since been
  // paid, plus approved manual expense entries.
  let checksQuery = supabase
    .from("checks")
    .select(
      "id, due_date, amount, payee, notes, status, payment_method, department_id, departments(name), categories(name)",
    )
    .not("due_date", "is", null)
    .neq("status", "CANCELLED")
    .order("due_date", { ascending: false })
    .limit(300);
  let manualQuery = supabase
    .from("manual_department_entries")
    .select("id, entry_date, amount, notes, department_id, departments(name)")
    .eq("status", "APPROVED")
    .eq("direction", "EXPENSE")
    .order("entry_date", { ascending: false })
    .limit(300);

  if (myDepartmentIds) {
    checksQuery = checksQuery.in("department_id", [...myDepartmentIds]);
    manualQuery = manualQuery.in("department_id", [...myDepartmentIds]);
  }

  const [{ data: checks }, { data: manualEntries }] = await Promise.all([checksQuery, manualQuery]);

  type Row = {
    id: string;
    date: string | null;
    source: string;
    description: string;
    amount: number;
    departmentName: string | null;
    categoryName: string | null;
    status: string | null;
  };

  const rows: Row[] = [
    ...(checks ?? []).map((c) => {
      const row = c as unknown as {
        id: string;
        due_date: string | null;
        amount: number;
        payee: string;
        notes: string | null;
        status: string;
        payment_method: string;
        departments: { name: string } | null;
        categories: { name: string } | null;
      };
      return {
        id: row.id,
        date: row.due_date,
        source: row.payment_method === "TRANSFER" ? "העברה" : "צ׳ק",
        description: row.payee + (row.notes ? ` — ${row.notes}` : ""),
        amount: Number(row.amount),
        departmentName: row.departments?.name ?? null,
        categoryName: row.categories?.name ?? null,
        status: row.status,
      };
    }),
    ...(manualEntries ?? []).map((m) => {
      const row = m as unknown as {
        id: string;
        entry_date: string | null;
        amount: number;
        notes: string | null;
        departments: { name: string } | null;
      };
      return {
        id: row.id,
        date: row.entry_date,
        source: "הוצאה ידנית",
        description: row.notes ?? "—",
        amount: Number(row.amount),
        departmentName: row.departments?.name ?? null,
        categoryName: null,
        status: "APPROVED",
      };
    }),
  ].sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">הוצאות</h1>
      <p className="text-sm text-muted">כל ההוצאות מכל הסוגים שכבר אושרו — צ׳קים, העברות והוצאות ידניות.</p>
      <div className="card p-4">
        <ExpensesTable rows={rows} />
      </div>
    </div>
  );
}
