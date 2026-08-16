import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { formatCurrency, formatDate } from "@/lib/format";
import {
  ClassifyCheckRow,
  CheckStatusControls,
  DeptExpenseRequestForm,
  EditDeleteCheckRow,
  IssueCheckRow,
  NewCheckForm,
  VerifyTransferButton,
} from "@/components/checks-client";
import { PasteExistingChecksForm } from "@/components/checks-paste-client";
import { PaymentSpreadForm } from "@/components/payment-spread-client";

export default async function ChecksPage() {
  const user = await requireUser();
  const isAdmin = user.profile.role === "FINANCE_ADMIN";
  const supabase = await createClient();

  const [
    { data: pendingChecks },
    { data: pendingApproval },
    { data: needingIssuance },
    { data: transfersNeedingVerification },
    { data: checks },
    { data: departments },
    { data: categories },
    { data: bankAccounts },
    { data: grants },
    { data: suppliers },
  ] = await Promise.all([
    supabase.from("v_pending_checks").select("*").order("due_date"),
    supabase.from("v_checks_pending_approval").select("*").order("created_at"),
    supabase.from("v_checks_needing_issuance").select("*").order("created_at"),
    supabase.from("v_transfers_needing_verification").select("*").order("due_date"),
    supabase
      .from("checks")
      .select("*, bank_accounts(bank_name, account_number), departments(name)")
      .order("due_date", { ascending: false })
      .limit(200),
    supabase.from("departments").select("*").order("name"),
    supabase.from("categories").select("*").order("name"),
    supabase.from("bank_accounts").select("*, departments(name)").order("bank_name"),
    supabase.from("user_department_access").select("department_id").eq("user_id", user.id),
    supabase.from("suppliers").select("name").order("name"),
  ]);
  const supplierNames = (suppliers ?? []).map((s) => s.name);

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
            <NewCheckForm bankAccounts={bankAccounts ?? []} departments={departments ?? []} categories={categories ?? []} />
            <PaymentSpreadForm bankAccounts={bankAccounts ?? []} departments={departments ?? []} />
            <PasteExistingChecksForm bankAccounts={bankAccounts ?? []} departments={departments ?? []} />
          </div>
        )}
      </div>

      {myDepartments.length > 0 && (
        <DeptExpenseRequestForm
          departments={myDepartments}
          bankAccounts={bankAccounts ?? []}
          canSetDates={isAdmin || user.profile.can_set_check_dates}
        />
      )}

      {(transfersNeedingVerification ?? []).length > 0 && isAdmin && (
        <div className="card p-4 border-warning/40">
          <h2 className="font-semibold mb-1">
            ⚠ {transfersNeedingVerification!.length} העברות שתאריכן עבר טרם אושרו כבוצעו
          </h2>
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
              {transfersNeedingVerification!.map((t) => (
                <tr key={t.id!}>
                  <td>{t.payee}</td>
                  <td>{formatCurrency(Number(t.amount))}</td>
                  <td>{formatDate(t.due_date!)}</td>
                  <td>{t.department_name ?? "בהמתנה"}</td>
                  <td>
                    <VerifyTransferButton checkId={t.id!} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(needingIssuance ?? []).length > 0 && isAdmin && (
        <div className="card p-4 border-warning/40">
          <h2 className="font-semibold mb-1">
            ⚠ {needingIssuance!.length} בקשות הוצאה ממתינות להנפקה (חסר מספר צ׳ק ו/או תאריך)
          </h2>
          <table className="data-table">
            <thead>
              <tr>
                <th>מוטב</th>
                <th>סכום</th>
                <th>מחלקה</th>
                <th>אמצעי</th>
                <th>הנפקה</th>
              </tr>
            </thead>
            <tbody>
              {needingIssuance!.map((c) => (
                <tr key={c.id!}>
                  <td>{c.payee}</td>
                  <td>{formatCurrency(Number(c.amount))}</td>
                  <td>{c.department_name ?? "בהמתנה"}</td>
                  <td>{c.payment_method === "TRANSFER" ? "העברה" : "צ׳ק"}</td>
                  <td>
                    <IssueCheckRow
                      checkId={c.id!}
                      currentCheckNumber={c.check_number}
                      currentDueDate={c.due_date}
                      amount={Number(c.amount)}
                      departments={departments ?? []}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(pendingApproval ?? []).length > 0 && (
        <div className="card p-4">
          <h2 className="font-semibold mb-1">הוצאות ממתינות לאישור (ללא תאריך — לא משפיעות על התחזית)</h2>
          {isAdmin && (
            <p className="text-xs text-muted mb-2">
              קביעת תאריך כאן מאשרת את הבקשה ומעבירה אותה מיד למסך &quot;צ׳קים להנפקה&quot; למטה.
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
                  <td>{c.department_name ?? "בהמתנה"}</td>
                  <td>{c.notes ?? "—"}</td>
                  {isAdmin && (
                    <td>
                      <IssueCheckRow
                        checkId={c.id!}
                        currentCheckNumber={c.check_number}
                        currentDueDate={c.due_date}
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
        <h2 className="font-semibold mb-3">כל הצ׳קים וההעברות</h2>
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
                  </td>
                  <td>{formatCurrency(Number(row.amount))}</td>
                  <td>{row.due_date ? formatDate(row.due_date) : <span className="text-muted">ללא תאריך</span>}</td>
                  <td>
                    {row.bank_accounts?.bank_name} ({row.bank_accounts?.account_number})
                  </td>
                  <td>
                    {row.departments?.name ?? <span className="text-warning">בהמתנה</span>}
                    {row.skip_department_ledger && (
                      <span className="badge bg-background text-muted mr-1">חוץ מהמאזן הפנימי</span>
                    )}
                  </td>
                  <td>
                    <CheckStatusControls checkId={row.id} status={row.status} />
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
