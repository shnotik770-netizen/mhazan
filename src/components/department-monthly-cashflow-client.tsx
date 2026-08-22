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

// Collapsed by default — the cards + transaction list above stay exactly as
// they were before this existed. Opening this shows the same continuous
// month-by-month balance a bank cash-flow report shows: real history up to
// today, seamlessly continuing into the forecast from recurring schedules
// and known checks/transfers. Picking a past month adds a summary line for
// "how much was owed by the end of that month" and trims the table to start
// there.
export function DepartmentMonthlyCashFlow({ rows }: { rows: MonthlyFlow[] }) {
  const [fromMonth, setFromMonth] = useState("");

  if (rows.length === 0) return null;

  const pastMonths = rows.filter((r) => !r.isFuture);
  const startIndex = fromMonth ? rows.findIndex((r) => r.month === fromMonth) : -1;
  const visibleRows = startIndex >= 0 ? rows.slice(startIndex) : rows;
  const summaryRow = startIndex > 0 ? rows[startIndex - 1] : null;

  return (
    <details className="card p-4">
      <summary className="cursor-pointer font-semibold">תזרים חודשי — עבר ותחזית</summary>
      <div className="mt-3 space-y-3">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <label className="text-muted">הצג החל מחודש:</label>
          <select
            value={fromMonth}
            onChange={(e) => setFromMonth(e.target.value)}
            className="rounded border border-border bg-transparent px-2 py-1 text-sm"
          >
            <option value="">כל הטווח</option>
            {pastMonths.map((r) => (
              <option key={r.month} value={r.month}>
                {monthLabel(r.month)}
              </option>
            ))}
          </select>
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
            </tbody>
          </table>
        </div>
      </div>
    </details>
  );
}
