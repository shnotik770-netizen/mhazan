"use client";

import { Fragment } from "react";
import { formatCurrency, formatDate } from "@/lib/format";

type DayEntry = {
  checks: number;
  transfers: number;
  recurring: number;
  income: number;
  overdue: number;
  total: number;
  runningBalance: number;
};

// Always shows every row passed in — the range is already scoped by the
// page-level "עד חודש" filter, so there's no separate cutoff control here.
export function ForecastDailyTable({
  rows,
  mode,
}: {
  rows: [string, DayEntry][];
  mode: "bank" | "department";
}) {
  return (
    <div className="card p-4 overflow-x-auto">
      <h2 className="font-semibold mb-2">סיכום יומי — כמה כסף אמור לרדת/להיכנס בכל יום</h2>
      <table className="data-table">
        <thead>
          <tr>
            <th>תאריך</th>
            <th>צ׳קים</th>
            <th>העברות</th>
            <th>הוראות קבע</th>
            {mode === "bank" && <th>צפי הכנסה</th>}
            <th>פיגורים (ישנים)</th>
            <th>סה״כ שינוי יומי</th>
            <th>{mode === "bank" ? "יתרה בסוף היום" : "יתרה מצטברת בסוף היום"}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([date, d], i) => {
            const month = date.slice(0, 7);
            const prevMonth = i > 0 ? rows[i - 1][0].slice(0, 7) : null;
            const isNewMonth = prevMonth !== null && month !== prevMonth;
            return (
              <Fragment key={date}>
                {isNewMonth && (
                  <tr key={`sep-${month}`}>
                    <td colSpan={mode === "bank" ? 8 : 7} className="border-t-2 border-border py-1 text-xs font-semibold text-muted">
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
                  <td className={d.overdue < 0 ? "text-warning" : undefined}>
                    {d.overdue !== 0 ? formatCurrency(d.overdue) : "—"}
                  </td>
                  <td className={`font-semibold ${d.total < 0 ? "text-danger" : "text-success"}`}>
                    {formatCurrency(d.total)}
                  </td>
                  <td className="font-semibold">{formatCurrency(d.runningBalance)}</td>
                </tr>
              </Fragment>
            );
          })}
          {rows.length === 0 && (
            <tr>
              <td colSpan={mode === "bank" ? 8 : 7} className="text-center text-muted py-6">
                אין תנועות צפויות בטווח שנבחר
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
