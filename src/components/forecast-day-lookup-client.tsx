"use client";

import { useState } from "react";
import { formatCurrency, formatDate, todayIso } from "@/lib/format";
import { useSimulation } from "@/components/forecast-simulation-client";

// Pick any single date and see the projected bank balance on that day —
// carried forward from the last dated forecast item on or before it —
// plus how much is missing if the projection goes negative. When a
// "not going out" simulation is active (marked further down the page), the
// simulated balance for the same date is shown alongside the real one.
export function ForecastDayLookup() {
  const { items, startingBalance, heldAdjustment, hasSimulation } = useSimulation();
  const today = todayIso();
  const [date, setDate] = useState(today);

  let balance = startingBalance;
  let simulatedBalance = startingBalance;
  let matchedDate: string | null = null;
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.date > date) break;
    balance = item.runningBalance;
    simulatedBalance = item.runningBalance - heldAdjustment[i];
    matchedDate = item.date;
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
      {hasSimulation && (
        <p className={`text-sm font-semibold ${simulatedBalance < 0 ? "text-danger" : "text-primary"}`}>
          🧪 יתרה בסימולציה לתאריך זה: {formatCurrency(simulatedBalance)}
        </p>
      )}
    </div>
  );
}
