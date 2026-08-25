import { requireFinanceAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { DepartmentsTable, NewDepartmentForm } from "@/components/departments-client";

export default async function DepartmentsPage() {
  await requireFinanceAdmin();
  const supabase = await createClient();

  const [{ data: departments }, { data: bankAccounts }, { data: categories }] = await Promise.all([
    supabase.from("departments").select("*").order("name"),
    supabase.from("bank_accounts").select("id, department_id, bank_name, account_number").order("bank_name"),
    supabase.from("categories").select("id, department_id"),
  ]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">ניהול מחלקות</h1>
        <p className="text-sm text-muted">
          כל חשבון בנק, קטגוריה, הכנסה וצ׳ק במערכת משויכים למחלקה. הגדירו כאן את המחלקות של המוסד לפני
          שממשיכים להגדרת חשבונות וקטגוריות.
        </p>
      </div>

      <div className="card p-4">
        <div className="overflow-x-auto">
          <DepartmentsTable
            departments={departments ?? []}
            categories={categories ?? []}
            bankAccounts={bankAccounts ?? []}
          />
        </div>
        <NewDepartmentForm bankAccounts={bankAccounts ?? []} />
      </div>
    </div>
  );
}
