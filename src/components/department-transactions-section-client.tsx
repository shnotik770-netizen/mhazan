"use client";

import { useMemo, useState } from "react";
import { formatCurrency } from "@/lib/format";
import { DepartmentTransactionsTable } from "@/components/department-report-table-client";

type ForecastDetail = { donorName: string; categoryName: string; current: number; total: number; amount: number };

type Row = {
  id: string;
  date: string | null;
  typeDetail: string;
  typeCategory: string;
  description: string;
  amount: number;
  spreadTotal?: number | null;
  status?: string | null;
  isOld: boolean;
  kind: "check" | "income" | "manual" | "commission" | "forecast";
  forecastDetails?: ForecastDetail[];
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
  departmentId,
  monthOptions,
  defaultSortDir = "desc",
}: {
  title: string;
  rows: Row[];
  isAdmin: boolean;
  departmentId: string;
  monthOptions: string[];
  defaultSortDir?: "asc" | "desc";
}) {
  const [search, setSearch] = useState("");
  const [month, setMonth] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [kindFilter, setKindFilter] = useState<"all" | "income" | "expense">("all");

  const filtered = useMemo(() => {
    let result = rows;
    if (fromDate || toDate) {
      result = result.filter((r) => {
        if (!r.date) return false;
        if (fromDate && r.date < fromDate) return false;
        if (toDate && r.date > toDate) return false;
        return true;
      });
    } else if (month) {
      result = result.filter((r) => r.date?.slice(0, 7) === month);
    }
    if (kindFilter === "income") result = result.filter((r) => r.amount > 0);
    else if (kindFilter === "expense") result = result.filter((r) => r.amount < 0);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter(
        (r) => r.description.toLowerCase().includes(q) || r.typeDetail.toLowerCase().includes(q),
      );
    }
    return result;
  }, [rows, month, fromDate, toDate, kindFilter, search]);

  const counted = filtered.filter((r) => !r.isOld);
  const income = counted.filter((r) => r.amount > 0).reduce((sum, r) => sum + r.amount, 0);
  const expense = counted.filter((r) => r.amount < 0).reduce((sum, r) => sum + -r.amount, 0);
  const net = income - expense;

  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="font-semibold">{title}</h2>
        <div className="flex items-center gap-2 text-sm flex-wrap">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="חיפוש (תיאור / סוג)..."
            className="rounded border border-border bg-transparent px-2 py-1 text-sm w-40"
          />
          <div className="flex items-center rounded-lg border border-border overflow-hidden text-xs">
            {(
              [
                { key: "all", label: "כל התנועות" },
                { key: "income", label: "הכנסות בלבד" },
                { key: "expense", label: "הוצאות בלבד" },
              ] as const
            ).map((opt) => (
              <button
                key={opt.key}
                type="button"
                onClick={() => setKindFilter(opt.key)}
                className={`px-2 py-1 ${
                  kindFilter === opt.key ? "bg-primary text-primary-foreground" : "bg-transparent text-muted"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <select
            value={month}
            onChange={(e) => {
              setMonth(e.target.value);
              setFromDate("");
              setToDate("");
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
          <div className="flex items-center gap-1">
            <span className="text-xs text-muted">מתאריך</span>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => {
                setFromDate(e.target.value);
                setMonth("");
              }}
              className="rounded border border-border bg-transparent px-2 py-1 text-sm"
            />
            <span className="text-xs text-muted">עד תאריך</span>
            <input
              type="date"
              value={toDate}
              onChange={(e) => {
                setToDate(e.target.value);
                setMonth("");
              }}
              className="rounded border border-border bg-transparent px-2 py-1 text-sm"
            />
          </div>
          {(month || fromDate || toDate || search) && (
            <button
              type="button"
              onClick={() => {
                setMonth("");
                setFromDate("");
                setToDate("");
                setSearch("");
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
        <DepartmentTransactionsTable rows={filtered} isAdmin={isAdmin} departmentId={departmentId} defaultSortDir={defaultSortDir} />
      </div>
    </div>
  );
}
