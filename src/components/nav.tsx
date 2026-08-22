"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "@/app/login/actions";
import type { CurrentUser } from "@/lib/auth";

// Department/category/supplier management live only behind "הגדרות" —
// keeping them out of the main nav means a non-admin never even sees
// links to admin-only management screens.
const links = [
  { href: "/", label: "דשבורד" },
  { href: "/checks", label: "צ׳קים והעברות" },
  { href: "/incomes", label: "הכנסות" },
  { href: "/transactions", label: "כל התנועות" },
  { href: "/expenses", label: "הוצאות" },
  { href: "/ledger", label: "דוחות מחלקות" },
  { href: "/forecast", label: "תחזית תזרים", forecastOnly: true },
  { href: "/settings", label: "הגדרות", adminOnly: true },
];

export function Nav({ user, canSeeForecast }: { user: CurrentUser; canSeeForecast: boolean }) {
  const isAdmin = user.profile.role === "FINANCE_ADMIN";
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const visibleLinks = links.filter((l) => (!l.adminOnly || isAdmin) && (!l.forecastOnly || canSeeForecast));

  return (
    <header className="border-b border-border bg-surface no-print">
      <div className="mx-auto max-w-7xl px-4 flex items-center justify-between gap-6 h-14">
        <div className="flex items-center gap-6 min-w-0">
          <span
            className="text-lg font-bold tracking-tight shrink-0"
            style={{ fontFamily: "var(--font-display)", color: "var(--primary)" }}
          >
            דשבורד מרכז חב״ד עפולה
          </span>
          <nav className="hidden md:flex items-center gap-1">
            {visibleLinks.map((l) => {
              const active = l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    active ? "bg-primary/10 text-primary" : "hover:bg-background"
                  }`}
                >
                  {l.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <button
          onClick={() => setOpen((v) => !v)}
          className="md:hidden rounded-lg p-2 hover:bg-background"
          aria-label="תפריט"
          aria-expanded={open}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>

        <div className="hidden md:flex items-center gap-3 shrink-0">
          <span className="text-sm text-muted">
            {user.profile.full_name ?? user.email}
            <span className="badge bg-background text-muted mr-2">{isAdmin ? "מנהל כספים" : "מנהל מחלקה"}</span>
          </span>
          <form action={signOut}>
            <button className="text-sm text-muted hover:text-foreground" type="submit">
              יציאה
            </button>
          </form>
        </div>
      </div>

      {open && (
        <div className="md:hidden border-t border-border px-4 py-3 space-y-3">
          <nav className="flex flex-col gap-1">
            {visibleLinks.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="px-3 py-2 rounded-lg text-sm font-medium hover:bg-background"
              >
                {l.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center justify-between border-t border-border pt-3">
            <span className="text-sm text-muted">
              {user.profile.full_name ?? user.email}
              <span className="badge bg-background text-muted mr-2">{isAdmin ? "מנהל כספים" : "מנהל מחלקה"}</span>
            </span>
            <form action={signOut}>
              <button className="text-sm text-muted hover:text-foreground" type="submit">
                יציאה
              </button>
            </form>
          </div>
        </div>
      )}
    </header>
  );
}
