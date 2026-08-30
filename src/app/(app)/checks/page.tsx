import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { DeptExpenseRequestForm } from "@/components/checks-client";
import { PasteExistingChecksForm } from "@/components/checks-paste-client";
import { UnifiedCheckForm } from "@/components/unified-check-form";
import { BulkExpenseRequestFormMulti } from "@/components/bulk-checks-client";
import { IssuanceQueueTable } from "@/components/issuance-queue-client";
import { BankReconciliationPanel } from "@/components/bank-reconciliation-client";
import { ChecksFilterBar } from "@/components/checks-filter-bar";
import {
  CollapsibleSection,
  OverdueChecksTable,
  OverdueTransfersTable,
  PendingApprovalTable,
} from "@/components/checks-sections-client";
import { ScheduleConfirmationsList, type PendingConfirmation } from "@/components/schedule-confirmations-client";
import { RecurringSchedulesSection, type ScheduleRow } from "@/components/recurring-schedules-manager-client";
import { InterDepartmentTransferButton, NewManualEntryButton } from "@/components/manual-entries-client";
import { CancelCheckNumberButton } from "@/components/cancel-check-number-client";

export default async function ChecksPage({
  searchParams,
}: {
  searchParams: Promise<{ asOf?: string; dept?: string; bank?: string }>;
}) {
  const { asOf: asOfParam, dept: deptParam, bank: bankParam } = await searchParams;
  const asOf = asOfParam || new Date().toISOString().slice(0, 10);
  const deptFilter = deptParam ?? "";
  const bankFilter = bankParam ?? "";

  const user = await requireUser();
  const isAdmin = user.profile.role === "FINANCE_ADMIN";
  const supabase = await createClient();

  let pendingApprovalQuery = supabase.from("v_checks_pending_approval").select("*").order("created_at");
  let needingIssuanceQuery = supabase.from("v_checks_needing_issuance").select("*").order("created_at");
  let overdueQuery = supabase
    .from("checks")
    .select("*, bank_accounts(bank_name, account_number), departments(name)")
    .eq("status", "UNPAID")
    .not("due_date", "is", null)
    .lte("due_date", asOf)
    .order("due_date");

  if (bankFilter) {
    pendingApprovalQuery = pendingApprovalQuery.eq("bank_account_id", bankFilter);
    needingIssuanceQuery = needingIssuanceQuery.eq("bank_account_id", bankFilter);
    overdueQuery = overdueQuery.eq("bank_account_id", bankFilter);
  }

  const [
    { data: pendingApproval },
    { data: needingIssuance },
    { data: overdueByAsOf },
    { data: departments },
    { data: categories },
    { data: bankAccounts },
    { data: grants },
    { data: suppliers },
    { data: checkAllocations },
    { data: pendingConfirmations },
    { data: schedules },
  ] = await Promise.all([
    pendingApprovalQuery,
    needingIssuanceQuery,
    overdueQuery,
    supabase.from("departments").select("*").order("name"),
    supabase.from("categories").select("*").order("name"),
    supabase.from("bank_accounts").select("*, departments!bank_accounts_department_id_fkey(name)").order("bank_name"),
    supabase.from("user_department_access").select("department_id").eq("user_id", user.id),
    supabase.from("suppliers").select("name").order("name"),
    supabase.from("check_allocations").select("check_id, department_id, amount, departments(name)"),
    isAdmin ? supabase.rpc("get_pending_schedule_confirmations") : Promise.resolve({ data: [] as never[] }),
    isAdmin
      ? supabase
          .from("recurring_schedules")
          .select("*, departments(name), recurring_schedule_allocations(department_id, amount, departments(name))")
          .order("name")
      : Promise.resolve({ data: [] as never[] }),
  ]);
  const supplierNames = (suppliers ?? []).map((s) => s.name);

  const scheduleRows: ScheduleRow[] = (schedules ?? []).map((s) => {
    const row = s as unknown as {
      id: string;
      name: string;
      direction: string;
      frequency: string;
      type: string;
      day_of_month: number | null;
      day_of_week: number | null;
      one_time_date: string | null;
      expected_amount: number;
      is_active: boolean;
      end_date: string | null;
      department_id: string | null;
      bank_account_id: string | null;
      category_id: string | null;
      departments: { name: string } | null;
      recurring_schedule_allocations: { department_id: string; amount: number; departments: { name: string } | null }[];
    };
    return {
      id: row.id,
      name: row.name,
      direction: row.direction,
      frequency: row.frequency,
      type: row.type,
      day_of_month: row.day_of_month,
      day_of_week: row.day_of_week,
      one_time_date: row.one_time_date,
      expected_amount: Number(row.expected_amount),
      is_active: row.is_active,
      end_date: row.end_date,
      departmentId: row.department_id,
      bankAccountId: row.bank_account_id,
      categoryId: row.category_id,
      departmentName: row.departments?.name ?? null,
      allocations: row.recurring_schedule_allocations.map((a) => ({
        departmentId: a.department_id,
        amount: Number(a.amount),
        departmentName: a.departments?.name ?? null,
      })),
    };
  });

  const allocationsByCheck = new Map<
    string,
    { departmentId: string; departmentName: string | null; amount: number }[]
  >();
  for (const a of (checkAllocations ?? []) as unknown as {
    check_id: string;
    department_id: string;
    amount: number;
    departments: { name: string } | null;
  }[]) {
    const list = allocationsByCheck.get(a.check_id) ?? [];
    list.push({ departmentId: a.department_id, departmentName: a.departments?.name ?? null, amount: Number(a.amount) });
    allocationsByCheck.set(a.check_id, list);
  }

  // Matches a split check via its allocations too, not just a direct
  // department_id — otherwise filtering by department would silently hide
  // any check that's split across departments.
  function matchesDeptFilter(row: { id: string | null; department_id: string | null }) {
    if (!deptFilter) return true;
    if (row.department_id === deptFilter) return true;
    return (allocationsByCheck.get(row.id ?? "") ?? []).some((a) => a.departmentId === deptFilter);
  }

  const filteredPendingApproval = (pendingApproval ?? []).filter(matchesDeptFilter);
  const filteredNeedingIssuance = (needingIssuance ?? []).filter(matchesDeptFilter);
  const filteredOverdue = (overdueByAsOf ?? []).filter(matchesDeptFilter);
  const overdueTransfers = filteredOverdue.filter((c) => c.payment_method === "TRANSFER");
  const overdueChecks = filteredOverdue.filter((c) => c.payment_method !== "TRANSFER");

  // Sort primarily by check-entry date, but group same-payee rows together
  // even when their entry date is later, so an admin preparing one payee's
  // checks sees all of that payee's pending items at once.
  const sortedNeedingIssuance = (() => {
    const rows = filteredNeedingIssuance;
    const earliestByPayee = new Map<string, string>();
    for (const r of rows) {
      const key = (r.payee ?? "").trim().toLowerCase();
      const current = earliestByPayee.get(key);
      if (!current || (r.created_at ?? "") < current) earliestByPayee.set(key, r.created_at ?? "");
    }
    return [...rows].sort((a, b) => {
      const groupA = earliestByPayee.get((a.payee ?? "").trim().toLowerCase()) ?? "";
      const groupB = earliestByPayee.get((b.payee ?? "").trim().toLowerCase()) ?? "";
      if (groupA !== groupB) return groupA < groupB ? -1 : 1;
      return (a.created_at ?? "") < (b.created_at ?? "") ? -1 : 1;
    });
  })();

  const grantedIds = new Set((grants ?? []).map((g) => g.department_id));
  const myDepartments = isAdmin ? (departments ?? []) : (departments ?? []).filter((d) => grantedIds.has(d.id));

  const pendingConfirmationRows: PendingConfirmation[] = (pendingConfirmations ?? []).map((p) => {
    const row = p as unknown as {
      schedule_id: string;
      schedule_name: string;
      direction: string;
      department_id: string | null;
      department_name: string | null;
      expected_amount: number;
      period_date: string;
      is_split: boolean;
      split_allocations: { departmentId: string; departmentName: string; amount: number }[] | null;
    };
    return {
      scheduleId: row.schedule_id,
      scheduleName: row.schedule_name,
      direction: row.direction,
      departmentId: row.department_id,
      departmentName: row.department_name,
      expectedAmount: Number(row.expected_amount),
      periodDate: row.period_date,
      isSplit: row.is_split,
      splitAllocations: row.split_allocations ?? [],
    };
  });

  return (
    <div className="space-y-6">
      <datalist id="supplier-names">
        {supplierNames.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>

      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl font-bold">ניהול צ׳קים והעברות</h1>
        {isAdmin && (
          <div className="flex items-center gap-2">
            <UnifiedCheckForm bankAccounts={bankAccounts ?? []} departments={departments ?? []} />
            <PasteExistingChecksForm bankAccounts={bankAccounts ?? []} departments={departments ?? []} />
            <BankReconciliationPanel bankAccounts={bankAccounts ?? []} />
            <NewManualEntryButton departments={departments ?? []} bankAccounts={bankAccounts ?? []} />
            <InterDepartmentTransferButton departments={departments ?? []} />
            <CancelCheckNumberButton bankAccounts={bankAccounts ?? []} />
          </div>
        )}
      </div>

      <ChecksFilterBar
        deptFilter={deptFilter}
        bankFilter={bankFilter}
        asOf={asOf}
        departments={departments ?? []}
        bankAccounts={bankAccounts ?? []}
      />

      {/* Admins use "+ דרישת תשלום חדשה" above (UnifiedCheckForm) — its
          direct entry auto-approves and covers the full feature set
          (category, split, spread, skip-ledger), so this simpler,
          RLS-restricted request form is only shown to department managers,
          for whom it's the one and only way to submit a request. */}
      {!isAdmin && myDepartments.length > 0 && (
        <div className="space-y-2">
          <DeptExpenseRequestForm
            departments={myDepartments}
            bankAccounts={bankAccounts ?? []}
            canSetDates={user.profile.can_set_check_dates}
          />
          <BulkExpenseRequestFormMulti
            departments={myDepartments}
            bankAccounts={bankAccounts ?? []}
            canSetDates={user.profile.can_set_check_dates}
          />
        </div>
      )}

      {isAdmin && <ScheduleConfirmationsList pending={pendingConfirmationRows} departments={departments ?? []} />}

      {isAdmin && (
        <div id="due-checks" className="card p-4 scroll-mt-4">
          <CollapsibleSection title={<h2 className="font-semibold">צ׳קים והעברות שהגיע תאריכם ולא נפרעו</h2>}>
            <p className="text-xs text-muted mb-2">
              כל צ׳ק/העברה עם תאריך פירעון שעבר (או שווה לתאריך שנבחר) וסטטוס עדיין &quot;לא נפרע&quot;.
            </p>
            <form className="flex flex-wrap items-end gap-3 mb-3" method="get">
              <input type="hidden" name="dept" value={deptFilter} />
              <input type="hidden" name="bank" value={bankFilter} />
              <div>
                <label className="block text-sm font-medium mb-1">
                  בדוק לפי תאריך אחר (במקום היום)
                </label>
                <input
                  type="date"
                  name="asOf"
                  defaultValue={asOf}
                  className="rounded-lg border border-border bg-transparent px-3 py-2 text-sm"
                />
              </div>
              <button type="submit" className="rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold">
                סנן
              </button>
            </form>

            {overdueTransfers.length > 0 && (
              <OverdueTransfersTable
                rows={
                  overdueTransfers as unknown as {
                    id: string;
                    payee: string;
                    amount: number;
                    due_date: string;
                    bank_account_id: string;
                    departments: { name: string } | null;
                    bank_accounts: { bank_name: string; account_number: string } | null;
                  }[]
                }
                bankAccounts={bankAccounts ?? []}
              />
            )}

            {overdueChecks.length > 0 && (
              <OverdueChecksTable
                rows={
                  overdueChecks as unknown as {
                    id: string;
                    payee: string;
                    check_number: string | null;
                    amount: number;
                    due_date: string;
                    bank_account_id: string;
                    departments: { name: string } | null;
                    bank_accounts: { bank_name: string; account_number: string } | null;
                  }[]
                }
                bankAccounts={bankAccounts ?? []}
              />
            )}

            {overdueTransfers.length === 0 && overdueChecks.length === 0 && (
              <p className="text-sm text-muted">אין צ׳קים/העברות שטרם אושרו עד התאריך שנבחר</p>
            )}
          </CollapsibleSection>
        </div>
      )}

      {isAdmin && (
        <RecurringSchedulesSection
          schedules={scheduleRows}
          departments={departments ?? []}
          bankAccounts={bankAccounts ?? []}
          categories={categories ?? []}
        />
      )}

      {sortedNeedingIssuance.length > 0 && isAdmin && (
        <div id="issuance-queue" className="card p-4 border-warning/40 scroll-mt-4">
          <CollapsibleSection
            title={
              <h2 className="font-semibold">
                ⚠ {sortedNeedingIssuance.length} צ׳קים להנפקה (יש להם תאריך, חסר מספר צ׳ק)
              </h2>
            }
          >
            <p className="text-xs text-muted mb-2">
              ממוין לפי תאריך הזנה, עם קיבוץ של אותו ספק יחד. ניתן לסמן כמה שורות ולמזג לתשלום אחד או לקבץ לפריסה.
            </p>
            <IssuanceQueueTable
              rows={sortedNeedingIssuance}
              departments={departments ?? []}
              bankAccounts={bankAccounts ?? []}
              allocationsByCheck={allocationsByCheck}
            />
          </CollapsibleSection>
        </div>
      )}

      {filteredPendingApproval.length > 0 && (
        <div className="card p-4">
          <CollapsibleSection title={<h2 className="font-semibold">דרישות תשלום ממתינות לאישור (לא משפיעות על התחזית)</h2>}>
            {isAdmin && (
              <p className="text-xs text-muted mb-2">
                קביעת תאריך כאן מאשרת את הבקשה. עבור צ׳ק ללא מספר היא תעבור למסך &quot;צ׳קים להנפקה&quot; למעלה; עבור
                העברה, או צ׳ק עם מספר, היא תמתין לביצוע בתאריך שנקבע.
              </p>
            )}
            <PendingApprovalTable
              rows={filteredPendingApproval}
              isAdmin={isAdmin}
              bankAccounts={bankAccounts ?? []}
              allocationsByCheck={allocationsByCheck}
            />
          </CollapsibleSection>
        </div>
      )}

    </div>
  );
}
