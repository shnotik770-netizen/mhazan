"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireFinanceAdmin } from "@/lib/auth";
import type { TablesInsert } from "@/lib/supabase/database.types";

export type SplitAllocation = { departmentId: string; amount: number };

export type IncomeBatchRow = {
  date: string;
  categoryId: string;
  donorName: string;
  donorIdNumber: string;
  amount: number;
  receiptNumber: string;
  transactionRef: string;
  orderRef: string;
  paymentMethod: string;
  installmentCurrent: number | null;
  installmentTotal: number | null;
  notes: string;
  splitAllocations: SplitAllocation[];
  rawPasteData?: Record<string, string>;
};

export type SubmitIncomeBatchResult = {
  savedCount: number;
  // Same order/length as the rows passed in, so the client can zip them
  // back together and know exactly which original rows to keep visible.
  outcomes: { success: boolean; reason?: string }[];
  error?: string;
};

// Used by the paste-income preview to flag rows whose transaction number
// was already recorded (e.g. an installment charge re-appearing in an
// overlapping date-range paste), so they can be excluded before saving
// instead of relying on the DB's unique constraint to reject them.
export async function checkExistingTransactionRefs(refs: string[]): Promise<string[]> {
  const unique = Array.from(new Set(refs.filter(Boolean)));
  if (unique.length === 0) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("incomes")
    .select("transaction_ref")
    .in("transaction_ref", unique);
  if (error) throw new Error(error.message);

  return (data ?? []).map((r) => r.transaction_ref).filter((r): r is string => Boolean(r));
}

// Inserts rows ONE AT A TIME rather than as a single multi-row statement:
// a single row that fails (a race-condition duplicate, a category that got
// unassigned in the meantime, etc.) must never block the rest of the
// batch from saving. Each split row's allocations are still inserted
// together so a given source row lands atomically (all its department
// slices or none), but different source rows are fully independent.
export async function submitIncomeBatch(
  bankAccountId: string,
  rows: IncomeBatchRow[],
): Promise<SubmitIncomeBatchResult> {
  if (!bankAccountId) return { savedCount: 0, outcomes: [], error: "יש לבחור חשבון בנק יעד" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const today = new Date().toISOString().slice(0, 10);
  let savedCount = 0;
  const outcomes: { success: boolean; reason?: string }[] = [];

  for (const r of rows) {
    // owner_department_id/issuing_department_id are sent as real NULL, not
    // a placeholder — fn_income_before_write derives issuing_department_id
    // "if null" and unconditionally derives owner_department_id for
    // non-split categories. Split rows must supply a real
    // owner_department_id per allocation since there's no single category
    // department to derive it from.
    const base = {
      bank_account_id: bankAccountId,
      category_id: r.categoryId,
      date: r.date || today,
      donor_name: r.donorName || null,
      donor_id_number: r.donorIdNumber || null,
      receipt_number: r.receiptNumber || null,
      transaction_ref: r.transactionRef || null,
      order_ref: r.orderRef || null,
      payment_method: r.paymentMethod || null,
      installment_current: r.installmentCurrent,
      installment_total: r.installmentTotal,
      raw_paste_data: r.rawPasteData ?? null,
      notes: r.notes || null,
      created_by: user?.id ?? null,
      issuing_department_id: null,
    };

    let rowPayload: TablesInsert<"incomes">[] = [];
    if (r.splitAllocations.length > 0) {
      // transaction_ref has a partial unique index — the same bank
      // transaction only gets one ref across however many department slices
      // it's split into, so only the first split row keeps it.
      rowPayload = r.splitAllocations
        .filter((a) => a.departmentId && a.amount > 0)
        .map(
          (alloc, i) =>
            ({
              ...base,
              amount: alloc.amount,
              owner_department_id: alloc.departmentId,
              transaction_ref: i === 0 ? base.transaction_ref : null,
            }) as unknown as TablesInsert<"incomes">,
        );
    } else if (r.categoryId && r.amount > 0) {
      rowPayload = [
        { ...base, amount: r.amount, owner_department_id: null } as unknown as TablesInsert<"incomes">,
      ];
    }

    if (rowPayload.length === 0) {
      outcomes.push({ success: false, reason: "חסר קטגוריה או סכום" });
      continue;
    }

    const { error } = await supabase.from("incomes").insert(rowPayload);
    if (error) {
      const reason = error.code === "23505" ? "מספר עסקה כפול — כבר קיים במערכת" : error.message;
      outcomes.push({ success: false, reason });
    } else {
      savedCount += 1;
      outcomes.push({ success: true });
    }
  }

  revalidatePath("/incomes");
  revalidatePath("/");
  revalidatePath("/ledger");
  return { savedCount, outcomes };
}

export async function deleteIncome(incomeId: string): Promise<{ error?: string }> {
  await requireFinanceAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("incomes").delete().eq("id", incomeId);
  revalidatePath("/incomes");
  revalidatePath("/");
  revalidatePath("/ledger");
  return { error: error?.message };
}

function revalidateIncomePaths() {
  revalidatePath("/incomes");
  revalidatePath("/");
  revalidatePath("/ledger");
  revalidatePath("/transactions");
}

// Reassigns a single (non-split) income to a different department. Sets
// requires_inter_settlement explicitly since the DB trigger that derives it
// only fires on category/bank-account/issuing-department changes, not on
// owner_department_id directly.
export async function updateIncomeDepartment(incomeId: string, departmentId: string): Promise<{ error?: string }> {
  await requireFinanceAdmin();
  const supabase = await createClient();

  const { data: income, error: fetchError } = await supabase
    .from("incomes")
    .select("issuing_department_id")
    .eq("id", incomeId)
    .single();
  if (fetchError || !income) return { error: fetchError?.message ?? "ההכנסה לא נמצאה" };

  const { error } = await supabase
    .from("incomes")
    .update({
      owner_department_id: departmentId,
      requires_inter_settlement: departmentId !== income.issuing_department_id,
    })
    .eq("id", incomeId);
  if (error) return { error: error.message };

  revalidateIncomePaths();
  return {};
}

// Mirrors updateCheckLedgerFlag: reclassify an income tagged "old"
// (skip_department_ledger) while reviewing a department report — confirm
// it's really old history that shouldn't count again, or flip it back to
// counting toward the department's balance.
export async function updateIncomeLedgerFlag(incomeId: string, skipDepartmentLedger: boolean): Promise<{ error?: string }> {
  await requireFinanceAdmin();
  const supabase = await createClient();
  const { error } = await supabase
    .from("incomes")
    .update({ skip_department_ledger: skipDepartmentLedger })
    .eq("id", incomeId);
  revalidateIncomePaths();
  return { error: error?.message };
}

// Splits an existing (previously single-department) income across several
// departments: deletes the original row and inserts one row per
// allocation, preserving everything else. Only possible when the income's
// category is marked as a split category — the insert trigger otherwise
// unconditionally forces owner_department_id from the category's single
// department, the same constraint the paste-time split flow has.
export async function splitIncome(
  incomeId: string,
  allocations: SplitAllocation[],
): Promise<{ error?: string }> {
  await requireFinanceAdmin();
  const supabase = await createClient();

  const validAllocations = allocations.filter((a) => a.departmentId && a.amount > 0);
  if (validAllocations.length < 2) return { error: "יש להזין לפחות שתי מחלקות עם סכום" };

  const { data: income, error: fetchError } = await supabase.from("incomes").select("*").eq("id", incomeId).single();
  if (fetchError || !income) return { error: fetchError?.message ?? "ההכנסה לא נמצאה" };

  const { data: category } = await supabase.from("categories").select("is_split").eq("id", income.category_id).single();
  if (!category?.is_split) {
    return { error: "ניתן לפצל הכנסה רק מקטגוריה המוגדרת כקטגוריית פיצול (ניהול קטגוריות)" };
  }

  const totalAllocated = validAllocations.reduce((sum, a) => sum + a.amount, 0);
  if (Math.abs(totalAllocated - Number(income.amount)) > 0.01) {
    return { error: `סכום הפיצול (${totalAllocated}) חייב להיות שווה לסכום ההכנסה המקורי (${income.amount})` };
  }

  // transaction_ref is unique (partial index): the original bank
  // transaction's ref keeps that identity but only on the first new row,
  // matching the same rule used at paste-time. The original row still
  // holds that ref while it exists, so free it first (rather than delete
  // the original outright before we know the insert will succeed).
  const originalRef = income.transaction_ref;
  if (originalRef) {
    const { error: freeRefError } = await supabase
      .from("incomes")
      .update({ transaction_ref: null })
      .eq("id", incomeId);
    if (freeRefError) return { error: freeRefError.message };
  }

  const rows = validAllocations.map((alloc, i) => ({
    bank_account_id: income.bank_account_id,
    category_id: income.category_id,
    date: income.date,
    donor_name: income.donor_name,
    donor_id_number: income.donor_id_number,
    receipt_number: income.receipt_number,
    transaction_ref: i === 0 ? originalRef : null,
    order_ref: income.order_ref,
    raw_paste_data: income.raw_paste_data,
    notes: income.notes,
    created_by: income.created_by,
    issuing_department_id: income.issuing_department_id,
    owner_department_id: alloc.departmentId,
    amount: alloc.amount,
  }));

  const { data: inserted, error: insertError } = await supabase.from("incomes").insert(rows).select("id");
  if (insertError) {
    if (originalRef) await supabase.from("incomes").update({ transaction_ref: originalRef }).eq("id", incomeId);
    return { error: insertError.message };
  }

  const { error: deleteError } = await supabase.from("incomes").delete().eq("id", incomeId);
  if (deleteError) {
    // Roll back the just-inserted rows so we don't end up double-counting.
    await supabase
      .from("incomes")
      .delete()
      .in("id", (inserted ?? []).map((r) => r.id));
    return { error: deleteError.message };
  }

  revalidateIncomePaths();
  return {};
}
