"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireUser, requireFinanceAdmin } from "@/lib/auth";

function revalidateEntryPaths() {
  revalidatePath("/");
}

export async function createManualEntry(input: {
  departmentId: string;
  direction: "INCOME" | "EXPENSE";
  amount: number;
  entryDate: string;
  notes: string | null;
}): Promise<{ error?: string }> {
  if (!input.entryDate) return { error: "יש להזין תאריך" };
  const user = await requireUser();
  const supabase = await createClient();
  const isAdmin = user.profile.role === "FINANCE_ADMIN";

  const { error } = await supabase.from("manual_department_entries").insert({
    department_id: input.departmentId,
    direction: input.direction,
    amount: input.amount,
    entry_date: input.entryDate,
    notes: input.notes,
    created_by: user.id,
    status: isAdmin ? "APPROVED" : "PENDING",
    approved_by: isAdmin ? user.id : null,
    approved_at: isAdmin ? new Date().toISOString() : null,
  });

  if (error) return { error: error.message };
  revalidateEntryPaths();
  return {};
}

export async function reviewManualEntry(entryId: string, decision: "APPROVED" | "REJECTED"): Promise<void> {
  const admin = await requireFinanceAdmin();
  const supabase = await createClient();
  const { error } = await supabase
    .from("manual_department_entries")
    .update({ status: decision, approved_by: admin.id, approved_at: new Date().toISOString() })
    .eq("id", entryId);
  if (error) throw new Error(error.message);
  revalidateEntryPaths();
}
