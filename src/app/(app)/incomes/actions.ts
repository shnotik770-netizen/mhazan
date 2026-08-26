"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireFinanceAdmin, requireUser } from "@/lib/auth";
import { safeErrorMessage } from "@/lib/safe-error";
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
  typeText: string;
  notes: string;
  splitAllocations: SplitAllocation[];
  rawPasteData?: Record<string, string>;
};

export type MissedStandingOrderAlert = {
  departmentId: string;
  departmentName: string;
  orderRef: string;
  month: string;
  donorName: string;
  categoryName: string | null;
  amount: number;
};

export type SubmitIncomeBatchResult = {
  savedCount: number;
  // Same order/length as the rows passed in, so the client can zip them
  // back together and know exactly which original rows to keep visible.
  outcomes: { success: boolean; reason?: string }[];
  // Standing orders that were forecasted for a month this batch just
  // covered, but that never showed up among the actual incomes for that
  // department+month — surfaced right when the gap is discoverable (the
  // moment that month's income is fully pasted in), instead of only
  // quietly dropping out of the department report's forecast later.
  missedStandingOrders?: MissedStandingOrderAlert[];
  error?: string;
};

// Used by the paste-income preview to flag rows whose transaction number
// was already recorded (e.g. an installment charge re-appearing in an
// overlapping date-range paste), so they can be excluded before saving
// instead of relying on the DB's unique constraint to reject them.
export async function checkExistingTransactionRefs(refs: string[]): Promise<string[]> {
  await requireUser();
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
  // A whole batch pasted purely to backfill history — every row is
  // inserted with skip_department_ledger set, exactly like the "סמן
  // כישנה" toggle a manager can flip on an individual row later, just
  // applied to the entire paste up front instead of one row at a time.
  isHistory = false,
): Promise<SubmitIncomeBatchResult> {
  await requireFinanceAdmin();
  if (!bankAccountId) return { savedCount: 0, outcomes: [], error: "יש לבחור חשבון בנק יעד" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const today = new Date().toISOString().slice(0, 10);
  let savedCount = 0;
  const outcomes: { success: boolean; reason?: string }[] = [];
  // (departmentId, month) pairs actually touched by this batch — used
  // afterward to check which forecasted standing orders never showed up.
  const touchedDepartmentMonths = new Set<string>();

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
      type_text: r.typeText || null,
      raw_paste_data: r.rawPasteData ?? null,
      notes: r.notes || null,
      created_by: user?.id ?? null,
      issuing_department_id: null,
      skip_department_ledger: isHistory,
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

    const { data: inserted, error } = await supabase.from("incomes").insert(rowPayload).select("owner_department_id, date");
    if (error) {
      const reason = error.code === "23505" ? "מספר עסקה כפול — כבר קיים במערכת" : safeErrorMessage(error);
      outcomes.push({ success: false, reason });
    } else {
      savedCount += 1;
      outcomes.push({ success: true });
      for (const row of inserted ?? []) {
        if (row.owner_department_id) touchedDepartmentMonths.add(`${row.owner_department_id}|${row.date.slice(0, 7)}`);
      }
    }
  }

  // A history backfill isn't the live monthly reconciliation event this
  // check exists for — running it here would just flag old, already-known
  // gaps as if they'd been freshly discovered.
  const missedStandingOrders = isHistory ? [] : await detectMissedStandingOrders(supabase, touchedDepartmentMonths);

  revalidatePath("/incomes");
  revalidatePath("/");
  revalidatePath("/ledger");
  for (const key of touchedDepartmentMonths) revalidatePath(`/reports/${key.split("|")[0]}`);
  return { savedCount, outcomes, missedStandingOrders };
}

// For every (department, month) this batch actually touched, checks the
// cached Nedarim standing-order forecast for that same month against the
// full set of incomes now on file for that department+month (matched by
// order_ref) — anything forecasted but still unmatched is flagged as
// "missed" (unique per department+order+month, so re-pasting the same
// month twice never creates duplicate alerts). Only ever *adds* rows —
// never touches dismissed_at — so an admin's dismissal is never silently
// undone by a later paste.
type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;
async function detectMissedStandingOrders(
  supabase: SupabaseServerClient,
  departmentMonths: Set<string>,
): Promise<MissedStandingOrderAlert[]> {
  if (departmentMonths.size === 0) return [];
  const flagged: MissedStandingOrderAlert[] = [];

  for (const key of departmentMonths) {
    const [departmentId, month] = key.split("|");

    const { data: forecast } = await supabase
      .from("standing_order_forecast")
      .select("details")
      .eq("department_id", departmentId)
      .eq("month", month)
      .maybeSingle();
    const details = (forecast?.details ?? []) as unknown as { donorName: string; categoryName: string; amount: number; orderRef?: string }[];
    if (details.length === 0) continue;

    const { data: monthIncomes } = await supabase
      .from("incomes")
      .select("order_ref")
      .eq("owner_department_id", departmentId)
      .gte("date", `${month}-01`)
      .lt("date", `${addOneMonth(month)}-01`);
    const chargedRefs = new Set((monthIncomes ?? []).map((r) => r.order_ref).filter(Boolean));

    const missing = details.filter((d) => d.orderRef && !chargedRefs.has(d.orderRef));
    if (missing.length === 0) continue;

    const { data: department } = await supabase.from("departments").select("name").eq("id", departmentId).single();

    const { data: newlyInserted } = await supabase
      .from("standing_order_missed_charges")
      .upsert(
        missing.map((d) => ({
          department_id: departmentId,
          order_ref: d.orderRef as string,
          month,
          donor_name: d.donorName,
          category_name: d.categoryName || null,
          amount: d.amount,
        })),
        { onConflict: "department_id,order_ref,month", ignoreDuplicates: true },
      )
      .select("order_ref, donor_name, category_name, amount");

    for (const row of newlyInserted ?? []) {
      flagged.push({
        departmentId,
        departmentName: department?.name ?? departmentId,
        orderRef: row.order_ref,
        month,
        donorName: row.donor_name,
        categoryName: row.category_name,
        amount: Number(row.amount),
      });
    }
  }

  return flagged;
}

function addOneMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// Lets an admin archive a "missed standing order" note once it's been
// reviewed (the charge really didn't happen, or was found and recorded
// under a different reference) — it stays in the table for history, just
// no longer shown as an open item on the department report.
export async function dismissMissedStandingOrder(id: number): Promise<{ error?: string }> {
  const admin = await requireFinanceAdmin();
  const supabase = await createClient();
  const { data: existing, error: fetchError } = await supabase
    .from("standing_order_missed_charges")
    .select("department_id")
    .eq("id", id)
    .single();
  if (fetchError || !existing) return { error: safeErrorMessage(fetchError) ?? "הרשומה לא נמצאה" };

  const { error } = await supabase
    .from("standing_order_missed_charges")
    .update({ dismissed_at: new Date().toISOString(), dismissed_by: admin.id })
    .eq("id", id);
  if (error) return { error: safeErrorMessage(error) };

  revalidatePath(`/reports/${existing.department_id}`);
  return {};
}

// A narrow "fix a typo" edit for a donor's name, offered directly from a
// department report row — deliberately touches only this one field rather
// than reusing the full updateIncome (which expects date/amount/category/
// payment method together) so a quick spelling correction can never
// accidentally overwrite something else.
export async function updateIncomeDonorName(incomeId: string, donorName: string): Promise<{ error?: string }> {
  await requireFinanceAdmin();
  const trimmed = donorName.trim();
  if (!trimmed) return { error: "שם תורם לא יכול להיות ריק" };
  const supabase = await createClient();
  const { data: existing } = await supabase.from("incomes").select("owner_department_id").eq("id", incomeId).single();
  const { error } = await supabase.from("incomes").update({ donor_name: trimmed }).eq("id", incomeId);
  if (error) return { error: safeErrorMessage(error) };
  revalidateIncomePaths(existing?.owner_department_id);
  return {};
}

export async function deleteIncome(incomeId: string): Promise<{ error?: string }> {
  await requireFinanceAdmin();
  const supabase = await createClient();
  const { data: existing } = await supabase.from("incomes").select("owner_department_id").eq("id", incomeId).single();
  const { error } = await supabase.from("incomes").delete().eq("id", incomeId);
  revalidateIncomePaths(existing?.owner_department_id);
  return { error: safeErrorMessage(error) };
}

// An income also affects its department's own report page, not just the
// global incomes/ledger/transactions lists — missing this (the same class
// of bug fixed for manual entries) left an edited/reassigned/deleted
// income showing everywhere except its own /reports/[departmentId] until
// something else happened to bust that page's cache.
function revalidateIncomePaths(departmentId?: string | null) {
  revalidatePath("/incomes");
  revalidatePath("/");
  revalidatePath("/ledger");
  revalidatePath("/transactions");
  if (departmentId) revalidatePath(`/reports/${departmentId}`);
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
    .select("owner_department_id, issuing_department_id")
    .eq("id", incomeId)
    .single();
  if (fetchError || !income) return { error: safeErrorMessage(fetchError) ?? "ההכנסה לא נמצאה" };

  const { error } = await supabase
    .from("incomes")
    .update({
      owner_department_id: departmentId,
      requires_inter_settlement: departmentId !== income.issuing_department_id,
    })
    .eq("id", incomeId);
  if (error) return { error: safeErrorMessage(error) };

  revalidateIncomePaths(income.owner_department_id);
  if (departmentId !== income.owner_department_id) revalidateIncomePaths(departmentId);
  return {};
}

export type IncomeEditInput = {
  date: string;
  amount: number;
  donorName: string;
  categoryId: string;
  paymentMethod: string;
  typeText: string;
  receiptNumber: string;
  orderRef: string;
  notes: string;
};

// General edit of an income row's own details, from the unified
// transactions view. Department is deliberately not editable here: a
// DB trigger (fn_income_before_write) re-derives owner_department_id from
// category_id on every update that touches it, for any non-split category
// — the same rule the paste flow relies on — so setting both in one
// statement would just have the trigger silently overwrite whatever
// department this call sent. Use updateIncomeDepartment (its own,
// narrower call site) for a manual department override instead.
export async function updateIncome(incomeId: string, input: IncomeEditInput): Promise<{ error?: string }> {
  await requireFinanceAdmin();
  if (!input.date) return { error: "יש להזין תאריך" };
  if (!input.amount || input.amount <= 0) return { error: "סכום לא תקין" };
  if (!input.categoryId) return { error: "יש לבחור קטגוריה" };
  const supabase = await createClient();

  const { data: before } = await supabase.from("incomes").select("owner_department_id").eq("id", incomeId).single();

  const { data: updated, error } = await supabase
    .from("incomes")
    .update({
      date: input.date,
      amount: input.amount,
      donor_name: input.donorName || null,
      category_id: input.categoryId,
      payment_method: input.paymentMethod || null,
      type_text: input.typeText || null,
      receipt_number: input.receiptNumber || null,
      order_ref: input.orderRef || null,
      notes: input.notes || null,
    })
    .eq("id", incomeId)
    .select("owner_department_id")
    .single();
  if (error) return { error: safeErrorMessage(error) };

  // A category change can move owner_department_id via the DB trigger
  // above, so both the old and new department's report might need it.
  revalidateIncomePaths(before?.owner_department_id);
  if (updated && updated.owner_department_id !== before?.owner_department_id) {
    revalidateIncomePaths(updated.owner_department_id);
  }
  return {};
}

// Mirrors updateCheckLedgerFlag: reclassify an income tagged "old"
// (skip_department_ledger) while reviewing a department report — confirm
// it's really old history that shouldn't count again, or flip it back to
// counting toward the department's balance.
export async function updateIncomeLedgerFlag(incomeId: string, skipDepartmentLedger: boolean): Promise<{ error?: string }> {
  await requireFinanceAdmin();
  const supabase = await createClient();
  const { data: updated, error } = await supabase
    .from("incomes")
    .update({ skip_department_ledger: skipDepartmentLedger })
    .eq("id", incomeId)
    .select("owner_department_id")
    .single();
  revalidateIncomePaths(updated?.owner_department_id);
  return { error: safeErrorMessage(error) };
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
  if (fetchError || !income) return { error: safeErrorMessage(fetchError) ?? "ההכנסה לא נמצאה" };

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
    if (freeRefError) return { error: safeErrorMessage(freeRefError) };
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
    return { error: safeErrorMessage(insertError) };
  }

  const { error: deleteError } = await supabase.from("incomes").delete().eq("id", incomeId);
  if (deleteError) {
    // Roll back the just-inserted rows so we don't end up double-counting.
    await supabase
      .from("incomes")
      .delete()
      .in("id", (inserted ?? []).map((r) => r.id));
    return { error: safeErrorMessage(deleteError) };
  }

  revalidateIncomePaths();
  return {};
}

export type IncomeDetail = {
  id: string;
  date: string;
  amount: number;
  donorName: string | null;
  donorIdNumber: string | null;
  categoryName: string | null;
  departmentName: string | null;
  paymentMethod: string | null;
  installmentCurrent: number | null;
  installmentTotal: number | null;
  typeText: string | null;
  receiptNumber: string | null;
  orderRef: string | null;
  transactionRef: string | null;
  notes: string | null;
  bankName: string | null;
  accountNumber: string | null;
};

// Full detail for one income row — everything captured at paste time
// (donor, category, payment method/type, receipt/order/transaction
// numbers, bank account, notes), for the "פרטים" link on a report row.
export async function getIncomeDetail(incomeId: string): Promise<{ error?: string; detail?: IncomeDetail }> {
  await requireUser();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("incomes")
    .select("*, categories(name), bank_accounts(bank_name, account_number), owner:owner_department_id(name)")
    .eq("id", incomeId)
    .single();
  if (error || !data) return { error: error ? safeErrorMessage(error) : "ההכנסה לא נמצאה" };

  const row = data as unknown as {
    id: string;
    date: string;
    amount: number;
    donor_name: string | null;
    donor_id_number: string | null;
    payment_method: string | null;
    installment_current: number | null;
    installment_total: number | null;
    type_text: string | null;
    receipt_number: string | null;
    order_ref: string | null;
    transaction_ref: string | null;
    notes: string | null;
    categories: { name: string } | null;
    bank_accounts: { bank_name: string; account_number: string } | null;
    owner: { name: string } | null;
  };

  return {
    detail: {
      id: row.id,
      date: row.date,
      amount: Number(row.amount),
      donorName: row.donor_name,
      donorIdNumber: row.donor_id_number,
      categoryName: row.categories?.name ?? null,
      departmentName: row.owner?.name ?? null,
      paymentMethod: row.payment_method,
      installmentCurrent: row.installment_current,
      installmentTotal: row.installment_total,
      typeText: row.type_text,
      receiptNumber: row.receipt_number,
      orderRef: row.order_ref,
      transactionRef: row.transaction_ref,
      notes: row.notes,
      bankName: row.bank_accounts?.bank_name ?? null,
      accountNumber: row.bank_accounts?.account_number ?? null,
    },
  };
}

export type DonorIncomeRow = {
  id: string;
  date: string;
  amount: number;
  paymentMethod: string | null;
  installmentCurrent: number | null;
  installmentTotal: number | null;
  typeText: string | null;
  categoryName: string | null;
  departmentName: string | null;
  receiptNumber: string | null;
};

// Every income recorded under the exact same donor name (case-insensitive)
// — RLS already scopes this to whatever departments the caller can see,
// same as every other incomes query — so a click on a donor's name can
// answer "has this donor given before?" without leaving the report.
// `departmentId`, when passed (e.g. from inside one department's report),
// narrows this to that department only, even for an admin who could
// otherwise see the donor's history across the whole system.
export async function getIncomesByDonor(donorName: string, departmentId?: string): Promise<{ rows: DonorIncomeRow[] }> {
  await requireUser();
  const trimmed = donorName.trim();
  if (!trimmed) return { rows: [] };
  const supabase = await createClient();
  let query = supabase
    .from("incomes")
    .select(
      "id, date, amount, payment_method, installment_current, installment_total, type_text, receipt_number, categories(name), owner:owner_department_id(name)",
    )
    .ilike("donor_name", trimmed)
    .order("date", { ascending: false });
  if (departmentId) query = query.eq("owner_department_id", departmentId);
  const { data } = await query;

  return {
    rows: ((data ?? []) as unknown as {
      id: string;
      date: string;
      amount: number;
      payment_method: string | null;
      installment_current: number | null;
      installment_total: number | null;
      type_text: string | null;
      receipt_number: string | null;
      categories: { name: string } | null;
      owner: { name: string } | null;
    }[]).map((row) => ({
      id: row.id,
      date: row.date,
      amount: Number(row.amount),
      paymentMethod: row.payment_method,
      installmentCurrent: row.installment_current,
      installmentTotal: row.installment_total,
      typeText: row.type_text,
      categoryName: row.categories?.name ?? null,
      departmentName: row.owner?.name ?? null,
      receiptNumber: row.receipt_number,
    })),
  };
}
