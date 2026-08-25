import { createClient } from "@/lib/supabase/server";
import { formatCurrency, todayIso } from "@/lib/format";

export function addMonths(monthKey: string, n: number): string {
  const [y, m] = monthKey.split("-").map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function monthLabel(monthKey: string): string {
  return new Intl.DateTimeFormat("he-IL", { month: "long", year: "numeric" }).format(new Date(`${monthKey}-01T00:00:00`));
}

export type InstallmentForecastDetail = {
  donorName: string;
  categoryName: string;
  current: number;
  total: number;
  amount: number;
  // Only set on standing-order forecast details — the Nedarim Plus KevaId,
  // used to detect a real income already recorded against this exact order
  // (see order_ref matching below) so a charge that already came in doesn't
  // also linger as a forecast line.
  orderRef?: string;
};

export type CombinedRow = {
  id: string;
  date: string | null;
  typeDetail: string;
  description: string;
  amount: number;
  spreadTotal?: number | null;
  status?: string | null;
  isOld: boolean;
  kind: "check" | "income" | "manual" | "commission" | "forecast";
  forecastDetails?: InstallmentForecastDetail[];
};

export type MonthlyFlowRow = {
  month: string;
  income: number;
  expense: number;
  opening: number;
  closing: number;
  isFuture: boolean;
};

export type MissedStandingOrderNote = {
  id: number;
  orderRef: string;
  month: string;
  donorName: string;
  categoryName: string | null;
  amount: number;
};

export type DepartmentReportData = {
  totalIncome: number;
  totalExpense: number;
  net: number;
  pastRows: CombinedRow[];
  futureRows: CombinedRow[];
  pastMonths: string[];
  futureMonths: string[];
  monthlyFlow: MonthlyFlowRow[];
  missedStandingOrders: MissedStandingOrderNote[];
};

// All the data assembly behind a department's report — shared by the
// on-screen report (department-report.tsx) and the Excel export route, so
// the two can never drift apart on what counts as "current" vs "old" or how
// rows are combined/sorted.
export async function getDepartmentReportData(departmentId: string): Promise<DepartmentReportData> {
  const supabase = await createClient();

  const [
    { data: incomes, error: incomesError },
    { data: expenses, error: expensesError },
    { data: manualEntries, error: manualEntriesError },
    { data: commissionEntries, error: commissionError },
    { data: standingOrderForecast, error: standingOrderError },
  ] = await Promise.all([
    supabase
      .from("incomes")
      .select(
        "id, date, amount, donor_name, payment_method, installment_current, installment_total, type_text, skip_department_ledger, order_ref, categories(name)",
      )
      .eq("owner_department_id", departmentId)
      .order("date", { ascending: false }),
    supabase
      .from("v_check_department_amounts")
      .select("check_id, due_date, amount, payee, payment_method, skip_department_ledger, spread_id, status")
      .eq("department_id", departmentId)
      .neq("status", "CANCELLED")
      .order("due_date", { ascending: false }),
    supabase
      .from("manual_department_entries")
      .select("id, entry_date, amount, direction, notes, recurring_schedule_id, is_inter_department_transfer")
      .eq("department_id", departmentId)
      .eq("status", "APPROVED")
      .order("entry_date", { ascending: false }),
    supabase
      .from("credit_commission_entries")
      .select("id, month, qualifying_total, amount")
      .eq("department_id", departmentId)
      .order("month", { ascending: false }),
    supabase
      .from("standing_order_forecast")
      .select("month, amount, details")
      .eq("department_id", departmentId),
  ]);

  // A failed query here would otherwise silently render as "no rows" via
  // the `?? []` fallbacks below — exactly the kind of gap that makes a
  // real data problem look like a missing feature. Surface it in the logs
  // instead of swallowing it.
  for (const [label, error] of [
    ["incomes", incomesError],
    ["expenses", expensesError],
    ["manualEntries", manualEntriesError],
    ["commissionEntries", commissionError],
    ["standingOrderForecast", standingOrderError],
  ] as const) {
    if (error) console.error(`getDepartmentReportData(${departmentId}): ${label} query failed`, error);
  }

  const incomeRows: CombinedRow[] = (incomes ?? []).map((r) => {
    // "סוג" (e.g. "1/2" for an installment, or free text like "הו״ק"/"מזומן")
    // matters just as much as the payment method for identifying a
    // transaction — shown alongside it instead of only the method. The
    // income's category isn't shown here: in this org categories are named
    // per department, so on a single department's own report it almost
    // always just repeats the department's own name back.
    const typeSuffix =
      r.installment_current != null && r.installment_total != null
        ? `${r.installment_current}/${r.installment_total}`
        : r.type_text || null;
    const parenParts = [r.payment_method, typeSuffix].filter(Boolean);
    return {
      id: r.id,
      date: r.date,
      typeDetail: parenParts.length > 0 ? parenParts.join(" · ") : "—",
      description: r.donor_name || "—",
      amount: Number(r.amount),
      isOld: r.skip_department_ledger,
      kind: "income",
    };
  });

  // Several checks/transfers under one spread_id (a split payment plan,
  // or several requests merged into one payee's schedule) should read as
  // one recurring commitment, not unrelated rows — so each row in a spread
  // carries the group's total, not just its own installment. Only rows
  // still counted toward the balance participate in that group total.
  const allExpenses = expenses ?? [];
  const spreadTotals = new Map<string, { total: number; count: number }>();
  for (const r of allExpenses) {
    if (!r.spread_id || r.skip_department_ledger) continue;
    const g = spreadTotals.get(r.spread_id) ?? { total: 0, count: 0 };
    g.total += Number(r.amount);
    g.count += 1;
    spreadTotals.set(r.spread_id, g);
  }

  const expenseRows: CombinedRow[] = allExpenses.map((r) => {
    const group = r.spread_id ? spreadTotals.get(r.spread_id) : undefined;
    return {
      id: r.check_id as string,
      date: r.due_date,
      typeDetail: r.payment_method === "TRANSFER" ? "העברה" : "צ׳ק",
      description: r.payee ?? "הוצאה",
      amount: -Number(r.amount),
      spreadTotal: group && group.count > 1 ? group.total : null,
      status: r.status,
      isOld: Boolean(r.skip_department_ledger),
      kind: "check",
    };
  });

  const manualRows: CombinedRow[] = (manualEntries ?? []).map((e) => {
    // "סוג" reflects only what was actually recorded (a deliberate
    // inter-department transfer vs. a plain manual entry) — never inferred
    // from which bank account it happens to post through, since most
    // departments share one central account and that used to misfire on
    // completely ordinary entries. The description shows exactly what was
    // typed at the time, including the transfer's own from/to wording for
    // a real transfer.
    const kindLabel = e.is_inter_department_transfer
      ? "העברה בין מחלקות"
      : e.recurring_schedule_id
        ? "קבוע (אושר)"
        : "ידני";
    const fallbackLabel = e.direction === "INCOME" ? "רישום ידני — הכנסה" : "רישום ידני — הוצאה";
    return {
      id: e.id,
      date: e.entry_date,
      typeDetail: kindLabel,
      description: e.notes || fallbackLabel,
      amount: e.direction === "INCOME" ? Number(e.amount) : -Number(e.amount),
      isOld: false,
      kind: "manual",
    };
  });

  // One auto-computed row per month this department had qualifying
  // card/Bit/"העברה בקליק" income — 2% of that month's total, kept in sync
  // by a DB trigger on `incomes` rather than editable here. The commission
  // is actually charged the following month (e.g. August's income produces
  // a charge dated September 1st), so the displayed/counted date is shifted
  // one month past `month`, which itself stays the income period it's
  // computed from.
  const commissionRows: CombinedRow[] = (commissionEntries ?? []).map((c) => ({
    id: c.id,
    date: `${addMonths(c.month.slice(0, 7), 1)}-01`,
    typeDetail: "עמלת אשראי",
    description: `עמלת אשראי (2% על ${formatCurrency(Number(c.qualifying_total))} מהכנסות אשראי/ביט/העברה בקליק ב${monthLabel(c.month.slice(0, 7))})`,
    amount: -Number(c.amount),
    isOld: false,
    kind: "commission",
  }));

  // Credit-card installment income (e.g. "7/12", captured via
  // installment_current/installment_total on a paste) repeats as its own
  // income row every month as it's paid off — so the most recent occurrence
  // per donor+total+category tells the real remaining count, and only that
  // one should project forward: an older row for the same commitment would
  // otherwise project the same future months a second time. This also
  // means a mid-month paste can never double-count itself: the moment a
  // real row for a given month is entered, it becomes each commitment's
  // new "latest" and the projection window simply starts the month after
  // it, whatever day of the month it was pasted on. "Old"/excluded income
  // never drives a live projection.
  type InstallmentGroup = { donorName: string; categoryName: string; amount: number; total: number; current: number; date: string };
  const installmentGroups = new Map<string, InstallmentGroup>();
  for (const r of incomes ?? []) {
    if (r.skip_department_ledger) continue;
    if (r.payment_method !== "אשראי" || r.installment_current == null || r.installment_total == null) continue;
    if (r.installment_current >= r.installment_total) continue;
    const categoryName = (r as unknown as { categories: { name: string } | null }).categories?.name ?? "";
    const key = `${r.donor_name ?? ""}|${r.installment_total}|${categoryName}`;
    // incomes is already ordered newest-first, so the first occurrence of a
    // key is its latest progress.
    if (installmentGroups.has(key)) continue;
    installmentGroups.set(key, {
      donorName: r.donor_name ?? "—",
      categoryName,
      amount: Number(r.amount),
      total: r.installment_total,
      current: r.installment_current,
      date: r.date,
    });
  }

  // One combined row per month (not one per commitment) — reads as an
  // ordinary future income line inside "תנועות עתידיות ידועות", so it
  // folds straight into that section's own income/net summary instead of
  // being a separate number a manager has to reconcile by hand against the
  // rest of the report. Dated on the last day of its month so it always
  // sorts as "future", even when the month in question is the current one.
  // Each month also keeps the list of commitments behind its total, so the
  // row can be expanded to show exactly which payments it's counting.
  const installmentForecastByMonth = new Map<string, { total: number; details: InstallmentForecastDetail[] }>();
  for (const g of installmentGroups.values()) {
    const remaining = g.total - g.current;
    for (let i = 1; i <= remaining; i++) {
      const m = addMonths(g.date.slice(0, 7), i);
      const bucket = installmentForecastByMonth.get(m) ?? { total: 0, details: [] };
      bucket.total += g.amount;
      bucket.details.push({
        donorName: g.donorName,
        categoryName: g.categoryName,
        current: g.current + i,
        total: g.total,
        amount: g.amount,
      });
      installmentForecastByMonth.set(m, bucket);
    }
  }
  const installmentForecastRows: CombinedRow[] = [...installmentForecastByMonth.entries()].map(([month, g]) => {
    const [y, m] = month.split("-").map(Number);
    const lastDay = new Date(y, m, 0).getDate();
    return {
      id: `installment-forecast-${month}`,
      date: `${month}-${String(lastDay).padStart(2, "0")}`,
      typeDetail: "צפי המשך תשלומים",
      description: `צפי המשך תשלומי אשראי (${g.details.length} תורמים)`,
      amount: g.total,
      isOld: false,
      kind: "forecast",
      forecastDetails: g.details,
    };
  });

  // Standing orders can fail to actually charge (insufficient funds, a
  // cancelled card, etc.) — unlike a credit-card installment, which is
  // certain to recur — so a forecasted standing-order charge is dropped in
  // either of two cases:
  //  1. A real income row shows up for that *exact* order in that *exact*
  //     month, matched by order_ref (the Nedarim KevaId, captured when the
  //     month's income report is pasted in) — the charge happened, no need
  //     to also show it as a forecast.
  //  2. The forecasted month has already fully elapsed with no such match.
  //     Once a manager has moved past a month, that month's income paste is
  //     assumed complete — if the order still isn't there, it simply didn't
  //     charge that month for whatever reason, and the forecast line for it
  //     should quietly disappear rather than linger as a stale "future" row
  //     for a month that's already over. (A later Nedarim sync will pick up
  //     wherever the order's schedule actually continues from.)
  const chargedOrderMonths = new Set<string>();
  for (const r of incomes ?? []) {
    if (!r.order_ref || !r.date) continue;
    chargedOrderMonths.add(`${r.order_ref}|${r.date.slice(0, 7)}`);
  }
  const currentMonth = todayIso().slice(0, 7);

  // Standing-order (הוראת קבע) forecast, cached in `standing_order_forecast`
  // by the monthly (or manually-triggered) Nedarim Plus sync — pre-computed
  // there rather than here since it comes from an external API call, not a
  // query against our own tables. Rendered exactly like the credit-card
  // installment forecast above: one expandable row per month inside
  // "תנועות עתידיות ידועות", dated to the last day of its month.
  const standingOrderRows: CombinedRow[] = [];
  for (const s of standingOrderForecast ?? []) {
    const month = s.month;
    if (month < currentMonth) continue;
    const allDetails = (s.details ?? []) as unknown as InstallmentForecastDetail[];
    const details = allDetails.filter((d) => !d.orderRef || !chargedOrderMonths.has(`${d.orderRef}|${month}`));
    if (details.length === 0) continue;
    const total = details.reduce((sum, d) => sum + d.amount, 0);
    const [y, m] = month.split("-").map(Number);
    const lastDay = new Date(y, m, 0).getDate();
    standingOrderRows.push({
      id: `standing-order-forecast-${month}`,
      date: `${month}-${String(lastDay).padStart(2, "0")}`,
      typeDetail: "צפי הוראות קבע",
      description: `צפי הוראות קבע (${details.length} הוראות)`,
      amount: total,
      isOld: false,
      kind: "forecast",
      forecastDetails: details,
    });
  }

  const allRows = [
    ...incomeRows,
    ...expenseRows,
    ...manualRows,
    ...commissionRows,
    ...installmentForecastRows,
    ...standingOrderRows,
  ].sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));

  // Split into what's already happened (or has no date) vs. what's already
  // in the system with a future date (an approved check/transfer not yet
  // due, mostly) — the "current" cards below only ever reflect the former,
  // so they show the account's actual state today rather than a number
  // that silently includes commitments that haven't come due yet.
  const today = todayIso();
  const pastRows = allRows.filter((r) => !r.date || r.date <= today);
  const futureRows = [...allRows.filter((r) => r.date && r.date > today)].sort((a, b) =>
    (a.date ?? "").localeCompare(b.date ?? ""),
  );

  // "Old" rows (skip_department_ledger) still appear in the list, tagged,
  // but never count toward the department's balance — that's the whole
  // point of the flag.
  const pastCounted = pastRows.filter((r) => !r.isOld);
  const totalIncome = pastCounted.filter((r) => r.amount > 0).reduce((sum, r) => sum + r.amount, 0);
  const totalExpense = pastCounted.filter((r) => r.amount < 0).reduce((sum, r) => sum + -r.amount, 0);
  const net = totalIncome - totalExpense;

  const futureMonths = [...new Set(futureRows.filter((r) => r.date).map((r) => r.date!.slice(0, 7)))].sort();
  const pastMonths = [...new Set(pastRows.filter((r) => r.date).map((r) => r.date!.slice(0, 7)))].sort();

  // Monthly cash-flow view: actual history per month, continuing seamlessly
  // into the same forecast the bank/department forecast page shows, so a
  // manager can see "what did we owe at the end of month X" and "what's the
  // running balance expected each month after that" in one continuous
  // table. Only *past* rows feed the history side — future-dated rows
  // already in the system (the list above) are also what the forecast RPC
  // below projects for those same dates, so folding them in here too would
  // double-count them.
  const todayMonth = today.slice(0, 7);
  const historicalByMonth = new Map<string, { income: number; expense: number }>();
  for (const r of pastCounted) {
    if (!r.date) continue;
    const m = r.date.slice(0, 7);
    const g = historicalByMonth.get(m) ?? { income: 0, expense: 0 };
    if (r.amount > 0) g.income += r.amount;
    else g.expense += -r.amount;
    historicalByMonth.set(m, g);
  }

  const { data: forecastRows } = await supabase.rpc("get_department_cash_flow_forecast", {
    p_department_id: departmentId,
    p_horizon_days: 400,
  });
  const forecastByMonth = new Map<string, { income: number; expense: number }>();
  for (const row of forecastRows ?? []) {
    const m = row.forecast_date!.slice(0, 7);
    const g = forecastByMonth.get(m) ?? { income: 0, expense: 0 };
    const change = Number(row.expected_change);
    if (change > 0) g.income += change;
    else g.expense += -change;
    forecastByMonth.set(m, g);
  }

  // Same installment-forecast totals as the "תנועות עתידיות ידועות" row
  // above — folded in here too so the monthly cash-flow table always
  // agrees with that section instead of needing its own separate figure.
  for (const [month, g] of installmentForecastByMonth) {
    const bucket = forecastByMonth.get(month) ?? { income: 0, expense: 0 };
    bucket.income += g.total;
    forecastByMonth.set(month, bucket);
  }
  for (const row of standingOrderRows) {
    const month = row.date!.slice(0, 7);
    const bucket = forecastByMonth.get(month) ?? { income: 0, expense: 0 };
    bucket.income += row.amount;
    forecastByMonth.set(month, bucket);
  }

  const touchedMonths = [...new Set([...historicalByMonth.keys(), ...forecastByMonth.keys()])].sort();
  let running = 0;
  const monthlyFlow: MonthlyFlowRow[] =
    touchedMonths.length === 0
      ? []
      : (() => {
          const rows: MonthlyFlowRow[] = [];
          let cursor = touchedMonths[0];
          const last = touchedMonths[touchedMonths.length - 1];
          while (cursor <= last) {
            const hist = historicalByMonth.get(cursor);
            const fut = forecastByMonth.get(cursor);
            const income = (hist?.income ?? 0) + (fut?.income ?? 0);
            const expense = (hist?.expense ?? 0) + (fut?.expense ?? 0);
            const opening = running;
            const closing = opening + income - expense;
            running = closing;
            rows.push({ month: cursor, income, expense, opening, closing, isFuture: cursor > todayMonth });
            cursor = addMonths(cursor, 1);
          }
          return rows;
        })();

  // Open (undismissed) "missed standing order" notes — detected once, at
  // the moment a month's income paste was found to be missing an expected
  // order, and kept here until an admin explicitly archives them (see
  // dismissMissedStandingOrder). Shown as a dismissible note rather than
  // folded into the transaction list, since it's a flag about an absence,
  // not a transaction itself.
  const { data: missedStandingOrders } = await supabase
    .from("standing_order_missed_charges")
    .select("id, order_ref, month, donor_name, category_name, amount")
    .eq("department_id", departmentId)
    .is("dismissed_at", null)
    .order("month", { ascending: false });

  return {
    totalIncome,
    totalExpense,
    net,
    pastRows,
    futureRows,
    pastMonths,
    futureMonths,
    monthlyFlow,
    missedStandingOrders: (missedStandingOrders ?? []).map((m) => ({
      id: m.id,
      orderRef: m.order_ref,
      month: m.month,
      donorName: m.donor_name,
      categoryName: m.category_name,
      amount: Number(m.amount),
    })),
  };
}
