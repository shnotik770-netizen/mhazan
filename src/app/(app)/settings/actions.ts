"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireFinanceAdmin } from "@/lib/auth";

export async function createDepartment(formData: FormData): Promise<void> {
  await requireFinanceAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("departments").insert({
    name: String(formData.get("name") ?? ""),
    code: String(formData.get("code") ?? "").toUpperCase(),
    home_bank_account_id: String(formData.get("home_bank_account_id") ?? ""),
  });
  if (error) throw new Error(error.message);
  revalidatePath("/settings");
  revalidatePath("/departments");
}

export async function updateDepartment(formData: FormData): Promise<void> {
  await requireFinanceAdmin();
  const supabase = await createClient();
  const homeBankAccountId = String(formData.get("home_bank_account_id") ?? "");
  const { error } = await supabase
    .from("departments")
    .update({
      name: String(formData.get("name") ?? ""),
      code: String(formData.get("code") ?? "").toUpperCase(),
      ...(homeBankAccountId ? { home_bank_account_id: homeBankAccountId } : {}),
    })
    .eq("id", String(formData.get("id") ?? ""));
  if (error) throw new Error(error.message);
  revalidatePath("/settings");
  revalidatePath("/departments");
  revalidatePath("/");
}

export async function deleteDepartment(formData: FormData): Promise<void> {
  await requireFinanceAdmin();
  const supabase = await createClient();
  const { error } = await supabase
    .from("departments")
    .delete()
    .eq("id", String(formData.get("id") ?? ""));
  if (error) {
    throw new Error(
      "לא ניתן למחוק מחלקה שיש לה חשבונות בנק, קטגוריות, הכנסות או צ׳קים משויכים: " + error.message,
    );
  }
  revalidatePath("/settings");
  revalidatePath("/departments");
  revalidatePath("/");
}

export async function createBankAccount(formData: FormData): Promise<void> {
  await requireFinanceAdmin();
  const supabase = await createClient();
  const departmentId = String(formData.get("department_id") ?? "");
  const { data, error } = await supabase
    .from("bank_accounts")
    .insert({
      department_id: departmentId,
      bank_name: String(formData.get("bank_name") ?? ""),
      account_number: String(formData.get("account_number") ?? ""),
      current_balance: Number(formData.get("current_balance") ?? 0),
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  // A department that just got its own bank account should use it as its
  // home account going forward, instead of whatever it defaulted to before.
  await supabase.from("departments").update({ home_bank_account_id: data.id }).eq("id", departmentId);
  revalidatePath("/settings");
  revalidatePath("/departments");
  revalidatePath("/");
}

export async function createRecurringSchedule(formData: FormData): Promise<void> {
  await requireFinanceAdmin();
  const supabase = await createClient();
  const frequency = String(formData.get("frequency") ?? "MONTHLY");
  const type = String(formData.get("type") ?? "FIXED_DATE_FIXED_AMOUNT");
  // A variable-date monthly schedule (its whole point: the day isn't known
  // in advance) is the one case that's allowed to skip day_of_month —
  // every other combination still needs its date field, enforced again by
  // the DB check constraint either way.
  const dayOfMonthRaw = formData.get("day_of_month");
  const dayOfMonth =
    (frequency === "MONTHLY" && type === "VARIABLE_DATE_ESTIMATED_AMOUNT" && !dayOfMonthRaw) || frequency === "WEEKLY" || frequency === "ONCE"
      ? null
      : Number(dayOfMonthRaw);

  // A schedule split across departments (mirrors checks/check_allocations)
  // is submitted as repeated allocation_department_id/allocation_amount
  // fields instead of a single department_id.
  const allocations = formData
    .getAll("allocation_department_id")
    .map((departmentId, i) => ({
      departmentId: String(departmentId),
      amount: Number(formData.getAll("allocation_amount")[i]),
    }))
    .filter((a) => a.departmentId && a.amount > 0);

  const { data: schedule, error } = await supabase
    .from("recurring_schedules")
    .insert({
      department_id: allocations.length >= 2 ? null : String(formData.get("department_id") ?? ""),
      name: String(formData.get("name") ?? ""),
      type,
      direction: String(formData.get("direction") ?? "EXPENSE"),
      frequency,
      day_of_month: frequency === "MONTHLY" || frequency === "YEARLY" ? dayOfMonth : null,
      day_of_week: frequency === "WEEKLY" ? Number(formData.get("day_of_week")) : null,
      one_time_date: frequency === "ONCE" ? String(formData.get("one_time_date")) : null,
      expected_amount: Number(formData.get("expected_amount") ?? 0),
      category_id: String(formData.get("category_id") ?? "") || null,
      bank_account_id: String(formData.get("bank_account_id") ?? "") || null,
      end_date: String(formData.get("end_date") ?? "") || null,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  if (allocations.length >= 2) {
    const { error: allocError } = await supabase.from("recurring_schedule_allocations").insert(
      allocations.map((a) => ({
        schedule_id: schedule.id,
        department_id: a.departmentId,
        amount: a.amount,
      })),
    );
    if (allocError) throw new Error(allocError.message);
  }

  revalidatePath("/settings");
  revalidatePath("/forecast");
}

// Creates a new login for a user directly (rather than requiring them to
// self-register). Delegates the actual account creation to the
// admin-create-user Edge Function, which is the only place the service-role
// key is ever used — it re-verifies finance-admin status server-side using
// the caller's own session before doing anything.
export async function createUser(input: {
  email: string;
  password: string;
  fullName: string;
}): Promise<{ error?: string }> {
  await requireFinanceAdmin();
  const supabase = await createClient();

  const { data, error } = await supabase.functions.invoke("admin-create-user", {
    body: { email: input.email, password: input.password, fullName: input.fullName || null },
  });

  if (error) {
    let message = error.message;
    try {
      const context = (error as { context?: Response }).context;
      const body = await context?.json();
      if (body?.error) message = body.error;
    } catch {
      // Fall back to the generic error message.
    }
    return { error: message };
  }
  if (data?.error) return { error: data.error };

  revalidatePath("/settings");
  return {};
}

export async function updateUserAccess(
  userId: string,
  role: "DEPT_MANAGER" | "FINANCE_ADMIN",
  departmentIds: string[],
  canSetCheckDates: boolean,
): Promise<void> {
  const admin = await requireFinanceAdmin();
  const supabase = await createClient();

  const { error: roleError } = await supabase
    .from("user_profiles")
    .update({ role, can_set_check_dates: canSetCheckDates })
    .eq("id", userId);
  if (roleError) throw new Error(roleError.message);

  const { error: deleteError } = await supabase
    .from("user_department_access")
    .delete()
    .eq("user_id", userId);
  if (deleteError) throw new Error(deleteError.message);

  if (departmentIds.length > 0) {
    const { error: insertError } = await supabase.from("user_department_access").insert(
      departmentIds.map((departmentId) => ({
        user_id: userId,
        department_id: departmentId,
        granted_by: admin.id,
      })),
    );
    if (insertError) throw new Error(insertError.message);
  }

  revalidatePath("/settings");
}

export type ScheduleConfirmationAllocation = { departmentId: string; amount: number };

// Confirms one occurrence of an estimated-amount recurring schedule (the
// real amount, once known) by inserting an ordinary approved manual entry
// tagged with the schedule/period — reusing the existing department/bank
// account auto-ledger detection instead of a separate mechanism. Letting
// the confirmer pick the department(s) fresh (rather than only ever using
// the schedule's own department) is what makes "assign or split" possible
// even though the schedule itself is single-department.
export async function confirmScheduleOccurrence(
  scheduleId: string,
  periodDate: string,
  confirmedDate: string,
  allocations: ScheduleConfirmationAllocation[],
): Promise<{ error?: string }> {
  const admin = await requireFinanceAdmin();
  if (!confirmedDate) return { error: "יש להזין תאריך" };
  const valid = allocations.filter((a) => a.departmentId && a.amount > 0);
  if (valid.length === 0) return { error: "יש להזין סכום ומחלקה לפחות" };

  const supabase = await createClient();
  const { data: schedule, error: scheduleError } = await supabase
    .from("recurring_schedules")
    .select("name, direction, bank_account_id")
    .eq("id", scheduleId)
    .single();
  if (scheduleError || !schedule) return { error: scheduleError?.message ?? "הוראת הקבע לא נמצאה" };
  if (!schedule.bank_account_id) return { error: "להוראת הקבע הזו אין חשבון בנק מוגדר" };

  const { error } = await supabase.from("manual_department_entries").insert(
    valid.map((a) => ({
      department_id: a.departmentId,
      bank_account_id: schedule.bank_account_id as string,
      direction: schedule.direction,
      amount: a.amount,
      entry_date: confirmedDate,
      notes: `אישור הוראת קבע: ${schedule.name}`,
      status: "APPROVED",
      approved_by: admin.id,
      approved_at: new Date().toISOString(),
      created_by: admin.id,
      recurring_schedule_id: scheduleId,
      recurring_period_date: periodDate,
    })),
  );
  if (error) {
    const reason = error.code === "23505" ? "התקופה הזו כבר אושרה עבור אחת המחלקות שנבחרו" : error.message;
    return { error: reason };
  }

  revalidatePath("/settings");
  revalidatePath("/forecast");
  revalidatePath("/ledger");
  revalidatePath("/");
  return {};
}

export async function deleteRecurringSchedule(scheduleId: string): Promise<{ error?: string }> {
  await requireFinanceAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("recurring_schedules").delete().eq("id", scheduleId);
  if (error) return { error: error.message };
  revalidatePath("/settings");
  revalidatePath("/expenses");
  revalidatePath("/forecast");
  return {};
}

export async function setRecurringScheduleActive(scheduleId: string, isActive: boolean): Promise<{ error?: string }> {
  await requireFinanceAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("recurring_schedules").update({ is_active: isActive }).eq("id", scheduleId);
  if (error) return { error: error.message };
  revalidatePath("/settings");
  revalidatePath("/expenses");
  revalidatePath("/forecast");
  return {};
}
