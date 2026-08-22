"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireFinanceAdmin } from "@/lib/auth";
import { safeErrorMessage } from "@/lib/safe-error";
import { toLocalISODate } from "@/lib/format";

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
  if (error) return { error: safeErrorMessage(error) };
  revalidateForecastPaths();
  return {};
}

// A repeated expected income (repeatMonths > 1) isn't a real recurring
// schedule — it has no department/category and never posts to the ledger —
// so instead of a schedule row it's simply materialized up front as one
// expected_incomes row per month, each independently confirmable/deletable.
export async function createExpectedIncome(input: {
  bankAccountId: string;
  amount: number;
  expectedDate: string;
  description: string | null;
  repeatMonths?: number;
}): Promise<{ error?: string }> {
  const admin = await requireFinanceAdmin();
  if (!input.bankAccountId) return { error: "יש לבחור חשבון בנק" };
  if (!input.expectedDate) return { error: "יש להזין תאריך" };
  const supabase = await createClient();
  const months = Math.max(1, Math.floor(input.repeatMonths ?? 1));
  const [y, m, d] = input.expectedDate.split("-").map(Number);
  const rows = Array.from({ length: months }, (_, i) => ({
    bank_account_id: input.bankAccountId,
    amount: input.amount,
    expected_date: toLocalISODate(new Date(y, m - 1 + i, d)),
    description: input.description,
    created_by: admin.id,
  }));
  const { error } = await supabase.from("expected_incomes").insert(rows);
  if (error) return { error: safeErrorMessage(error) };
  revalidateForecastPaths();
  return {};
}

export async function updateExpectedIncome(
  id: string,
  input: {
    bankAccountId: string;
    amount: number;
    expectedDate: string;
    description: string | null;
  },
): Promise<{ error?: string }> {
  await requireFinanceAdmin();
  if (!input.bankAccountId) return { error: "יש לבחור חשבון בנק" };
  if (!input.expectedDate) return { error: "יש להזין תאריך" };
  const supabase = await createClient();
  const { error } = await supabase
    .from("expected_incomes")
    .update({
      bank_account_id: input.bankAccountId,
      amount: input.amount,
      expected_date: input.expectedDate,
      description: input.description,
    })
    .eq("id", id);
  if (error) return { error: safeErrorMessage(error) };
  revalidateForecastPaths();
  return {};
}

// Income no longer auto-updates the bank balance on its own (every other
// transaction type is manual-balance-only too) — but confirming that a
// projected expected income actually arrived is exactly the moment an admin
// may want to bump the balance by that amount, so it's offered here as an
// explicit opt-in rather than happening silently.
export async function updateExpectedIncomeStatus(
  id: string,
  status: "PENDING" | "CONFIRMED" | "NOT_RECEIVED",
  updateBalance = false,
): Promise<{ error?: string }> {
  await requireFinanceAdmin();
  const supabase = await createClient();

  if (status === "CONFIRMED" && updateBalance) {
    const { data: income, error: fetchError } = await supabase
      .from("expected_incomes")
      .select("amount, bank_account_id")
      .eq("id", id)
      .single();
    if (fetchError) return { error: safeErrorMessage(fetchError) };
    const { data: account, error: accountError } = await supabase
      .from("bank_accounts")
      .select("current_balance")
      .eq("id", income.bank_account_id)
      .single();
    if (accountError) return { error: safeErrorMessage(accountError) };
    const { error: balanceError } = await supabase
      .from("bank_accounts")
      .update({ current_balance: Number(account.current_balance) + Number(income.amount) })
      .eq("id", income.bank_account_id);
    if (balanceError) return { error: safeErrorMessage(balanceError) };
  }

  const { error } = await supabase.from("expected_incomes").update({ status }).eq("id", id);
  if (error) return { error: safeErrorMessage(error) };
  revalidateForecastPaths();
  return {};
}

export async function deleteExpectedIncome(id: string): Promise<{ error?: string }> {
  await requireFinanceAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("expected_incomes").delete().eq("id", id);
  if (error) return { error: safeErrorMessage(error) };
  revalidateForecastPaths();
  return {};
}
