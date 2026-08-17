import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import {
  ClassifyCheckRow,
  DeptExpenseRequestForm,
} from "@/components/checks-client";
import { PasteExistingChecksForm } from "@/components/checks-paste-client";
import { UnifiedCheckForm } from "@/components/unified-check-form";
import { BulkExpenseRequestFormMulti } from "@/components/bulk-checks-client";
import { IssuanceQueueTable } from "@/components/issuance-queue-client";
import { BankReconciliationPanel } from "@/components/bank-reconciliation-client";
import { ChecksFilterBar } from "@/components/checks-filter-bar";
import {
  AllChecksTable,
  CollapsibleSection,
  IssuedChecksTable,
  OverdueChecksTable,
  OverdueTransfersTable,
  PendingApprovalTable,
  TransfersPendingExecutionTable,
} from "@/components/checks-sections-client";
import { formatCurrency, formatDate } from "@/lib/format";

export default async function ChecksPage({
  searchParams,
}: {
  searchParams: Promise<{ asOf?: string; pm?: string; st?: string; dept?: string; bank?: string }>;
}) {
  const { asOf: asOfParam, pm: pmParam, st: stParam, dept: deptParam, bank: bankParam } = await searchParams;
  const asOf = asOfParam || new Date().toISOString().slice(0, 10);
  const pmFilter = pmParam === "CHECK" || pmParam === "TRANSFER" ? pmParam : "ALL";
  const stFilter = ["UNPAID", "CLEARED", "CANCELLED"].includes(stParam ?? "") ? stParam! : "ALL";
  const deptFilter = deptParam ?? "";
  const bankFilter = bankParam ?? "";

  const user = await requireUser();
  const isAdmin = user.profile.role === "FINANCE_ADMIN";
  const supabase = await createClient();

  let pendingApprovalQuery = supabase.from("v_checks_pending_approval").select("*").order("created_at");
  let needingIssuanceQuery = supabase.from("v_checks_needing_issuance").select("*").order("created_at");
  let issuedQuery = supabase.from("v_checks_issued").select("*").order("due_date");
  let transfersPendingExecutionQuery = supabase.from("v_transfers_pending_execution").select("*").order("due_date");
  let overdueQuery = supabase
    .from("checks")
    .select("*, bank_accounts(bank_name, account_number), departments(name)")
    .eq("status", "UNPAID")
    .not("due_date", "is", null)
    .lte("due_date", asOf)
    .order("due_date");
  let allChecksQuery = supabase
    .from("checks")
    .select("*, bank_accounts(bank_name, account_number), departments(name)")
    .order("due_date", { ascending: false })
    .limit(200);

  if (pmFilter !== "ALL") allChecksQuery = allChecksQuery.eq("payment_method", pmFilter);
  if (stFilter !== "ALL") allChecksQuery = allChecksQuery.eq("status", stFilter);
  if (bankFilter) {
    pendingApprovalQuery = pendingApprovalQuery.eq("bank_account_id", bankFilter);
    needingIssuanceQuery = needingIssuanceQuery.eq("bank_account_id", bankFilter);
    issuedQuery = issuedQuery.eq("bank_account_id", bankFilter);
    transfersPendingExecutionQuery = transfersPendingExecutionQuery.eq("bank_account_id", bankFilter);
    overdueQuery = overdueQuery.eq("bank_account_id", bankFilter);
    allChecksQuery = allChecksQuery.eq("bank_account_id", bankFilter);
  }

  const [
    { data: pendingChecks },
    { data: pendingApproval },
    { data: needingIssuance },
    { data: issuedChecks },
    { data: transfersPendingExecution },
    { data: overdueByAsOf },
    { data: checks },
    { data: departments },
    { data: categories },
    { data: bankAccounts },
    { data: grants },
    { data: suppliers },
    { data: checkAllocations },
  ] = await Promise.all([
    supabase.from("v_pending_checks").select("*").order("due_date"),
    pendingApprovalQuery,
    needingIssuanceQuery,
    issuedQuery,
    transfersPendingExecutionQuery,
    overdueQuery,
    allChecksQuery,
    supabase.from("departments").select("*").order("name"),
    supabase.from("categories").select("*").order("name"),
    supabase.from("bank_accounts").select("*, departments(name)").order("bank_name"),
    supabase.from("user_department_access").select("department_id").eq("user_id", user.id),
    supabase.from("suppliers").select("name").order("name"),
    supabase.from("check_allocations").select("check_id, department_id, amount, departments(name)"),
  ]);
  const supplierNames = (suppliers ?? []).map((s) => s.name);

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
  const filteredIssued = (issuedChecks ?? []).filter(matchesDeptFilter);
  const filteredTransfersPendingExecution = (transfersPendingExecution ?? []).filter(matchesDeptFilter);
  const filteredChecks = (checks ?? []).filter(matchesDeptFilter);
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
            <UnifiedCheckForm bankAccounts={bankAccounts ?? []} departments={departments ?? []} categories={categories ?? []} />
            <PasteExistingChecksForm bankAccounts={bankAccounts ?? []} departments={departments ?? []} />
            <BankReconciliationPanel bankAccounts={bankAccounts ?? []} />
          </div>
        )}
      </div>

      <ChecksFilterBar
        deptFilter={deptFilter}
        bankFilter={bankFilter}
        asOf={asOf}
        pmFilter={pmFilter}
        stFilter={stFilter}
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

      {isAdmin && (
        <div className="card p-4">
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
                    departments: { name: string } | null;
                    bank_accounts: { bank_name: string; account_number: string } | null;
                  }[]
                }
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
                    departments: { name: string } | null;
                    bank_accounts: { bank_name: string; account_number: string } | null;
                  }[]
                }
              />
            )}

            {overdueTransfers.length === 0 && overdueChecks.length === 0 && (
              <p className="text-sm text-muted">אין צ׳קים/העברות שטרם אושרו עד התאריך שנבחר</p>
            )}
          </CollapsibleSection>
        </div>
      )}

      {sortedNeedingIssuance.length > 0 && isAdmin && (
        <div className="card p-4 border-warning/40">
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
            <PendingApprovalTable rows={filteredPendingApproval} isAdmin={isAdmin} allocationsByCheck={allocationsByCheck} />
          </CollapsibleSection>
        </div>
      )}

      {filteredIssued.length > 0 && isAdmin && (
        <div className="card p-4">
          <CollapsibleSection title={<h2 className="font-semibold">צ׳קים שהונפקו — עם מספר לתאריך</h2>}>
            <IssuedChecksTable rows={filteredIssued} departments={departments ?? []} allocationsByCheck={allocationsByCheck} />
          </CollapsibleSection>
        </div>
      )}

      {filteredTransfersPendingExecution.length > 0 && isAdmin && (
        <div className="card p-4">
          <CollapsibleSection title={<h2 className="font-semibold">העברות שאושרו עם תאריך — ועוד לא שולמו</h2>}>
            <TransfersPendingExecutionTable
              rows={filteredTransfersPendingExecution}
              departments={departments ?? []}
              allocationsByCheck={allocationsByCheck}
            />
          </CollapsibleSection>
        </div>
      )}

      {(pendingChecks ?? []).length > 0 && isAdmin && (
        <div className="card p-4 border-warning/40">
          <CollapsibleSection
            title={<h2 className="font-semibold">⚠ ישנם {pendingChecks!.length} צ׳קים הדורשים סיווג מחלקה</h2>}
          >
            <p className="text-sm text-muted mb-3">
              עד לסיווג, צ׳קים אלו מחושבים במאזן הכללי תחת &quot;הוצאות כלליות / לא מסווגות&quot;.
            </p>
            <div className="overflow-x-auto">
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
                    <td>{c.due_date ? formatDate(c.due_date) : "—"}</td>
                    <td>
                      {c.bank_name} ({c.account_number})
                    </td>
                    <td>
                      <ClassifyCheckRow checkId={c.id!} departments={departments ?? []} categories={categories ?? []} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </CollapsibleSection>
        </div>
      )}

      <div className="card p-4 overflow-x-auto">
        <CollapsibleSection
          title={
            <div className="flex items-center justify-between flex-wrap gap-2 w-full">
              <h2 className="font-semibold">כל הצ׳קים וההעברות</h2>
              <form className="flex items-center gap-2" method="get">
                <input type="hidden" name="asOf" value={asOf} />
                <input type="hidden" name="dept" value={deptFilter} />
                <input type="hidden" name="bank" value={bankFilter} />
                <select name="pm" defaultValue={pmFilter} className="rounded-lg border border-border bg-transparent px-2 py-1 text-sm">
                  <option value="ALL">צ׳קים והעברות</option>
                  <option value="CHECK">צ׳קים בלבד</option>
                  <option value="TRANSFER">העברות בלבד</option>
                </select>
                <select name="st" defaultValue={stFilter} className="rounded-lg border border-border bg-transparent px-2 py-1 text-sm">
                  <option value="ALL">כל הסטטוסים</option>
                  <option value="UNPAID">לא נפרע</option>
                  <option value="CLEARED">נפרע</option>
                  <option value="CANCELLED">בוטל</option>
                </select>
                <button type="submit" className="rounded-lg border border-border px-3 py-1.5 text-sm font-semibold">
                  סנן
                </button>
              </form>
            </div>
          }
        >
          <AllChecksTable
            rows={
              filteredChecks as unknown as {
                id: string;
                check_number: string | null;
                payee: string;
                amount: number;
                due_date: string | null;
                status: string;
                payment_method: string;
                department_id: string | null;
                notes: string | null;
                skip_department_ledger: boolean;
                spread_id: string | null;
                internal_beneficiary: string | null;
                bank_accounts: { bank_name: string; account_number: string } | null;
                departments: { name: string } | null;
              }[]
            }
            isAdmin={isAdmin}
            departments={departments ?? []}
            allocationsByCheck={allocationsByCheck}
          />
        </CollapsibleSection>
      </div>
    </div>
  );
}
