// The exact same per-day/per-month breakdown /forecast/page.tsx builds for
// its on-screen monthly cards + daily table — extracted here so the PDF
// export view (/forecast/print) can render the identical numbers instead of
// a separately-computed summary that could quietly drift from what the live
// page shows. Both pages call these same functions on the same
// get_cash_flow_forecast rows.

export type DayEntry = {
  checks: number;
  transfers: number;
  recurring: number;
  income: number;
  overdue: number;
  total: number;
  runningBalance: number;
};

export type MonthlyCard = {
  month: string;
  opening: number;
  income: number;
  expense: number;
  oldExpense: number;
  closing: number;
};

type ForecastRpcRow = {
  forecast_date: string | null;
  category: string | null;
  expected_change: number | string;
  running_balance: number | string;
};

// Groups the flat per-item forecast rows into a per-day breakdown by
// category (checks / transfers / recurring / expected income / overdue) —
// "UNDATED" rows (approved but not yet due-dated) are excluded, same as
// everywhere else in the forecast.
export function computeDailyBreakdown(forecastRows: ForecastRpcRow[]): [string, DayEntry][] {
  const datedForecast = forecastRows.filter((row) => row.category !== "UNDATED");
  const byDate = new Map<string, DayEntry>();
  for (const row of datedForecast) {
    const d = row.forecast_date!;
    const entry =
      byDate.get(d) ?? { checks: 0, transfers: 0, recurring: 0, income: 0, overdue: 0, total: 0, runningBalance: 0 };
    const change = Number(row.expected_change);
    if (row.category === "CHECK") entry.checks += change;
    else if (row.category === "TRANSFER") entry.transfers += change;
    else if (row.category === "RECURRING") entry.recurring += change;
    else if (row.category === "INCOME") entry.income += change;
    else if (row.category === "OVERDUE") entry.overdue += change;
    entry.total += change;
    entry.runningBalance = Number(row.running_balance);
    byDate.set(d, entry);
  }
  return [...byDate.entries()].sort(([a], [b]) => (a < b ? -1 : 1));
}

// How many days of forecast to request from get_cash_flow_forecast to fully
// cover `months` calendar months from today through the last day of the
// last one — e.g. months=3 covers this month plus the next two.
export function daysUntilMonthsEnd(months: number): number {
  const target = new Date();
  target.setDate(1);
  target.setMonth(target.getMonth() + months);
  target.setDate(target.getDate() - 1);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  return Math.max(1, Math.round((target.getTime() - today.getTime()) / 86400000));
}

// Every calendar month touched by the horizon, from the current month onward.
export function monthsInHorizon(horizonDays: number): string[] {
  const months: string[] = [];
  const cursor = new Date();
  cursor.setDate(1);
  const horizonEnd = new Date();
  horizonEnd.setDate(horizonEnd.getDate() + horizonDays);
  while (cursor <= horizonEnd) {
    months.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`);
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return months;
}

// One card per month covered by the horizon: that month's forecasted
// income/expenses (plus overdue, carried separately), and the balance it
// closes with — opening carries forward from the previous month's closing,
// starting from the account's real current balance.
export function computeMonthlyCards(
  dailyBreakdown: [string, DayEntry][],
  months: string[],
  startBalance: number,
): { monthlyCards: MonthlyCard[]; dailyRowsByMonth: Map<string, [string, DayEntry][]> } {
  const dailyRowsByMonth = new Map<string, [string, DayEntry][]>();
  let openingBalance = startBalance;
  const monthlyCards = months.map((month) => {
    const monthRows = dailyBreakdown.filter(([date]) => date.startsWith(month));
    dailyRowsByMonth.set(month, monthRows);
    const income = monthRows.reduce((sum, [, d]) => sum + d.income, 0);
    const expense = monthRows.reduce((sum, [, d]) => sum + d.checks + d.transfers + d.recurring, 0);
    const oldExpense = monthRows.reduce((sum, [, d]) => sum + d.overdue, 0);
    const opening = openingBalance;
    const closing = monthRows.length > 0 ? monthRows[monthRows.length - 1][1].runningBalance : opening;
    openingBalance = closing;
    return { month, opening, income, expense, oldExpense, closing };
  });
  return { monthlyCards, dailyRowsByMonth };
}
