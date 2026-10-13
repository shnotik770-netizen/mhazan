"use client";

import { useRouter } from "next/navigation";
import { DateInput } from "@/components/date-input";
import { formatCurrency, formatDate, todayIso } from "@/lib/format";
import { useSimulation } from "@/components/forecast-simulation-client";

type MonthOption = { value: string; label: string };

// Replaces what used to be two separate controls — a month cutoff in the
// top filter bar (driving the real server-side horizon) and a client-only
// "look up any date" tool further down (reading only whatever the month
// cutoff happened to already fetch, so a date past that cutoff silently
// read as incomplete) — with one box offering either way to choose how far
// ahead to look, and whichever one is picked actually drives the horizon
// everything below is computed from: the monthly cards, the daily table,
// and this box's own balance breakdown all re-fetch from the chosen date
// or month-end instead of the lookup being a second, independent view.
export function ForecastHorizonPicker({
  selectedAccountId,
  mode,
  date,
  month,
  monthOptions,
}: {
  selectedAccountId: string;
  mode: "date" | "month";
  date: string;
  month: string;
  monthOptions: MonthOption[];
}) {
  const router = useRouter();
  const { items, startingBalance, heldAdjustment, hasSimulation } = useSimulation();

  function goToDate(d: string) {
    const sp = new URLSearchParams();
    sp.set("account", selectedAccountId);
    sp.set("date", d);
    router.push(`/forecast?${sp.toString()}`);
  }

  function goToMonth(m: string) {
    const sp = new URLSearchParams();
    sp.set("account", selectedAccountId);
    sp.set("upto", m);
    router.push(`/forecast?${sp.toString()}`);
  }

  // The breakdown below always reads up through a single reference date —
  // in month mode that's the month's last day, so "יתרה לתאריך זה" always
  // means something concrete even without an exact date chosen.
  const lookupDate = mode === "date" ? date : monthEndDate(month);

  // Walks the simulated items up through targetDate — used twice below: once
  // for whatever the admin picked (today by default, via "עד סוף חודש" on
  // the current month — or any other date/month), and once fixed on today's
  // actual date, so today's balance is always visible as a reference point
  // alongside it, even once a different date/month is selected.
  function simulateUpTo(targetDate: string) {
    let balance = startingBalance;
    let income = 0;
    let expense = 0;
    let matchedDate: string | null = null;
    let matchedIndex = -1;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.date > targetDate) break;
      balance = item.runningBalance - heldAdjustment[i];
      if (item.change >= 0) income += item.change;
      else expense += item.change;
      matchedDate = item.date;
      matchedIndex = i;
    }
    const deferred = matchedIndex >= 0 ? -heldAdjustment[matchedIndex] : 0;
    return { balance, income, expense, matchedDate, deferred };
  }

  const selected = simulateUpTo(lookupDate);
  const todayBalance = simulateUpTo(todayIso()).balance;

  return (
    <div className="card p-4 space-y-3">
      <h2 className="font-semibold">צפי יתרה לתאריך מסוים</h2>

      <div className="flex items-center gap-1 rounded-lg border border-border p-0.5 text-xs w-fit">
        <button
          type="button"
          onClick={() => mode !== "date" && goToDate(date)}
          className={`rounded px-2 py-1 ${mode === "date" ? "bg-primary text-primary-foreground" : "text-muted"}`}
        >
          תאריך מדויק
        </button>
        <button
          type="button"
          onClick={() => mode !== "month" && goToMonth(month)}
          className={`rounded px-2 py-1 ${mode === "month" ? "bg-primary text-primary-foreground" : "text-muted"}`}
        >
          עד סוף חודש
        </button>
      </div>

      {mode === "date" ? (
        <DateInput value={date} onChange={goToDate} className="rounded-lg border border-border bg-transparent px-3 py-2 text-sm" />
      ) : (
        <select
          value={month}
          onChange={(e) => goToMonth(e.target.value)}
          className="rounded-lg border border-border bg-transparent px-3 py-2 text-sm"
        >
          {monthOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )}

      <p className="text-xs text-muted">
        {selected.matchedDate
          ? `לפי התנועות הצפויות עד ${formatDate(selected.matchedDate)} (כולל)`
          : "לפני התחלת התנועות הצפויות — היתרה הנוכחית"}
      </p>

      <div className="text-sm space-y-0.5">
        <p className="text-danger">הוצאות: {formatCurrency(Math.abs(selected.expense))}</p>
        <p className="text-success">הכנסות: {formatCurrency(selected.income)}</p>
        {hasSimulation && <p className="text-primary">🧪 הוצאות מושהות: {formatCurrency(Math.abs(selected.deferred))}</p>}
      </div>

      <div className="pt-1 grid grid-cols-2 gap-3">
        <div>
          <p className="text-xs text-muted">יתרה היום</p>
          <p className={`text-2xl font-bold ${todayBalance < 0 ? "text-danger" : "text-success"}`}>
            {formatCurrency(todayBalance)}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted">יתרה ל־{formatDate(lookupDate)}</p>
          <p className={`text-2xl font-bold ${selected.balance < 0 ? "text-danger" : "text-success"}`}>
            {formatCurrency(selected.balance)}
          </p>
        </div>
      </div>
    </div>
  );
}

function monthEndDate(monthStr: string): string {
  const [y, m] = monthStr.split("-").map(Number);
  const lastDay = new Date(y, m, 0);
  return lastDay.toISOString().slice(0, 10);
}
