import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getAccessibleBankAccountIds } from "@/lib/bank-access";
import { Nav } from "@/components/nav";
import { QuickActionsFab } from "@/components/quick-actions-fab";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const isAdmin = user.profile.role === "FINANCE_ADMIN";

  // The bank cash-flow forecast has nothing to show a department that
  // doesn't run its own bank account (most route through the central
  // account instead) — hidden from the nav for those users, and the page
  // itself redirects away too in case someone still has the link.
  const supabase = await createClient();
  const accessibleAccountIds = await getAccessibleBankAccountIds(supabase, user.id, isAdmin);
  const canSeeForecast = isAdmin || (accessibleAccountIds?.size ?? 0) > 0;

  return (
    <>
      <Nav user={user} canSeeForecast={canSeeForecast} />
      <main className="flex-1 mx-auto w-full max-w-7xl px-4 py-6">{children}</main>
      {isAdmin && <QuickActionsFab />}
    </>
  );
}
