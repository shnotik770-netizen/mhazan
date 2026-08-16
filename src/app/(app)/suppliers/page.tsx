import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireFinanceAdmin } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { NewSupplierForm, DeleteSupplierButton, ImportSuppliersButton } from "@/components/suppliers-client";

export default async function SuppliersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await requireFinanceAdmin();
  const { q: qParam } = await searchParams;
  const q = (qParam ?? "").trim();
  const supabase = await createClient();

  let suppliersQuery = supabase.from("suppliers").select("*").order("name");
  if (q) suppliersQuery = suppliersQuery.or(`name.ilike.%${q}%,notes.ilike.%${q}%`);
  const { data: suppliers } = await suppliersQuery;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-bold">ניהול ספקים</h1>
          <p className="text-sm text-muted">
            רשימת מוטבים שיצא עליהם צ׳ק/העברה בעבר — מוצעת אוטומטית בשדות &quot;מוטב&quot; בטופסי צ׳קים.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ImportSuppliersButton />
          <NewSupplierForm />
        </div>
      </div>

      <form className="flex items-center gap-2" method="get">
        <input
          name="q"
          defaultValue={q}
          placeholder="חיפוש לפי שם ספק / הערות"
          className="w-full max-w-sm rounded-lg border border-border bg-transparent px-3 py-2 text-sm"
        />
        <button type="submit" className="rounded-lg border border-border px-4 py-2 text-sm font-semibold">
          חיפוש
        </button>
        {q && (
          <Link href="/suppliers" className="text-sm text-muted underline">
            נקה
          </Link>
        )}
      </form>

      <div className="card p-4 overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>שם ספק</th>
              <th>הערות</th>
              <th>נוסף בתאריך</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {(suppliers ?? []).map((s) => (
              <tr key={s.id}>
                <td>{s.name}</td>
                <td>{s.notes ?? "—"}</td>
                <td>{formatDate(s.created_at)}</td>
                <td>
                  <DeleteSupplierButton supplierId={s.id} name={s.name} />
                </td>
              </tr>
            ))}
            {(suppliers ?? []).length === 0 && (
              <tr>
                <td colSpan={4} className="text-center text-muted py-6">
                  אין ספקים רשומים עדיין. ניתן להוסיף ידנית או לייבא מתוך היסטוריית הצ׳קים.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
