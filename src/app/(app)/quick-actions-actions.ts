"use server";

import { createClient } from "@/lib/supabase/server";
import { requireFinanceAdmin } from "@/lib/auth";

// Reference data the floating quick-actions button needs (bank accounts,
// departments, categories) — fetched lazily the first time an admin opens
// the button rather than on every page load in the shared layout, since
// most navigations never touch it.
export async function getQuickActionRefData() {
  await requireFinanceAdmin();
  const supabase = await createClient();
  const [{ data: bankAccounts }, { data: departments }, { data: categories }] = await Promise.all([
    supabase.from("bank_accounts").select("*, departments!bank_accounts_department_id_fkey(name)").order("bank_name"),
    supabase.from("departments").select("*").order("name"),
    supabase.from("categories").select("*").order("name"),
  ]);
  return {
    bankAccounts: bankAccounts ?? [],
    departments: departments ?? [],
    categories: categories ?? [],
  };
}
