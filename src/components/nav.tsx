"use client";

import { useState } from "react";
import Link from "next/link";
import { signOut } from "@/app/login/actions";
import type { CurrentUser } from "@/lib/auth";

// Department/category/supplier management live only behind "הגדרות" —
// keeping them out of the main nav means a non-admin never even sees
// links to admin-only management screens.
const links = [
  { href: "/", label: "דשבורד" },
  { href: "/transactions", label: "כל התנועות" },
  { href: "/incomes", label: "הכנסות" },
  { href: "/checks", label: "צ׳קים" },
  { href: "/expenses", label: "הוצאות" },
  { href: "/ledger", label: "התחשבנות פנימית" },
  { href: "/forecast", label: "תחזית תזרים" },
  { href: "/settings", label: "הגדרות", adminOnly: true },
];

export function Nav({ user }: { user: CurrentUser }) {
  const isAdmin = user.profile.role === "FINANCE_ADMIN";
  const [open, setOpen] = useState(false);
  const visibleLinks = links.filter((l) => !l.adminOnly || isAdmin);

  return (
    <header className="border-b border-border bg-surface no-print">
      <div className="mx-auto max-w-7xl px-4 flex items-center justify-between h-14">
        <nav className="hidden md:flex items-center gap-1">
          {visibleLinks.map((l) => (
            <Link key={l.href} href={l.href} className="px-3 py-2 rounded-lg text-sm font-medium hover:bg-background">
              {l.label}
            </Link>
          ))}
        </nav>

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

        <div className="hidden md:flex items-center gap-3">
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
