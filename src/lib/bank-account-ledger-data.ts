import { createClient } from "@/lib/supabase/server";

export type BankAccountLedgerTransaction = {
  id: string;
  date: string | null;
  description: string;
  // Signed relative to fromDepartmentId → toDepartmentId on this specific
  // leg, not relative to the pair's eventual debtor/creditor — the UI
  // resolves direction per-transaction against those two fields.
  amount: number;
  fromDepartmentId: string;
  toDepartmentId: string;
  // Physical bank account labels for display only (e.g. "מזרחי · 412043")
  // — resolved server-side since the client no longer has a department-pair
  // shaped way to look accounts up (unlike department names, which live
  // directly on the pair as departmentAName/departmentBName).
  fromAccountName: string;
  toAccountName: string;
  kind: "income" | "check" | "manual" | "commission";
  // Only ever set for a "check" leg (UNPAID/CLEARED) — lets the pair report
  // show the same "נפרע?" column a department report shows.
  status?: string | null;
  // The department whose OWN ledger this leg belongs to — distinct from
  // fromDepartmentId/toDepartmentId (the two sides of the debt itself):
  // for an income leg this is the receiving department (= toDepartmentId),
  // for a check it's the paying department (= fromDepartmentId), and for a
  // manual entry it depends on direction — kept as its own field so callers
  // don't have to re-derive it per leg kind.
  departmentId: string | null;
  departmentName: string | null;
};

export type BankAccountLedgerPair = {
  // Stable identifier for linking to this pair's own report page — the two
  // department IDs joined in a fixed (sorted) order, so the same pair
  // always resolves to the same URL regardless of which side triggered the
  // lookup.
  pairId: string;
  departmentAId: string;
  departmentAName: string;
  departmentBId: string;
  departmentBName: string;
  netAmount: number;
  debtorDepartmentId: string;
  creditorDepartmentId: string;
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

// Debt BETWEEN DEPARTMENTS THAT EACH MANAGE THEIR OWN BANK ACCOUNT, as
// opposed to the older "מי חייב למי" view (ledger-tables-client.tsx) which
// nets debt between every department regardless of who actually owns an
// account. A regular department report is that department against the one
// bank account its own money flows through; this report is specifically
// about the debt BETWEEN two departments that each manage a separate
// account — most departments don't manage their own account at all (they
// just share one of a handful of accounts as their home account), so this
// only ever involves the departments named on bank_accounts.department_id.
//
// Earlier this grouped by the two PHYSICAL bank accounts involved instead
// of by department — but since up to 18 departments can share the same 3
// accounts, that silently merged unrelated departments' debts into one
// number whenever they happened to route money through the same pair of
// accounts (confirmed against live data: one account pair mixed 6 distinct
// departments' debts into a single net figure). Grouping by the ACCOUNT
// OWNER'S department on each side (bank_accounts.department_id, a direct,
// unambiguous FK — not departments.home_bank_account_id, which many
// departments can share) keeps each department pair's debt separate, and
// also means a department that later manages more than one account still
// nets against the same counterpart correctly (or, if it moves money
// between its own two accounts, correctly produces no leg at all, since
// both sides resolve to the same department).
export async function getBankAccountLedgerData(): Promise<BankAccountLedgerPair[]> {
  const supabase = await createClient();

  const [
    { data: bankAccounts, error: bankAccountsError },
    { data: departments, error: departmentsError },
    { data: incomes, error: incomesError },
    { data: checkLegs, error: checksError },
    { data: manualEntries, error: manualError },
  ] = await Promise.all([
    supabase.from("bank_accounts").select("id, department_id, bank_name, account_number"),
    supabase.from("departments").select("id, name, home_bank_account_id"),
    supabase
      .from("incomes")
      .select("id, date, amount, donor_name, payment_method, bank_account_id, owner_department_id")
      .eq("requires_inter_settlement", true)
      .eq("skip_department_ledger", false),
    supabase
      .from("v_check_department_amounts")
      .select("check_id, due_date, amount, payee, bank_account_id, department_id, status")
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
  const accountOwnerDeptId = new Map((bankAccounts ?? []).map((a) => [a.id, a.department_id]));
  const homeAccountByDept = new Map((departments ?? []).map((d) => [d.id, d.home_bank_account_id]));
  const deptNameById = new Map((departments ?? []).map((d) => [d.id, d.name]));

  const legs: BankAccountLedgerTransaction[] = [];

  for (const r of incomes ?? []) {
    const homeAccountId = homeAccountByDept.get(r.owner_department_id);
    const actualAccountId = r.bank_account_id;
    if (!homeAccountId || !actualAccountId || homeAccountId === actualAccountId) continue;
    const counterpartDeptId = accountOwnerDeptId.get(actualAccountId);
    if (!counterpartDeptId || counterpartDeptId === r.owner_department_id) continue;
    legs.push({
      id: r.id,
      date: r.date,
      description: r.donor_name || "הכנסה",
      amount: Number(r.amount),
      fromDepartmentId: counterpartDeptId,
      toDepartmentId: r.owner_department_id,
      fromAccountName: accountNameById.get(actualAccountId) ?? "—",
      toAccountName: accountNameById.get(homeAccountId) ?? "—",
      kind: "income",
      departmentId: r.owner_department_id,
      departmentName: deptNameById.get(r.owner_department_id) ?? null,
    });
    if (r.payment_method && QUALIFYING_COMMISSION_METHODS.has(r.payment_method)) {
      const commission = Math.round(Number(r.amount) * 0.02 * 100) / 100;
      legs.push({
        id: `${r.id}-commission`,
        date: r.date,
        description: `עמלת אשראי 2% על הכנסה מ${r.donor_name ? ` — ${r.donor_name}` : ""}`,
        amount: -commission,
        fromDepartmentId: counterpartDeptId,
        toDepartmentId: r.owner_department_id,
        fromAccountName: accountNameById.get(actualAccountId) ?? "—",
        toAccountName: accountNameById.get(homeAccountId) ?? "—",
        kind: "commission",
        departmentId: r.owner_department_id,
        departmentName: deptNameById.get(r.owner_department_id) ?? null,
      });
    }
  }

  for (const r of checkLegs ?? []) {
    if (!r.check_id || !r.department_id || !r.bank_account_id) continue;
    const homeAccountId = homeAccountByDept.get(r.department_id);
    const actualAccountId = r.bank_account_id;
    if (!homeAccountId || homeAccountId === actualAccountId) continue;
    const counterpartDeptId = accountOwnerDeptId.get(actualAccountId);
    if (!counterpartDeptId || counterpartDeptId === r.department_id) continue;
    legs.push({
      id: r.check_id,
      date: r.due_date,
      description: r.payee ?? "הוצאה",
      amount: Number(r.amount),
      fromDepartmentId: r.department_id,
      toDepartmentId: counterpartDeptId,
      fromAccountName: accountNameById.get(homeAccountId) ?? "—",
      toAccountName: accountNameById.get(actualAccountId) ?? "—",
      kind: "check",
      status: r.status,
      departmentId: r.department_id,
      departmentName: deptNameById.get(r.department_id) ?? null,
    });
  }

  for (const e of manualEntries ?? []) {
    if (!e.department_id || !e.bank_account_id) continue;
    const homeAccountId = homeAccountByDept.get(e.department_id);
    if (!homeAccountId || homeAccountId === e.bank_account_id) continue;
    const counterpartDeptId = accountOwnerDeptId.get(e.bank_account_id);
    if (!counterpartDeptId || counterpartDeptId === e.department_id) continue;
    const isIncome = e.direction === "INCOME";
    const fromDepartmentId = isIncome ? counterpartDeptId : e.department_id;
    const toDepartmentId = isIncome ? e.department_id : counterpartDeptId;
    const fromAccountId = isIncome ? e.bank_account_id : homeAccountId;
    const toAccountId = isIncome ? homeAccountId : e.bank_account_id;
    legs.push({
      id: e.id,
      date: e.entry_date,
      description: e.notes || "רישום ידני",
      amount: Number(e.amount),
      fromDepartmentId,
      toDepartmentId,
      fromAccountName: accountNameById.get(fromAccountId) ?? "—",
      toAccountName: accountNameById.get(toAccountId) ?? "—",
      kind: "manual",
      departmentId: e.department_id,
      departmentName: deptNameById.get(e.department_id) ?? null,
    });
  }

  const pairs = new Map<
    string,
    { a: string; b: string; net: number; transactions: BankAccountLedgerTransaction[] }
  >();

  for (const leg of legs) {
    const key = pairKey(leg.fromDepartmentId, leg.toDepartmentId);
    const [a, b] =
      leg.fromDepartmentId < leg.toDepartmentId
        ? [leg.fromDepartmentId, leg.toDepartmentId]
        : [leg.toDepartmentId, leg.fromDepartmentId];
    const entry = pairs.get(key) ?? { a, b, net: 0, transactions: [] };
    entry.net += leg.fromDepartmentId === a ? leg.amount : -leg.amount;
    entry.transactions.push(leg);
    pairs.set(key, entry);
  }

  const result: BankAccountLedgerPair[] = [];
  for (const { a, b, net, transactions } of pairs.values()) {
    if (Math.abs(net) < 0.005) continue;
    result.push({
      pairId: `${a}__${b}`,
      departmentAId: a,
      departmentAName: deptNameById.get(a) ?? "—",
      departmentBId: b,
      departmentBName: deptNameById.get(b) ?? "—",
      netAmount: Math.abs(net),
      debtorDepartmentId: net > 0 ? a : b,
      creditorDepartmentId: net > 0 ? b : a,
      transactions: transactions.sort((x, y) => (y.date ?? "").localeCompare(x.date ?? "")),
    });
  }
  return result.sort((x, y) => y.netAmount - x.netAmount);
}
