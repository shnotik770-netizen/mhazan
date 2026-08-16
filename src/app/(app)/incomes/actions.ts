"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type IncomeBatchRow = {
  date: string;
  categoryId: string;
  donorName: string;
  amount: number;
  receiptNumber: string;
  notes: string;
};

export async function submitIncomeBatch(bankAccountId: string, rows: IncomeBatchRow[]) {
  if (!bankAccountId) return { error: "יש לבחור חשבון בנק יעד" };
  const validRows = rows.filter((r) => r.categoryId && r.amount > 0);
  if (validRows.length === 0) return { error: "אין שורות תקינות לשמירה" };

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const payload = validRows.map((r) => ({
    bank_account_id: bankAccountId,
    category_id: r.categoryId,
    date: r.date || new Date().toISOString().slice(0, 10),
    donor_name: r.donorName || null,
    amount: r.amount,
    receipt_number: r.receiptNumber || null,
    notes: r.notes || null,
    created_by: user?.id ?? null,
    // owner_department_id / issuing_department_id are placeholders — the
    // fn_income_before_write trigger derives and overwrites both.
    owner_department_id: "00000000-0000-0000-0000-000000000000",
    issuing_department_id: "00000000-0000-0000-0000-000000000000",
  }));

  const { error, count } = await supabase
    .from("incomes")
    .insert(payload, { count: "exact" });

  if (error) return { error: error.message };

  revalidatePath("/incomes");
  revalidatePath("/");
  revalidatePath("/ledger");
  return { success: true, count: count ?? validRows.length };
}
