import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { formatCurrency } from "@/lib/format";
import { ManualEntryApprovalRow, NewManualEntryForm } from "@/components/manual-entries-client";

export default async function DashboardPage() {
  const user = await requireUser();
  const isAdmin = user.profile.role === "FINANCE_ADMIN";
  const supabase = await createClient();

  const [
    { data: bankAccounts },
    { data: pendingSummary },
    { data: ledgerBalances },
    { data: departments },
    { data: grants },
    { data: pendingManualEntries },
  ] = await Promise.all([
    supabase.from("bank_accounts").select("*, departments(name)").order("bank_name"),
    supabase.from("v_pending_queue_summary").select("*"),
    supabase.from("v_inter_department_balances").select("*"),
    supabase.from("departments").select("*"),
    supabase.from("user_department_access").select("department_id").eq("user_id", user.id),
    isAdmin
      ? supabase
          .from("manual_department_entries")
          .select("*, departments(name)")
          .eq("status", "PENDING")
          .order("created_at")
      : Promise.resolve({ data: null }),
  ]);

  const grantedIds = new Set((grants ?? []).map((g) => g.department_id));
  const myDepartments = isAdmin ? (departments ?? []) : (departments ?? []).filter((d) => grantedIds.has(d.id));

  const deptName = (id: string | null) => departments?.find((d) => d.id === id)?.name ?? "—";

  const totalBalance = (bankAccounts ?? []).reduce((sum, b) => sum + Number(b.current_balance), 0);
  const totalPending = (pendingSummary ?? []).reduce((sum, p) => sum + Number(p.pending_count ?? 0), 0);
  const pendingCountFor = (source: string) =>
    Number((pendingSummary ?? []).find((p) => p.source === source)?.pending_count ?? 0);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">דשבורד מוסדי מרכזי</h1>
          <p className="text-sm text-muted">
            שלום {user.profile.full_name ?? user.email} — סקירה כללית של המצב הפיננסי
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Link
            href="/forecast"
            className="rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold"
          >
            תחזית תזרים ←
          </Link>
          {user.profile.role === "FINANCE_ADMIN" && (
            <>
              <Link
                href="/settings#recurring-schedules"
                className="rounded-lg border border-border px-4 py-2 text-sm font-semibold"
              >
                + הוראת קבע חדשה
              </Link>
              <Link
                href="/settings"
                className="rounded-lg border border-border px-4 py-2 text-sm font-semibold"
              >
                הגדרות מערכת
              </Link>
            </>
          )}
        </div>
      </div>

      {totalPending > 0 && (
        <div className="space-y-2">
          {pendingCountFor("CHECK") + pendingCountFor("BANK_TRANSACTION") > 0 && (
            <Link
              href="/checks"
              className="block card px-4 py-3 bg-warning-bg border-warning/30 text-sm font-medium"
            >
              ⚠ ישנם {pendingCountFor("CHECK") + pendingCountFor("BANK_TRANSACTION")} צ׳קים / תנועות בנק
              הדורשים סיווג מחלקה — לחצו לסיווג
            </Link>
          )}
          {pendingCountFor("CATEGORY") > 0 && (
            <Link
              href="/categories"
              className="block card px-4 py-3 bg-warning-bg border-warning/30 text-sm font-medium"
            >
              ⚠ ישנן {pendingCountFor("CATEGORY")} קטגוריות הדורשות שיוך למחלקה — לחצו לשיוך
            </Link>
          )}
        </div>
      )}

      {isAdmin && (pendingManualEntries ?? []).length > 0 && (
        <div className="card p-4 border-warning/40 overflow-x-auto">
          <h2 className="font-semibold mb-1">
            ⚠ {pendingManualEntries!.length} רישומים ידניים ממתינים לאישור
          </h2>
          <table className="data-table">
            <thead>
              <tr>
                <th>תאריך</th>
                <th>מחלקה</th>
                <th>סוג</th>
                <th>סכום</th>
                <th>הערות</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {pendingManualEntries!.map((e) => (
                <ManualEntryApprovalRow
                  key={e.id}
                  entryId={e.id}
                  departmentName={(e as { departments: { name: string } | null }).departments?.name ?? "—"}
                  direction={e.direction}
                  amount={Number(e.amount)}
                  entryDate={e.entry_date}
                  notes={e.notes}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {myDepartments.length > 0 && (
        <div className="card p-4">
          <h2 className="font-semibold mb-3">דוחות מחלקתיים</h2>
          <div className="flex flex-wrap gap-2">
            {myDepartments.map((d) => (
              <Link key={d.id} href={`/reports/${d.id}`} className="rounded-lg border border-border px-3 py-1.5 text-sm">
                דוח — {d.name}
              </Link>
            ))}
          </div>
        </div>
      )}

      {myDepartments.length > 0 && <NewManualEntryForm departments={myDepartments} />}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card stat-card p-4 ps-5">
          <p className="text-sm text-muted mb-1">סה&quot;כ יתרת בנקים</p>
          <p className="text-2xl font-bold" style={{ fontFamily: "var(--font-display)" }}>
            {formatCurrency(totalBalance)}
          </p>
        </div>
        <div className="card stat-card p-4 ps-5">
          <p className="text-sm text-muted mb-1">חובות פנימיים פתוחים</p>
          <p className="text-2xl font-bold" style={{ fontFamily: "var(--font-display)" }}>
            {ledgerBalances?.length ?? 0} זוגות מחלקות
          </p>
        </div>
        <div className="card stat-card p-4 ps-5">
          <p className="text-sm text-muted mb-1">פריטים בהמתנה לסיווג</p>
          <p className="text-2xl font-bold" style={{ fontFamily: "var(--font-display)" }}>
            {totalPending}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card p-4 overflow-x-auto">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold">מאזן בנקים</h2>
            <Link href="/forecast" className="text-sm text-primary">
              תחזית תזרים ←
            </Link>
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th>מחלקה</th>
                <th>בנק</th>
                <th>מספר חשבון</th>
                <th>יתרה</th>
              </tr>
            </thead>
            <tbody>
              {(bankAccounts ?? []).map((b) => (
                <tr key={b.id}>
                  <td>{(b as { departments: { name: string } | null }).departments?.name}</td>
                  <td>{b.bank_name}</td>
                  <td>{b.account_number}</td>
                  <td className={Number(b.current_balance) < 0 ? "text-danger" : ""}>
                    {formatCurrency(Number(b.current_balance))}
                  </td>
                </tr>
              ))}
              {(bankAccounts ?? []).length === 0 && (
                <tr>
                  <td colSpan={4} className="text-center text-muted py-6">
                    אין חשבונות בנק מוגדרים.{" "}
                    <Link href="/settings" className="text-primary">
                      הגדרת חשבון ראשון
                    </Link>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="card p-4 overflow-x-auto">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold">התחשבנות פנימית בין מחלקות</h2>
            <Link href="/ledger" className="text-sm text-primary">
              לדוח המלא ←
            </Link>
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th>חייב</th>
                <th>זכאי</th>
                <th>סכום</th>
              </tr>
            </thead>
            <tbody>
              {(ledgerBalances ?? []).map((row, i) => (
                <tr key={i}>
                  <td>{deptName(row.debtor_department_id)}</td>
                  <td>{deptName(row.creditor_department_id)}</td>
                  <td>{formatCurrency(Number(row.net_amount))}</td>
                </tr>
              ))}
              {(ledgerBalances ?? []).length === 0 && (
                <tr>
                  <td colSpan={3} className="text-center text-muted py-6">
                    אין חובות פנימיים פתוחים
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
