import { createClient } from "@/lib/supabase/server";

export type BankAccountLedgerTransaction = {
  id: string;
  date: string | null;
  description: string;
  // Signed relative to fromAccountId → toAccountId on this specific leg,
  // not relative to the pair's eventual debtor/creditor — the UI resolves
  // direction per-transaction against `fromAccountId`/`toAccountId`.
  amount: number;
  fromAccountId: string;
  toAccountId: string;
  kind: "income" | "check" | "manual" | "commission";
};

export type BankAccountLedgerPair = {
  // Stable identifier for linking to this pair's own report page — the two
  // account IDs joined in a fixed (sorted) order, so the same pair always
  // resolves to the same URL regardless of which side triggered the lookup.
  pairId: string;
  accountAId: string;
  accountAName: string;
  accountBId: string;
  accountBName: string;
  netAmount: number;
  debtorAccountId: string;
  creditorAccountId: string;
  transactions: BankAccountLedgerTransaction[];
};

// Same three payment methods (and same 2% rate) that drive the existing
// per-department credit-commission line (see fn_recompute_credit_commission
// in the DB) — recomputed here per-transaction rather than pulled from the
// monthly-aggregate credit_commission_entries table, since that table is
// keyed by department/month and has no bank-account attribution of its own.
// Shown as its own breakdown line (not silently folded into the income
// amount) so admins can see exactly what composes the net figure.
const QUALIFYING_COMMISSION_METHODS = new Set(["אשראי", "ביט", "העברה בקליק"]);

function accountLabel(bankName: string, accountNumber: string): string {
  return `${bankName} · ${accountNumber}`;
}

function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

// Debt BETWEEN BANK ACCOUNTS, as opposed to the older "מי חייב למי" view
// (ledger-tables-client.tsx) which nets debt between DEPARTMENTS. Most
// departments share one central bank account, so a department-to-department
// balance there is usually meaningless (it's not a real account-to-account
// debt) — but crediting a department whose home account genuinely differs
// from the account a transaction actually touched (a cross-account transfer,
// or any income/check/manual-entry recorded through the "wrong" account
// relative to who it belongs to) is a real amount one bank account owes
// another. This mirrors the exact debtor/creditor shape the DB triggers
// already compute for the department-level ledger (fn_income_after_write,
// fn_sync_check_ledger, fn_manual_entry_after_write) but substitutes each
// side's real bank account (the physical account actually used, or the
// department's home_bank_account_id when the row only carries a department)
// for the department itself — so two departments that share a home account
// never show up here, and two that don't, always do.
export async function getBankAccountLedgerData(): Promise<BankAccountLedgerPair[]> {
  const supabase = await createClient();

  const [
    { data: bankAccounts, error: bankAccountsError },
    { data: departments, error: departmentsError },
    { data: incomes, error: incomesError },
    { data: checkLegs, error: checksError },
    { data: manualEntries, error: manualError },
  ] = await Promise.all([
    supabase.from("bank_accounts").select("id, bank_name, account_number"),
    supabase.from("departments").select("id, home_bank_account_id"),
    supabase
      .from("incomes")
      .select("id, date, amount, donor_name, payment_method, bank_account_id, owner_department_id")
      .eq("requires_inter_settlement", true)
      .eq("skip_department_ledger", false),
    supabase
      .from("v_check_department_amounts")
      .select("check_id, due_date, amount, payee, bank_account_id, department_id")
      .neq("status", "CANCELLED")
      .eq("skip_department_ledger", false),
    supabase
      .from("manual_department_entries")
      .select("id, entry_date, amount, direction, notes, bank_account_id, department_id")
      .eq("status", "APPROVED"),
  ]);

  // Same defensive logging pattern as getDepartmentReportData — a failed
  // query here would otherwise silently render as "no cross-account debt"
  // via the `?? []` fallbacks below, which on a live financial system reads
  // as a false all-clear rather than a data-fetch failure.
  for (const [label, error] of [
    ["bankAccounts", bankAccountsError],
    ["departments", departmentsError],
    ["incomes", incomesError],
    ["checkLegs", checksError],
    ["manualEntries", manualError],
  ] as const) {
    if (error) console.error(`getBankAccountLedgerData(): ${label} query failed`, error);
  }

  const accountNameById = new Map(
    (bankAccounts ?? []).map((a) => [a.id, accountLabel(a.bank_name, a.account_number)]),
  );
  const homeAccountByDept = new Map((departments ?? []).map((d) => [d.id, d.home_bank_account_id]));

  const legs: BankAccountLedgerTransaction[] = [];

  for (const r of incomes ?? []) {
    const toAccountId = homeAccountByDept.get(r.owner_department_id);
    const fromAccountId = r.bank_account_id;
    if (!toAccountId || !fromAccountId || toAccountId === fromAccountId) continue;
    legs.push({
      id: r.id,
      date: r.date,
      description: r.donor_name || "הכנסה",
      amount: Number(r.amount),
      fromAccountId,
      toAccountId,
      kind: "income",
    });
    if (r.payment_method && QUALIFYING_COMMISSION_METHODS.has(r.payment_method)) {
      const commission = Math.round(Number(r.amount) * 0.02 * 100) / 100;
      legs.push({
        id: `${r.id}-commission`,
        date: r.date,
        description: `עמלת אשראי 2% על הכנסה מ${r.donor_name ? ` — ${r.donor_name}` : ""}`,
        amount: -commission,
        fromAccountId,
        toAccountId,
        kind: "commission",
      });
    }
  }

  for (const r of checkLegs ?? []) {
    if (!r.check_id || !r.department_id || !r.bank_account_id) continue;
    const fromAccountId = homeAccountByDept.get(r.department_id);
    const toAccountId = r.bank_account_id;
    if (!fromAccountId || fromAccountId === toAccountId) continue;
    legs.push({
      id: r.check_id,
      date: r.due_date,
      description: r.payee ?? "הוצאה",
      amount: Number(r.amount),
      fromAccountId,
      toAccountId,
      kind: "check",
    });
  }

  for (const e of manualEntries ?? []) {
    if (!e.department_id || !e.bank_account_id) continue;
    const homeAccountId = homeAccountByDept.get(e.department_id);
    if (!homeAccountId || homeAccountId === e.bank_account_id) continue;
    const [fromAccountId, toAccountId] =
      e.direction === "INCOME" ? [e.bank_account_id, homeAccountId] : [homeAccountId, e.bank_account_id];
    legs.push({
      id: e.id,
      date: e.entry_date,
      description: e.notes || "רישום ידני",
      amount: Number(e.amount),
      fromAccountId,
      toAccountId,
      kind: "manual",
    });
  }

  const pairs = new Map<
    string,
    { a: string; b: string; net: number; transactions: BankAccountLedgerTransaction[] }
  >();

  for (const leg of legs) {
    const key = pairKey(leg.fromAccountId, leg.toAccountId);
    const [a, b] = leg.fromAccountId < leg.toAccountId ? [leg.fromAccountId, leg.toAccountId] : [leg.toAccountId, leg.fromAccountId];
    const entry = pairs.get(key) ?? { a, b, net: 0, transactions: [] };
    entry.net += leg.fromAccountId === a ? leg.amount : -leg.amount;
    entry.transactions.push(leg);
    pairs.set(key, entry);
  }

  const result: BankAccountLedgerPair[] = [];
  for (const { a, b, net, transactions } of pairs.values()) {
    if (Math.abs(net) < 0.005) continue;
    result.push({
      pairId: `${a}__${b}`,
      accountAId: a,
      accountAName: accountNameById.get(a) ?? "—",
      accountBId: b,
      accountBName: accountNameById.get(b) ?? "—",
      netAmount: Math.abs(net),
      debtorAccountId: net > 0 ? a : b,
      creditorAccountId: net > 0 ? b : a,
      transactions: transactions.sort((x, y) => (y.date ?? "").localeCompare(x.date ?? "")),
    });
  }
  return result.sort((x, y) => y.netAmount - x.netAmount);
}
