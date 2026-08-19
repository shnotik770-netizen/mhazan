"use client";

import { createContext, useContext, useMemo, useState } from "react";
import { formatCurrency, formatDate } from "@/lib/format";

export type MonthlyCard = {
  month: string;
  opening: number;
  income: number;
  expense: number;
  oldExpense: number;
  closing: number;
};

export type ForecastItemRow = {
  id: string;
  date: string;
  source: string;
  change: number;
  runningBalance: number;
};

type SimulationState = {
  items: ForecastItemRow[];
  startingBalance: number;
  held: Set<string>;
  heldAdjustment: number[]; // parallel to items — cumulative held effect up to and including that row
  hasSimulation: boolean;
  toggle: (id: string) => void;
  saved: boolean;
  saveSimulation: () => void;
  clearSimulation: () => void;
};

const SimulationContext = createContext<SimulationState | null>(null);

// Every consumer (the day-lookup widget, the monthly cards, the item table)
// shares one held-rows state through this context instead of each keeping
// its own — otherwise marking a row "not going out" at the bottom of the
// page wouldn't be reflected in the balance-lookup widget near the top.
export function useSimulation(): SimulationState {
  const ctx = useContext(SimulationContext);
  if (!ctx) throw new Error("useSimulation must be used within ForecastSimulationProvider");
  return ctx;
}

function storageKey(bankAccountId: string) {
  return `forecast-sim-held-${bankAccountId}`;
}

// A what-if tool: marking a row "not going out" (e.g. a check you decided not
// to deposit) recomputes the running balance and monthly totals as if that
// item never happened — purely a display overlay on top of the real
// forecast rows, never touching any stored data. Held rows can optionally be
// saved to localStorage so the simulation survives a reload, but it's
// explicitly local/per-browser and never treated as real forecast data.
export function ForecastSimulationProvider({
  bankAccountId,
  startingBalance,
  items,
  children,
}: {
  bankAccountId: string;
  startingBalance: number;
  items: ForecastItemRow[];
  children: React.ReactNode;
}) {
  // Read once from localStorage as the initial value (rather than in an
  // effect) so there's no cascading render — the page passes
  // key={bankAccountId} on this provider, so switching accounts remounts it
  // and re-runs this initializer instead of leaving stale state behind.
  const [held, setHeld] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const raw = localStorage.getItem(storageKey(bankAccountId));
      return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
    } catch {
      return new Set();
    }
  });
  const [saved, setSaved] = useState(() => typeof window !== "undefined" && localStorage.getItem(storageKey(bankAccountId)) !== null);

  function toggle(id: string) {
    setHeld((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setSaved(false);
  }

  function saveSimulation() {
    localStorage.setItem(storageKey(bankAccountId), JSON.stringify([...held]));
    setSaved(true);
  }

  function clearSimulation() {
    localStorage.removeItem(storageKey(bankAccountId));
    setHeld(new Set());
    setSaved(false);
  }

  // Cumulative held adjustment per row, in the same order the running
  // balance was originally computed — lets each row's (or date's) adjusted
  // balance be derived from the original without redoing the categorization
  // the SQL function already did.
  const heldAdjustment = useMemo(
    () =>
      items.reduce<{ list: number[]; running: number }>(
        (acc, item) => {
          const running = acc.running + (held.has(item.id) ? item.change : 0);
          return { list: [...acc.list, running], running };
        },
        { list: [], running: 0 },
      ).list,
    [items, held],
  );

  const value: SimulationState = {
    items,
    startingBalance,
    held,
    heldAdjustment,
    hasSimulation: held.size > 0,
    toggle,
    saved,
    saveSimulation,
    clearSimulation,
  };

  return <SimulationContext.Provider value={value}>{children}</SimulationContext.Provider>;
}

function monthCardLabel(month: string) {
  return new Intl.DateTimeFormat("he-IL", { month: "long", year: "numeric" }).format(new Date(`${month}-01T00:00:00`));
}

export function ForecastSimulationBanner() {
  const { hasSimulation, held, saved, saveSimulation, clearSimulation } = useSimulation();
  if (!hasSimulation) return null;
  return (
    <div className="card p-3 bg-warning-bg border-warning/40 flex items-center justify-between flex-wrap gap-2">
      <p className="text-sm font-medium text-warning">
        🧪 סימולציה פעילה — {held.size} פריטים מסומנים כ״לא יוצא״. זו הגדרה זמנית לבדיקה בלבד, לא משנה שום נתון אמיתי
        במערכת.
      </p>
      <div className="flex items-center gap-2">
        <button
          onClick={saveSimulation}
          disabled={saved}
          className="rounded-lg border border-warning/50 px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
        >
          {saved ? "נשמר בדפדפן זה" : "שמור סימולציה"}
        </button>
        <button onClick={clearSimulation} className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold">
          נקה סימולציה
        </button>
      </div>
    </div>
  );
}

export function ForecastSimulationPanel({ monthlyCards }: { monthlyCards: MonthlyCard[] }) {
  const { items, held, heldAdjustment, hasSimulation, toggle } = useSimulation();

  const heldByMonth = useMemo(() => {
    const map = new Map<string, number>();
    items.forEach((item) => {
      if (!held.has(item.id)) return;
      const month = item.date.slice(0, 7);
      map.set(month, (map.get(month) ?? 0) + item.change);
    });
    return map;
  }, [items, held]);

  const lastIndexByMonth = useMemo(() => {
    const map = new Map<string, number>();
    items.forEach((item, i) => map.set(item.date.slice(0, 7), i));
    return map;
  }, [items]);

  return (
    <div className="space-y-4">
      {monthlyCards.length > 0 && (
        <div>
          <h2 className="font-semibold mb-2">מצב חזוי לפי חודשים</h2>
          <div className="flex flex-col gap-3">
            {monthlyCards.map((c) => {
              const deferred = -(heldByMonth.get(c.month) ?? 0);
              const lastIdxInMonth = lastIndexByMonth.get(c.month) ?? -1;
              const simulatedClosing = lastIdxInMonth >= 0 ? c.closing - heldAdjustment[lastIdxInMonth] : c.closing;
              return (
                <div key={c.month} className="card p-4 space-y-1">
                  <p className="font-semibold">{monthCardLabel(c.month)}</p>
                  <p className="text-xs text-muted">
                    יתרת פתיחה: <span className="font-medium text-foreground">{formatCurrency(c.opening)}</span>
                  </p>
                  <p className="text-xs text-success">הכנסות: {formatCurrency(c.income)}</p>
                  <p className="text-xs text-danger">הוצאות: {formatCurrency(Math.abs(c.expense))}</p>
                  {c.oldExpense !== 0 && (
                    <p className="text-xs text-warning">
                      הוצאות ישנות שלא נפדו מחודשים קודמים: {formatCurrency(Math.abs(c.oldExpense))}
                    </p>
                  )}
                  {deferred !== 0 && (
                    <p className="text-xs text-primary">
                      🧪 הוצאות מושהות (סימולציה): {formatCurrency(Math.abs(deferred))}
                    </p>
                  )}
                  <p className="text-sm font-semibold pt-1 border-t border-border">
                    יתרת סגירה:{" "}
                    <span className={c.closing < 0 ? "text-danger" : "text-success"}>{formatCurrency(c.closing)}</span>
                  </p>
                  {deferred !== 0 && (
                    <p className="text-xs font-semibold text-primary">
                      יתרת סגירה בסימולציה: {formatCurrency(simulatedClosing)}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <details className="card p-4">
        <summary className="cursor-pointer font-semibold">פירוט מלא לפי פריט</summary>
        <p className="text-xs text-muted mt-2">
          סמנו ״לא יוצא״ על פריט (למשל צ׳ק שביקשתם לא להפקיד) כדי לראות בסימולציה איך זה משנה את התחזית — לא משנה שום
          נתון אמיתי.
        </p>
        <div className="overflow-x-auto mt-3">
          <table className="data-table">
            <thead>
              <tr>
                <th>תאריך</th>
                <th>מקור</th>
                <th>שינוי צפוי</th>
                <th>יתרה חזויה</th>
                {hasSimulation && <th>יתרה בסימולציה</th>}
                <th>לא יוצא (סימולציה)</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, i) => {
                const isHeld = held.has(item.id);
                return (
                  <tr key={item.id} className={isHeld ? "opacity-50" : undefined}>
                    <td className={isHeld ? "line-through" : undefined}>{formatDate(item.date)}</td>
                    <td className={isHeld ? "line-through" : undefined}>{item.source}</td>
                    <td className={item.change < 0 ? "text-danger" : "text-success"}>{formatCurrency(item.change)}</td>
                    <td className="font-semibold">{formatCurrency(item.runningBalance)}</td>
                    {hasSimulation && (
                      <td className="font-semibold text-primary">{formatCurrency(item.runningBalance - heldAdjustment[i])}</td>
                    )}
                    <td>
                      <input type="checkbox" checked={isHeld} onChange={() => toggle(item.id)} />
                    </td>
                  </tr>
                );
              })}
              {items.length === 0 && (
                <tr>
                  <td colSpan={hasSimulation ? 6 : 5} className="text-center text-muted py-6">
                    אין תנועות צפויות בטווח שנבחר
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
