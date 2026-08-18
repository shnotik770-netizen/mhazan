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

  const { error } = await supabase.from("recurring_schedules").insert({
    department_id: String(formData.get("department_id") ?? ""),
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
  });
  if (error) throw new Error(error.message);
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
