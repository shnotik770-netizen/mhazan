"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireFinanceAdmin } from "@/lib/auth";
import type { Tables } from "@/lib/supabase/database.types";

function revalidateCategoryPaths() {
  revalidatePath("/categories");
  revalidatePath("/incomes/new");
  revalidatePath("/checks");
  revalidatePath("/settings");
  revalidatePath("/");
}

// Called from the paste-income flow: any category name typed in the pasted
// data that doesn't already exist becomes a new pending category (no
// department yet) instead of silently failing to match. Categories are
// shared between income and expense — there's no type split.
export async function findOrCreateCategoryByName(name: string): Promise<Tables<"categories">> {
  await requireFinanceAdmin();
  const supabase = await createClient();
  const trimmed = name.trim();
  if (!trimmed) throw new Error("שם קטגוריה ריק");

  const { data: existing } = await supabase
    .from("categories")
    .select("*")
    .ilike("name", trimmed)
    .maybeSingle();
  if (existing) return existing;

  const { data: created, error } = await supabase
    .from("categories")
    .insert({ name: trimmed, department_id: null })
    .select("*")
    .single();
  if (error) throw new Error(error.message);

  revalidateCategoryPaths();
  return created;
}

export async function createCategory(formData: FormData): Promise<void> {
  await requireFinanceAdmin();
  const supabase = await createClient();
  const isSplit = formData.get("is_split") === "on";
  const { error } = await supabase.from("categories").insert({
    name: String(formData.get("name") ?? ""),
    department_id: isSplit ? null : String(formData.get("department_id") ?? "") || null,
    is_split: isSplit,
  });
  if (error) throw new Error(error.message);
  revalidateCategoryPaths();
}

export async function updateCategory(formData: FormData): Promise<void> {
  await requireFinanceAdmin();
  const supabase = await createClient();
  const isSplit = formData.get("is_split") === "on";
  const { error } = await supabase
    .from("categories")
    .update({
      name: String(formData.get("name") ?? ""),
      department_id: isSplit ? null : String(formData.get("department_id") ?? "") || null,
      is_split: isSplit,
    })
    .eq("id", String(formData.get("id") ?? ""));
  if (error) throw new Error(error.message);
  revalidateCategoryPaths();
}

export async function deleteCategory(formData: FormData): Promise<void> {
  await requireFinanceAdmin();
  const supabase = await createClient();
  const { error } = await supabase
    .from("categories")
    .delete()
    .eq("id", String(formData.get("id") ?? ""));
  if (error) {
    throw new Error("לא ניתן למחוק קטגוריה שיש לה הכנסות, צ׳קים או הוראות קבע משויכים: " + error.message);
  }
  revalidateCategoryPaths();
}
