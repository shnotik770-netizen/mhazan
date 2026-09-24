"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireFinanceAdmin, requireUser } from "@/lib/auth";
import { safeErrorMessage } from "@/lib/safe-error";
import {
  ensureSupplier,
  friendlyCheckError,
  insertAllocations,
  revalidateCheckPaths,
  type CheckAllocationInput,
} from "./checks-shared";

export type PettyCashEntryBatchRow = {
  supplierName: string;
  invoiceNumber: string;
  amount: number;
  entryDate: string;
  // Null when split across departments via `allocations` instead — same
  // convention as a regular check (see createCheck/CheckAllocationInput).
  departmentId: string | null;
  allocations: CheckAllocationInput[];
  categoryId: string | null;
  paidBy: string | null;
  notes: string | null;
};

export type PettyCashBatchOutcome = { success: boolean; reason?: string };

// Logs one petty-cash invoice at a time (the caller loops this into a
// batch the same way every other bulk entry point in the app works, so one
// bad row never blocks the rest). A non-admin can only file a single-
// department entry, which lands PENDING until a finance admin reviews it —
// RLS (petty_cash_entries_dept_manager_request) enforces this same shape at
// the database level too; splitting across departments is admin-only, same
// as for a regular check.
export async function createPettyCashEntryBatch(rows: PettyCashEntryBatchRow[]): Promise<{ outcomes: PettyCashBatchOutcome[] }> {
  const user = await requireUser();
  const supabase = await createClient();
  const isAdmin = user.profile.role === "FINANCE_ADMIN";

  const outcomes: PettyCashBatchOutcome[] = [];
  const departmentIds = new Set<string>();

  for (const row of rows) {
    if (!row.supplierName.trim()) {
      outcomes.push({ success: false, reason: "יש להזין שם ספק" });
      continue;
    }
    if (!row.invoiceNumber.trim()) {
      outcomes.push({ success: false, reason: "יש להזין מספר חשבונית" });
      continue;
    }
    if (!row.amount || row.amount <= 0) {
      outcomes.push({ success: false, reason: "סכום לא תקין" });
      continue;
    }
    if (!row.entryDate) {
      outcomes.push({ success: false, reason: "יש להזין תאריך" });
      continue;
    }
    const isSplit = row.allocations.some((a) => a.departmentId && a.amount > 0);
    if (isSplit && !isAdmin) {
      outcomes.push({ success: false, reason: "פיצול בין מחלקות זמין רק למנהל כספים" });
      continue;
    }
    if (!isSplit && !row.departmentId) {
      outcomes.push({ success: false, reason: "יש לבחור מחלקה" });
      continue;
    }

    const { data: created, error } = await supabase
      .from("petty_cash_entries")
      .insert({
        supplier_name: row.supplierName.trim(),
        invoice_number: row.invoiceNumber.trim(),
        amount: row.amount,
        entry_date: row.entryDate,
        department_id: isSplit ? null : row.departmentId,
        category_id: row.categoryId || null,
        paid_by: row.paidBy?.trim() || null,
        notes: row.notes,
        created_by: user.id,
        status: isAdmin ? "APPROVED" : "PENDING",
        approved_by: isAdmin ? user.id : null,
        approved_at: isAdmin ? new Date().toISOString() : null,
      })
      .select("id")
      .single();

    if (error) {
      outcomes.push({ success: false, reason: safeErrorMessage(error) });
      continue;
    }

    if (isSplit) {
      const allocError = await insertAllocations(supabase, created.id, row.allocations);
      if (allocError) {
        outcomes.push({ success: false, reason: allocError });
        continue;
      }
      for (const a of row.allocations) if (a.departmentId && a.amount > 0) departmentIds.add(a.departmentId);
    } else if (row.departmentId) {
      departmentIds.add(row.departmentId);
    }

    await ensureSupplier(supabase, row.supplierName, user.id);
    outcomes.push({ success: true });
  }

  revalidatePath("/checks");
  for (const id of departmentIds) revalidateCheckPaths(id);
  return { outcomes };
}

// Approve/reject a pending entry before it can be included in a settlement
// — the same review gate every other request type in this app goes through
// (manual entries, dept-manager check requests) before it can affect real
// money.
export async function reviewPettyCashEntry(entryId: string, decision: "APPROVED" | "REJECTED"): Promise<{ error?: string }> {
  const admin = await requireFinanceAdmin();
  const supabase = await createClient();
  const [{ data: entry }, { data: allocations }] = await Promise.all([
    supabase.from("petty_cash_entries").select("department_id").eq("id", entryId).single(),
    supabase.from("petty_cash_entry_allocations").select("department_id").eq("petty_cash_entry_id", entryId),
  ]);
  const { error } = await supabase
    .from("petty_cash_entries")
    .update({ status: decision, approved_by: admin.id, approved_at: new Date().toISOString() })
    .eq("id", entryId);
  if (error) return { error: safeErrorMessage(error) };

  revalidatePath("/checks");
  if (entry?.department_id) revalidateCheckPaths(entry.department_id);
  for (const a of allocations ?? []) revalidateCheckPaths(a.department_id);
  return {};
}

// Lets a finance admin correct a still-unsettled entry (a typo in the
// supplier name/invoice number, a wrong amount) — mirrors updateManualEntry.
// Once an entry has a check_id (settled) it's part of an already-issued
// check/transfer and shouldn't be edited here.
export async function updatePettyCashEntry(
  entryId: string,
  input: {
    supplierName: string;
    invoiceNumber: string;
    amount: number;
    entryDate: string;
    departmentId: string | null;
    categoryId: string | null;
    paidBy: string | null;
    notes: string | null;
  },
): Promise<{ error?: string }> {
  await requireFinanceAdmin();
  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("petty_cash_entries")
    .select("department_id, check_id")
    .eq("id", entryId)
    .single();
  if (existing?.check_id) return { error: "לא ניתן לערוך חשבונית ששולמה כבר" };

  const { error } = await supabase
    .from("petty_cash_entries")
    .update({
      supplier_name: input.supplierName.trim(),
      invoice_number: input.invoiceNumber.trim(),
      amount: input.amount,
      entry_date: input.entryDate,
      department_id: input.departmentId,
      category_id: input.categoryId,
      paid_by: input.paidBy?.trim() || null,
      notes: input.notes,
    })
    .eq("id", entryId);
  if (error) return { error: safeErrorMessage(error) };

  revalidatePath("/checks");
  if (input.departmentId) revalidateCheckPaths(input.departmentId);
  if (existing?.department_id && existing.department_id !== input.departmentId) revalidateCheckPaths(existing.department_id);
  return {};
}

export async function deletePettyCashEntry(entryId: string): Promise<{ error?: string }> {
  await requireFinanceAdmin();
  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("petty_cash_entries")
    .select("department_id, check_id")
    .eq("id", entryId)
    .single();
  if (existing?.check_id) return { error: "לא ניתן למחוק חשבונית ששולמה כבר" };

  const { error } = await supabase.from("petty_cash_entries").delete().eq("id", entryId);
  if (error) return { error: safeErrorMessage(error) };

  revalidatePath("/checks");
  if (existing?.department_id) revalidateCheckPaths(existing.department_id);
  return {};
}

export type PettyCashSettlement = {
  paymentMethod: "CHECK" | "TRANSFER";
  bankAccountId: string;
  checkNumber: string | null;
  dueDate: string;
  notes: string | null;
};

// Pays out a batch of approved, not-yet-settled invoices as ONE real check/
// transfer — the actual physical payment event, tracked like any other
// check (its own check_number/bank_account_id/due_date, visible in the
// issuance queue and bank-account debt ledger). Department attribution is
// preserved via check_allocations, summed across every selected entry's own
// department (or its own split), exactly like mergeChecks does for regular
// checks. Unlike mergeChecks, the original entries are NOT deleted — they're
// stamped with the new check's id instead, so the department report can
// keep showing each supplier/invoice individually (tagged "קופה קטנה")
// instead of one lump "החזר קופה קטנה" row.
export async function settlePettyCashEntries(entryIds: string[], settlement: PettyCashSettlement): Promise<{ error?: string }> {
  const admin = await requireFinanceAdmin();
  const supabase = await createClient();

  if (entryIds.length === 0) return { error: "יש לבחור לפחות חשבונית אחת" };
  if (!settlement.bankAccountId) return { error: "יש לבחור חשבון בנק" };
  if (!settlement.dueDate) return { error: "יש להזין תאריך" };

  const [{ data: entries, error: fetchError }, { data: allocations, error: allocFetchError }] = await Promise.all([
    supabase.from("petty_cash_entries").select("*").in("id", entryIds),
    supabase.from("petty_cash_entry_allocations").select("*").in("petty_cash_entry_id", entryIds),
  ]);
  if (fetchError) return { error: safeErrorMessage(fetchError) };
  if (allocFetchError) return { error: safeErrorMessage(allocFetchError) };
  if (!entries || entries.length !== entryIds.length) return { error: "חלק מהחשבוניות לא נמצאו" };
  if (entries.some((e) => e.status !== "APPROVED")) return { error: "ניתן לשלם רק חשבוניות מאושרות" };
  if (entries.some((e) => e.check_id !== null)) return { error: "חלק מהחשבוניות כבר שולמו" };

  const totalAmount = entries.reduce((sum, e) => sum + Number(e.amount), 0);

  const allocationsByEntry = new Map<string, { department_id: string; amount: number }[]>();
  for (const a of allocations ?? []) {
    const list = allocationsByEntry.get(a.petty_cash_entry_id) ?? [];
    list.push({ department_id: a.department_id, amount: Number(a.amount) });
    allocationsByEntry.set(a.petty_cash_entry_id, list);
  }

  const departmentTotals = new Map<string, number>();
  for (const e of entries) {
    const existing = allocationsByEntry.get(e.id);
    if (existing) {
      for (const a of existing) departmentTotals.set(a.department_id, (departmentTotals.get(a.department_id) ?? 0) + a.amount);
    } else if (e.department_id) {
      departmentTotals.set(e.department_id, (departmentTotals.get(e.department_id) ?? 0) + Number(e.amount));
    }
  }
  const singleDepartment = departmentTotals.size === 1 ? [...departmentTotals.keys()][0] : null;

  const { data: created, error: insertError } = await supabase
    .from("checks")
    .insert({
      payment_method: settlement.paymentMethod,
      bank_account_id: settlement.bankAccountId,
      payee: "החזר קופה קטנה",
      amount: totalAmount,
      due_date: settlement.dueDate,
      check_number: settlement.checkNumber || null,
      issued_at: settlement.checkNumber ? new Date().toISOString() : null,
      department_id: singleDepartment,
      notes: settlement.notes || `תשלום ${entries.length} חשבוניות קופה קטנה`,
      has_invoice: true,
      is_petty_cash: true,
      created_by: admin.id,
      approved_at: new Date().toISOString(),
      approved_by: admin.id,
    })
    .select("id")
    .single();
  if (insertError) return { error: friendlyCheckError(insertError, settlement.checkNumber) };

  if (!singleDepartment) {
    const allocRows = [...departmentTotals.entries()].map(([departmentId, amount]) => ({ departmentId, amount }));
    const allocError = await insertAllocations(supabase, created.id, allocRows);
    if (allocError) return { error: allocError };
  }

  const { error: updateError } = await supabase
    .from("petty_cash_entries")
    .update({ check_id: created.id })
    .in("id", entryIds);
  if (updateError) return { error: safeErrorMessage(updateError) };

  revalidatePath("/checks");
  revalidatePath("/ledger");
  revalidatePath("/");
  revalidatePath("/forecast");
  for (const deptId of departmentTotals.keys()) revalidateCheckPaths(deptId);
  return {};
}
