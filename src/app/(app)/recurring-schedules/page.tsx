import { requireFinanceAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { RecurringSchedulesManager, type ScheduleRow } from "@/components/recurring-schedules-manager-client";

export default async function RecurringSchedulesPage() {
  await requireFinanceAdmin();
  const supabase = await createClient();

  const [{ data: schedules }, { data: departments }, { data: bankAccounts }, { data: categories }] = await Promise.all([
    supabase
      .from("recurring_schedules")
      .select("*, departments(name), recurring_schedule_allocations(department_id, amount, departments(name))")
      .order("name"),
    supabase.from("departments").select("*").order("name"),
    supabase.from("bank_accounts").select("*, departments!bank_accounts_department_id_fkey(name)").order("bank_name"),
    supabase.from("categories").select("*").order("name"),
  ]);

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

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">ניהול הוראות קבע</h1>
        <p className="text-sm text-muted">
          כל הוראות הקבע (הכנסות והוצאות חוזרות) המוגדרות במערכת — הוספה, עריכה, השבתה ומחיקה.
        </p>
      </div>

      <RecurringSchedulesManager
        schedules={scheduleRows}
        departments={departments ?? []}
        bankAccounts={bankAccounts ?? []}
        categories={categories ?? []}
      />
    </div>
  );
}
