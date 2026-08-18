import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { formatCurrency, formatDate } from "@/lib/format";
import { DeleteIncomeButton } from "@/components/delete-income-button";
import { IncomeDepartmentEditor } from "@/components/income-department-editor";

export default async function IncomesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q: qParam } = await searchParams;
  const q = (qParam ?? "").trim();

  const user = await requireUser();
  const isAdmin = user.profile.role === "FINANCE_ADMIN";
  const supabase = await createClient();
  let incomesQuery = supabase
    .from("incomes")
    .select(
      "*, categories(name), bank_accounts(bank_name, account_number), owner:owner_department_id(name), issuer:issuing_department_id(name)",
    )
    .order("date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(200);
  if (q) incomesQuery = incomesQuery.or(`donor_name.ilike.%${q}%,notes.ilike.%${q}%,order_ref.ilike.%${q}%`);

  // Every income row that belongs to a standing order (order_ref set),
  // most recent first — grouped below into one row per order showing how
  // many installments are left, per the admin's request to see this at a
  // glance instead of reading each payment's raw "סוג" text.
  const standingOrdersQuery = supabase
    .from("incomes")
    .select("order_ref, date, amount, donor_name, installment_current, installment_total, categories(name)")
    .not("order_ref", "is", null)
    .order("date", { ascending: false });

  const [{ data: incomes }, { data: departments }, { data: standingOrderRows }] = await Promise.all([
    incomesQuery,
    isAdmin ? supabase.from("departments").select("*").order("name") : Promise.resolve({ data: [] }),
    standingOrdersQuery,
  ]);

  // One card per standing-order number: the most recent payment (rows are
  // already newest-first) gives the current installment count, from which
  // the remaining payments are derived when the total is known.
  const standingOrders = (() => {
    const byRef = new Map<
      string,
      { orderRef: string; donorName: string | null; categoryName: string | null; amount: number; date: string; current: number | null; total: number | null }
    >();
    for (const r of (standingOrderRows ?? []) as unknown as {
      order_ref: string;
      date: string;
      amount: number;
      donor_name: string | null;
      installment_current: number | null;
      installment_total: number | null;
      categories: { name: string } | null;
    }[]) {
      if (byRef.has(r.order_ref)) continue;
      byRef.set(r.order_ref, {
        orderRef: r.order_ref,
        donorName: r.donor_name,
        categoryName: r.categories?.name ?? null,
        amount: Number(r.amount),
        date: r.date,
        current: r.installment_current,
        total: r.installment_total,
      });
    }
    // standingOrderRows is already sorted newest-first, and each order_ref's
    // first occurrence in that order is its latest payment — so Map
    // insertion order already reflects the right group ordering.
    return [...byRef.values()];
  })();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl font-bold">הכנסות</h1>
        {user.profile.role === "FINANCE_ADMIN" && (
          <Link
            href="/incomes/new"
            className="rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold"
          >
            + קליטת הכנסות בהדבקה
          </Link>
        )}
      </div>

      <form className="flex items-center gap-2" method="get">
        <input
          name="q"
          defaultValue={q}
          placeholder="חיפוש לפי שם תורם / הערות / מספר הוראה"
          className="w-full max-w-sm rounded-lg border border-border bg-transparent px-3 py-2 text-sm"
        />
        <button type="submit" className="rounded-lg border border-border px-4 py-2 text-sm font-semibold">
          חיפוש
        </button>
        {q && (
          <Link href="/incomes" className="text-sm text-muted underline">
            נקה
          </Link>
        )}
      </form>

      {standingOrders.length > 0 && (
        <div className="card p-4 overflow-x-auto">
          <h2 className="font-semibold mb-1">הוראות קבע — תשלומים שנותרו</h2>
          <p className="text-xs text-muted mb-2">
            לפי מספר ההוראה ועמודת &quot;סוג&quot; (X מתוך Y) בהדבקת ההכנסה האחרונה של כל הוראה.
          </p>
          <table className="data-table">
            <thead>
              <tr>
                <th>מס׳ הוראה</th>
                <th>שם תורם</th>
                <th>קטגוריה</th>
                <th>סכום אחרון</th>
                <th>תשלום אחרון</th>
                <th>תשלומים שנותרו</th>
              </tr>
            </thead>
            <tbody>
              {standingOrders.map((o) => {
                const remaining = o.current != null && o.total != null ? o.total - o.current : null;
                return (
                  <tr key={o.orderRef}>
                    <td>{o.orderRef}</td>
                    <td>{o.donorName ?? "—"}</td>
                    <td>{o.categoryName ?? "—"}</td>
                    <td>{formatCurrency(o.amount)}</td>
                    <td>
                      {formatDate(o.date)}
                      {o.current != null && o.total != null ? ` (${o.current}/${o.total})` : ""}
                    </td>
                    <td>
                      {remaining == null ? (
                        <span className="text-muted">לא ידוע</span>
                      ) : remaining <= 1 ? (
                        <span className="badge bg-warning-bg text-warning">{remaining} — עומדת להסתיים</span>
                      ) : (
                        remaining
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="card p-4 overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>תאריך</th>
              <th>קטגוריה</th>
              <th>שם תורם</th>
              <th>סכום</th>
              <th>מקור</th>
              <th>סוג</th>
              <th>חשבון בנק</th>
              <th>מחלקה בעלים</th>
              <th>מחלקה מנפיקה</th>
              <th>התחשבנות</th>
              <th>מס׳ קבלה</th>
              <th>מס׳ הוראה</th>
              {isAdmin && <th></th>}
            </tr>
          </thead>
          <tbody>
            {(incomes ?? []).map((inc) => {
              const row = inc as unknown as {
                id: string;
                date: string;
                amount: number;
                donor_name: string | null;
                receipt_number: string | null;
                order_ref: string | null;
                payment_method: string | null;
                installment_current: number | null;
                installment_total: number | null;
                requires_inter_settlement: boolean;
                owner_department_id: string | null;
                categories: { name: string } | null;
                bank_accounts: { bank_name: string; account_number: string } | null;
                owner: { name: string } | null;
                issuer: { name: string } | null;
              };
              return (
                <tr key={row.id}>
                  <td>{formatDate(row.date)}</td>
                  <td>{row.categories?.name}</td>
                  <td>{row.donor_name ?? "—"}</td>
                  <td>{formatCurrency(Number(row.amount))}</td>
                  <td>{row.payment_method ?? "—"}</td>
                  <td>
                    {row.installment_current && row.installment_total
                      ? `${row.installment_current}/${row.installment_total}`
                      : "—"}
                  </td>
                  <td>
                    {row.bank_accounts?.bank_name} ({row.bank_accounts?.account_number})
                  </td>
                  <td>
                    {row.owner?.name}
                    {isAdmin && (
                      <div>
                        <IncomeDepartmentEditor
                          incomeId={row.id}
                          amount={Number(row.amount)}
                          currentDepartmentId={row.owner_department_id}
                          departments={departments ?? []}
                        />
                      </div>
                    )}
                  </td>
                  <td>{row.issuer?.name}</td>
                  <td>
                    {row.requires_inter_settlement ? (
                      <span className="badge bg-warning-bg text-warning">חוב פנימי</span>
                    ) : (
                      <span className="badge bg-success-bg text-success">ישיר</span>
                    )}
                  </td>
                  <td>{row.receipt_number ?? "—"}</td>
                  <td>{row.order_ref ?? "—"}</td>
                  {isAdmin && (
                    <td>
                      <DeleteIncomeButton incomeId={row.id} label={row.donor_name ?? row.categories?.name ?? ""} />
                    </td>
                  )}
                </tr>
              );
            })}
            {(incomes ?? []).length === 0 && (
              <tr>
                <td colSpan={isAdmin ? 13 : 12} className="text-center text-muted py-6">
                  אין הכנסות רשומות עדיין
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
