import { createClient } from "@/lib/supabase/server";
import { formatCurrency, formatDate } from "@/lib/format";
import { ClassifyCheckRow, CheckStatusControls, NewCheckForm } from "@/components/checks-client";

export default async function ChecksPage() {
  const supabase = await createClient();

  const [{ data: pendingChecks }, { data: checks }, { data: departments }, { data: categories }, { data: bankAccounts }] =
    await Promise.all([
      supabase.from("v_pending_checks").select("*").order("due_date"),
      supabase
        .from("checks")
        .select("*, bank_accounts(bank_name, account_number), departments(name)")
        .order("due_date", { ascending: false })
        .limit(200),
      supabase.from("departments").select("*").order("name"),
      supabase.from("categories").select("*").order("name"),
      supabase.from("bank_accounts").select("*, departments(name)").order("bank_name"),
    ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">ניהול צ׳קים</h1>
        <NewCheckForm
          bankAccounts={bankAccounts ?? []}
          departments={departments ?? []}
          categories={categories ?? []}
        />
      </div>

      {(pendingChecks ?? []).length > 0 && (
        <div className="card p-4 border-warning/40">
          <h2 className="font-semibold mb-1">
            ⚠ ישנם {pendingChecks!.length} צ׳קים הדורשים סיווג מחלקה
          </h2>
          <p className="text-sm text-muted mb-3">
            עד לסיווג, צ׳קים אלו מחושבים במאזן הכללי תחת &quot;הוצאות כלליות / לא מסווגות&quot;.
          </p>
          <table className="data-table">
            <thead>
              <tr>
                <th>מס׳ צ׳ק</th>
                <th>מוטב</th>
                <th>סכום</th>
                <th>תאריך פירעון</th>
                <th>חשבון</th>
                <th>סיווג</th>
              </tr>
            </thead>
            <tbody>
              {pendingChecks!.map((c) => (
                <tr key={c.id!}>
                  <td>{c.check_number}</td>
                  <td>{c.payee}</td>
                  <td>{formatCurrency(Number(c.amount))}</td>
                  <td>{formatDate(c.due_date!)}</td>
                  <td>
                    {c.bank_name} ({c.account_number})
                  </td>
                  <td>
                    <ClassifyCheckRow
                      checkId={c.id!}
                      departments={departments ?? []}
                      categories={categories ?? []}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="card p-4 overflow-x-auto">
        <h2 className="font-semibold mb-3">כל הצ׳קים</h2>
        <table className="data-table">
          <thead>
            <tr>
              <th>מס׳ צ׳ק</th>
              <th>מוטב</th>
              <th>סכום</th>
              <th>תאריך פירעון</th>
              <th>חשבון</th>
              <th>מחלקה</th>
              <th>סטטוס</th>
            </tr>
          </thead>
          <tbody>
            {(checks ?? []).map((c) => {
              const row = c as unknown as {
                id: string;
                check_number: string;
                payee: string;
                amount: number;
                due_date: string;
                status: string;
                bank_accounts: { bank_name: string; account_number: string } | null;
                departments: { name: string } | null;
              };
              return (
                <tr key={row.id}>
                  <td>{row.check_number}</td>
                  <td>{row.payee}</td>
                  <td>{formatCurrency(Number(row.amount))}</td>
                  <td>{formatDate(row.due_date)}</td>
                  <td>
                    {row.bank_accounts?.bank_name} ({row.bank_accounts?.account_number})
                  </td>
                  <td>{row.departments?.name ?? <span className="text-warning">בהמתנה</span>}</td>
                  <td>
                    <CheckStatusControls checkId={row.id} status={row.status} />
                  </td>
                </tr>
              );
            })}
            {(checks ?? []).length === 0 && (
              <tr>
                <td colSpan={7} className="text-center text-muted py-6">
                  אין צ׳קים רשומים עדיין
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
