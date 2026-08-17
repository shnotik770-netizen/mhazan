"use client";

import { useState } from "react";
import { formatCurrency, formatDate } from "@/lib/format";

type ExpenseRow = {
  id: string;
  date: string | null;
  source: string;
  description: string;
  amount: number;
  departmentName: string | null;
  categoryName: string | null;
  status: string | null;
};

export function ExpensesTable({ rows }: { rows: ExpenseRow[] }) {
  const [query, setQuery] = useState("");
  const filtered = rows.filter((r) => {
    if (!query.trim()) return true;
    const q = query.trim().toLowerCase();
    return (
      r.description.toLowerCase().includes(q) ||
      (r.departmentName ?? "").toLowerCase().includes(q) ||
      (r.categoryName ?? "").toLowerCase().includes(q)
    );
  });

  return (
    <div>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="חיפוש לפי תיאור / מחלקה / קטגוריה"
        className="w-full max-w-sm rounded-lg border border-border bg-transparent px-3 py-2 text-sm mb-3"
      />
      <div className="overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>סוג</th>
              <th>תיאור</th>
              <th>סכום</th>
              <th>תאריך</th>
              <th>מחלקה</th>
              <th>קטגוריה</th>
              <th>סטטוס</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={`${r.source}-${r.id}`}>
                <td>{r.source}</td>
                <td>{r.description}</td>
                <td>{formatCurrency(r.amount)}</td>
                <td>{r.date ? formatDate(r.date) : "—"}</td>
                <td>{r.departmentName ?? <span className="text-warning">בהמתנה</span>}</td>
                <td>{r.categoryName ?? "—"}</td>
                <td>
                  {r.status === "CLEARED" ? (
                    <span className="badge bg-success-bg text-success">נפרע</span>
                  ) : r.status === "APPROVED" ? (
                    <span className="badge bg-success-bg text-success">מאושר</span>
                  ) : (
                    <span className="badge bg-warning-bg text-warning">לא נפרע</span>
                  )}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center text-muted py-6">
                  אין הוצאות מאושרות עדיין
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
