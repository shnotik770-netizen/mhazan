import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { ExpensesTable } from "@/components/expenses-client";

export default async function ExpensesPage() {
  const user = await requireUser();
  const isAdmin = user.profile.role === "FINANCE_ADMIN";
  const supabase = await createClient();

  const [{ data: departments }, { data: grants }, { data: categories }] = await Promise.all([
    supabase.from("departments").select("*").order("name"),
    supabase.from("user_department_access").select("department_id").eq("user_id", user.id),
    supabase.from("categories").select("id, name").order("name"),
  ]);
  const grantedIds = new Set((grants ?? []).map((g) => g.department_id));
  const myDepartmentIds = isAdmin ? null : new Set((departments ?? []).filter((d) => grantedIds.has(d.id)).map((d) => d.id));

  // "הוצאות" = every expense already approved (out of the "דרישות תשלום"
  // stage — i.e. has a due date) regardless of whether it's since been
  // paid, plus approved manual expense entries.
  let checksQuery = supabase
    .from("checks")
    .select(
      "id, due_date, amount, payee, notes, status, payment_method, check_number, department_id, category_id, bank_account_id, spread_id, departments(name), categories(name), bank_accounts(bank_name, account_number)",
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
    isCheck: boolean;
    date: string | null;
    source: string;
    description: string;
    payeeName: string;
    notes: string | null;
    amount: number;
    departmentId: string | null;
    departmentName: string | null;
    categoryId: string | null;
    categoryName: string | null;
    bankAccountName: string | null;
    status: string | null;
    checkNumber: string | null;
    paymentMethod: string | null;
    spreadId: string | null;
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
        check_number: string | null;
        department_id: string | null;
        category_id: string | null;
        spread_id: string | null;
        departments: { name: string } | null;
        categories: { name: string } | null;
        bank_accounts: { bank_name: string; account_number: string } | null;
      };
      return {
        id: row.id,
        isCheck: true,
        date: row.due_date,
        source: row.payment_method === "TRANSFER" ? "העברה" : "צ׳ק",
        description: row.payee + (row.notes ? ` — ${row.notes}` : ""),
        payeeName: row.payee,
        notes: row.notes,
        amount: Number(row.amount),
        departmentId: row.department_id,
        departmentName: row.departments?.name ?? null,
        categoryId: row.category_id,
        categoryName: row.categories?.name ?? null,
        bankAccountName: row.bank_accounts ? `${row.bank_accounts.bank_name} (${row.bank_accounts.account_number})` : null,
        status: row.status,
        checkNumber: row.check_number,
        paymentMethod: row.payment_method,
        spreadId: row.spread_id,
      };
    }),
    ...(manualEntries ?? []).map((m) => {
      const row = m as unknown as {
        id: string;
        entry_date: string | null;
        amount: number;
        notes: string | null;
        department_id: string | null;
        departments: { name: string } | null;
      };
      return {
        id: row.id,
        isCheck: false,
        date: row.entry_date,
        source: "הוצאה ידנית",
        description: row.notes ?? "—",
        payeeName: "",
        notes: row.notes,
        amount: Number(row.amount),
        departmentId: row.department_id,
        departmentName: row.departments?.name ?? null,
        categoryId: null,
        categoryName: null,
        bankAccountName: null,
        status: "APPROVED",
        checkNumber: null,
        paymentMethod: null,
        spreadId: null,
      };
    }),
  ].sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">הוצאות</h1>
      <p className="text-sm text-muted">כל ההוצאות מכל הסוגים שכבר אושרו — צ׳קים, העברות והוצאות ידניות.</p>
      <div className="card p-4">
        <ExpensesTable
          rows={rows}
          departments={(departments ?? []).map((d) => ({ id: d.id, name: d.name }))}
          categories={(categories ?? []).map((c) => ({ id: c.id, name: c.name }))}
          isAdmin={isAdmin}
        />
      </div>
    </div>
  );
}
