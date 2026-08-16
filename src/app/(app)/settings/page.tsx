import Link from "next/link";
import { requireFinanceAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatCurrency } from "@/lib/format";
import { NewUserForm, UserAccessRow } from "@/components/user-access-client";
import { createBankAccount, createRecurringSchedule } from "./actions";

export default async function SettingsPage() {
  await requireFinanceAdmin();
  const supabase = await createClient();

  const [
    { data: departments },
    { data: bankAccounts },
    { data: categories },
    { data: schedules },
    { data: profiles },
    { data: accessGrants },
  ] = await Promise.all([
    supabase.from("departments").select("*").order("name"),
    supabase.from("bank_accounts").select("*, departments(name)").order("bank_name"),
    supabase.from("categories").select("*, departments(name)").order("name"),
    supabase.from("recurring_schedules").select("*, departments(name)").order("name"),
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
                <td>{formatCurrency(Number(b.current_balance))}</td>
              </tr>
            ))}
          </tbody>
        </table>
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

      <section id="recurring-schedules" className="card p-4 space-y-3">
        <h2 className="font-semibold">הוראות קבע (מנוע תחזית)</h2>
        <table className="data-table">
          <thead>
            <tr>
              <th>שם</th>
              <th>מחלקה</th>
              <th>כיוון</th>
              <th>תדירות</th>
              <th>סכום צפוי</th>
              <th>פעיל</th>
            </tr>
          </thead>
          <tbody>
            {(schedules ?? []).map((s) => (
              <tr key={s.id}>
                <td>{s.name}</td>
                <td>{(s as { departments: { name: string } | null }).departments?.name}</td>
                <td>{s.direction === "INCOME" ? "הכנסה" : "הוצאה"}</td>
                <td>{s.frequency}</td>
                <td>{formatCurrency(Number(s.expected_amount))}</td>
                <td>{s.is_active ? "כן" : "לא"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <form action={createRecurringSchedule} className="grid grid-cols-2 md:grid-cols-4 gap-2 pt-2">
          <input name="name" placeholder="שם ההוראה" required className="rounded border border-border bg-transparent px-2 py-1 text-sm" />
          <select name="department_id" required className="rounded border border-border bg-transparent px-2 py-1 text-sm">
            <option value="">מחלקה...</option>
            {(departments ?? []).map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          <select name="direction" className="rounded border border-border bg-transparent px-2 py-1 text-sm">
            <option value="EXPENSE">הוצאה</option>
            <option value="INCOME">הכנסה</option>
          </select>
          <select name="type" className="rounded border border-border bg-transparent px-2 py-1 text-sm">
            <option value="FIXED_AMOUNT">סכום קבוע</option>
            <option value="VARIABLE_AMOUNT">סכום משתנה</option>
            <option value="ONE_TIME">חד פעמי</option>
          </select>
          <select name="frequency" className="rounded border border-border bg-transparent px-2 py-1 text-sm">
            <option value="MONTHLY">חודשי</option>
            <option value="WEEKLY">שבועי</option>
            <option value="YEARLY">שנתי</option>
            <option value="ONCE">חד פעמי</option>
          </select>
          <input name="day_of_month" type="number" min="1" max="31" placeholder="יום בחודש" className="rounded border border-border bg-transparent px-2 py-1 text-sm" />
          <input name="day_of_week" type="number" min="0" max="6" placeholder="יום בשבוע (0=א׳)" className="rounded border border-border bg-transparent px-2 py-1 text-sm" />
          <input name="one_time_date" type="date" className="rounded border border-border bg-transparent px-2 py-1 text-sm" />
          <input name="expected_amount" type="number" placeholder="סכום צפוי" required className="rounded border border-border bg-transparent px-2 py-1 text-sm" />
          <select name="bank_account_id" required className="rounded border border-border bg-transparent px-2 py-1 text-sm">
            <option value="">חשבון בנק...</option>
            {(bankAccounts ?? []).map((b) => (
              <option key={b.id} value={b.id}>
                {b.bank_name} ({b.account_number})
              </option>
            ))}
          </select>
          <select name="category_id" className="rounded border border-border bg-transparent px-2 py-1 text-sm">
            <option value="">קטגוריה (אופציונלי)...</option>
            {(categories ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <button type="submit" className="rounded bg-primary text-primary-foreground text-sm px-3 py-1">
            הוסף הוראת קבע
          </button>
        </form>
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
      </section>
    </div>
  );
}
