import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "./database.types";

// Force a re-login after this long with no request reaching the server, on
// top of whatever lifetime the Supabase JWT/refresh token would otherwise
// give the session. A finance dashboard left open on an unattended or shared
// screen should not stay signed in indefinitely just because the tab is
// still open and nobody closed it.
const IDLE_TIMEOUT_MS = 30 * 60 * 1000;
const LAST_ACTIVITY_COOKIE = "mhz_last_activity";

// Per-request nonce-based CSP, following Next.js's own documented pattern
// (node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md).
// A static CSP in next.config.ts can't allow Next's own inline hydration
// script without 'unsafe-inline' (which defeats most of the point of a
// script-src restriction); a fresh nonce per request lets us allow exactly
// that one script, and nothing else, without widening the policy at all.
// 'strict-dynamic' means the policy doesn't even need a host allowlist
// (nothing third-party is loaded anywhere in this app).
// style-src deliberately allows 'unsafe-inline' instead of the nonce: Radix
// (every ⋮ row menu and popover) injects an un-nonced <style> tag for its
// scroll lock, which a nonce'd style-src blocked on every menu open. Inline
// styles can't execute code -- the XSS protection lives in script-src, which
// stays nonce-only.
function buildCsp(nonce: string, isDev: boolean) {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests",
  ].join("; ");
}

export async function updateSession(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = buildCsp(nonce, process.env.NODE_ENV === "development");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  let supabaseResponse = NextResponse.next({ request: { headers: requestHeaders } });
  supabaseResponse.headers.set("Content-Security-Policy", csp);

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request: { headers: requestHeaders } });
          supabaseResponse.headers.set("Content-Security-Policy", csp);
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isAuthRoute = request.nextUrl.pathname.startsWith("/login");
  // /api/health is hit by an unauthenticated uptime check -- it must not be
  // redirected to /login, but it also doesn't belong in isAuthRoute (a
  // logged-in user hitting it shouldn't be bounced to "/" the way visiting
  // /login while signed in is).
  const isPublicRoute = isAuthRoute || request.nextUrl.pathname === "/api/health";

  if (user && !isAuthRoute) {
    const lastActivity = Number(request.cookies.get(LAST_ACTIVITY_COOKIE)?.value ?? 0);
    const now = Date.now();

    if (lastActivity && now - lastActivity > IDLE_TIMEOUT_MS) {
      await supabase.auth.signOut();
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("reason", "idle");
      const redirectResponse = NextResponse.redirect(url);
      // Carry over the cookies signOut() just cleared on supabaseResponse --
      // a freshly constructed redirect response doesn't have them, and
      // without this the browser keeps its still-valid session cookies.
      supabaseResponse.cookies.getAll().forEach((cookie) => {
        redirectResponse.cookies.set(cookie);
      });
      return redirectResponse;
    }

    supabaseResponse.cookies.set(LAST_ACTIVITY_COOKIE, String(now), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: IDLE_TIMEOUT_MS / 1000,
    });
  }

  if (!user && !isPublicRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user && isAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
