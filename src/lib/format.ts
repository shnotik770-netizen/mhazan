export function formatCurrency(amount: number, currency = "ILS") {
  return new Intl.NumberFormat("he-IL", { style: "currency", currency }).format(amount);
}

// Free-text search boxes across the app sit in an RTL page but are just as
// often used to look up a plain number (a check number, an amount) as a
// Hebrew name. Typing or pasting a number next to RTL text — including
// copying it straight out of an RTL table cell — can silently carry
// invisible bidi control characters (LRM/RLM/embedding marks) along with
// it; `.trim()` alone doesn't remove them since they aren't whitespace, so
// a search for a check number can fail to match its own exact value even
// though both sides look identical on screen. Every free-text search
// should normalize through this instead of a bare `.trim().toLowerCase()`.
export function normalizeSearchQuery(text: string): string {
  return text
    .replace(/[​-‏‪-‮⁦-⁩]/g, "")
    .trim()
    .toLowerCase();
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

// A native <input type="date">'s year segment is a fixed 4-character
// field: typing just "26" and moving on commits as "0026", not "2026" —
// browsers zero-pad an incomplete year instead of expanding it. Nobody is
// ever entering a real date from the first century, so any year under 100
// is unambiguously this mistake and gets silently corrected back to the
// current millennium instead of saving (or worse, sorting/filtering) as a
// date a couple thousand years off.
export function expandTwoDigitYear(isoDate: string): string {
  const m = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return isoDate;
  const year = Number(m[1]);
  if (year >= 100) return isoDate;
  return `${year + 2000}-${m[2]}-${m[3]}`;
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
