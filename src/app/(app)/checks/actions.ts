"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireFinanceAdmin, requireUser } from "@/lib/auth";
import { safeErrorMessage } from "@/lib/safe-error";
import type { Tables } from "@/lib/supabase/database.types";

export type CheckAllocationInput = { departmentId: string; amount: number };

function revalidateCheckPaths() {
  revalidatePath("/checks");
  revalidatePath("/");
  revalidatePath("/forecast");
  revalidatePath("/expenses");
}

// idx_checks_unique_number_per_bank enforces one check number per bank
// account at the DB level (a physical check number can only ever be used
// once, cancelled ones included) — this turns that raw unique-violation
// into a message an admin can actually act on.
function friendlyCheckError(error: { message: string; code?: string } | null, checkNumber?: string | null): string | undefined {
  if (!error) return undefined;
  if (error.code === "23505" && error.message.includes("idx_checks_unique_number_per_bank")) {
    return checkNumber ? `מספר צ׳ק ${checkNumber} כבר קיים בחשבון הבנק הזה` : "מספר צ׳ק זה כבר קיים בחשבון הבנק הזה";
  }
  return safeErrorMessage(error);
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
  return safeErrorMessage(error) ?? null;
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
      issued_at: input.checkNumber ? new Date().toISOString() : null,
      department_id: isSplit ? null : input.departmentId,
      category_id: input.categoryId,
      internal_beneficiary: input.internalBeneficiary || null,
      notes: input.notes,
      skip_department_ledger: input.skipDepartmentLedger,
      created_by: user?.id ?? null,
      // A finance admin entering an expense directly IS the approval —
      // it goes straight to the issuance queue, not through the
      // dept-manager-request approval step.
      approved_at: new Date().toISOString(),
      approved_by: user?.id ?? null,
    })
    .select("id")
    .single();

  if (error) return { error: friendlyCheckError(error, input.checkNumber) };

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
  const currentUser = await requireUser();
  const supabase = await createClient();

  const { error } = await supabase.from("checks").insert({
    payment_method: input.paymentMethod,
    department_id: input.departmentId,
    bank_account_id: input.bankAccountId,
    payee: input.payee,
    amount: input.amount,
    due_date: input.dueDate || null,
    notes: input.notes,
    created_by: currentUser.id,
  });

  if (error) return { error: safeErrorMessage(error) };
  await ensureSupplier(supabase, input.payee, currentUser.id);
  revalidateCheckPaths();
  return {};
}

// Finance admin finalizes a department's request: assigns the real check
// number and/or due date, optionally splitting it across departments at
// this point.
export async function issueCheck(
  checkId: string,
  input: {
    checkNumber: string | null;
    dueDate: string | null;
    paymentMethod?: "CHECK" | "TRANSFER";
    allocations: CheckAllocationInput[];
  },
): Promise<{ error?: string }> {
  await requireFinanceAdmin();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isSplit = input.allocations.some((a) => a.departmentId && a.amount > 0);

  const { error } = await supabase
    .from("checks")
    .update({
      check_number: input.checkNumber || null,
      due_date: input.dueDate || null,
      ...(input.paymentMethod ? { payment_method: input.paymentMethod } : {}),
      ...(input.checkNumber ? { issued_at: new Date().toISOString() } : {}),
      department_id: isSplit ? null : undefined,
      // Reaching this action at all means a finance admin approved it —
      // whether this is the first-time approval of a dept-manager request
      // or just finalizing an already-approved issuance-queue item.
      approved_at: new Date().toISOString(),
      approved_by: user?.id ?? null,
    })
    .eq("id", checkId);
  if (error) return { error: friendlyCheckError(error, input.checkNumber) };

  if (isSplit) {
    await supabase.from("check_allocations").delete().eq("check_id", checkId);
    const allocError = await insertAllocations(supabase, checkId, input.allocations);
    if (allocError) return { error: allocError };
  }

  revalidateCheckPaths();
  return {};
}

// Used from the issuance queue when a pending request turns out to need
// several payments instead of one: replaces the single pending check with
// a full spread (reusing createPaymentSpread), then removes the original
// row so it isn't double-counted.
export async function convertPendingCheckToSpread(
  checkId: string,
  rows: { date: string | null; amount: number; checkNumber: string | null; departmentId: string | null; allocations: CheckAllocationInput[] }[],
): Promise<{ error?: string }> {
  await requireFinanceAdmin();
  const supabase = await createClient();

  const [{ data: original, error: fetchError }, { data: originalAllocations, error: allocFetchError }] =
    await Promise.all([
      supabase.from("checks").select("*").eq("id", checkId).single(),
      supabase.from("check_allocations").select("department_id, amount").eq("check_id", checkId),
    ]);
  if (fetchError || !original) return { error: safeErrorMessage(fetchError) ?? "הצ׳ק/הבקשה לא נמצא/ה" };
  if (allocFetchError) return { error: safeErrorMessage(allocFetchError) };

  // If the original was itself split across departments (e.g. the result
  // of an earlier merge), the per-row department picker in the spread UI
  // has no way to represent that multi-department mix — so without this,
  // turning it into a spread would silently drop the department split.
  // Instead, scale the same department proportions into every new row.
  const originalTotal = Number(original.amount);
  const rowsWithAllocations =
    originalAllocations && originalAllocations.length > 0 && originalTotal > 0
      ? rows.map((r) => ({
          ...r,
          departmentId: null,
          allocations: originalAllocations.map((a) => ({
            departmentId: a.department_id,
            amount: Math.round(((Number(a.amount) / originalTotal) * r.amount + Number.EPSILON) * 100) / 100,
          })),
        }))
      : // The common case: the original just had one plain department, not a
        // split. Any row the caller left without a department (the UI is
        // supposed to pre-fill this, but a blank is a silent data-loss bug,
        // not a valid "no department" choice) falls back to the original's
        // department instead of ending up unclassified.
        rows.map((r) => ({
          ...r,
          departmentId: r.departmentId || (r.allocations.length === 0 ? original.department_id : null),
        }));

  const spreadResult = await createPaymentSpread({
    payee: original.payee,
    paymentMethod: original.payment_method as "CHECK" | "TRANSFER",
    internalBeneficiary: null,
    notes: original.notes,
    bankAccountId: original.bank_account_id,
    rows: rowsWithAllocations,
  });
  if (spreadResult.error) return spreadResult;

  const { error: deleteError } = await supabase.from("checks").delete().eq("id", checkId);
  if (deleteError) return { error: safeErrorMessage(deleteError) };

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
  if (spreadError) return { error: safeErrorMessage(spreadError) };

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
        issued_at: row.checkNumber ? new Date().toISOString() : null,
        department_id: isSplit ? null : row.departmentId,
        internal_beneficiary: input.internalBeneficiary || null,
        spread_id: spread.id,
        created_by: user?.id ?? null,
        approved_at: new Date().toISOString(),
        approved_by: user?.id ?? null,
      })
      .select("id")
      .single();
    if (error) return { error: friendlyCheckError(error, row.checkNumber) };
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
    checkNumber: string | null;
    payee: string;
    amount: number;
    date: string | null;
    status: "UNPAID" | "CLEARED" | "CANCELLED";
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

  const seenNumbers = new Set<string>();
  for (const r of validRows) {
    if (!r.checkNumber) continue;
    if (seenNumbers.has(r.checkNumber)) return { error: `מספר צ׳ק ${r.checkNumber} מופיע יותר מפעם אחת ברשימה שהודבקה` };
    seenNumbers.add(r.checkNumber);
  }

  const { error, count } = await supabase.from("checks").insert(
    validRows.map((r) => ({
      payment_method: "CHECK" as const,
      bank_account_id: bankAccountId,
      check_number: r.checkNumber,
      payee: r.payee,
      amount: r.amount,
      due_date: r.date || null,
      issued_at: r.checkNumber ? new Date().toISOString() : null,
      status: r.status,
      department_id: r.departmentId,
      skip_department_ledger: !r.includeInDepartmentLedger,
      created_by: user?.id ?? null,
      approved_at: new Date().toISOString(),
      approved_by: user?.id ?? null,
    })),
    { count: "exact" },
  );

  if (error) return { error: friendlyCheckError(error) };
  revalidateCheckPaths();
  return { count: count ?? validRows.length };
}

// Used by the paste-existing-checks importer: auto-fill a row's department
// from the most recent prior check to the same payee that was already
// classified, so only genuinely new payees land in the pending queue.
export async function lookupDepartmentsByPayee(payees: string[]): Promise<Record<string, string>> {
  await requireUser();
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

// Bulk-assigns one department to several checks/transfers at once — e.g.
// clearing a backlog of unclassified expenses from the /expenses screen.
// Clears any existing per-department split first since a bulk single-
// department assignment supersedes it.
export async function bulkAssignCheckDepartment(checkIds: string[], departmentId: string): Promise<{ error?: string }> {
  await requireFinanceAdmin();
  if (checkIds.length === 0 || !departmentId) return {};
  const supabase = await createClient();
  await supabase.from("check_allocations").delete().in("check_id", checkIds);
  const { error } = await supabase.from("checks").update({ department_id: departmentId }).in("id", checkIds);
  revalidateCheckPaths();
  return { error: safeErrorMessage(error) };
}

// Splits the combined total of several already-existing checks/transfers
// (e.g. old checks being reviewed on /expenses) across multiple
// departments, without changing how many checks there are or their
// individual amounts. Distributes each department's target amount across
// the selected checks in order (a "waterfall" fill), so a check whose
// amount doesn't land exactly on a department boundary gets split via
// check_allocations same as any other split check; a check that lands
// entirely within one department's share just gets that department_id
// directly, matching the single-department convention used everywhere
// else. Replaces any existing department/allocation on the selected checks.
export async function splitChecksAcrossDepartments(
  checkIds: string[],
  allocations: CheckAllocationInput[],
): Promise<{ error?: string }> {
  await requireFinanceAdmin();
  const validAllocations = allocations.filter((a) => a.departmentId && a.amount > 0);
  if (checkIds.length === 0) return { error: "יש לבחור צ׳קים/העברות" };
  if (validAllocations.length < 2) return { error: "יש להזין לפחות שתי מחלקות עם סכום" };

  const supabase = await createClient();
  const { data: checks, error: fetchError } = await supabase
    .from("checks")
    .select("id, amount")
    .in("id", checkIds)
    .order("created_at");
  if (fetchError) return { error: safeErrorMessage(fetchError) };
  if (!checks || checks.length !== checkIds.length) return { error: "חלק מהצ׳קים לא נמצאו" };

  const totalChecks = checks.reduce((sum, c) => sum + Number(c.amount), 0);
  const totalAllocated = validAllocations.reduce((sum, a) => sum + a.amount, 0);
  if (Math.abs(totalChecks - totalAllocated) > 0.01) {
    return { error: `סכום החלוקה (${totalAllocated}) חייב להיות שווה לסכום הצ׳קים שנבחרו (${totalChecks})` };
  }

  const deptQueue = validAllocations.map((a) => ({ departmentId: a.departmentId, remaining: a.amount }));
  let deptIdx = 0;
  const rowsByCheck = new Map<string, { department_id: string; amount: number }[]>();

  for (const check of checks) {
    let remaining = Number(check.amount);
    while (remaining > 0.001 && deptIdx < deptQueue.length) {
      const dept = deptQueue[deptIdx];
      const take = Math.min(remaining, dept.remaining);
      if (take > 0.001) {
        const list = rowsByCheck.get(check.id) ?? [];
        list.push({ department_id: dept.departmentId, amount: Math.round(take * 100) / 100 });
        rowsByCheck.set(check.id, list);
        remaining -= take;
        dept.remaining -= take;
      }
      if (dept.remaining <= 0.001) deptIdx += 1;
    }
  }

  await supabase.from("check_allocations").delete().in("check_id", checkIds);

  for (const [checkId, rows] of rowsByCheck.entries()) {
    if (rows.length === 1) {
      const { error } = await supabase
        .from("checks")
        .update({ department_id: rows[0].department_id })
        .eq("id", checkId);
      if (error) return { error: safeErrorMessage(error) };
    } else {
      const { error: clearError } = await supabase.from("checks").update({ department_id: null }).eq("id", checkId);
      if (clearError) return { error: safeErrorMessage(clearError) };
      const { error } = await supabase
        .from("check_allocations")
        .insert(rows.map((r) => ({ check_id: checkId, department_id: r.department_id, amount: r.amount })));
      if (error) return { error: safeErrorMessage(error) };
    }
  }

  revalidateCheckPaths();
  return {};
}

// "הנפקה מהירה": assigns a check number to several already-dated,
// number-less checks at once (e.g. a sequential run written by hand).
// Saved one at a time so a single bad row (duplicate number typed twice,
// row deleted meanwhile) doesn't block the rest of the batch.
export async function bulkAssignCheckNumbers(
  assignments: { checkId: string; checkNumber: string }[],
): Promise<{ outcomes: { checkId: string; success: boolean; reason?: string }[] }> {
  await requireFinanceAdmin();
  const supabase = await createClient();
  const outcomes: { checkId: string; success: boolean; reason?: string }[] = [];

  for (const a of assignments) {
    const checkNumber = a.checkNumber.trim();
    if (!checkNumber) {
      outcomes.push({ checkId: a.checkId, success: false, reason: "חסר מספר צ׳ק" });
      continue;
    }
    const { error } = await supabase
      .from("checks")
      .update({ check_number: checkNumber, issued_at: new Date().toISOString() })
      .eq("id", a.checkId);
    outcomes.push({ checkId: a.checkId, success: !error, reason: friendlyCheckError(error, checkNumber) });
  }

  revalidateCheckPaths();
  return { outcomes };
}

// Records a physical check number as burned/voided (e.g. torn or misprinted
// while writing a "הנפקה מהירה" batch by hand) — a CANCELLED placeholder
// check so the number is accounted for in the sequence/audit trail instead
// of just silently missing, without being assigned to any real payment
// request or counting toward any balance (CANCELLED checks are excluded
// from every balance/forecast query already).
export async function recordCancelledCheckNumber(
  bankAccountId: string,
  checkNumber: string,
): Promise<{ error?: string }> {
  await requireFinanceAdmin();
  const trimmed = checkNumber.trim();
  if (!bankAccountId) return { error: "לא נמצא חשבון בנק לצ׳ק המדולג" };
  if (!trimmed) return { error: "חסר מספר צ׳ק לדילוג" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase.from("checks").insert({
    bank_account_id: bankAccountId,
    payment_method: "CHECK",
    payee: "דילוג — צ׳ק תקול",
    amount: 1,
    check_number: trimmed,
    issued_at: new Date().toISOString(),
    status: "CANCELLED",
    department_id: null,
    notes: "מספר צ׳ק שדולג (פגום) בהנפקה מהירה",
    created_by: user?.id ?? null,
    approved_at: new Date().toISOString(),
    approved_by: user?.id ?? null,
  });

  revalidateCheckPaths();
  return { error: friendlyCheckError(error, trimmed) };
}

// Lightweight single-field update for setting a due date directly on the
// issuance-queue table — an admin who already knows the date but not yet
// the check number shouldn't have to open the full "הנפק"/edit flow just
// to record it.
export async function updateCheckDueDate(checkId: string, dueDate: string | null): Promise<{ error?: string }> {
  await requireFinanceAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("checks").update({ due_date: dueDate || null }).eq("id", checkId);
  revalidateCheckPaths();
  return { error: safeErrorMessage(error) };
}

export async function updateCheckStatus(
  checkId: string,
  status: "UNPAID" | "CLEARED" | "CANCELLED",
  internalBeneficiary?: string | null,
) {
  await requireFinanceAdmin();
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
  return { error: safeErrorMessage(error) };
}

export async function deleteCheck(checkId: string): Promise<{ error?: string }> {
  await requireFinanceAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("checks").delete().eq("id", checkId);
  revalidateCheckPaths();
  return { error: safeErrorMessage(error) };
}

export type CheckSpreadRow = {
  id: string;
  check_number: string | null;
  amount: number;
  due_date: string | null;
  status: string;
  departmentName: string | null;
  allocations: { departmentId: string; departmentName: string | null; amount: number }[];
};

export type CheckSpreadDetail = {
  check: {
    id: string;
    payee: string;
    payment_method: string;
    notes: string | null;
    bankName: string | null;
    accountNumber: string | null;
  };
  spreadRows: CheckSpreadRow[];
};

// Full detail for one check — if it's part of a spread (several checks
// under one spread_id, whether from a supplier installment plan or several
// merged payment requests), pulls in every sibling check and each row's
// department split, not just the one that was clicked.
export async function getCheckSpreadDetail(checkId: string): Promise<{ error?: string; detail?: CheckSpreadDetail }> {
  await requireUser();
  const supabase = await createClient();
  const { data: check, error } = await supabase
    .from("checks")
    .select("*, bank_accounts(bank_name, account_number)")
    .eq("id", checkId)
    .single();
  if (error || !check) return { error: error ? safeErrorMessage(error) : "הצ׳ק לא נמצא" };

  const rawRows = check.spread_id
    ? (
        await supabase
          .from("checks")
          .select("id, check_number, amount, due_date, status, department_id, departments(name)")
          .eq("spread_id", check.spread_id)
          .order("due_date", { ascending: true, nullsFirst: false })
      ).data
    : null;
  const rows = (rawRows ?? [check]) as unknown as {
    id: string;
    check_number: string | null;
    amount: number;
    due_date: string | null;
    status: string;
    department_id: string | null;
    departments: { name: string } | null;
  }[];

  const { data: allocations } = await supabase
    .from("check_allocations")
    .select("check_id, department_id, amount, departments(name)")
    .in(
      "check_id",
      rows.map((r) => r.id),
    );
  const allocationsByCheck = new Map<string, { departmentId: string; departmentName: string | null; amount: number }[]>();
  for (const a of (allocations ?? []) as unknown as {
    check_id: string;
    department_id: string;
    amount: number;
    departments: { name: string } | null;
  }[]) {
    const list = allocationsByCheck.get(a.check_id) ?? [];
    list.push({ departmentId: a.department_id, departmentName: a.departments?.name ?? null, amount: Number(a.amount) });
    allocationsByCheck.set(a.check_id, list);
  }

  const bankAccounts = check as unknown as { bank_accounts: { bank_name: string; account_number: string } | null };

  return {
    detail: {
      check: {
        id: check.id,
        payee: check.payee,
        payment_method: check.payment_method,
        notes: check.notes,
        bankName: bankAccounts.bank_accounts?.bank_name ?? null,
        accountNumber: bankAccounts.bank_accounts?.account_number ?? null,
      },
      spreadRows: rows.map((r) => ({
        id: r.id,
        check_number: r.check_number,
        amount: Number(r.amount),
        due_date: r.due_date,
        status: r.status,
        departmentName: r.departments?.name ?? null,
        allocations: allocationsByCheck.get(r.id) ?? [],
      })),
    },
  };
}

export type PayeeExpenseRow = {
  id: string;
  due_date: string | null;
  amount: number;
  payment_method: string;
  check_number: string | null;
  status: string;
  department_id: string | null;
  departmentName: string | null;
  categoryName: string | null;
  notes: string | null;
  spread_id: string | null;
};

// Every approved expense (check/transfer with a due date, not cancelled)
// for one payee — RLS already scopes this to whatever departments the
// caller can see, same as every other checks query. Also returns the
// department list and each check's split allocations so the payee-history
// modal can offer full inline editing per row, not just a read-only list.
export async function getExpensesByPayee(payee: string): Promise<{
  rows: PayeeExpenseRow[];
  departments: Tables<"departments">[];
  allocationsByCheck: Record<string, CheckAllocationInput[]>;
}> {
  await requireUser();
  const supabase = await createClient();
  const [{ data }, { data: departments }] = await Promise.all([
    supabase
      .from("checks")
      .select(
        "id, due_date, amount, payment_method, check_number, status, department_id, notes, spread_id, departments(name), categories(name)",
      )
      .ilike("payee", payee)
      .not("due_date", "is", null)
      .neq("status", "CANCELLED")
      .order("due_date", { ascending: false }),
    supabase.from("departments").select("*").order("name"),
  ]);

  const rows = (data ?? []) as unknown as {
    id: string;
    due_date: string | null;
    amount: number;
    payment_method: string;
    check_number: string | null;
    status: string;
    department_id: string | null;
    notes: string | null;
    spread_id: string | null;
    departments: { name: string } | null;
    categories: { name: string } | null;
  }[];

  const checkIds = rows.map((r) => r.id);
  const { data: allocations } =
    checkIds.length > 0
      ? await supabase.from("check_allocations").select("check_id, department_id, amount").in("check_id", checkIds)
      : { data: [] as { check_id: string; department_id: string; amount: number }[] };
  const allocationsByCheck: Record<string, CheckAllocationInput[]> = {};
  for (const a of allocations ?? []) {
    (allocationsByCheck[a.check_id] ??= []).push({ departmentId: a.department_id, amount: Number(a.amount) });
  }

  return {
    rows: rows.map((r) => ({
      id: r.id,
      due_date: r.due_date,
      amount: Number(r.amount),
      payment_method: r.payment_method,
      check_number: r.check_number,
      status: r.status,
      department_id: r.department_id,
      departmentName: r.departments?.name ?? null,
      categoryName: r.categories?.name ?? null,
      notes: r.notes,
      spread_id: r.spread_id,
    })),
    departments: departments ?? [],
    allocationsByCheck,
  };
}

// Candidate list for the bank-reconciliation panel: unpaid, numbered checks
// on a given bank account, to be matched client-side against a pasted bank
// statement by check number + amount.
export async function getUnpaidChecksForReconciliation(
  bankAccountId: string,
): Promise<{ id: string; check_number: string; amount: number; payee: string; due_date: string | null }[]> {
  await requireFinanceAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("checks")
    .select("id, check_number, amount, payee, due_date")
    .eq("bank_account_id", bankAccountId)
    .eq("payment_method", "CHECK")
    .eq("status", "UNPAID")
    .not("check_number", "is", null)
    .order("due_date");
  if (error) throw new Error(error.message);
  return (data ?? []).map((c) => ({ ...c, check_number: c.check_number as string, amount: Number(c.amount) }));
}

// Bulk-confirms a batch of checks as cleared, for the reconciliation panel.
export async function bulkMarkChecksCleared(checkIds: string[]): Promise<{ error?: string; count?: number }> {
  await requireFinanceAdmin();
  const supabase = await createClient();
  if (checkIds.length === 0) return { count: 0 };
  const { error, count } = await supabase
    .from("checks")
    .update({ status: "CLEARED" }, { count: "exact" })
    .in("id", checkIds);
  if (error) return { error: safeErrorMessage(error) };
  revalidateCheckPaths();
  return { count: count ?? checkIds.length };
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
      issued_at: row.checkNumber ? new Date().toISOString() : null,
      department_id: row.departmentId || null,
      notes: row.notes,
      created_by: user?.id ?? null,
      approved_at: new Date().toISOString(),
      approved_by: user?.id ?? null,
    });
    if (error) {
      outcomes.push({ success: false, reason: friendlyCheckError(error, row.checkNumber) });
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
  const currentUser = await requireUser();
  const supabase = await createClient();

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
      created_by: currentUser.id,
    });
    if (error) {
      outcomes.push({ success: false, reason: safeErrorMessage(error) ?? "שגיאה" });
    } else {
      outcomes.push({ success: true });
      await ensureSupplier(supabase, row.payee, currentUser.id);
    }
  }

  revalidateCheckPaths();
  return { outcomes };
}

// Merges several pending checks/transfers to the same payee (same bank
// account, same payment method) into a single check. Each original check's
// amount becomes a department allocation on the merged check when they
// belonged to different departments, so no department attribution is lost.
//
// When the selection mixes checks and transfers, pass forcePaymentMethod to
// convert every selected row to that method first (after the caller has
// warned the admin and gotten a choice) so the merge can go ahead instead
// of just failing on the type mismatch.
export async function mergeChecks(
  checkIds: string[],
  forcePaymentMethod?: "CHECK" | "TRANSFER",
): Promise<{ error?: string }> {
  await requireFinanceAdmin();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (checkIds.length < 2) return { error: "יש לבחור לפחות שני צ׳קים/העברות למיזוג" };

  if (forcePaymentMethod) {
    const { error: convertError } = await supabase
      .from("checks")
      .update({ payment_method: forcePaymentMethod, check_number: null })
      .in("id", checkIds);
    if (convertError) return { error: safeErrorMessage(convertError) };
  }

  const [{ data: checks, error: fetchError }, { data: existingAllocations, error: allocFetchError }] =
    await Promise.all([
      supabase.from("checks").select("*").in("id", checkIds),
      supabase.from("check_allocations").select("*").in("check_id", checkIds),
    ]);
  if (fetchError) return { error: safeErrorMessage(fetchError) };
  if (allocFetchError) return { error: safeErrorMessage(allocFetchError) };
  if (!checks || checks.length !== checkIds.length) return { error: "חלק מהצ׳קים לא נמצאו" };

  const payees = new Set(checks.map((c) => c.payee.trim().toLowerCase()));
  if (payees.size > 1) return { error: "ניתן למזג רק צ׳קים/העברות לאותו מוטב" };
  const bankAccountIds = new Set(checks.map((c) => c.bank_account_id));
  if (bankAccountIds.size > 1) return { error: "ניתן למזג רק צ׳קים/העברות מאותו חשבון בנק" };
  const paymentMethods = new Set(checks.map((c) => c.payment_method));
  if (paymentMethods.size > 1) return { error: "ניתן למזג רק צ׳קים/העברות מאותו סוג (צ׳ק/העברה)" };

  // Preserve each original check's department attribution — including
  // checks that were themselves already split across departments — by
  // summing per-department amounts across the whole selection, rather than
  // collapsing to a single department_id whenever more than one is involved.
  const allocationsByCheck = new Map<string, { department_id: string; amount: number }[]>();
  for (const a of existingAllocations ?? []) {
    const list = allocationsByCheck.get(a.check_id) ?? [];
    list.push({ department_id: a.department_id, amount: Number(a.amount) });
    allocationsByCheck.set(a.check_id, list);
  }

  const unclassified = checks.filter((c) => !c.department_id && !allocationsByCheck.has(c.id));
  if (unclassified.length > 0) {
    return { error: "יש לסווג למחלקה את כל הצ׳קים/ההעברות הנבחרים לפני מיזוג" };
  }

  const totalAmount = checks.reduce((sum, c) => sum + Number(c.amount), 0);
  const departmentTotals = new Map<string, number>();
  for (const c of checks) {
    const existing = allocationsByCheck.get(c.id);
    if (existing) {
      for (const a of existing) {
        departmentTotals.set(a.department_id, (departmentTotals.get(a.department_id) ?? 0) + a.amount);
      }
    } else if (c.department_id) {
      departmentTotals.set(c.department_id, (departmentTotals.get(c.department_id) ?? 0) + Number(c.amount));
    }
  }
  const singleDepartment = departmentTotals.size === 1 ? [...departmentTotals.keys()][0] : null;

  // Carry the earliest due date forward — dropping it would silently bump
  // an already-scheduled check back into the no-date "ממתינות לאישור"
  // queue, which looks like the merge lost information (it also loses the
  // split's visibility there, since that queue doesn't render allocations).
  const dueDates = checks.map((c) => c.due_date).filter((d): d is string => !!d);
  const earliestDueDate = dueDates.length > 0 ? dueDates.sort()[0] : null;

  const { data: merged, error: insertError } = await supabase
    .from("checks")
    .insert({
      payment_method: checks[0].payment_method,
      bank_account_id: checks[0].bank_account_id,
      payee: checks[0].payee,
      amount: totalAmount,
      due_date: earliestDueDate,
      department_id: singleDepartment,
      notes: `מיזוג ${checks.length} צ׳קים/העברות`,
      created_by: user?.id ?? null,
      // Merging only ever operates on already-approved items (the
      // issuance/execution queues) — the merged result stays approved too,
      // otherwise it would silently fall back into pending-approval.
      approved_at: new Date().toISOString(),
      approved_by: user?.id ?? null,
    })
    .select("id")
    .single();
  if (insertError) return { error: safeErrorMessage(insertError) };

  if (!singleDepartment) {
    const allocRows = [...departmentTotals.entries()].map(([departmentId, amount]) => ({ departmentId, amount }));
    const allocError = await insertAllocations(supabase, merged.id, allocRows);
    if (allocError) return { error: allocError };
  }

  const { error: deleteError } = await supabase.from("checks").delete().in("id", checkIds);
  if (deleteError) return { error: safeErrorMessage(deleteError) };

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
  if (fetchError) return { error: safeErrorMessage(fetchError) };
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
    if (spreadError) return { error: safeErrorMessage(spreadError) };
    spreadId = spread.id;
  }

  const { error: updateError } = await supabase.from("checks").update({ spread_id: spreadId }).in("id", checkIds);
  if (updateError) return { error: safeErrorMessage(updateError) };

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
    categoryId?: string | null;
    notes: string | null;
    paymentMethod?: "CHECK" | "TRANSFER";
    allocations?: CheckAllocationInput[];
  },
): Promise<{ error?: string }> {
  await requireFinanceAdmin();
  const supabase = await createClient();
  const isSplit = (input.allocations ?? []).some((a) => a.departmentId && a.amount > 0);

  const { data: existing } = await supabase.from("checks").select("check_number").eq("id", checkId).single();
  const justNumbered = !existing?.check_number && !!input.checkNumber;

  const { error } = await supabase
    .from("checks")
    .update({
      payee: input.payee,
      amount: input.amount,
      due_date: input.dueDate || null,
      check_number: input.checkNumber || null,
      department_id: isSplit ? null : input.departmentId || null,
      notes: input.notes,
      ...(input.categoryId !== undefined ? { category_id: input.categoryId || null } : {}),
      ...(input.paymentMethod ? { payment_method: input.paymentMethod } : {}),
      ...(justNumbered ? { issued_at: new Date().toISOString() } : {}),
    })
    .eq("id", checkId);
  if (error) {
    revalidateCheckPaths();
    return { error: friendlyCheckError(error, input.checkNumber) };
  }

  if (input.allocations !== undefined) {
    await supabase.from("check_allocations").delete().eq("check_id", checkId);
    if (isSplit) {
      const allocError = await insertAllocations(supabase, checkId, input.allocations!);
      if (allocError) {
        revalidateCheckPaths();
        return { error: allocError };
      }
    }
  }

  revalidateCheckPaths();
  return {};
}

// Lets an admin reclassify a check tagged "old" (skip_department_ledger)
// while reviewing a department report — either confirm it really is old
// history that shouldn't count again, or flip it back to counting toward
// the department's balance because it turns out it was never accounted
// for under the old system after all.
export async function updateCheckLedgerFlag(checkId: string, skipDepartmentLedger: boolean): Promise<{ error?: string }> {
  await requireFinanceAdmin();
  const supabase = await createClient();
  const { error } = await supabase
    .from("checks")
    .update({ skip_department_ledger: skipDepartmentLedger })
    .eq("id", checkId);
  revalidateCheckPaths();
  return { error: safeErrorMessage(error) };
}
