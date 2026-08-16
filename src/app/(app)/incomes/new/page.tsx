import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PasteIncomeForm } from "@/components/paste-income-form";

export default async function NewIncomePage() {
  const supabase = await createClient();
  const [{ data: bankAccounts }, { data: categories }] = await Promise.all([
    supabase.from("bank_accounts").select("*, departments(name)").order("bank_name"),
    supabase.from("categories").select("*, departments(name)").eq("type", "INCOME").order("name"),
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
      />
    </div>
  );
}
