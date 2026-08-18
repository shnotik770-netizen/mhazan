import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/supabase/database.types";

export type CurrentUser = {
  id: string;
  email: string | null;
  profile: Tables<"user_profiles">;
};

// Every page also calls requireUser() on top of the shared layout already
// doing it, and several call it more than once (page + its server
// actions) — each call is a network round-trip to Supabase Auth plus a
// profile lookup. React's cache() memoizes this per request, so no matter
// how many times it's called while rendering one request, the actual
// auth.getUser() + profile query only ever runs once.
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (!profile) return null;

  return { id: user.id, email: user.email ?? null, profile };
});

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireFinanceAdmin(): Promise<CurrentUser> {
  const user = await requireUser();
  if (user.profile.role !== "FINANCE_ADMIN") redirect("/");
  return user;
}
