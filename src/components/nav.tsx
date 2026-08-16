import Link from "next/link";
import { signOut } from "@/app/login/actions";
import type { CurrentUser } from "@/lib/auth";

const links = [
  { href: "/", label: "דשבורד" },
  { href: "/incomes", label: "הכנסות" },
  { href: "/checks", label: "צ׳קים" },
  { href: "/ledger", label: "התחשבנות פנימית" },
  { href: "/forecast", label: "תחזית תזרים" },
  { href: "/departments", label: "ניהול מחלקות", adminOnly: true },
  { href: "/settings", label: "הגדרות", adminOnly: true },
];

export function Nav({ user }: { user: CurrentUser }) {
  const isAdmin = user.profile.role === "FINANCE_ADMIN";

  return (
    <header className="border-b border-border bg-surface">
      <div className="mx-auto max-w-7xl px-4 flex items-center justify-between h-14">
        <nav className="flex items-center gap-1">
          {links
            .filter((l) => !l.adminOnly || isAdmin)
            .map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="px-3 py-2 rounded-lg text-sm font-medium hover:bg-background"
              >
                {l.label}
              </Link>
            ))}
        </nav>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted">
            {user.profile.full_name ?? user.email}
            <span className="badge bg-background text-muted mr-2">
              {isAdmin ? "מנהל כספים" : "מנהל מחלקה"}
            </span>
          </span>
          <form action={signOut}>
            <button className="text-sm text-muted hover:text-foreground" type="submit">
              יציאה
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
