"use client";

import { useState } from "react";
import { formatCurrency, formatDate } from "@/lib/format";

type DayEntry = { runningBalance: number };

// Pick any single date and see the projected bank balance on that day —
// carried forward from the last dated forecast item on or before it —
// plus how much is missing if the projection goes negative.
export function ForecastDayLookup({
  rows,
  startingBalance,
}: {
  rows: [string, DayEntry][];
  startingBalance: number;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);

  let balance = startingBalance;
  let matchedDate: string | null = null;
  for (const [d, entry] of rows) {
    if (d <= date) {
      balance = entry.runningBalance;
      matchedDate = d;
    } else break;
  }

  return (
    <div className="card p-4 space-y-2">
      <h2 className="font-semibold">צפי יתרה לתאריך מסוים</h2>
      <div className="flex items-center gap-2">
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="rounded-lg border border-border bg-transparent px-3 py-2 text-sm"
        />
      </div>
      <p className="text-xs text-muted">
        {matchedDate ? `לפי התנועות הצפויות עד ${formatDate(matchedDate)} (כולל)` : "לפני התחלת התנועות הצפויות — היתרה הנוכחית"}
      </p>
      <p className={`text-2xl font-bold ${balance < 0 ? "text-danger" : "text-success"}`}>
        {formatCurrency(balance)}
      </p>
      {balance < 0 && (
        <p className="text-sm text-danger font-medium">
          חסרים {formatCurrency(Math.abs(balance))} כדי לכסות את כל ההתחייבויות עד תאריך זה
        </p>
      )}
    </div>
  );
}
