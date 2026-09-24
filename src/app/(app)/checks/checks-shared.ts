// Shared helpers used by both checks/actions.ts and checks/petty-cash-actions.ts.
// Deliberately NOT a "use server" file: a couple of these (revalidateCheckPaths,
// friendlyCheckError) are plain synchronous helpers, and a "use server" module
// may only export async functions — mixing them in here would break the build.

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { safeErrorMessage } from "@/lib/safe-error";

// categoryId is optional and per-allocation: a split invoice can give each
// department's portion its own category instead of sharing the check's one
// overall category. Omitted/null falls back to the check's own category_id
// (see v_check_department_amounts' COALESCE).
export type CheckAllocationInput = { departmentId: string; amount: number; categoryId?: string | null };

// `departmentId` additionally revalidates that department's own report
// page (/reports/[id]) — otherwise an edited/moved/deleted check kept
// showing everywhere except the department report it actually belongs to,
// the same class of stale-cache bug fixed for incomes and manual entries.
export function revalidateCheckPaths(departmentId?: string | null) {
  revalidatePath("/checks");
  revalidatePath("/");
  revalidatePath("/forecast");
  revalidatePath("/expenses");
  revalidatePath("/ledger");
  revalidatePath("/transactions");
  if (departmentId) revalidatePath(`/reports/${departmentId}`);
}

// idx_checks_unique_number_per_bank enforces one check number per bank
// account at the DB level (a physical check number can only ever be used
// once, cancelled ones included) — this turns that raw unique-violation
// into a message an admin can actually act on.
export function friendlyCheckError(error: { message: string; code?: string } | null, checkNumber?: string | null): string | undefined {
  if (!error) return undefined;
  if (error.code === "23505" && error.message.includes("idx_checks_unique_number_per_bank")) {
    return checkNumber ? `מספר צ׳ק ${checkNumber} כבר קיים בחשבון הבנק הזה` : "מספר צ׳ק זה כבר קיים בחשבון הבנק הזה";
  }
  return safeErrorMessage(error);
}

// Grows the suppliers list automatically as new payees are used, so admins
// don't have to separately remember to register them.
export async function ensureSupplier(
  supabase: Awaited<ReturnType<typeof createClient>>,
  payee: string,
  userId: string | null,
) {
  const trimmed = payee.trim();
  if (!trimmed) return;
  await supabase
    .from("suppliers")
    .upsert({ name: trimmed, created_by: userId }, { onConflict: "name", ignoreDuplicates: true });
}

export async function insertAllocations(
  supabase: Awaited<ReturnType<typeof createClient>>,
  checkId: string,
  allocations: CheckAllocationInput[],
) {
  const rows = allocations.filter((a) => a.departmentId && a.amount > 0);
  if (rows.length === 0) return null;
  const { error } = await supabase.from("check_allocations").insert(
    rows.map((a) => ({ check_id: checkId, department_id: a.departmentId, amount: a.amount, category_id: a.categoryId || null })),
  );
  return safeErrorMessage(error) ?? null;
}

// Same shape as insertAllocations, but for petty_cash_entry_allocations —
// a different table (petty_cash_entry_id, not check_id) linked to a
// petty_cash_entries row rather than a checks row, so it can't reuse the
// same insert.
export async function insertPettyCashAllocations(
  supabase: Awaited<ReturnType<typeof createClient>>,
  pettyCashEntryId: string,
  allocations: CheckAllocationInput[],
) {
  const rows = allocations.filter((a) => a.departmentId && a.amount > 0);
  if (rows.length === 0) return null;
  const { error } = await supabase.from("petty_cash_entry_allocations").insert(
    rows.map((a) => ({
      petty_cash_entry_id: pettyCashEntryId,
      department_id: a.departmentId,
      amount: a.amount,
      category_id: a.categoryId || null,
    })),
  );
  return safeErrorMessage(error) ?? null;
}
