import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { formatCurrency, formatDate } from "@/lib/format";
import {
  ClassifyCheckRow,
  CheckStatusControls,
  DeptExpenseRequestForm,
  EditDeleteCheckRow,
  IssueCheckRow,
  VerifyTransferButton,
} from "@/components/checks-client";
import { PasteExistingChecksForm } from "@/components/checks-paste-client";
import { UnifiedCheckForm } from "@/components/unified-check-form";
import { BulkCheckEntryForm, BulkExpenseRequestFormMulti } from "@/components/bulk-checks-client";
import { IssuanceQueueTable } from "@/components/issuance-queue-client";
import { BankReconciliationPanel } from "@/components/bank-reconciliation-client";

export default async function ChecksPage({
  searchParams,
}: {
  searchParams: Promise<{ asOf?: string; q?: string; pm?: string; st?: string }>;
}) {
  const { asOf: asOfParam, q: qParam, pm: pmParam, st: stParam } = await searchParams;
  const asOf = asOfParam || new Date().toISOString().slice(0, 10);
  const q = (qParam ?? "").trim();
  const pmFilter = pmParam === "CHECK" || pmParam === "TRANSFER" ? pmParam : "ALL";
  const stFilter = ["UNPAID", "CLEARED", "CANCELLED"].includes(stParam ?? "") ? stParam! : "ALL";

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
  let allChecksQuery = supabase
    .from("checks")
    .select("*, bank_accounts(bank_name, account_number), departments(name)")
    .order("due_date", { ascending: false })
    .limit(200);

  if (q) {
    pendingApprovalQuery = pendingApprovalQuery.or(`payee.ilike.%${q}%,notes.ilike.%${q}%`);
    needingIssuanceQuery = needingIssuanceQuery.or(`payee.ilike.%${q}%,notes.ilike.%${q}%`);
    overdueQuery = overdueQuery.or(`payee.ilike.%${q}%,notes.ilike.%${q}%`);
    allChecksQuery = allChecksQuery.or(`payee.ilike.%${q}%,notes.ilike.%${q}%`);
  }
  if (pmFilter !== "ALL") allChecksQuery = allChecksQuery.eq("payment_method", pmFilter);
  if (stFilter !== "ALL") allChecksQuery = allChecksQuery.eq("status", stFilter);

  const [
    { data: pendingChecks },
    { data: pendingApproval },
    { data: needingIssuance },
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
  const overdueTransfers = (overdueByAsOf ?? []).filter((c) => c.payment_method === "TRANSFER");
  const overdueChecks = (overdueByAsOf ?? []).filter((c) => c.payment_method !== "TRANSFER");

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

  // Sort primarily by check-entry date, but group same-payee rows together
  // even when their entry date is later, so an admin preparing one payee's
  // checks sees all of that payee's pending items at once.
  const sortedNeedingIssuance = (() => {
    const rows = needingIssuance ?? [];
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

  // Shared so every list on this page shows a split check's real
  // department breakdown instead of a bare "בהמתנה" that looks unclassified.
  function departmentCell(checkId: string, departmentName: string | null) {
    if (departmentName) return departmentName;
    const allocations = allocationsByCheck.get(checkId);
    if (allocations) {
      return (
        <span className="text-xs">
          מפוצל: {allocations.map((a) => `${a.departmentName ?? "?"} (${formatCurrency(a.amount)})`).join(", ")}
        </span>
      );
    }
    return <span className="text-warning">בהמתנה</span>;
  }

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
            <BulkCheckEntryForm bankAccounts={bankAccounts ?? []} departments={departments ?? []} />
            <PasteExistingChecksForm bankAccounts={bankAccounts ?? []} departments={departments ?? []} />
            <BankReconciliationPanel bankAccounts={bankAccounts ?? []} />
            <a href="/settings#recurring-schedules" className="rounded-lg border border-border px-4 py-2 text-sm font-semibold">
              + הוראת קבע חדשה
            </a>
          </div>
        )}
      </div>

      <form className="flex items-center gap-2" method="get">
        <input type="hidden" name="asOf" value={asOf} />
        <input type="hidden" name="pm" value={pmFilter} />
        <input type="hidden" name="st" value={stFilter} />
        <input
          name="q"
          defaultValue={q}
          placeholder="חיפוש לפי מוטב / הערות — בכל הרשימות בעמוד"
          className="w-full max-w-sm rounded-lg border border-border bg-transparent px-3 py-2 text-sm"
        />
        <button type="submit" className="rounded-lg border border-border px-4 py-2 text-sm font-semibold">
          חיפוש
        </button>
        {q && (
          <a href="/checks" className="text-sm text-muted underline">
            נקה
          </a>
        )}
      </form>

      {myDepartments.length > 0 && (
        <div className="space-y-2">
          <DeptExpenseRequestForm
            departments={myDepartments}
            bankAccounts={bankAccounts ?? []}
            canSetDates={isAdmin || user.profile.can_set_check_dates}
          />
          <BulkExpenseRequestFormMulti
            departments={myDepartments}
            bankAccounts={bankAccounts ?? []}
            canSetDates={isAdmin || user.profile.can_set_check_dates}
          />
        </div>
      )}

      {isAdmin && (
        <div className="card p-4">
          <form className="flex flex-wrap items-end gap-3 mb-3" method="get">
            <input type="hidden" name="q" value={q} />
            <div>
              <label className="block text-sm font-medium mb-1">
                צ׳קים / העברות שהיו אמורים להתבצע עד תאריך
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
            <div className="mb-4">
              <h2 className="font-semibold mb-1">⚠ {overdueTransfers.length} העברות שטרם אושרו כבוצעו</h2>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>מוטב</th>
                    <th>סכום</th>
                    <th>תאריך</th>
                    <th>מחלקה</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {overdueTransfers.map((t) => {
                    const row = t as unknown as { id: string; payee: string; amount: number; due_date: string; departments: { name: string } | null };
                    return (
                      <tr key={row.id}>
                        <td>{row.payee}</td>
                        <td>{formatCurrency(Number(row.amount))}</td>
                        <td>{formatDate(row.due_date)}</td>
                        <td>{row.departments?.name ?? "בהמתנה"}</td>
                        <td>
                          <VerifyTransferButton checkId={row.id} label="אשר שההעברה בוצעה" captureInternalBeneficiary />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {overdueChecks.length > 0 && (
            <div>
              <h2 className="font-semibold mb-1">⚠ {overdueChecks.length} צ׳קים שטרם אושרו כנפרעו</h2>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>מוטב</th>
                    <th>מס׳ צ׳ק</th>
                    <th>סכום</th>
                    <th>תאריך</th>
                    <th>מחלקה</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {overdueChecks.map((c) => {
                    const row = c as unknown as {
                      id: string;
                      payee: string;
                      check_number: string | null;
                      amount: number;
                      due_date: string;
                      departments: { name: string } | null;
                    };
                    return (
                      <tr key={row.id}>
                        <td>{row.payee}</td>
                        <td>{row.check_number ?? "—"}</td>
                        <td>{formatCurrency(Number(row.amount))}</td>
                        <td>{formatDate(row.due_date)}</td>
                        <td>{row.departments?.name ?? "בהמתנה"}</td>
                        <td>
                          <VerifyTransferButton checkId={row.id} label="סמן כנפרע" />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {overdueTransfers.length === 0 && overdueChecks.length === 0 && (
            <p className="text-sm text-muted">אין צ׳קים/העברות שטרם אושרו עד התאריך שנבחר</p>
          )}
        </div>
      )}

      {sortedNeedingIssuance.length > 0 && isAdmin && (
        <div className="card p-4 border-warning/40">
          <h2 className="font-semibold mb-1">
            ⚠ {sortedNeedingIssuance.length} צ׳קים להנפקה (יש להם תאריך, חסר מספר צ׳ק)
          </h2>
          <p className="text-xs text-muted mb-2">
            ממוין לפי תאריך הזנה, עם קיבוץ של אותו ספק יחד. ניתן לסמן כמה שורות ולמזג לתשלום אחד או לקבץ לפריסה.
          </p>
          <IssuanceQueueTable
            rows={sortedNeedingIssuance}
            departments={departments ?? []}
            allocationsByCheck={allocationsByCheck}
          />
        </div>
      )}

      {(pendingApproval ?? []).length > 0 && (
        <div className="card p-4">
          <h2 className="font-semibold mb-1">הוצאות לתשלום — ממתינות לאישור/תאריך (לא משפיעות על התחזית)</h2>
          {isAdmin && (
            <p className="text-xs text-muted mb-2">
              קביעת תאריך כאן מאשרת את הבקשה. עבור צ׳ק ללא מספר היא תעבור למסך &quot;צ׳קים להנפקה&quot; למעלה; עבור
              העברה, או צ׳ק עם מספר, היא תמתין לביצוע בתאריך שנקבע.
            </p>
          )}
          <table className="data-table">
            <thead>
              <tr>
                <th>מוטב</th>
                <th>סכום</th>
                <th>מחלקה</th>
                <th>הערות</th>
                {isAdmin && <th>אישור</th>}
              </tr>
            </thead>
            <tbody>
              {pendingApproval!.map((c) => (
                <tr key={c.id!}>
                  <td>{c.payee}</td>
                  <td>{formatCurrency(Number(c.amount))}</td>
                  <td>{departmentCell(c.id!, c.department_name)}</td>
                  <td>{c.notes ?? "—"}</td>
                  {isAdmin && (
                    <td>
                      <IssueCheckRow
                        checkId={c.id!}
                        currentCheckNumber={c.check_number}
                        currentDueDate={c.due_date}
                        currentPaymentMethod={c.payment_method ?? undefined}
                        amount={Number(c.amount)}
                        departments={departments ?? []}
                      />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(pendingChecks ?? []).length > 0 && isAdmin && (
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
      )}

      <div className="card p-4 overflow-x-auto">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
          <h2 className="font-semibold">כל הצ׳קים וההעברות</h2>
          <form className="flex items-center gap-2" method="get">
            <input type="hidden" name="q" value={q} />
            <input type="hidden" name="asOf" value={asOf} />
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
        <table className="data-table">
          <thead>
            <tr>
              <th>אמצעי</th>
              <th>מס׳ צ׳ק</th>
              <th>מוטב</th>
              <th>סכום</th>
              <th>תאריך פירעון</th>
              <th>חשבון</th>
              <th>מחלקה</th>
              <th>סטטוס</th>
              {isAdmin && <th></th>}
            </tr>
          </thead>
          <tbody>
            {(checks ?? []).map((c) => {
              const row = c as unknown as {
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
              };
              return (
                <tr key={row.id}>
                  <td>{row.payment_method === "TRANSFER" ? "העברה" : "צ׳ק"}</td>
                  <td>{row.check_number ?? "—"}</td>
                  <td>
                    {row.payee}
                    {row.spread_id && <span className="badge bg-background text-muted mr-1">פריסה</span>}
                    {row.internal_beneficiary && (
                      <div className="text-xs text-muted">מוטב פנימי: {row.internal_beneficiary}</div>
                    )}
                  </td>
                  <td>{formatCurrency(Number(row.amount))}</td>
                  <td>{row.due_date ? formatDate(row.due_date) : <span className="text-muted">ללא תאריך</span>}</td>
                  <td>
                    {row.bank_accounts?.bank_name} ({row.bank_accounts?.account_number})
                  </td>
                  <td>
                    {departmentCell(row.id, row.departments?.name ?? null)}
                    {row.skip_department_ledger && (
                      <span className="badge bg-background text-muted mr-1">חוץ מהמאזן הפנימי</span>
                    )}
                  </td>
                  <td>
                    <CheckStatusControls checkId={row.id} status={row.status} paymentMethod={row.payment_method} />
                  </td>
                  {isAdmin && (
                    <td>
                      <EditDeleteCheckRow
                        checkId={row.id}
                        payee={row.payee}
                        amount={Number(row.amount)}
                        dueDate={row.due_date}
                        checkNumber={row.check_number}
                        departmentId={row.department_id}
                        notes={row.notes}
                        paymentMethod={row.payment_method}
                        existingAllocations={(allocationsByCheck.get(row.id) ?? []).map((a) => ({
                          departmentId: a.departmentId,
                          amount: a.amount,
                        }))}
                        departments={departments ?? []}
                      />
                    </td>
                  )}
                </tr>
              );
            })}
            {(checks ?? []).length === 0 && (
              <tr>
                <td colSpan={isAdmin ? 9 : 8} className="text-center text-muted py-6">
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
