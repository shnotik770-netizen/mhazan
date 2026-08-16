"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function settleBalances(deptA: string, deptB: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("settle_ledger_between", {
    p_dept_a: deptA,
    p_dept_b: deptB,
  });

  revalidatePath("/ledger");
  revalidatePath("/");
  return { error: error?.message, settledCount: data ?? 0 };
}
