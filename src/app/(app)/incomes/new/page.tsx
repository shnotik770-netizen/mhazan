import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireFinanceAdmin } from "@/lib/auth";
import { PasteIncomeForm } from "@/components/paste-income-form";

export default async function NewIncomePage() {
  await requireFinanceAdmin();
  const supabase = await createClient();
  const [{ data: bankAccounts }, { data: categories }, { data: departments }] = await Promise.all([
    supabase.from("bank_accounts").select("*, departments(name)").order("bank_name"),
    supabase.from("categories").select("*, departments(name)").eq("type", "INCOME").order("name"),
    supabase.from("departments").select("*").order("name"),
  ]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">קליטת הכנסות בהדבקה</h1>
        <Link href="/incomes" className="text-sm text-primary">
          ← חזרה לרשימת הכנסות
        </Link>
      </div>
      <PasteIncomeForm
        bankAccounts={bankAccounts ?? []}
        categories={categories ?? []}
        departments={departments ?? []}
      />
    </div>
  );
}
