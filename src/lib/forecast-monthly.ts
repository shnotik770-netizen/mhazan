// Shared by the PDF export print view (src/app/(app)/forecast/print) — kept
// separate from forecast/page.tsx's own monthlyCards computation (which
// needs the full per-category daily breakdown for its interactive cards)
// since the print view only ever needs a plain month-by-month balance
// summary, for one or every bank account at once.

export type MonthlyForecastRow = {
  month: string;
  opening: number;
  income: number;
  expense: number;
  closing: number;
};

type ForecastRpcRow = {
  forecast_date: string | null;
  category: string | null;
  expected_change: number | string;
  running_balance: number | string;
};

// Every calendar month from the current one, `count` months long — e.g.
// count=3 covers this month plus the next two.
export function monthsFromToday(count: number): string[] {
  const months: string[] = [];
  const cursor = new Date();
  cursor.setDate(1);
  for (let i = 0; i < count; i++) {
    months.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`);
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return months;
}

// How many days of forecast to request from get_cash_flow_forecast to fully
// cover `count` months from today through the last day of the last one.
export function daysUntilMonthsEnd(count: number): number {
  const target = new Date();
  target.setDate(1);
  target.setMonth(target.getMonth() + count);
  target.setDate(target.getDate() - 1);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  return Math.max(1, Math.round((target.getTime() - today.getTime()) / 86400000));
}

// One row per month: opening balance, that month's forecasted income/expense,
// and the balance it closes with — opening carries forward from the previous
// month's closing, starting from the account's real current balance.
// "UNDATED" rows (approved checks/transfers with no due date yet) are
// excluded, same as everywhere else in the forecast — they have no month to
// land in.
export function computeMonthlyForecast(
  forecastRows: ForecastRpcRow[],
  startBalance: number,
  months: string[],
): MonthlyForecastRow[] {
  const dated = forecastRows.filter((r) => r.category !== "UNDATED" && r.forecast_date);
  const byMonth = new Map<string, { income: number; expense: number; lastBalance: number }>();
  for (const r of dated) {
    const m = r.forecast_date!.slice(0, 7);
    const g = byMonth.get(m) ?? { income: 0, expense: 0, lastBalance: startBalance };
    const change = Number(r.expected_change);
    if (change > 0) g.income += change;
    else g.expense += -change;
    g.lastBalance = Number(r.running_balance);
    byMonth.set(m, g);
  }
  let opening = startBalance;
  return months.map((month) => {
    const g = byMonth.get(month);
    const closing = g ? g.lastBalance : opening;
    const row: MonthlyForecastRow = { month, opening, income: g?.income ?? 0, expense: g?.expense ?? 0, closing };
    opening = closing;
    return row;
  });
}
