"use client";

import { useState } from "react";
import { formatCurrency, formatDate, todayIso } from "@/lib/format";
import { useSimulation } from "@/components/forecast-simulation-client";

// Pick any single date and see the projected bank balance on that day —
// carried forward from the last dated forecast item on or before it — plus
// how much of that comes from income vs. expenses, and how much of it is
// currently held back by a "not going out" simulation. The simulated
// balance (identical to the real one when no simulation is active) is the
// headline figure, since it's always the accurate answer to "what will the
// balance actually be" given whatever's currently marked held.
export function ForecastDayLookup() {
  const { items, startingBalance, heldAdjustment, hasSimulation } = useSimulation();
  const today = todayIso();
  const [date, setDate] = useState(today);

  let simulatedBalance = startingBalance;
  let income = 0;
  let expense = 0;
  let matchedDate: string | null = null;
  let matchedIndex = -1;
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.date > date) break;
    simulatedBalance = item.runningBalance - heldAdjustment[i];
    if (item.change >= 0) income += item.change;
    else expense += item.change;
    matchedDate = item.date;
    matchedIndex = i;
  }
  const deferred = matchedIndex >= 0 ? -heldAdjustment[matchedIndex] : 0;

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

      <div className="text-sm space-y-0.5">
        <p className="text-danger">הוצאות: {formatCurrency(Math.abs(expense))}</p>
        <p className="text-success">הכנסות: {formatCurrency(income)}</p>
        {hasSimulation && (
          <p className="text-primary">🧪 הוצאות מושהות: {formatCurrency(Math.abs(deferred))}</p>
        )}
      </div>

      <div className="pt-1">
        <p className="text-xs text-muted">יתרה בסימולציה לתאריך זה</p>
        <p className={`text-2xl font-bold ${simulatedBalance < 0 ? "text-danger" : "text-success"}`}>
          {formatCurrency(simulatedBalance)}
        </p>
      </div>
    </div>
  );
}
