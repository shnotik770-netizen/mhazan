import { requireFinanceAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { CategoriesTable, NewCategoryForm, PendingCategoriesTable } from "@/components/categories-client";

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
        <div className="card p-4 border-warning/40 overflow-x-auto">
          <h2 className="font-semibold mb-1">
            ⚠ ישנן {pendingCategories!.length} קטגוריות הדורשות שיוך למחלקה
          </h2>
          <PendingCategoriesTable categories={pendingCategories ?? []} departments={departments ?? []} />
        </div>
      )}

      <div className="card p-4 overflow-x-auto">
        <h2 className="font-semibold mb-3">כל הקטגוריות</h2>
        <p className="text-xs text-muted mb-2">
          קטגוריות הממתינות לשיוך מחלקה מוצגות רק בטבלה שלמעלה, ולא כאן, עד שהן משויכות.
        </p>
        <CategoriesTable
          categories={(categories ?? []).filter((c) => c.is_split || c.department_id != null)}
          departments={departments ?? []}
        />
        <NewCategoryForm departments={departments ?? []} />
      </div>
    </div>
  );
}
