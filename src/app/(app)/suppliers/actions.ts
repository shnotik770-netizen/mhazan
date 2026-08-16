"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireFinanceAdmin } from "@/lib/auth";

function revalidateSupplierPaths() {
  revalidatePath("/suppliers");
  revalidatePath("/checks");
}

export async function createSupplier(formData: FormData): Promise<void> {
  const admin = await requireFinanceAdmin();
  const supabase = await createClient();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("יש להזין שם ספק");
  const { error } = await supabase.from("suppliers").insert({
    name,
    notes: String(formData.get("notes") ?? "") || null,
    created_by: admin.id,
  });
  if (error) throw new Error(error.message);
  revalidateSupplierPaths();
}

export async function deleteSupplier(formData: FormData): Promise<void> {
  await requireFinanceAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("suppliers").delete().eq("id", String(formData.get("id") ?? ""));
  if (error) throw new Error(error.message);
  revalidateSupplierPaths();
}

// Backfills the suppliers list from payees that already have checks/transfers
// issued to them but aren't in the suppliers table yet, so the admin doesn't
// have to retype names that already exist in check history.
export async function importSuppliersFromCheckHistory(): Promise<{ added: number }> {
  await requireFinanceAdmin();
  const supabase = await createClient();

  const [{ data: existing }, { data: payeeRows }] = await Promise.all([
    supabase.from("suppliers").select("name"),
    supabase.from("checks").select("payee"),
  ]);

  const existingNames = new Set((existing ?? []).map((s) => s.name.trim().toLowerCase()));
  const newNames = new Map<string, string>();
  for (const row of payeeRows ?? []) {
    const trimmed = row.payee?.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (!existingNames.has(key) && !newNames.has(key)) newNames.set(key, trimmed);
  }

  if (newNames.size === 0) return { added: 0 };

  const { error } = await supabase.from("suppliers").insert(
    Array.from(newNames.values()).map((name) => ({ name })),
  );
  if (error) throw new Error(error.message);

  revalidateSupplierPaths();
  return { added: newNames.size };
}
