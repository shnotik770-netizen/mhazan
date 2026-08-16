import { requireFinanceAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { CategoryRow, NewCategoryForm, PendingCategoryRow } from "@/components/categories-client";

export default async function CategoriesPage() {
  await requireFinanceAdmin();
  const supabase = await createClient();

  const [{ data: categories }, { data: pendingCategories }, { data: departments }] = await Promise.all([
    supabase.from("categories").select("*").order("name"),
    supabase.from("v_pending_categories").select("*").order("created_at"),
    supabase.from("departments").select("*").order("name"),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">ניהול קטגוריות</h1>
        <p className="text-sm text-muted">
          קטגוריות ששמן זוהה בהדבקת הכנסות מהבנק ולא היו קיימות במערכת נוצרות כאן אוטומטית וממתינות לשיוך
          מחלקה — עד לשיוך לא ניתן לרשום הכנסה תחתן.
        </p>
      </div>

      {(pendingCategories ?? []).length > 0 && (
        <div className="card p-4 border-warning/40">
          <h2 className="font-semibold mb-1">
            ⚠ ישנן {pendingCategories!.length} קטגוריות הדורשות שיוך למחלקה
          </h2>
          <table className="data-table">
            <thead>
              <tr>
                <th>שם קטגוריה</th>
                <th>מחלקה</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {pendingCategories!.map((c) => (
                <PendingCategoryRow key={c.id!} category={c as never} departments={departments ?? []} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="card p-4">
        <h2 className="font-semibold mb-3">כל הקטגוריות</h2>
        <table className="data-table">
          <thead>
            <tr>
              <th>שם</th>
              <th>מחלקה</th>
              <th>פעולות</th>
            </tr>
          </thead>
          <tbody>
            {(categories ?? []).map((c) => (
              <CategoryRow key={c.id} category={c} departments={departments ?? []} />
            ))}
            {(categories ?? []).length === 0 && (
              <tr>
                <td colSpan={3} className="text-center text-muted py-6">
                  אין קטגוריות מוגדרות עדיין — הוסיפו את הקטגוריה הראשונה למטה
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <NewCategoryForm departments={departments ?? []} />
      </div>
    </div>
  );
}
