import { createClient } from "@/lib/supabase/server";
import { formatCurrency, formatDate } from "@/lib/format";
import { SettleBalancesButton } from "@/components/settle-balances-button";

export default async function LedgerPage() {
  const supabase = await createClient();

  const [{ data: balances }, { data: departments }, { data: openEntries }] = await Promise.all([
    supabase.from("v_inter_department_balances").select("*"),
    supabase.from("departments").select("*"),
    supabase
      .from("inter_department_ledger")
      .select("*, from_dept:from_department_id(name), to_dept:to_department_id(name)")
      .eq("status", "OPEN")
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  const deptName = (id: string | null) => departments?.find((d) => d.id === id)?.name ?? "—";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">התחשבנות פנימית בין מחלקות</h1>
        <p className="text-sm text-muted">
          מציג כמה כל מחלקה חייבת למחלקה אחרת, בשל הכנסות שנכנסו לחשבון בנק של מחלקה אחרת מבעלת הקטגוריה.
        </p>
      </div>

      <div className="card p-4">
        <h2 className="font-semibold mb-3">מטריצת יתרות נטו</h2>
        <table className="data-table">
          <thead>
            <tr>
              <th>חייב</th>
              <th>זכאי</th>
              <th>סכום נטו</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {(balances ?? []).map((row, i) => (
              <tr key={i}>
                <td>{deptName(row.debtor_department_id)}</td>
                <td>{deptName(row.creditor_department_id)}</td>
                <td className="font-semibold">{formatCurrency(Number(row.net_amount))}</td>
                <td>
                  <SettleBalancesButton
                    deptA={row.debtor_department_id!}
                    deptB={row.creditor_department_id!}
                    debtorName={deptName(row.debtor_department_id)}
                    creditorName={deptName(row.creditor_department_id)}
                  />
                </td>
              </tr>
            ))}
            {(balances ?? []).length === 0 && (
              <tr>
                <td colSpan={4} className="text-center text-muted py-6">
                  אין יתרות פתוחות בין מחלקות
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="card p-4 overflow-x-auto">
        <h2 className="font-semibold mb-3">תנועות פתוחות (לפני נטו)</h2>
        <table className="data-table">
          <thead>
            <tr>
              <th>תאריך</th>
              <th>ממחלקה (חייב)</th>
              <th>למחלקה (זכאי)</th>
              <th>סכום</th>
            </tr>
          </thead>
          <tbody>
            {(openEntries ?? []).map((e) => {
              const row = e as unknown as {
                id: string;
                created_at: string;
                amount: number;
                from_dept: { name: string } | null;
                to_dept: { name: string } | null;
              };
              return (
                <tr key={row.id}>
                  <td>{formatDate(row.created_at)}</td>
                  <td>{row.from_dept?.name}</td>
                  <td>{row.to_dept?.name}</td>
                  <td>{formatCurrency(Number(row.amount))}</td>
                </tr>
              );
            })}
            {(openEntries ?? []).length === 0 && (
              <tr>
                <td colSpan={4} className="text-center text-muted py-6">
                  אין תנועות פתוחות
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
