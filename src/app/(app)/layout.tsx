import { requireUser } from "@/lib/auth";
import { Nav } from "@/components/nav";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  return (
    <>
      <Nav user={user} />
      <main className="flex-1 mx-auto w-full max-w-7xl px-4 py-6">{children}</main>
    </>
  );
}
