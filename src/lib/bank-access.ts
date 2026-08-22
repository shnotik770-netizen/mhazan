import type { createClient } from "@/lib/supabase/server";

// A finance admin sees every bank account, so `null` means "no filter". A
// department manager only ever sees the accounts owned by a department
// they're granted — usually zero or one, since most departments route
// their money through the central account instead of running their own.
export async function getAccessibleBankAccountIds(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  isAdmin: boolean,
): Promise<Set<string> | null> {
  if (isAdmin) return null;
  const { data: grants } = await supabase.from("user_department_access").select("department_id").eq("user_id", userId);
  const deptIds = (grants ?? []).map((g) => g.department_id);
  if (deptIds.length === 0) return new Set();
  const { data: accounts } = await supabase.from("bank_accounts").select("id").in("department_id", deptIds);
  return new Set((accounts ?? []).map((a) => a.id));
}
