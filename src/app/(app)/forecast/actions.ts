"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireFinanceAdmin } from "@/lib/auth";

function revalidateForecastPaths() {
  revalidatePath("/forecast");
  revalidatePath("/");
}

export async function updateBankBalance(bankAccountId: string, newBalance: number): Promise<{ error?: string }> {
  await requireFinanceAdmin();
  const supabase = await createClient();
  const { error } = await supabase
    .from("bank_accounts")
    .update({ current_balance: newBalance })
    .eq("id", bankAccountId);
  if (error) return { error: error.message };
  revalidateForecastPaths();
  return {};
}

export async function createExpectedIncome(input: {
  bankAccountId: string;
  amount: number;
  expectedDate: string;
  description: string | null;
}): Promise<{ error?: string }> {
  const admin = await requireFinanceAdmin();
  if (!input.expectedDate) return { error: "יש להזין תאריך" };
  const supabase = await createClient();
  const { error } = await supabase.from("expected_incomes").insert({
    bank_account_id: input.bankAccountId,
    amount: input.amount,
    expected_date: input.expectedDate,
    description: input.description,
    created_by: admin.id,
  });
  if (error) return { error: error.message };
  revalidateForecastPaths();
  return {};
}

export async function updateExpectedIncomeStatus(
  id: string,
  status: "PENDING" | "CONFIRMED" | "NOT_RECEIVED",
): Promise<{ error?: string }> {
  await requireFinanceAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("expected_incomes").update({ status }).eq("id", id);
  if (error) return { error: error.message };
  revalidateForecastPaths();
  return {};
}

export async function deleteExpectedIncome(id: string): Promise<{ error?: string }> {
  await requireFinanceAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("expected_incomes").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidateForecastPaths();
  return {};
}
