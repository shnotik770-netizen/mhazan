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
