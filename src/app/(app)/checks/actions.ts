"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function createCheck(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const departmentId = String(formData.get("department_id") ?? "");

  const { error } = await supabase.from("checks").insert({
    check_number: String(formData.get("check_number") ?? ""),
    bank_account_id: String(formData.get("bank_account_id") ?? ""),
    payee: String(formData.get("payee") ?? ""),
    amount: Number(formData.get("amount") ?? 0),
    due_date: String(formData.get("due_date") ?? ""),
    department_id: departmentId || null,
    category_id: String(formData.get("category_id") ?? "") || null,
    notes: String(formData.get("notes") ?? "") || null,
    created_by: user?.id ?? null,
  });

  revalidatePath("/checks");
  revalidatePath("/");
  return { error: error?.message };
}

export async function classifyCheck(checkId: string, departmentId: string, categoryId: string | null) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("checks")
    .update({ department_id: departmentId, category_id: categoryId })
    .eq("id", checkId);

  revalidatePath("/checks");
  revalidatePath("/");
  return { error: error?.message };
}

export async function updateCheckStatus(checkId: string, status: "UNPAID" | "CLEARED" | "CANCELLED") {
  const supabase = await createClient();
  const { error } = await supabase.from("checks").update({ status }).eq("id", checkId);

  revalidatePath("/checks");
  revalidatePath("/");
  revalidatePath("/forecast");
  return { error: error?.message };
}
