"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";

// Railway's edge sets x-forwarded-for with the real client IP first in the
// list (any value a client tried to supply itself is overwritten, not
// appended to, by the proxy) -- used only to populate user_login_ips below,
// a temporary data-collection table for deciding on an admin IP-allowlist.
function getClientIp(h: Headers): string | null {
  const forwarded = h.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  return first || h.get("x-real-ip");
}

export async function login(formData: FormData) {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    redirect(`/login?error=${encodeURIComponent(error.message)}`);
  }

  if (data.user) {
    try {
      const h = await headers();
      await supabase.from("user_login_ips").insert({
        user_id: data.user.id,
        ip_address: getClientIp(h),
        user_agent: h.get("user-agent"),
      });
    } catch {
      // Best-effort only -- a login must never fail because this logging
      // insert did.
    }
  }

  redirect("/");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
