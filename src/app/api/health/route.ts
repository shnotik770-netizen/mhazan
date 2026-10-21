import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Unauthenticated liveness/readiness check for external uptime monitoring.
// Intentionally does not touch any application table (those now require an
// authenticated session, by design) -- it calls Supabase Auth instead, which
// needs no table grant, to also catch "the app is up but Supabase isn't
// reachable" as a distinct failure from "the app itself is down".
export async function GET() {
  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.getSession();
    if (error) {
      return NextResponse.json({ status: "degraded", component: "auth" }, { status: 503 });
    }
    return NextResponse.json({ status: "ok" });
  } catch {
    return NextResponse.json({ status: "error" }, { status: 503 });
  }
}
