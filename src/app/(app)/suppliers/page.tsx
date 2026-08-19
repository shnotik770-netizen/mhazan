import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireFinanceAdmin } from "@/lib/auth";
import { NewSupplierForm, SuppliersTable, ImportSuppliersButton } from "@/components/suppliers-client";

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
        <SuppliersTable suppliers={suppliers ?? []} />
      </div>
    </div>
  );
}
