import { requireFinanceAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

// Hebrew labels for every table wired to the generic audit trigger
// (fin_72_generic_audit_log) — kept here rather than in the DB so the list
// filter always matches exactly what's actually being logged.
const TABLE_LABELS: Record<string, string> = {
  bank_accounts: "חשבונות בנק",
  bank_transactions: "תנועות בנק (יבוא/התאמה)",
  categories: "קטגוריות",
  check_allocations: "פיצול צ׳קים בין מחלקות",
  checks: "צ׳קים והעברות",
  credit_commission_entries: "עמלת אשראי",
  departments: "מחלקות",
  expected_incomes: "הכנסות צפויות",
  incomes: "הכנסות",
  inter_department_ledger: "יתרות בין-מחלקתיות",
  manual_department_entries: "רישומים ידניים",
  payment_spreads: "פריסות תשלום",
  recurring_schedule_allocations: "פיצול הוראות קבע",
  recurring_schedules: "הוראות קבע",
  suppliers: "ספקים",
  user_department_access: "הרשאות גישה למחלקות",
  user_profiles: "משתמשים",
};

const ACTION_LABELS: Record<string, string> = { INSERT: "נוצר", UPDATE: "עודכן", DELETE: "נמחק" };

type AuditRow = {
  id: number;
  occurred_at: string;
  table_name: string;
  row_id: string | null;
  action: string;
  changed_columns: string[] | null;
  old_data: unknown;
  new_data: unknown;
  user_profiles: { full_name: string | null } | null;
};

const PAGE_SIZE = 300;

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<{ table?: string; action?: string; actor?: string; start?: string; end?: string }>;
}) {
  await requireFinanceAdmin();
  const { table, action, actor, start, end } = await searchParams;
  const supabase = await createClient();

  let query = supabase
    .from("audit_log")
    .select("id, occurred_at, table_name, row_id, action, changed_columns, old_data, new_data, user_profiles(full_name)")
    .order("occurred_at", { ascending: false })
    .limit(PAGE_SIZE);

  if (table) query = query.eq("table_name", table);
  if (action) query = query.eq("action", action);
  if (actor) query = query.eq("actor_id", actor);
  if (start) query = query.gte("occurred_at", `${start}T00:00:00`);
  if (end) query = query.lte("occurred_at", `${end}T23:59:59`);

  const [{ data: rows }, { data: profiles }] = await Promise.all([
    query,
    supabase.from("user_profiles").select("id, full_name").order("full_name"),
  ]);

  const hasFilter = Boolean(table || action || actor || start || end);
  const auditRows = (rows ?? []) as unknown as AuditRow[];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">יומן ביקורת — כל הפעולות במערכת</h1>
        <p className="text-sm text-muted mt-1">
          כל יצירה, עדכון או מחיקה בטבלאות הפיננסיות ובהרשאות מתועדת כאן — מי, מתי, ומה בדיוק השתנה. מציג רק שינויים
          מהרגע שהיומן הופעל (25.8.2026) — לא ניתן לשחזר מה שקרה לפני כן.
        </p>
      </div>

      <form className="card p-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs text-muted mb-1">טבלה</label>
          <select
            name="table"
            defaultValue={table ?? ""}
            className="rounded border border-border bg-transparent px-2 py-1.5 text-sm"
          >
            <option value="">הכל</option>
            {Object.entries(TABLE_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-muted mb-1">פעולה</label>
          <select
            name="action"
            defaultValue={action ?? ""}
            className="rounded border border-border bg-transparent px-2 py-1.5 text-sm"
          >
            <option value="">הכל</option>
            <option value="INSERT">נוצר</option>
            <option value="UPDATE">עודכן</option>
            <option value="DELETE">נמחק</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-muted mb-1">משתמש</label>
          <select
            name="actor"
            defaultValue={actor ?? ""}
            className="rounded border border-border bg-transparent px-2 py-1.5 text-sm"
          >
            <option value="">הכל</option>
            {(profiles ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name ?? p.id}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-muted mb-1">מתאריך</label>
          <input
            type="date"
            name="start"
            defaultValue={start ?? ""}
            className="rounded border border-border bg-transparent px-2 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-muted mb-1">עד תאריך</label>
          <input
            type="date"
            name="end"
            defaultValue={end ?? ""}
            className="rounded border border-border bg-transparent px-2 py-1.5 text-sm"
          />
        </div>
        <button type="submit" className="rounded-lg bg-primary text-primary-foreground px-4 py-1.5 text-sm font-semibold">
          סנן
        </button>
        {hasFilter && (
          <a href="/audit-log" className="text-xs text-primary underline">
            נקה סינון
          </a>
        )}
      </form>

      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>מתי</th>
                <th>מי</th>
                <th>טבלה</th>
                <th>פעולה</th>
                <th>שדות ששונו</th>
                <th>פרטים</th>
              </tr>
            </thead>
            <tbody>
              {auditRows.map((r) => (
                <tr key={r.id}>
                  <td className="text-xs whitespace-nowrap">{new Date(r.occurred_at).toLocaleString("he-IL")}</td>
                  <td className="text-xs whitespace-nowrap">{r.user_profiles?.full_name ?? "מערכת"}</td>
                  <td className="text-xs whitespace-nowrap">{TABLE_LABELS[r.table_name] ?? r.table_name}</td>
                  <td>
                    <span
                      className={`badge ${
                        r.action === "DELETE"
                          ? "bg-danger-bg text-danger"
                          : r.action === "INSERT"
                            ? "bg-success-bg text-success"
                            : "bg-background text-muted"
                      }`}
                    >
                      {ACTION_LABELS[r.action] ?? r.action}
                    </span>
                  </td>
                  <td className="text-xs">{(r.changed_columns ?? []).join(", ") || "—"}</td>
                  <td>
                    <details>
                      <summary className="cursor-pointer text-xs text-primary">פרטים</summary>
                      <pre className="text-xs bg-background rounded p-2 mt-1 max-w-md overflow-auto" dir="ltr">
                        {JSON.stringify({ row_id: r.row_id, old: r.old_data, new: r.new_data }, null, 2)}
                      </pre>
                    </details>
                  </td>
                </tr>
              ))}
              {auditRows.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center text-muted py-6">
                    אין רשומות תואמות לסינון
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      {auditRows.length === PAGE_SIZE && (
        <p className="text-xs text-muted">
          מוצגות {PAGE_SIZE} הרשומות האחרונות התואמות לסינון — צמצמו את הסינון (למשל לפי טווח תאריכים) כדי לראות רשומות
          ישנות יותר.
        </p>
      )}
    </div>
  );
}
