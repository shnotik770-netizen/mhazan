"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireUser, requireFinanceAdmin } from "@/lib/auth";

function revalidateEntryPaths() {
  revalidatePath("/");
  revalidatePath("/expenses");
  revalidatePath("/transactions");
}

export async function createManualEntry(input: {
  departmentId: string;
  direction: "INCOME" | "EXPENSE";
  amount: number;
  entryDate: string;
  notes: string | null;
  bankAccountId: string;
}): Promise<{ error?: string }> {
  if (!input.entryDate) return { error: "יש להזין תאריך" };
  if (!input.departmentId) return { error: "יש לבחור מחלקה" };
  if (!input.bankAccountId) return { error: "יש לבחור חשבון בנק" };
  const user = await requireUser();
  const supabase = await createClient();
  const isAdmin = user.profile.role === "FINANCE_ADMIN";

  // A plain insert is enough now: if the bank account used belongs to a
  // different department than this entry, a trigger on the table
  // automatically creates the inter-department ledger entry — no separate
  // "third party" selection or cross-department write required.
  const { error } = await supabase.from("manual_department_entries").insert({
    department_id: input.departmentId,
    direction: input.direction,
    amount: input.amount,
    entry_date: input.entryDate,
    notes: input.notes,
    bank_account_id: input.bankAccountId,
    created_by: user.id,
    status: isAdmin ? "APPROVED" : "PENDING",
    approved_by: isAdmin ? user.id : null,
    approved_at: isAdmin ? new Date().toISOString() : null,
  });

  if (error) return { error: error.message };
  revalidateEntryPaths();
  return {};
}

// Lets an admin correct an already-approved manual entry (amount, date,
// department, notes) from the /expenses screen instead of deleting and
// re-entering it.
export async function updateManualEntry(
  entryId: string,
  input: { amount: number; entryDate: string; departmentId: string; notes: string | null; bankAccountId?: string },
): Promise<{ error?: string }> {
  await requireFinanceAdmin();
  if (!input.entryDate) return { error: "יש להזין תאריך" };
  const supabase = await createClient();
  const { error } = await supabase
    .from("manual_department_entries")
    .update({
      amount: input.amount,
      entry_date: input.entryDate,
      department_id: input.departmentId,
      notes: input.notes,
      ...(input.bankAccountId ? { bank_account_id: input.bankAccountId } : {}),
    })
    .eq("id", entryId);
  if (error) return { error: error.message };
  revalidateEntryPaths();
  return {};
}

export async function reviewManualEntry(entryId: string, decision: "APPROVED" | "REJECTED"): Promise<void> {
  await requireFinanceAdmin();
  const supabase = await createClient();
  // RPC (not a plain update) since it must run with elevated privileges to
  // let the after-write trigger create the auto-ledger entry regardless of
  // who originally submitted the (possibly non-admin) pending entry.
  const { error } = await supabase.rpc("review_manual_entry", { p_entry_id: entryId, p_decision: decision });
  if (error) throw new Error(error.message);
  revalidateEntryPaths();
}
