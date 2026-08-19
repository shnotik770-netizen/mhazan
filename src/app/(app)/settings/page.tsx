import Link from "next/link";
import { requireFinanceAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatCurrency, daysAgoLabel } from "@/lib/format";
import { NewUserForm, UserAccessRow } from "@/components/user-access-client";
import { createBankAccount } from "./actions";

export default async function SettingsPage() {
  await requireFinanceAdmin();
  const supabase = await createClient();

  const [
    { data: departments },
    { data: bankAccounts },
    { data: categories },
    { data: profiles },
    { data: accessGrants },
  ] = await Promise.all([
    supabase.from("departments").select("*").order("name"),
    supabase.from("bank_accounts").select("*, departments!bank_accounts_department_id_fkey(name)").order("bank_name"),
    supabase.from("categories").select("*, departments(name)").order("name"),
    supabase.from("user_profiles").select("*").order("full_name"),
    supabase.from("user_department_access").select("user_id, department_id"),
  ]);

  const grantsFor = (userId: string) =>
    (accessGrants ?? []).filter((g) => g.user_id === userId).map((g) => g.department_id);

  return (
    <div className="space-y-8">
      <h1 className="text-xl font-bold">הגדרות מערכת</h1>

      <section className="card p-4 flex items-center justify-between">
        <div>
          <h2 className="font-semibold">מחלקות</h2>
          <p className="text-sm text-muted">
            {(departments ?? []).length} מחלקות מוגדרות. הוספה, עריכה ומחיקה מתבצעות במסך ניהול המחלקות.
          </p>
        </div>
        <Link
          href="/departments"
          className="rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold whitespace-nowrap"
        >
          ניהול מחלקות
        </Link>
      </section>

      <section className="card p-4 space-y-3">
        <h2 className="font-semibold">חשבונות בנק</h2>
        <div className="overflow-x-auto">
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
                <td>
                  {formatCurrency(Number(b.current_balance))}
                  <div className="text-xs text-muted">{daysAgoLabel(b.balance_as_of)}</div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        <form action={createBankAccount} className="flex flex-wrap gap-2 pt-2">
          <select name="department_id" required className="rounded border border-border bg-transparent px-2 py-1 text-sm">
            <option value="">מחלקה...</option>
            {(departments ?? []).map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          <input name="bank_name" placeholder="שם בנק" required className="rounded border border-border bg-transparent px-2 py-1 text-sm" />
          <input name="account_number" placeholder="מספר חשבון" required className="rounded border border-border bg-transparent px-2 py-1 text-sm" />
          <input name="current_balance" type="number" placeholder="יתרת פתיחה" className="rounded border border-border bg-transparent px-2 py-1 text-sm w-32" />
          <button type="submit" className="rounded bg-primary text-primary-foreground text-sm px-3 py-1">
            הוסף חשבון
          </button>
        </form>
      </section>

      <section className="card p-4 flex items-center justify-between">
        <div>
          <h2 className="font-semibold">קטגוריות</h2>
          <p className="text-sm text-muted">
            {(categories ?? []).length} קטגוריות מוגדרות. הוספה, עריכה, מחיקה ושיוך קטגוריות ממתינות
            מתבצעים במסך ניהול הקטגוריות.
          </p>
        </div>
        <Link
          href="/categories"
          className="rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold whitespace-nowrap"
        >
          ניהול קטגוריות
        </Link>
      </section>

      <section className="card p-4 flex items-center justify-between">
        <div>
          <h2 className="font-semibold">ספקים</h2>
          <p className="text-sm text-muted">רשימת מוטבים שיצא עליהם צ׳ק/העברה בעבר, לצורך השלמה אוטומטית.</p>
        </div>
        <Link
          href="/suppliers"
          className="rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold whitespace-nowrap"
        >
          ניהול ספקים
        </Link>
      </section>

      <section className="card p-4 flex items-center justify-between">
        <div>
          <h2 className="font-semibold">הוראות קבע (מנוע תחזית)</h2>
          <p className="text-sm text-muted">
            הוספה, עריכה, הפעלה/השבתה ואישור סכומים בפועל מתבצעים בדף &quot;ניהול צ׳קים והעברות&quot;.
          </p>
        </div>
        <Link
          href="/checks"
          className="rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold whitespace-nowrap"
        >
          ניהול צ׳קים והעברות
        </Link>
      </section>

      <section className="card p-4 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="font-semibold">משתמשים והרשאות</h2>
          <NewUserForm />
        </div>
        <p className="text-sm text-muted">
          משתמש חדש (שנוצר כאן או שנרשם בעצמו) מקבל כברירת מחדל הרשאת צפייה בלבד וללא גישה לאף מחלקה. יש לאשר לו כאן
          את המחלקות הספציפיות שהוא רשאי לצפות בהן.
        </p>
        <div className="overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>שם</th>
              <th>הרשאה</th>
              <th>מחלקות מאושרות</th>
              <th>תאריך בבקשות</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {(profiles ?? []).map((p) => (
              <UserAccessRow
                key={p.id}
                userId={p.id}
                fullName={p.full_name ?? p.id.slice(0, 8)}
                role={p.role}
                grantedDepartmentIds={grantsFor(p.id)}
                canSetCheckDates={p.can_set_check_dates}
                departments={departments ?? []}
              />
            ))}
            {(profiles ?? []).length === 0 && (
              <tr>
                <td colSpan={5} className="text-center text-muted py-6">
                  אין משתמשים רשומים עדיין
                </td>
              </tr>
            )}
          </tbody>
        </table>
        </div>
      </section>
    </div>
  );
}
