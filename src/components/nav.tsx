"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { signOut } from "@/app/login/actions";
import { usePortalContainer } from "@/lib/use-portal-container";
import type { CurrentUser } from "@/lib/auth";

// The everyday screens stay directly on the bar; everything reached less
// often (browsing all history, the petty-cash settlement queue, or
// admin-only management screens) is tucked under "הרחבות" instead of
// adding a 9th top-level link.
const mainLinks = [
  { href: "/", label: "דשבורד" },
  { href: "/checks", label: "צ׳קים והעברות" },
  { href: "/expenses", label: "הוצאות" },
  { href: "/ledger", label: "דוחות מחלקות" },
  { href: "/forecast", label: "תחזית תזרים", forecastOnly: true },
];

// Department/category/supplier management live only behind "הגדרות" —
// keeping them out of the main nav means a non-admin never even sees
// links to admin-only management screens.
const extensionLinks = [
  { href: "/transactions", label: "כל התנועות" },
  { href: "/checks#petty-cash-queue", label: "קופה קטנה — חשבוניות ממתינות" },
  { href: "/recurring-schedules", label: "הרשאות וחיובים קבועים", adminOnly: true },
  { href: "/settings", label: "הגדרות", adminOnly: true },
];

function ExtensionsMenu({ links, active }: { links: typeof extensionLinks; active: boolean }) {
  const { ref: triggerRef, container } = usePortalContainer();
  return (
    <DropdownMenu.Root dir="rtl">
      <DropdownMenu.Trigger asChild>
        <button
          ref={triggerRef}
          type="button"
          className={`flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
            active ? "bg-primary/10 text-primary" : "hover:bg-background"
          }`}
        >
          הרחבות
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
          </svg>
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal container={container}>
        <DropdownMenu.Content
          align="start"
          sideOffset={6}
          collisionPadding={8}
          className="popover-panel z-50 min-w-[14rem] rounded-xl border border-border bg-surface p-1.5 text-right shadow-lg"
        >
          <div className="flex flex-col gap-0.5">
            {links.map((l) => (
              <DropdownMenu.Item key={l.href} asChild>
                <Link href={l.href} className="rounded-lg px-3 py-2 text-sm font-medium hover:bg-background">
                  {l.label}
                </Link>
              </DropdownMenu.Item>
            ))}
          </div>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

export function Nav({ user, canSeeForecast }: { user: CurrentUser; canSeeForecast: boolean }) {
  const isAdmin = user.profile.role === "FINANCE_ADMIN";
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const visibleMainLinks = mainLinks.filter((l) => !l.forecastOnly || canSeeForecast);
  const visibleExtensionLinks = extensionLinks.filter((l) => !l.adminOnly || isAdmin);
  const isExtensionActive = visibleExtensionLinks.some((l) => pathname.startsWith(l.href.split("#")[0]));

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
            {visibleMainLinks.map((l) => {
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
            <ExtensionsMenu links={visibleExtensionLinks} active={isExtensionActive} />
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
            {visibleMainLinks.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="px-3 py-2 rounded-lg text-sm font-medium hover:bg-background"
              >
                {l.label}
              </Link>
            ))}
            <p className="px-3 pt-2 text-xs font-semibold text-muted">הרחבות</p>
            {visibleExtensionLinks.map((l) => (
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
