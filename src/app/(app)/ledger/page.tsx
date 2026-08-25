import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { DepartmentReport } from "@/components/department-report";
import { NewManualEntryButton } from "@/components/manual-entries-client";
import { LedgerBalancesTable, LedgerNetPositionTable } from "@/components/ledger-tables-client";
import { DepartmentPickerSelect } from "@/components/department-picker-select-client";

export default async function LedgerPage({
  searchParams,
}: {
  searchParams: Promise<{ department?: string }>;
}) {
  const { department: departmentParam } = await searchParams;

  const user = await requireUser();
  const isAdmin = user.profile.role === "FINANCE_ADMIN";
  const supabase = await createClient();

  const [{ data: balances }, { data: departments }, { data: bankAccounts }, { data: grants }] =
    await Promise.all([
      supabase.from("v_inter_department_balances").select("*"),
      supabase.from("departments").select("*").order("name"),
      supabase.from("bank_accounts").select("*").order("bank_name"),
      supabase.from("user_department_access").select("department_id").eq("user_id", user.id),
    ]);

  const grantedIds = new Set((grants ?? []).map((g) => g.department_id));
  const myDepartments = isAdmin ? (departments ?? []) : (departments ?? []).filter((d) => grantedIds.has(d.id));

  const deptName = (id: string | null) => departments?.find((d) => d.id === id)?.name ?? "—";

  // Collapses the pairwise debtor→creditor breakdown into one net figure
  // per department (positive = owed to it overall, negative = it owes
  // overall) — the at-a-glance summary; the pairwise table stays below it
  // for whoever needs the full "who owes whom" detail.
  const netByDepartment = new Map<string, number>();
  for (const row of balances ?? []) {
    const amount = Number(row.net_amount);
    if (row.debtor_department_id) {
      netByDepartment.set(row.debtor_department_id, (netByDepartment.get(row.debtor_department_id) ?? 0) - amount);
    }
    if (row.creditor_department_id) {
      netByDepartment.set(row.creditor_department_id, (netByDepartment.get(row.creditor_department_id) ?? 0) + amount);
    }
  }
  const netPositionRows = [...netByDepartment.entries()]
    .map(([departmentId, netAmount]) => ({ departmentId, departmentName: deptName(departmentId), netAmount }))
    .filter((r) => Math.abs(r.netAmount) > 0.005)
    .sort((a, b) => a.netAmount - b.netAmount);

  // The "hub" department — whichever department's own bank account most
  // other departments use as their home account — is the one everyone
  // else's balance is effectively measured against. A row where money is
  // owed TO the hub gets flagged, since that's the account this dashboard
  // itself belongs to.
  const hubDepartmentId = (() => {
    const counts = new Map<string, number>();
    for (const d of departments ?? []) counts.set(d.home_bank_account_id, (counts.get(d.home_bank_account_id) ?? 0) + 1);
    let bestAccountId: string | null = null;
    let bestCount = 0;
    for (const [accountId, count] of counts) {
      if (count > bestCount) {
        bestAccountId = accountId;
        bestCount = count;
      }
    }
    return (bankAccounts ?? []).find((b) => b.id === bestAccountId)?.department_id ?? null;
  })();

  // Only a department this user is actually granted (or any, if admin) can
  // be selected here — same boundary /reports/[departmentId] enforces via
  // redirect, just checked directly since this renders inline instead.
  const selectedDepartment =
    departmentParam && myDepartments.some((d) => d.id === departmentParam)
      ? myDepartments.find((d) => d.id === departmentParam)!
      : null;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold">דוחות מחלקות</h1>
          <p className="text-sm text-muted">בחרו מחלקה כדי לראות את הדוח שלה. ניתן להוסיף הכנסה/הוצאה ידנית לכל מחלקה, לא רק לזו שפתוחה כרגע.</p>
        </div>
        <NewManualEntryButton departments={myDepartments} bankAccounts={bankAccounts ?? []} />
      </div>

      <div className="card p-4 flex flex-wrap items-center gap-2 no-print">
        <span className="text-sm font-medium ml-1">מחלקה:</span>
        <DepartmentPickerSelect departments={myDepartments} selectedId={selectedDepartment?.id ?? ""} />
        {selectedDepartment && (
          <Link href="/ledger" className="text-sm text-muted underline mr-2">
            נקה בחירה
          </Link>
        )}
      </div>

      {selectedDepartment && (
        <div className="space-y-4">
          <h2 className="text-lg font-bold">דוח — {selectedDepartment.name}</h2>
          <DepartmentReport departmentId={selectedDepartment.id} departmentName={selectedDepartment.name} isAdmin={isAdmin} />
        </div>
      )}

      {!selectedDepartment && (
        <div>
          <h2 className="text-lg font-bold mb-3">התחשבנות פנימית בין מחלקות</h2>
          <p className="text-sm text-muted mb-3">
            מציג כמה כל מחלקה חייבת למחלקה אחרת, בשל הכנסות שנכנסו לחשבון בנק של מחלקה אחרת מבעלת הקטגוריה. לחיצה על שם מחלקה בטבלה פותחת את הדוח שלה.
          </p>

          <div className="card p-4 overflow-x-auto">
            <h3 className="font-semibold mb-3">מטריצת יתרות נטו</h3>
            <LedgerNetPositionTable rows={netPositionRows} />
          </div>

          <div className="card p-4 overflow-x-auto">
            <h3 className="font-semibold mb-3">פירוט — מי חייב למי</h3>
            <LedgerBalancesTable
              rows={(balances ?? []).map((row) => ({
                debtorId: row.debtor_department_id,
                debtorName: deptName(row.debtor_department_id),
                creditorId: row.creditor_department_id,
                creditorName: deptName(row.creditor_department_id),
                netAmount: Number(row.net_amount),
                owedToHub: row.creditor_department_id === hubDepartmentId,
              }))}
            />
          </div>
        </div>
      )}
    </div>
  );
}
