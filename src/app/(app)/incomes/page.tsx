import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { formatCurrency, formatDate } from "@/lib/format";
import { DeleteIncomeButton } from "@/components/delete-income-button";

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
  const { data: incomes } = await incomesQuery;

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

      <div className="card p-4 overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>תאריך</th>
              <th>קטגוריה</th>
              <th>שם תורם</th>
              <th>סכום</th>
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
                requires_inter_settlement: boolean;
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
                  <td>
                    {row.bank_accounts?.bank_name} ({row.bank_accounts?.account_number})
                  </td>
                  <td>{row.owner?.name}</td>
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
                <td colSpan={isAdmin ? 11 : 10} className="text-center text-muted py-6">
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
