import { requireUser } from "@/lib/auth";
import { Nav } from "@/components/nav";
import { QuickActionsFab } from "@/components/quick-actions-fab";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const isAdmin = user.profile.role === "FINANCE_ADMIN";

  return (
    <>
      <Nav user={user} />
      <main className="flex-1 mx-auto w-full max-w-7xl px-4 py-6">{children}</main>
      {isAdmin && <QuickActionsFab />}
    </>
  );
}
