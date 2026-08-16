"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireFinanceAdmin } from "@/lib/auth";

export type CheckAllocationInput = { departmentId: string; amount: number };

function revalidateCheckPaths() {
  revalidatePath("/checks");
  revalidatePath("/");
  revalidatePath("/forecast");
}

// Grows the suppliers list automatically as new payees are used, so admins
// don't have to separately remember to register them.
async function ensureSupplier(
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

async function insertAllocations(
  supabase: Awaited<ReturnType<typeof createClient>>,
  checkId: string,
  allocations: CheckAllocationInput[],
) {
  const rows = allocations.filter((a) => a.departmentId && a.amount > 0);
  if (rows.length === 0) return null;
  const { error } = await supabase.from("check_allocations").insert(
    rows.map((a) => ({ check_id: checkId, department_id: a.departmentId, amount: a.amount })),
  );
  return error?.message ?? null;
}

// Full-featured creation used by finance admins: any payment method,
// optional department split, optional "already accounted for in the old
// system" flag.
export async function createCheck(input: {
  paymentMethod: "CHECK" | "TRANSFER";
  bankAccountId: string;
  payee: string;
  amount: number;
  dueDate: string | null;
  checkNumber: string | null;
  departmentId: string | null;
  categoryId: string | null;
  internalBeneficiary: string | null;
  notes: string | null;
  skipDepartmentLedger: boolean;
  allocations: CheckAllocationInput[];
}): Promise<{ error?: string }> {
  await requireFinanceAdmin();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isSplit = input.allocations.some((a) => a.departmentId && a.amount > 0);

  const { data: created, error } = await supabase
    .from("checks")
    .insert({
      payment_method: input.paymentMethod,
      bank_account_id: input.bankAccountId,
      payee: input.payee,
      amount: input.amount,
      due_date: input.dueDate || null,
      check_number: input.checkNumber || null,
      department_id: isSplit ? null : input.departmentId,
      category_id: input.categoryId,
      internal_beneficiary: input.internalBeneficiary || null,
      notes: input.notes,
      skip_department_ledger: input.skipDepartmentLedger,
      created_by: user?.id ?? null,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  if (isSplit) {
    const allocError = await insertAllocations(supabase, created.id, input.allocations);
    if (allocError) return { error: allocError };
  }

  await ensureSupplier(supabase, input.payee, user?.id ?? null);
  revalidateCheckPaths();
  return {};
}

// Narrow creation for a department manager filing an expense request: RLS
// (checks_dept_manager_request) enforces the single-department, no check
// number, no spread, no skip-ledger, date-only-if-permitted rules — this
// just submits the plain row and lets the database reject anything outside
// those bounds.
export async function createDeptExpenseRequest(input: {
  paymentMethod: "CHECK" | "TRANSFER";
  departmentId: string;
  bankAccountId: string;
  payee: string;
  amount: number;
  dueDate: string | null;
  notes: string | null;
}): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase.from("checks").insert({
    payment_method: input.paymentMethod,
    department_id: input.departmentId,
    bank_account_id: input.bankAccountId,
    payee: input.payee,
    amount: input.amount,
    due_date: input.dueDate || null,
    notes: input.notes,
    created_by: user?.id ?? null,
  });

  if (error) return { error: error.message };
  await ensureSupplier(supabase, input.payee, user?.id ?? null);
  revalidateCheckPaths();
  return {};
}

// Finance admin finalizes a department's request: assigns the real check
// number and/or due date, optionally splitting it across departments at
// this point.
export async function issueCheck(
  checkId: string,
  input: { checkNumber: string | null; dueDate: string | null; allocations: CheckAllocationInput[] },
): Promise<{ error?: string }> {
  await requireFinanceAdmin();
  const supabase = await createClient();

  const isSplit = input.allocations.some((a) => a.departmentId && a.amount > 0);

  const { error } = await supabase
    .from("checks")
    .update({
      check_number: input.checkNumber || null,
      due_date: input.dueDate || null,
      department_id: isSplit ? null : undefined,
    })
    .eq("id", checkId);
  if (error) return { error: error.message };

  if (isSplit) {
    await supabase.from("check_allocations").delete().eq("check_id", checkId);
    const allocError = await insertAllocations(supabase, checkId, input.allocations);
    if (allocError) return { error: allocError };
  }

  revalidateCheckPaths();
  return {};
}

// Creates a supplier "spread": one payee, N checks/transfers (each amount
// entered manually — no auto-split), optionally with per-row department
// allocations when the debt is shared across departments.
export async function createPaymentSpread(input: {
  payee: string;
  paymentMethod: "CHECK" | "TRANSFER";
  internalBeneficiary: string | null;
  notes: string | null;
  bankAccountId: string;
  rows: { date: string | null; amount: number; departmentId: string | null; allocations: CheckAllocationInput[] }[];
}): Promise<{ error?: string }> {
  await requireFinanceAdmin();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const validRows = input.rows.filter((r) => r.amount > 0);
  if (validRows.length === 0) return { error: "יש להזין לפחות שורה אחת עם סכום" };

  const { data: spread, error: spreadError } = await supabase
    .from("payment_spreads")
    .insert({
      payee: input.payee,
      payment_method: input.paymentMethod,
      internal_beneficiary: input.internalBeneficiary || null,
      notes: input.notes,
      created_by: user?.id ?? null,
    })
    .select("id")
    .single();
  if (spreadError) return { error: spreadError.message };

  for (const row of validRows) {
    const isSplit = row.allocations.some((a) => a.departmentId && a.amount > 0);
    const { data: created, error } = await supabase
      .from("checks")
      .insert({
        payment_method: input.paymentMethod,
        bank_account_id: input.bankAccountId,
        payee: input.payee,
        amount: row.amount,
        due_date: row.date || null,
        department_id: isSplit ? null : row.departmentId,
        internal_beneficiary: input.internalBeneficiary || null,
        spread_id: spread.id,
        created_by: user?.id ?? null,
      })
      .select("id")
      .single();
    if (error) return { error: error.message };
    if (isSplit) {
      const allocError = await insertAllocations(supabase, created.id, row.allocations);
      if (allocError) return { error: allocError };
    }
  }

  await ensureSupplier(supabase, input.payee, user?.id ?? null);
  revalidateCheckPaths();
  return { error: undefined };
}

// Bulk-import checks/transfers that were already written out in the world
// before this system existed, for bank-forecast accuracy. Each row decides
// for itself whether it should also count toward department accounting.
export async function pasteExistingChecks(
  bankAccountId: string,
  rows: {
    payee: string;
    amount: number;
    date: string | null;
    cleared: boolean;
    departmentId: string | null;
    includeInDepartmentLedger: boolean;
  }[],
): Promise<{ error?: string; count?: number }> {
  await requireFinanceAdmin();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const validRows = rows.filter((r) => r.payee && r.amount > 0);
  if (validRows.length === 0) return { error: "אין שורות תקינות לייבוא" };

  const { error, count } = await supabase.from("checks").insert(
    validRows.map((r) => ({
      payment_method: "CHECK" as const,
      bank_account_id: bankAccountId,
      payee: r.payee,
      amount: r.amount,
      due_date: r.date || null,
      status: r.cleared ? ("CLEARED" as const) : ("UNPAID" as const),
      department_id: r.departmentId,
      skip_department_ledger: !r.includeInDepartmentLedger,
      created_by: user?.id ?? null,
    })),
    { count: "exact" },
  );

  if (error) return { error: error.message };
  revalidateCheckPaths();
  return { count: count ?? validRows.length };
}

// Used by the paste-existing-checks importer: auto-fill a row's department
// from the most recent prior check to the same payee that was already
// classified, so only genuinely new payees land in the pending queue.
export async function lookupDepartmentsByPayee(payees: string[]): Promise<Record<string, string>> {
  const unique = Array.from(new Set(payees.filter(Boolean)));
  if (unique.length === 0) return {};

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("checks")
    .select("payee, department_id, created_at")
    .in("payee", unique)
    .not("department_id", "is", null)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);

  const map: Record<string, string> = {};
  for (const row of data ?? []) {
    const key = row.payee.trim().toLowerCase();
    if (!(key in map) && row.department_id) map[key] = row.department_id;
  }
  return map;
}

export async function classifyCheck(checkId: string, departmentId: string, categoryId: string | null) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("checks")
    .update({ department_id: departmentId, category_id: categoryId })
    .eq("id", checkId);

  revalidateCheckPaths();
  return { error: error?.message };
}

export async function updateCheckStatus(checkId: string, status: "UNPAID" | "CLEARED" | "CANCELLED") {
  const supabase = await createClient();
  const { error } = await supabase.from("checks").update({ status }).eq("id", checkId);

  revalidateCheckPaths();
  return { error: error?.message };
}

export async function deleteCheck(checkId: string): Promise<{ error?: string }> {
  await requireFinanceAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("checks").delete().eq("id", checkId);
  revalidateCheckPaths();
  return { error: error?.message };
}

export async function updateCheck(
  checkId: string,
  input: {
    payee: string;
    amount: number;
    dueDate: string | null;
    checkNumber: string | null;
    departmentId: string | null;
    notes: string | null;
  },
): Promise<{ error?: string }> {
  await requireFinanceAdmin();
  const supabase = await createClient();
  const { error } = await supabase
    .from("checks")
    .update({
      payee: input.payee,
      amount: input.amount,
      due_date: input.dueDate || null,
      check_number: input.checkNumber || null,
      department_id: input.departmentId || null,
      notes: input.notes,
    })
    .eq("id", checkId);
  revalidateCheckPaths();
  return { error: error?.message };
}
