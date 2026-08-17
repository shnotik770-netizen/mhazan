"use client";

import { Fragment, useState } from "react";
import { formatCurrency, formatDate } from "@/lib/format";

type DayEntry = {
  checks: number;
  transfers: number;
  recurring: number;
  income: number;
  total: number;
  runningBalance: number;
};

// "עד חודש" is cumulative from the current month — picking the next
// month shows two months of days, the one after that three, and so on —
// rather than a plain single-month filter, since the point is to let the
// daily detail grow to match however many months of forecast there are.
export function ForecastDailyTable({
  rows,
  months,
  mode,
}: {
  rows: [string, DayEntry][];
  months: string[];
  mode: "bank" | "department";
}) {
  const [uptoMonth, setUptoMonth] = useState(months[0] ?? "");
  const filtered = uptoMonth ? rows.filter(([date]) => date.slice(0, 7) <= uptoMonth) : rows;

  return (
    <div className="card p-4 overflow-x-auto">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
        <h2 className="font-semibold">סיכום יומי — כמה כסף אמור לרדת/להיכנס בכל יום</h2>
        {months.length > 1 && (
          <div className="flex items-center gap-2">
            <label className="text-sm text-muted">עד חודש</label>
            <select
              value={uptoMonth}
              onChange={(e) => setUptoMonth(e.target.value)}
              className="rounded-lg border border-border bg-transparent px-3 py-1.5 text-sm"
            >
              {months.map((m) => (
                <option key={m} value={m}>
                  {new Intl.DateTimeFormat("he-IL", { month: "long", year: "numeric" }).format(
                    new Date(`${m}-01T00:00:00`),
                  )}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
      <table className="data-table">
        <thead>
          <tr>
            <th>תאריך</th>
            <th>צ׳קים</th>
            <th>העברות</th>
            <th>הוראות קבע</th>
            {mode === "bank" && <th>צפי הכנסה</th>}
            <th>סה״כ שינוי יומי</th>
            <th>{mode === "bank" ? "יתרה בסוף היום" : "יתרה מצטברת בסוף היום"}</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map(([date, d], i) => {
            const month = date.slice(0, 7);
            const prevMonth = i > 0 ? filtered[i - 1][0].slice(0, 7) : null;
            const isNewMonth = prevMonth !== null && month !== prevMonth;
            return (
              <Fragment key={date}>
                {isNewMonth && (
                  <tr key={`sep-${month}`}>
                    <td colSpan={mode === "bank" ? 7 : 6} className="border-t-2 border-border py-1 text-xs font-semibold text-muted">
                      {new Intl.DateTimeFormat("he-IL", { month: "long", year: "numeric" }).format(
                        new Date(`${month}-01T00:00:00`),
                      )}
                    </td>
                  </tr>
                )}
                <tr key={date}>
                  <td>{formatDate(date)}</td>
                  <td className={d.checks < 0 ? "text-danger" : undefined}>{formatCurrency(d.checks)}</td>
                  <td className={d.transfers < 0 ? "text-danger" : undefined}>{formatCurrency(d.transfers)}</td>
                  <td className={d.recurring < 0 ? "text-danger" : undefined}>{formatCurrency(d.recurring)}</td>
                  {mode === "bank" && <td className="text-success">{formatCurrency(d.income)}</td>}
                  <td className={`font-semibold ${d.total < 0 ? "text-danger" : "text-success"}`}>
                    {formatCurrency(d.total)}
                  </td>
                  <td className="font-semibold">{formatCurrency(d.runningBalance)}</td>
                </tr>
              </Fragment>
            );
          })}
          {filtered.length === 0 && (
            <tr>
              <td colSpan={mode === "bank" ? 7 : 6} className="text-center text-muted py-6">
                אין תנועות צפויות בטווח שנבחר
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
