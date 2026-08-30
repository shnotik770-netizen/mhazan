export function formatCurrency(amount: number, currency = "ILS") {
  return new Intl.NumberFormat("he-IL", { style: "currency", currency }).format(amount);
}

export function formatDate(date: string) {
  return new Intl.DateTimeFormat("he-IL").format(new Date(date));
}

// Formats a Date using its LOCAL year/month/day — never toISOString(),
// which converts through UTC first. In a timezone ahead of UTC (e.g.
// Israel, UTC+2/+3), toISOString().slice(0, 10) silently rolls back to
// the previous day: local midnight is still "yesterday" in UTC, so any
// date built from local components (addMonths, "today", etc.) comes out
// one day early once converted.
export function toLocalISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function todayIso(): string {
  return toLocalISODate(new Date());
}

// Adds calendar months to a "YYYY-MM-DD" date, preserving local
// year/month/day throughout (see toLocalISODate above for why this never
// routes through toISOString()).
export function addMonthsToDate(iso: string, months: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setMonth(d.getMonth() + months);
  return toLocalISODate(d);
}

// A bank balance is manually entered/confirmed, never auto-calculated —
// this makes how stale that number is visible at a glance, e.g. next to
// "יתרה" everywhere it's shown, instead of admins having to guess whether
// it still reflects reality.
export function daysAgoLabel(dateStr: string | null): string {
  if (!dateStr) return "";
  const days = Math.round((new Date(todayIso()).getTime() - new Date(dateStr).getTime()) / 86400000);
  if (days <= 0) return "עודכן היום";
  if (days === 1) return "עודכן אתמול";
  return `עודכן לפני ${days} ימים`;
}
