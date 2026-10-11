import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { DepartmentReport } from "@/components/department-report";
import { NewManualEntryButton } from "@/components/manual-entries-client";
import { DepartmentBalanceTable, type DepartmentBalanceRow } from "@/components/dashboard-tables-client";
import { DepartmentPickerSelect } from "@/components/department-picker-select-client";
import { getBankAccountLedgerData } from "@/lib/bank-account-ledger-data";
import { BankAccountLedgerTable, BankAccountPairReport } from "@/components/bank-account-ledger-client";

export default async function LedgerPage({
  searchParams,
}: {
  searchParams: Promise<{ department?: string; accounts?: string }>;
}) {
  const { department: departmentParam, accounts: accountsParam } = await searchParams;

  const user = await requireUser();
  const isAdmin = user.profile.role === "FINANCE_ADMIN";
  const supabase = await createClient();

  const [
    { data: interDeptBalances },
    { data: ownBalances },
    { data: departments },
    { data: bankAccounts },
    { data: categories },
    { data: grants },
    bankAccountLedgerPairs,
  ] = await Promise.all([
    supabase.rpc("get_inter_department_balance_now_eom"),
    supabase.rpc("get_department_own_balance_now_eom"),
    supabase.from("departments").select("*").order("name"),
    supabase.from("bank_accounts").select("*").order("bank_name"),
    supabase.from("categories").select("id, name").order("name"),
    supabase.from("user_department_access").select("department_id").eq("user_id", user.id),
    getBankAccountLedgerData(),
  ]);

  const grantedIds = new Set((grants ?? []).map((g) => g.department_id));
  const myDepartments = isAdmin ? (departments ?? []) : (departments ?? []).filter((d) => grantedIds.has(d.id));

  const deptName = (id: string) => departments?.find((d) => d.id === id)?.name ?? "—";

  // Same 3-way split as the dashboard: a department without its own bank
  // account nets against whichever account actually manages it (tier 1); a
  // department that does have its own account gets its own real income/
  // expense balance instead (tier 2), since the cross-account ledger
  // doesn't apply to it the same way; real cross-account debt between two
  // account-owning departments is tier 3, below.
  const departmentsWithOwnAccount = new Set((bankAccounts ?? []).map((b) => b.department_id).filter((id): id is string => Boolean(id)));
  const isMeaningful = (r: { net_now: number | null; net_end_of_month: number | null }) =>
    Math.abs(Number(r.net_now ?? 0)) > 0.005 || Math.abs(Number(r.net_end_of_month ?? 0)) > 0.005;

  const internalBalanceRows: DepartmentBalanceRow[] = (interDeptBalances ?? [])
    .filter((r) => !departmentsWithOwnAccount.has(r.department_id) && isMeaningful(r))
    .map((r) => ({
      departmentId: r.department_id,
      departmentName: deptName(r.department_id),
      netNow: Number(r.net_now ?? 0),
      netEndOfMonth: Number(r.net_end_of_month ?? 0),
    }));

  const ownBalanceRows: DepartmentBalanceRow[] = (ownBalances ?? [])
    .filter((r) => departmentsWithOwnAccount.has(r.department_id) && isMeaningful(r))
    .map((r) => ({
      departmentId: r.department_id,
      departmentName: deptName(r.department_id),
      netNow: Number(r.net_now ?? 0),
      netEndOfMonth: Number(r.net_end_of_month ?? 0),
    }));

  // Only a department this user is actually granted (or any, if admin) can
  // be selected here — same boundary /reports/[departmentId] enforces via
  // redirect, just checked directly since this renders inline instead.
  const selectedDepartment =
    departmentParam && myDepartments.some((d) => d.id === departmentParam)
      ? myDepartments.find((d) => d.id === departmentParam)!
      : null;

  const selectedPair = !selectedDepartment && accountsParam
    ? (bankAccountLedgerPairs.find((p) => p.pairId === accountsParam) ?? null)
    : null;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap no-print">
        <div>
          <h1 className="text-xl font-bold">דוחות מחלקות</h1>
          <p className="text-sm text-muted">בחרו מחלקה כדי לראות את הדוח שלה. ניתן להוסיף הכנסה/הוצאה ידנית לכל מחלקה, לא רק לזו שפתוחה כרגע.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <NewManualEntryButton
            departments={myDepartments}
            bankAccounts={bankAccounts ?? []}
            categories={categories ?? []}
            isAdmin={isAdmin}
          />
        </div>
      </div>

      <div className="card p-4 flex flex-wrap items-center gap-2 no-print">
        <span className="text-sm font-medium ml-1">מעבר לדוח מחלקה:</span>
        <DepartmentPickerSelect departments={myDepartments} selectedId={selectedDepartment?.id ?? ""} />
        {selectedDepartment && (
          <Link href="/ledger" className="text-sm text-muted underline mr-2">
            נקה בחירה
          </Link>
        )}
        <Link
          href="/ledger"
          className="rounded-lg border border-border px-3 py-1.5 text-sm font-semibold hover:bg-background whitespace-nowrap ml-auto"
        >
          דוח בין חשבונות
        </Link>
      </div>

      {selectedDepartment && (
        <div className="space-y-4">
          <DepartmentReport departmentId={selectedDepartment.id} departmentName={selectedDepartment.name} isAdmin={isAdmin} />
        </div>
      )}

      {!selectedDepartment && selectedPair && (
        <div className="space-y-4">
          <Link href="/ledger" className="text-sm text-muted underline no-print">
            ⇦ חזרה לרשימת החשבונות
          </Link>
          <BankAccountPairReport pair={selectedPair} allPairs={bankAccountLedgerPairs} isAdmin={isAdmin} />
        </div>
      )}

      {!selectedDepartment && !selectedPair && (
        <div className="space-y-4">
          <div className="card p-4 overflow-x-auto">
            <h3 className="font-semibold mb-1">התחשבנות פנימית בין מחלקות</h3>
            <p className="text-sm text-muted mb-3">
              מחלקות ללא חשבון בנק משלהן (החולקות חשבון בנק של מחלקה אחרת) — מצב החוב/זכות שלהן מול החשבון שמנהל אותן, ממש עכשיו, ובסוגריים הצפי לסוף החודש.
            </p>
            <DepartmentBalanceTable
              rows={internalBalanceRows}
              emptyMessage="אין חובות פנימיים פתוחים"
              departmentHref={(id) => `/ledger?department=${id}`}
            />
          </div>

          <div className="card p-4 overflow-x-auto">
            <h3 className="font-semibold mb-1">מאזן מחלקות עם חשבון בנק משלהן</h3>
            <p className="text-sm text-muted mb-3">
              ההכנסות פחות ההוצאות בפועל של כל מחלקה שמנהלת חשבון בנק משלה, ממש עכשיו, ובסוגריים הצפי לסוף החודש.
            </p>
            <DepartmentBalanceTable
              rows={ownBalanceRows}
              emptyMessage="אין נתונים"
              departmentHref={(id) => `/ledger?department=${id}`}
            />
          </div>

          <div className="card p-4">
            <h3 className="font-semibold mb-1">חוב בין חשבונות בנק</h3>
            <p className="text-sm text-muted mb-3">
              רוב המחלקות משתמשות באותו חשבון בנק מרכזי, כך שחוב בין מחלקות ברוב המקרים אינו חוב אמיתי. הטבלה הזו מציגה רק
              חוב אמיתי בין חשבונות בנק שונים — העברות בין מחלקות עם חשבונות שונים, וכל הכנסה/הוצאה/רישום ידני שנרשם דרך
              חשבון אחר מהחשבון שאליו הוא שייך — כולל פירוט כל תנועה שמרכיבה את החוב ועמלת האשראי של 2% במקרים הרלוונטיים.
            </p>
            <BankAccountLedgerTable pairs={bankAccountLedgerPairs} />
          </div>
        </div>
      )}
    </div>
  );
}
