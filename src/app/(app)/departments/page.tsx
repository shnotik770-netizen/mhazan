import { requireFinanceAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { DepartmentRow, NewDepartmentForm } from "@/components/departments-client";

export default async function DepartmentsPage() {
  await requireFinanceAdmin();
  const supabase = await createClient();

  const [{ data: departments }, { data: bankAccounts }, { data: categories }] = await Promise.all([
    supabase.from("departments").select("*").order("name"),
    supabase.from("bank_accounts").select("id, department_id"),
    supabase.from("categories").select("id, department_id"),
  ]);

  const usageFor = (departmentId: string) => ({
    bankAccounts: (bankAccounts ?? []).filter((b) => b.department_id === departmentId).length,
    categories: (categories ?? []).filter((c) => c.department_id === departmentId).length,
  });

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
        <table className="data-table">
          <thead>
            <tr>
              <th>שם</th>
              <th>קוד</th>
              <th>שימוש</th>
              <th>פעולות</th>
            </tr>
          </thead>
          <tbody>
            {(departments ?? []).map((d) => (
              <DepartmentRow key={d.id} department={d} usage={usageFor(d.id)} />
            ))}
            {(departments ?? []).length === 0 && (
              <tr>
                <td colSpan={4} className="text-center text-muted py-6">
                  אין מחלקות מוגדרות עדיין — הוסיפו את המחלקה הראשונה למטה
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <NewDepartmentForm />
      </div>
    </div>
  );
}
