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
  bankAccountId?: string | null;
  counterpartyDepartmentId?: string | null;
}): Promise<{ error?: string }> {
  if (!input.entryDate) return { error: "יש להזין תאריך" };
  if (!input.departmentId) return { error: "יש לבחור מחלקה" };
  await requireUser();
  const supabase = await createClient();

  // Routed through an RPC (not a plain insert) because a counterparty
  // department also gets a mirrored entry created for it — the other side
  // of an inter-department transfer — which the calling user may not have
  // direct RLS access to write themselves.
  const { error } = await supabase.rpc("create_manual_entry_with_counterparty", {
    p_department_id: input.departmentId,
    p_direction: input.direction,
    p_amount: input.amount,
    p_entry_date: input.entryDate,
    p_notes: input.notes,
    p_bank_account_id: input.bankAccountId ?? null,
    p_counterparty_department_id: input.counterpartyDepartmentId ?? null,
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
  input: { amount: number; entryDate: string; departmentId: string; notes: string | null },
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
    })
    .eq("id", entryId);
  if (error) return { error: error.message };
  revalidateEntryPaths();
  return {};
}

export async function reviewManualEntry(entryId: string, decision: "APPROVED" | "REJECTED"): Promise<void> {
  await requireFinanceAdmin();
  const supabase = await createClient();
  // RPC (not a plain update) so a linked counterparty-transfer entry, if
  // any, is approved/rejected together with this one — the two sides must
  // never end up in different states.
  const { error } = await supabase.rpc("review_manual_entry", { p_entry_id: entryId, p_decision: decision });
  if (error) throw new Error(error.message);
  revalidateEntryPaths();
}
