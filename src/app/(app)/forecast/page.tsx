import { createClient } from "@/lib/supabase/server";
import { formatCurrency, formatDate } from "@/lib/format";

export default async function ForecastPage({
  searchParams,
}: {
  searchParams: Promise<{ account?: string; horizon?: string }>;
}) {
  const { account, horizon } = await searchParams;
  const horizonDays = Number(horizon ?? 30);

  const supabase = await createClient();
  const { data: bankAccounts } = await supabase
    .from("bank_accounts")
    .select("*, departments(name)")
    .order("bank_name");

  const selectedAccountId = account ?? bankAccounts?.[0]?.id ?? "";
  const selectedAccount = bankAccounts?.find((b) => b.id === selectedAccountId);

  const { data: forecast, error } = selectedAccountId
    ? await supabase.rpc("get_cash_flow_forecast", {
        p_bank_account_id: selectedAccountId,
        p_horizon_days: horizonDays,
      })
    : { data: [], error: null };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">תחזית תזרים מזומנים</h1>
        <p className="text-sm text-muted">
          יתרה צפויה = יתרת בנק נוכחית − צ׳קים בחוץ − הוראות קבע עתידיות + צפי הכנסות
        </p>
      </div>

      <form className="card p-4 flex flex-wrap items-end gap-4" method="get">
        <div>
          <label className="block text-sm font-medium mb-1">חשבון בנק</label>
          <select
            name="account"
            defaultValue={selectedAccountId}
            className="rounded-lg border border-border bg-transparent px-3 py-2 text-sm"
          >
            {(bankAccounts ?? []).map((b) => (
              <option key={b.id} value={b.id}>
                {(b as { departments: { name: string } | null }).departments?.name} — {b.bank_name} (
                {b.account_number})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">טווח ימים</label>
          <select
            name="horizon"
            defaultValue={String(horizonDays)}
            className="rounded-lg border border-border bg-transparent px-3 py-2 text-sm"
          >
            <option value="30">30 יום</option>
            <option value="60">60 יום</option>
            <option value="90">90 יום</option>
          </select>
        </div>
        <button
          type="submit"
          className="rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold"
        >
          עדכן תחזית
        </button>
      </form>

      {selectedAccount && (
        <div className="card p-4">
          <p className="text-sm text-muted mb-1">יתרת פתיחה נוכחית</p>
          <p className="text-2xl font-bold">{formatCurrency(Number(selectedAccount.current_balance))}</p>
        </div>
      )}

      {error && <div className="card p-4 bg-danger-bg text-danger text-sm">{error.message}</div>}

      <div className="card p-4 overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>תאריך</th>
              <th>מקור</th>
              <th>שינוי צפוי</th>
              <th>יתרה חזויה</th>
            </tr>
          </thead>
          <tbody>
            {(forecast ?? []).map((row, i) => (
              <tr key={i}>
                <td>{formatDate(row.forecast_date!)}</td>
                <td>{row.source}</td>
                <td className={Number(row.expected_change) < 0 ? "text-danger" : "text-success"}>
                  {formatCurrency(Number(row.expected_change))}
                </td>
                <td className="font-semibold">{formatCurrency(Number(row.running_balance))}</td>
              </tr>
            ))}
            {(forecast ?? []).length === 0 && (
              <tr>
                <td colSpan={4} className="text-center text-muted py-6">
                  אין תנועות צפויות בטווח שנבחר
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
