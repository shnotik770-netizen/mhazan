"use client";

import { useMemo, useState } from "react";
import { formatCurrency } from "@/lib/format";
import { DepartmentTransactionsTable } from "@/components/department-report-table-client";

type Row = {
  id: string;
  date: string | null;
  type: string;
  description: string;
  amount: number;
  spreadTotal?: number | null;
  status?: string | null;
  isOld: boolean;
  kind: "check" | "income" | "manual";
};

function monthLabel(monthStr: string): string {
  return new Intl.DateTimeFormat("he-IL", { month: "long", year: "numeric" }).format(new Date(`${monthStr}-01T00:00:00`));
}

// One filterable transactions block, reused for both the "future" and
// "past" sections of a department report — pick a month or an exact date
// and the summary line (income/expenses/net) recalculates for just that
// selection, same as the table below it.
export function DepartmentTransactionsSection({
  title,
  rows,
  isAdmin,
  monthOptions,
  defaultSortDir = "desc",
}: {
  title: string;
  rows: Row[];
  isAdmin: boolean;
  monthOptions: string[];
  defaultSortDir?: "asc" | "desc";
}) {
  const [month, setMonth] = useState("");
  const [exactDate, setExactDate] = useState("");

  const filtered = useMemo(() => {
    if (exactDate) return rows.filter((r) => r.date === exactDate);
    if (month) return rows.filter((r) => r.date?.slice(0, 7) === month);
    return rows;
  }, [rows, month, exactDate]);

  const counted = filtered.filter((r) => !r.isOld);
  const income = counted.filter((r) => r.amount > 0).reduce((sum, r) => sum + r.amount, 0);
  const expense = counted.filter((r) => r.amount < 0).reduce((sum, r) => sum + -r.amount, 0);
  const net = income - expense;

  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="font-semibold">{title}</h2>
        <div className="flex items-center gap-2 text-sm flex-wrap">
          <select
            value={month}
            onChange={(e) => {
              setMonth(e.target.value);
              setExactDate("");
            }}
            className="rounded border border-border bg-transparent px-2 py-1 text-sm"
          >
            <option value="">כל החודשים</option>
            {monthOptions.map((m) => (
              <option key={m} value={m}>
                {monthLabel(m)}
              </option>
            ))}
          </select>
          <input
            type="date"
            value={exactDate}
            onChange={(e) => {
              setExactDate(e.target.value);
              setMonth("");
            }}
            className="rounded border border-border bg-transparent px-2 py-1 text-sm"
          />
          {(month || exactDate) && (
            <button
              type="button"
              onClick={() => {
                setMonth("");
                setExactDate("");
              }}
              className="text-xs text-primary underline"
            >
              נקה סינון
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-4 text-sm">
        <p>
          הכנסות: <span className="text-success font-semibold">{formatCurrency(income)}</span>
        </p>
        <p>
          הוצאות: <span className="text-danger font-semibold">{formatCurrency(expense)}</span>
        </p>
        <p>
          נטו: <span className={`font-semibold ${net >= 0 ? "text-success" : "text-danger"}`}>{formatCurrency(net)}</span>
        </p>
      </div>

      <div className="overflow-x-auto">
        <DepartmentTransactionsTable rows={filtered} isAdmin={isAdmin} defaultSortDir={defaultSortDir} />
      </div>
    </div>
  );
}
