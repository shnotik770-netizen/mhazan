"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireUser, requireFinanceAdmin } from "@/lib/auth";
import { safeErrorMessage } from "@/lib/safe-error";

// A manual entry also affects the department's own report page and the
// inter-department ledger, not just the global transactions/expenses
// lists — both were missing here, so an approved manual entry kept
// showing on /transactions while the department's own /reports/[id] page
// kept serving its stale cached render until something else revalidated it.
function revalidateEntryPaths(departmentId?: string | null) {
  revalidatePath("/");
  revalidatePath("/expenses");
  revalidatePath("/transactions");
  revalidatePath("/ledger");
  if (departmentId) revalidatePath(`/reports/${departmentId}`);
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

  if (error) return { error: safeErrorMessage(error) };
  revalidateEntryPaths(input.departmentId);
  return {};
}

export type ManualEntryBatchRow = {
  departmentId: string;
  direction: "INCOME" | "EXPENSE";
  amount: number;
  entryDate: string;
  notes: string | null;
  bankAccountId: string;
};

export type ManualEntryBatchOutcome = { success: boolean; reason?: string };

// Bulk version of createManualEntry: type several rows at once (each its
// own amount/direction/department/notes) and save them all in one click.
// Each row is inserted individually — same as every other batch entry
// point in the app — so one bad row never blocks the rest from saving.
export async function createManualEntryBatch(rows: ManualEntryBatchRow[]): Promise<{ outcomes: ManualEntryBatchOutcome[] }> {
  const user = await requireUser();
  const supabase = await createClient();
  const isAdmin = user.profile.role === "FINANCE_ADMIN";

  const outcomes: ManualEntryBatchOutcome[] = [];
  const departmentIds = new Set<string>();
  for (const row of rows) {
    if (!row.entryDate) {
      outcomes.push({ success: false, reason: "יש להזין תאריך" });
      continue;
    }
    if (!row.departmentId) {
      outcomes.push({ success: false, reason: "יש לבחור מחלקה" });
      continue;
    }
    if (!row.bankAccountId) {
      outcomes.push({ success: false, reason: "יש לבחור חשבון בנק" });
      continue;
    }
    if (!row.amount || row.amount <= 0) {
      outcomes.push({ success: false, reason: "סכום לא תקין" });
      continue;
    }
    const { error } = await supabase.from("manual_department_entries").insert({
      department_id: row.departmentId,
      direction: row.direction,
      amount: row.amount,
      entry_date: row.entryDate,
      notes: row.notes,
      bank_account_id: row.bankAccountId,
      created_by: user.id,
      status: isAdmin ? "APPROVED" : "PENDING",
      approved_by: isAdmin ? user.id : null,
      approved_at: isAdmin ? new Date().toISOString() : null,
    });
    if (error) {
      outcomes.push({ success: false, reason: safeErrorMessage(error) });
    } else {
      outcomes.push({ success: true });
      departmentIds.add(row.departmentId);
    }
  }

  for (const id of departmentIds) revalidateEntryPaths(id);
  return { outcomes };
}

// Records that one department owes another (e.g. "חבד לנוער חייבת 800 ₪
// לבית הספר") without an actual bank-to-bank wire needing to happen for
// every such adjustment:
//
// - Same home bank account for both departments: two linked manual
//   entries through that one shared account (EXPENSE for the debtor,
//   INCOME for the creditor) — a pure internal reallocation, since no
//   real money moves between two different physical accounts.
// - Different home accounts: a single EXPENSE entry for the debtor,
//   posted through the *creditor's* own bank account. The existing
//   cross-department trigger on manual_department_entries then creates
//   the inter-department ledger row itself (debtor owes creditor) —
//   exactly the debt relationship being recorded — without a second
//   entry or any new database logic.
export async function createInterDepartmentTransfer(input: {
  debtorDepartmentId: string;
  creditorDepartmentId: string;
  amount: number;
  entryDate: string;
  notes: string | null;
}): Promise<{ error?: string }> {
  const user = await requireFinanceAdmin();
  if (!input.entryDate) return { error: "יש להזין תאריך" };
  if (!input.debtorDepartmentId || !input.creditorDepartmentId) return { error: "יש לבחור שתי מחלקות" };
  if (input.debtorDepartmentId === input.creditorDepartmentId) return { error: "יש לבחור שתי מחלקות שונות" };
  if (!input.amount || input.amount <= 0) return { error: "סכום לא תקין" };
  const supabase = await createClient();

  const { data: departments, error: fetchError } = await supabase
    .from("departments")
    .select("id, name, home_bank_account_id")
    .in("id", [input.debtorDepartmentId, input.creditorDepartmentId]);
  if (fetchError || !departments || departments.length !== 2) {
    return { error: fetchError ? safeErrorMessage(fetchError) : "מחלקה לא נמצאה" };
  }
  const debtor = departments.find((d) => d.id === input.debtorDepartmentId)!;
  const creditor = departments.find((d) => d.id === input.creditorDepartmentId)!;

  const baseRow = {
    amount: input.amount,
    entry_date: input.entryDate,
    created_by: user.id,
    status: "APPROVED" as const,
    approved_by: user.id,
    approved_at: new Date().toISOString(),
    is_inter_department_transfer: true,
  };
  // Written from each side's own perspective ("transfer to/from department
  // X") rather than inferred later from which bank account the entry
  // happens to post through — most departments share one central account,
  // so that inference used to misfire on completely ordinary manual
  // entries too.
  const debtorNote = `העברה למחלקת ${creditor.name}${input.notes ? ` — ${input.notes}` : ""}`;
  const creditorNote = `העברה ממחלקת ${debtor.name}${input.notes ? ` — ${input.notes}` : ""}`;

  if (debtor.home_bank_account_id === creditor.home_bank_account_id) {
    const { error } = await supabase.from("manual_department_entries").insert([
      {
        ...baseRow,
        department_id: debtor.id,
        direction: "EXPENSE",
        bank_account_id: debtor.home_bank_account_id,
        notes: debtorNote,
      },
      {
        ...baseRow,
        department_id: creditor.id,
        direction: "INCOME",
        bank_account_id: debtor.home_bank_account_id,
        notes: creditorNote,
      },
    ]);
    if (error) return { error: safeErrorMessage(error) };
  } else {
    const { error } = await supabase.from("manual_department_entries").insert({
      ...baseRow,
      department_id: debtor.id,
      direction: "EXPENSE",
      bank_account_id: creditor.home_bank_account_id,
      notes: debtorNote,
    });
    if (error) return { error: safeErrorMessage(error) };
  }

  revalidateEntryPaths(debtor.id);
  revalidateEntryPaths(creditor.id);
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
  const { data: existing } = await supabase
    .from("manual_department_entries")
    .select("department_id")
    .eq("id", entryId)
    .single();
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
  if (error) return { error: safeErrorMessage(error) };
  revalidateEntryPaths(input.departmentId);
  if (existing && existing.department_id !== input.departmentId) revalidateEntryPaths(existing.department_id);
  return {};
}

// A narrow "fix a typo" edit for a manual entry's description, offered
// directly from a department report row — deliberately touches only this
// one field rather than reusing the full updateManualEntry (which expects
// amount/date/department together) so a quick correction can never
// accidentally overwrite something else.
export async function updateManualEntryNotes(entryId: string, notes: string): Promise<{ error?: string }> {
  await requireFinanceAdmin();
  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("manual_department_entries")
    .select("department_id")
    .eq("id", entryId)
    .single();
  const { error } = await supabase
    .from("manual_department_entries")
    .update({ notes: notes.trim() || null })
    .eq("id", entryId);
  if (error) return { error: safeErrorMessage(error) };
  revalidateEntryPaths(existing?.department_id);
  return {};
}

export async function deleteManualEntry(entryId: string): Promise<{ error?: string }> {
  await requireFinanceAdmin();
  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("manual_department_entries")
    .select("department_id")
    .eq("id", entryId)
    .single();
  const { error } = await supabase.from("manual_department_entries").delete().eq("id", entryId);
  if (error) return { error: safeErrorMessage(error) };
  revalidateEntryPaths(existing?.department_id);
  return {};
}

export async function reviewManualEntry(entryId: string, decision: "APPROVED" | "REJECTED"): Promise<void> {
  await requireFinanceAdmin();
  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("manual_department_entries")
    .select("department_id")
    .eq("id", entryId)
    .single();
  // RPC (not a plain update) since it must run with elevated privileges to
  // let the after-write trigger create the auto-ledger entry regardless of
  // who originally submitted the (possibly non-admin) pending entry.
  const { error } = await supabase.rpc("review_manual_entry", { p_entry_id: entryId, p_decision: decision });
  if (error) throw new Error(error.message);
  revalidateEntryPaths(existing?.department_id);
}
