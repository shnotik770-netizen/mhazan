import Link from "next/link";
import { requireFinanceAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatCurrency } from "@/lib/format";
import {
  createBankAccount,
  createCategory,
  createRecurringSchedule,
  updateUserProfile,
} from "./actions";

export default async function SettingsPage() {
  await requireFinanceAdmin();
  const supabase = await createClient();

  const [
    { data: departments },
    { data: bankAccounts },
    { data: categories },
    { data: schedules },
    { data: profiles },
  ] = await Promise.all([
    supabase.from("departments").select("*").order("name"),
    supabase.from("bank_accounts").select("*, departments(name)").order("bank_name"),
    supabase.from("categories").select("*, departments(name)").order("name"),
    supabase.from("recurring_schedules").select("*, departments(name)").order("name"),
    supabase.from("user_profiles").select("*, departments(name)").order("full_name"),
  ]);

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

      <section className="card p-4 space-y-3">
        <h2 className="font-semibold">קטגוריות</h2>
        <table className="data-table">
          <thead>
            <tr>
              <th>שם</th>
              <th>מחלקה בעלים</th>
              <th>סוג</th>
            </tr>
          </thead>
          <tbody>
            {(categories ?? []).map((c) => (
              <tr key={c.id}>
                <td>{c.name}</td>
                <td>{(c as { departments: { name: string } | null }).departments?.name}</td>
                <td>{c.type === "INCOME" ? "הכנסה" : "הוצאה"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <form action={createCategory} className="flex flex-wrap gap-2 pt-2">
          <input name="name" placeholder="שם קטגוריה" required className="rounded border border-border bg-transparent px-2 py-1 text-sm" />
          <select name="department_id" required className="rounded border border-border bg-transparent px-2 py-1 text-sm">
            <option value="">מחלקה בעלים...</option>
            {(departments ?? []).map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          <select name="type" className="rounded border border-border bg-transparent px-2 py-1 text-sm">
            <option value="INCOME">הכנסה</option>
            <option value="EXPENSE">הוצאה</option>
          </select>
          <button type="submit" className="rounded bg-primary text-primary-foreground text-sm px-3 py-1">
            הוסף קטגוריה
          </button>
        </form>
      </section>

      <section className="card p-4 space-y-3">
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
        <h2 className="font-semibold">משתמשים והרשאות</h2>
        <table className="data-table">
          <thead>
            <tr>
              <th>שם</th>
              <th>תפקיד</th>
              <th>מחלקה</th>
              <th>עדכון</th>
            </tr>
          </thead>
          <tbody>
            {(profiles ?? []).map((p) => (
              <tr key={p.id}>
                <td>{p.full_name ?? p.id.slice(0, 8)}</td>
                <td colSpan={3}>
                  <form action={updateUserProfile} className="flex items-center gap-2">
                    <input type="hidden" name="user_id" value={p.id} />
                    <select name="role" defaultValue={p.role} className="rounded border border-border bg-transparent px-2 py-1 text-sm">
                      <option value="DEPT_MANAGER">מנהל מחלקה</option>
                      <option value="FINANCE_ADMIN">מנהל כספים</option>
                    </select>
                    <select name="department_id" defaultValue={p.department_id ?? ""} className="rounded border border-border bg-transparent px-2 py-1 text-sm">
                      <option value="">ללא מחלקה</option>
                      {(departments ?? []).map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                    <button type="submit" className="rounded bg-primary text-primary-foreground text-xs px-3 py-1">
                      עדכן
                    </button>
                  </form>
                </td>
              </tr>
            ))}
            {(profiles ?? []).length === 0 && (
              <tr>
                <td colSpan={4} className="text-center text-muted py-6">
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
