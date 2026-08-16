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
  rows: {
    date: string | null;
    amount: number;
    checkNumber?: string | null;
    departmentId: string | null;
    allocations: CheckAllocationInput[];
  }[];
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
        check_number: row.checkNumber || null,
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

export async function updateCheckStatus(
  checkId: string,
  status: "UNPAID" | "CLEARED" | "CANCELLED",
  internalBeneficiary?: string | null,
) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("checks")
    .update(
      internalBeneficiary !== undefined
        ? { status, internal_beneficiary: internalBeneficiary || null }
        : { status },
    )
    .eq("id", checkId);

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

export type BulkCheckRow = {
  paymentMethod: "CHECK" | "TRANSFER";
  bankAccountId: string;
  payee: string;
  amount: number;
  dueDate: string | null;
  checkNumber: string | null;
  departmentId: string | null;
  notes: string | null;
};

export type BulkRowOutcome = { success: boolean; reason?: string };

// Bulk entry of several checks/transfers at once: each row is inserted
// individually (not one multi-row insert) so a single bad row never blocks
// the rest of the batch from saving.
export async function createCheckBatch(rows: BulkCheckRow[]): Promise<{ outcomes: BulkRowOutcome[] }> {
  await requireFinanceAdmin();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const outcomes: BulkRowOutcome[] = [];
  for (const row of rows) {
    const { error } = await supabase.from("checks").insert({
      payment_method: row.paymentMethod,
      bank_account_id: row.bankAccountId,
      payee: row.payee,
      amount: row.amount,
      due_date: row.dueDate || null,
      check_number: row.checkNumber || null,
      department_id: row.departmentId || null,
      notes: row.notes,
      created_by: user?.id ?? null,
    });
    if (error) {
      outcomes.push({ success: false, reason: error.message });
    } else {
      outcomes.push({ success: true });
      await ensureSupplier(supabase, row.payee, user?.id ?? null);
    }
  }

  revalidateCheckPaths();
  return { outcomes };
}

export type BulkExpenseRequestRow = {
  departmentId: string;
  paymentMethod: "CHECK" | "TRANSFER";
  bankAccountId: string;
  payee: string;
  amount: number;
  dueDate: string | null;
  notes: string | null;
};

// Bulk version of createDeptExpenseRequest: type several requests at once,
// save all in one go. Same per-row RLS constraints apply (department
// managers can't set a date unless granted that permission — such rows
// simply insert with a null date and land in pending-approval).
export async function createDeptExpenseRequestBatch(
  rows: BulkExpenseRequestRow[],
): Promise<{ outcomes: BulkRowOutcome[] }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const outcomes: BulkRowOutcome[] = [];
  for (const row of rows) {
    const { error } = await supabase.from("checks").insert({
      payment_method: row.paymentMethod,
      department_id: row.departmentId,
      bank_account_id: row.bankAccountId,
      payee: row.payee,
      amount: row.amount,
      due_date: row.dueDate || null,
      notes: row.notes,
      created_by: user?.id ?? null,
    });
    if (error) {
      outcomes.push({ success: false, reason: error.message });
    } else {
      outcomes.push({ success: true });
      await ensureSupplier(supabase, row.payee, user?.id ?? null);
    }
  }

  revalidateCheckPaths();
  return { outcomes };
}

// Merges several pending checks/transfers to the same payee (same bank
// account, same payment method) into a single check. Each original check's
// amount becomes a department allocation on the merged check when they
// belonged to different departments, so no department attribution is lost.
export async function mergeChecks(checkIds: string[]): Promise<{ error?: string }> {
  await requireFinanceAdmin();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (checkIds.length < 2) return { error: "יש לבחור לפחות שני צ׳קים/העברות למיזוג" };

  const { data: checks, error: fetchError } = await supabase.from("checks").select("*").in("id", checkIds);
  if (fetchError) return { error: fetchError.message };
  if (!checks || checks.length !== checkIds.length) return { error: "חלק מהצ׳קים לא נמצאו" };

  const payees = new Set(checks.map((c) => c.payee.trim().toLowerCase()));
  if (payees.size > 1) return { error: "ניתן למזג רק צ׳קים/העברות לאותו מוטב" };
  const bankAccountIds = new Set(checks.map((c) => c.bank_account_id));
  if (bankAccountIds.size > 1) return { error: "ניתן למזג רק צ׳קים/העברות מאותו חשבון בנק" };
  const paymentMethods = new Set(checks.map((c) => c.payment_method));
  if (paymentMethods.size > 1) return { error: "ניתן למזג רק צ׳קים/העברות מאותו סוג (צ׳ק/העברה)" };

  const totalAmount = checks.reduce((sum, c) => sum + Number(c.amount), 0);
  const departmentIds = new Set(checks.map((c) => c.department_id).filter((d): d is string => !!d));

  const { data: merged, error: insertError } = await supabase
    .from("checks")
    .insert({
      payment_method: checks[0].payment_method,
      bank_account_id: checks[0].bank_account_id,
      payee: checks[0].payee,
      amount: totalAmount,
      department_id: departmentIds.size === 1 ? [...departmentIds][0] : null,
      notes: `מיזוג ${checks.length} צ׳קים/העברות`,
      created_by: user?.id ?? null,
    })
    .select("id")
    .single();
  if (insertError) return { error: insertError.message };

  if (departmentIds.size > 1) {
    const allocRows = checks
      .filter((c) => c.department_id)
      .map((c) => ({ departmentId: c.department_id as string, amount: Number(c.amount) }));
    const allocError = await insertAllocations(supabase, merged.id, allocRows);
    if (allocError) return { error: allocError };
  }

  const { error: deleteError } = await supabase.from("checks").delete().in("id", checkIds);
  if (deleteError) return { error: deleteError.message };

  revalidateCheckPaths();
  return {};
}

// Groups several pending checks/transfers to the same payee under one
// spread, without changing their amounts or count — for when several
// separate requests to the same supplier should be tracked/prepared
// together instead of merged into a single payment.
export async function groupChecksIntoSpread(checkIds: string[]): Promise<{ error?: string }> {
  await requireFinanceAdmin();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (checkIds.length < 2) return { error: "יש לבחור לפחות שני צ׳קים/העברות לקיבוץ" };

  const { data: checks, error: fetchError } = await supabase.from("checks").select("*").in("id", checkIds);
  if (fetchError) return { error: fetchError.message };
  if (!checks || checks.length !== checkIds.length) return { error: "חלק מהצ׳קים לא נמצאו" };

  const payees = new Set(checks.map((c) => c.payee.trim().toLowerCase()));
  if (payees.size > 1) return { error: "ניתן לקבץ רק צ׳קים/העברות לאותו מוטב" };
  const paymentMethods = new Set(checks.map((c) => c.payment_method));
  if (paymentMethods.size > 1) return { error: "ניתן לקבץ רק צ׳קים/העברות מאותו סוג (צ׳ק/העברה)" };

  const existingSpreadIds = new Set(checks.map((c) => c.spread_id).filter((s): s is string => !!s));
  let spreadId: string;
  if (existingSpreadIds.size === 1) {
    spreadId = [...existingSpreadIds][0];
  } else {
    const { data: spread, error: spreadError } = await supabase
      .from("payment_spreads")
      .insert({ payee: checks[0].payee, payment_method: checks[0].payment_method, created_by: user?.id ?? null })
      .select("id")
      .single();
    if (spreadError) return { error: spreadError.message };
    spreadId = spread.id;
  }

  const { error: updateError } = await supabase.from("checks").update({ spread_id: spreadId }).in("id", checkIds);
  if (updateError) return { error: updateError.message };

  revalidateCheckPaths();
  return {};
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
