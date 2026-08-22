"use client";

import { Fragment } from "react";
import { formatCurrency, formatDate } from "@/lib/format";
import { SortFilterTh, useSortFilter, type ColumnDef } from "@/components/sortable-table";

type DayEntry = {
  checks: number;
  transfers: number;
  recurring: number;
  income: number;
  overdue: number;
  total: number;
  runningBalance: number;
};

type Row = { date: string; entry: DayEntry };

function monthLabel(month: string) {
  return new Intl.DateTimeFormat("he-IL", { month: "long", year: "numeric" }).format(new Date(`${month}-01T00:00:00`));
}

// Always shows every row passed in — the range is already scoped by the
// page-level "עד חודש" filter, so there's no separate cutoff control here.
export function ForecastDailyTable({ rows }: { rows: [string, DayEntry][] }) {
  const allRows: Row[] = rows.map(([date, entry]) => ({ date, entry }));

  const columns: ColumnDef<Row>[] = [
    { key: "date", label: "תאריך", sortValue: (r) => r.date, filterValue: (r) => monthLabel(r.date.slice(0, 7)) },
    { key: "checks", label: "צ׳קים", sortValue: (r) => r.entry.checks },
    { key: "transfers", label: "העברות", sortValue: (r) => r.entry.transfers },
    { key: "recurring", label: "הוראות קבע", sortValue: (r) => r.entry.recurring },
    { key: "income", label: "צפי הכנסה", sortValue: (r) => r.entry.income },
    { key: "overdue", label: "פיגורים (ישנים)", sortValue: (r) => r.entry.overdue },
    { key: "total", label: "סה״כ שינוי יומי", sortValue: (r) => r.entry.total },
    { key: "runningBalance", label: "יתרה בסוף היום", sortValue: (r) => r.entry.runningBalance },
  ];

  const { rows: processedRows, sort, toggleSort, filters, setColumnFilter, hasActiveFilters, clearAll } = useSortFilter(
    allRows,
    columns,
  );
  const colSpan = 8;
  // Month separators only make sense in natural chronological order —
  // once the table is sorted by anything else, a flat list is what
  // actually matches what the user asked to see.
  const showMonthSeparators = sort === null;

  return (
    <div className="card p-4 overflow-x-auto">
      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
        <h2 className="font-semibold">סיכום יומי — כמה כסף אמור לרדת/להיכנס בכל יום</h2>
        {hasActiveFilters && (
          <button type="button" onClick={clearAll} className="text-xs text-primary underline">
            נקה מיון וסינון
          </button>
        )}
      </div>
      <table className="data-table">
        <thead>
          <tr>
            {columns.map((col) => (
              <SortFilterTh
                key={col.key}
                col={col}
                allRows={allRows}
                sort={sort}
                toggleSort={toggleSort}
                activeFilter={filters[col.key]}
                setColumnFilter={setColumnFilter}
              />
            ))}
          </tr>
        </thead>
        <tbody>
          {processedRows.map(({ date, entry: d }, i) => {
            const month = date.slice(0, 7);
            const prevMonth = i > 0 ? processedRows[i - 1].date.slice(0, 7) : null;
            const isNewMonth = showMonthSeparators && prevMonth !== null && month !== prevMonth;
            return (
              <Fragment key={date}>
                {isNewMonth && (
                  <tr key={`sep-${month}`}>
                    <td colSpan={colSpan} className="border-t-2 border-border py-1 text-xs font-semibold text-muted">
                      {monthLabel(month)}
                    </td>
                  </tr>
                )}
                <tr key={date}>
                  <td>{formatDate(date)}</td>
                  <td className={d.checks < 0 ? "text-danger" : undefined}>{formatCurrency(d.checks)}</td>
                  <td className={d.transfers < 0 ? "text-danger" : undefined}>{formatCurrency(d.transfers)}</td>
                  <td className={d.recurring < 0 ? "text-danger" : undefined}>{formatCurrency(d.recurring)}</td>
                  <td className="text-success">{formatCurrency(d.income)}</td>
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
          {processedRows.length === 0 && (
            <tr>
              <td colSpan={colSpan} className="text-center text-muted py-6">
                אין תנועות צפויות בטווח שנבחר
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
