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
  });
  if (error) throw new Error(error.message);
  revalidatePath("/settings");
}

export async function updateDepartment(formData: FormData): Promise<void> {
  await requireFinanceAdmin();
  const supabase = await createClient();
  const { error } = await supabase
    .from("departments")
    .update({
      name: String(formData.get("name") ?? ""),
      code: String(formData.get("code") ?? "").toUpperCase(),
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
  const { error } = await supabase.from("bank_accounts").insert({
    department_id: String(formData.get("department_id") ?? ""),
    bank_name: String(formData.get("bank_name") ?? ""),
    account_number: String(formData.get("account_number") ?? ""),
    current_balance: Number(formData.get("current_balance") ?? 0),
  });
  if (error) throw new Error(error.message);
  revalidatePath("/settings");
  revalidatePath("/");
}

export async function createCategory(formData: FormData): Promise<void> {
  await requireFinanceAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("categories").insert({
    name: String(formData.get("name") ?? ""),
    department_id: String(formData.get("department_id") ?? ""),
    type: String(formData.get("type") ?? "INCOME"),
  });
  if (error) throw new Error(error.message);
  revalidatePath("/settings");
}

export async function createRecurringSchedule(formData: FormData): Promise<void> {
  await requireFinanceAdmin();
  const supabase = await createClient();
  const frequency = String(formData.get("frequency") ?? "MONTHLY");

  const { error } = await supabase.from("recurring_schedules").insert({
    department_id: String(formData.get("department_id") ?? ""),
    name: String(formData.get("name") ?? ""),
    type: String(formData.get("type") ?? "FIXED_AMOUNT"),
    direction: String(formData.get("direction") ?? "EXPENSE"),
    frequency,
    day_of_month: frequency === "MONTHLY" || frequency === "YEARLY" ? Number(formData.get("day_of_month")) : null,
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

export async function updateUserProfile(formData: FormData): Promise<void> {
  await requireFinanceAdmin();
  const supabase = await createClient();
  const { error } = await supabase
    .from("user_profiles")
    .update({
      role: String(formData.get("role") ?? "DEPT_MANAGER"),
      department_id: String(formData.get("department_id") ?? "") || null,
    })
    .eq("id", String(formData.get("user_id") ?? ""));
  if (error) throw new Error(error.message);
  revalidatePath("/settings");
}
