"use client";

import { useState } from "react";
import { formatCurrency } from "@/lib/format";

type MonthlyFlow = {
  month: string;
  income: number;
  expense: number;
  opening: number;
  closing: number;
  isFuture: boolean;
};

function monthLabel(monthStr: string): string {
  return new Intl.DateTimeFormat("he-IL", { month: "long", year: "numeric" }).format(new Date(`${monthStr}-01T00:00:00`));
}

// Local copy, not imported from department-report-data.ts — that module
// pulls in the server-only Supabase client (next/headers), which a "use
// client" component must never import even for a small helper like this.
function addMonthsToKey(monthKey: string, n: number): string {
  const [y, m] = monthKey.split("-").map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// Always shown open — this is the same continuous month-by-month balance a
// bank cash-flow report shows: real history up to today, seamlessly
// continuing into the forecast from recurring schedules and known
// checks/transfers. `rows` can span years once a department has enough
// history, so by default only a 6-month window around today (1 month back,
// today, 4 months forward) is shown — wide enough for the near-term picture
// without a long scroll — with a from/to range picker to widen it.
export function DepartmentMonthlyCashFlow({ rows }: { rows: MonthlyFlow[] }) {
  const todayMonth = new Date().toISOString().slice(0, 7);
  const [fromMonth, setFromMonth] = useState(() => addMonthsToKey(todayMonth, -1));
  const [toMonth, setToMonth] = useState(() => addMonthsToKey(todayMonth, 4));
  const [showAll, setShowAll] = useState(false);

  if (rows.length === 0) return null;

  const allMonths = rows.map((r) => r.month);
  const visibleRows = showAll ? rows : rows.filter((r) => r.month >= fromMonth && r.month <= toMonth);
  const startIndex = visibleRows.length > 0 ? rows.findIndex((r) => r.month === visibleRows[0].month) : -1;
  const summaryRow = startIndex > 0 ? rows[startIndex - 1] : null;

  return (
    <div className="card p-4">
      <h2 className="font-semibold">תזרים חודשי מלא — עבר ותחזית (כולל הוראות קבע)</h2>
      <div className="mt-3 space-y-3">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <label className="text-muted">מחודש:</label>
          <select
            value={fromMonth}
            disabled={showAll}
            onChange={(e) => setFromMonth(e.target.value)}
            className="rounded border border-border bg-transparent px-2 py-1 text-sm disabled:opacity-50"
          >
            {allMonths.map((m) => (
              <option key={m} value={m}>
                {monthLabel(m)}
              </option>
            ))}
          </select>
          <label className="text-muted">עד חודש:</label>
          <select
            value={toMonth}
            disabled={showAll}
            onChange={(e) => setToMonth(e.target.value)}
            className="rounded border border-border bg-transparent px-2 py-1 text-sm disabled:opacity-50"
          >
            {allMonths.map((m) => (
              <option key={m} value={m}>
                {monthLabel(m)}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            className="text-xs text-primary underline"
          >
            {showAll ? "חזרה לטווח ברירת המחדל" : "הצג את כל הטווח"}
          </button>
        </div>

        {summaryRow && (
          <p className="text-sm">
            יתרה מצטברת עד סוף {monthLabel(summaryRow.month)}:{" "}
            <span className={`font-semibold ${summaryRow.closing >= 0 ? "text-success" : "text-danger"}`}>
              {formatCurrency(Math.abs(summaryRow.closing))} {summaryRow.closing >= 0 ? "(זכאית)" : "(חייבת)"}
            </span>
          </p>
        )}

        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>חודש</th>
                <th>יתרת פתיחה</th>
                <th>הכנסות</th>
                <th>הוצאות</th>
                <th>יתרת סגירה</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((r) => (
                <tr key={r.month}>
                  <td>
                    {monthLabel(r.month)}
                    {r.isFuture && <span className="text-xs text-muted mr-1">(תחזית)</span>}
                  </td>
                  <td>{formatCurrency(r.opening)}</td>
                  <td className="text-success">{formatCurrency(r.income)}</td>
                  <td className="text-danger">{formatCurrency(r.expense)}</td>
                  <td className={`font-semibold ${r.closing >= 0 ? "text-success" : "text-danger"}`}>
                    {formatCurrency(r.closing)}
                  </td>
                </tr>
              ))}
              {visibleRows.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center text-muted py-4">
                    אין נתונים בטווח שנבחר
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
