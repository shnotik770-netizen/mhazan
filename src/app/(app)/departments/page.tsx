import Link from "next/link";
import { requireFinanceAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { DepartmentRow, NewDepartmentForm } from "@/components/departments-client";

export default async function DepartmentsPage() {
  await requireFinanceAdmin();
  const supabase = await createClient();

  const [{ data: departments }, { data: bankAccounts }, { data: categories }] = await Promise.all([
    supabase.from("departments").select("*").order("name"),
    supabase.from("bank_accounts").select("id, department_id, bank_name, account_number").order("bank_name"),
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
        <div className="overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>שם</th>
              <th>קוד</th>
              <th>חשבון בית</th>
              <th>שימוש</th>
              <th>פעולות</th>
            </tr>
          </thead>
          <tbody>
            {(departments ?? []).map((d) => (
              <DepartmentRow key={d.id} department={d} usage={usageFor(d.id)} bankAccounts={bankAccounts ?? []} />
            ))}
            {(departments ?? []).length === 0 && (
              <tr>
                <td colSpan={5} className="text-center text-muted py-6">
                  אין מחלקות מוגדרות עדיין — הוסיפו את המחלקה הראשונה למטה
                </td>
              </tr>
            )}
          </tbody>
        </table>
        </div>
        <NewDepartmentForm bankAccounts={bankAccounts ?? []} />
      </div>

      {(departments ?? []).length > 0 && (
        <div className="card p-4">
          <h2 className="font-semibold mb-3">דוחות מחלקתיים</h2>
          <div className="flex flex-wrap gap-2">
            {(departments ?? []).map((d) => (
              <Link
                key={d.id}
                href={`/reports/${d.id}`}
                className="rounded-lg border border-border px-3 py-1.5 text-sm"
              >
                דוח — {d.name}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
