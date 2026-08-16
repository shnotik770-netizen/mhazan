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
      raw_paste_data: r.rawPasteData ?? null,
      notes: r.notes || null,
      created_by: user?.id ?? null,
      issuing_department_id: null,
    };

    let rowPayload: TablesInsert<"incomes">[] = [];
    if (r.splitAllocations.length > 0) {
      rowPayload = r.splitAllocations
        .filter((a) => a.departmentId && a.amount > 0)
        .map(
          (alloc) =>
            ({ ...base, amount: alloc.amount, owner_department_id: alloc.departmentId }) as unknown as TablesInsert<"incomes">,
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
