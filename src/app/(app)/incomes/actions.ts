"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
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
  notes: string;
  splitAllocations: SplitAllocation[];
};

export async function submitIncomeBatch(bankAccountId: string, rows: IncomeBatchRow[]) {
  if (!bankAccountId) return { error: "יש לבחור חשבון בנק יעד" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const today = new Date().toISOString().slice(0, 10);

  // owner_department_id/issuing_department_id are sent as real NULL, not a
  // placeholder — fn_income_before_write derives issuing_department_id
  // "if null" and unconditionally derives owner_department_id for
  // non-split categories. A non-null placeholder would never get replaced
  // and would fail the foreign key check. Split-category rows are the one
  // case that must supply a real owner_department_id (the department the
  // admin allocated that slice to) since there's no single category
  // department to derive it from.
  const payload: TablesInsert<"incomes">[] = [];

  for (const r of rows) {
    const base = {
      bank_account_id: bankAccountId,
      category_id: r.categoryId,
      date: r.date || today,
      donor_name: r.donorName || null,
      donor_id_number: r.donorIdNumber || null,
      receipt_number: r.receiptNumber || null,
      transaction_ref: r.transactionRef || null,
      notes: r.notes || null,
      created_by: user?.id ?? null,
      issuing_department_id: null,
    };

    if (r.splitAllocations.length > 0) {
      for (const alloc of r.splitAllocations) {
        if (!alloc.departmentId || alloc.amount <= 0) continue;
        payload.push({
          ...base,
          amount: alloc.amount,
          owner_department_id: alloc.departmentId,
        } as unknown as TablesInsert<"incomes">);
      }
    } else if (r.categoryId && r.amount > 0) {
      payload.push({
        ...base,
        amount: r.amount,
        owner_department_id: null,
      } as unknown as TablesInsert<"incomes">);
    }
  }

  if (payload.length === 0) return { error: "אין שורות תקינות לשמירה" };

  const { error, count } = await supabase.from("incomes").insert(payload, { count: "exact" });

  if (error) return { error: error.message };

  revalidatePath("/incomes");
  revalidatePath("/");
  revalidatePath("/ledger");
  return { success: true, count: count ?? payload.length };
}
