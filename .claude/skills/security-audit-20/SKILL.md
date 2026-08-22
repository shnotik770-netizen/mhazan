---
name: security-audit-20
description: Run a deep security review of this codebase against a fixed 20-point checklist (secrets, RLS, auth guards, input validation, XSS, rate limiting, CORS, error leakage, dependencies, password policy, file uploads, etc). Use whenever the user asks for a "deep"/"thorough" security audit, a security review of the whole app, or explicitly invokes this skill. Produces a full Hebrew report with status/severity per point, a summary table, a priority-ordered fix list, and fixed code for the most critical findings.
---

# Deep security audit — 20-point checklist

You are acting as a security auditor for this Next.js + Supabase financial application. Go through **every point below, one at a time**, and verify it directly against the code and the live database — never mark something "תקין" (fine) without having actually checked it. If you don't have enough information to decide, say so explicitly rather than guessing.

## The 20 points

1. קובץ סביבה או מפתחות בהיסטוריית הגיט (env files / secrets in git history)
2. מפתחות API שנחשפים לצד הלקוח (API keys exposed to the client)
3. הרשאות ברמת השורה כבויות בדאטהבייס (RLS disabled, or bypassed via weak `SECURITY DEFINER` gating)
4. בדיקות הרשאה שמתבצעות בצד הלקוח בלבד (client-only permission checks)
5. היעדר הגבלת קצב, במיוחד על נתיבים שעולים כסף (missing rate limiting)
6. שאילתות שנבנות בשרשור מחרוזות (string-concatenated SQL)
7. היעדר ולידציה של קלט בצד השרת (missing server-side input validation)
8. הזרקת HTML של משתמשים (`dangerouslySetInnerHTML` / unescaped user HTML)
9. סיסמאות שנשמרות בלי hash חזק (weak password hashing)
10. טוקנים שנשמרים בדפדפן במקום בעוגייה מאובטחת (tokens in localStorage instead of a secure cookie)
11. נתיבי אדמין בלי middleware שמאמת הרשאה (admin routes/actions without an auth guard)
12. הגדרות CORS מתירניות מדי (overly permissive CORS)
13. הרשמה בלי אימות כתובת מייל (signup without email verification)
14. גישה למשאבים לפי מזהה בלי בדיקת בעלות (IDOR — access by ID without an ownership check)
15. לוגים ששומרים את גוף הבקשה המלא (logs storing full request bodies / secrets)
16. Webhooks בלי אימות חתימה (webhooks without signature verification)
17. פירוט שגיאות שחוזר למשתמש בפרודקשן (raw error/stack trace details returned to the client)
18. חבילות עם פרצות ידועות (`npm audit`)
19. היעדר דרישות חוזק לסיסמה (no password strength requirements / leaked-password protection)
20. העלאת קבצים בלי הגבלת סוג, גודל ושם (unrestricted file uploads)

## Methodology per point (what "actually checked" means here)

- **1**: `git log --all --full-history -- '*.env*'`, check `.gitignore`, `git grep` for key-shaped strings (`service_role`, `sk-`, `AKIA`, `BEGIN PRIVATE KEY`).
- **2**: `grep -rn "NEXT_PUBLIC_\|process\.env\." src/`, confirm no `service_role`/secret key anywhere in app code; check any Edge Function that does use it re-verifies the caller's role server-side first.
- **3**: Use the Supabase MCP tools — `list_tables` for `rls_enabled`, then query `pg_policies` for actual policy conditions on every financial table (don't just check the enabled flag). Separately pull every `SECURITY DEFINER` function's source (`pg_get_functiondef` via `pg_proc`) and check for hardcoded secrets or missing role checks, especially ones grantable to `anon`.
- **4**: Confirm every sensitive Server Action calls `requireUser()`/`requireFinanceAdmin()` — grep each `actions.ts` for exported functions vs. calls to those guards (an `awk` script mapping function → guard-call works well). Anything relying only on RLS is a defense-in-depth gap, not necessarily exploitable — verify against the actual RLS policy before calling it a real vulnerability.
- **5**: Check for `/api` routes, any rate-limiting middleware/dependency (upstash, redis), and note that Supabase Auth has its own platform-level limits that aren't verifiable from the repo — say so explicitly rather than guessing at numbers.
- **6**: `grep` for template-literal SQL fragments containing `select|insert|update|delete|from|where`; check DB function bodies for `execute format(...)` with concatenated identifiers.
- **7**: Spot-check a few server actions that accept a monetary amount or other financial field — does the action validate it, or does a DB `CHECK` constraint provide the actual backstop? Note which layer is doing the enforcement.
- **8**: `grep -rn "dangerouslySetInnerHTML"`.
- **9**: Confirm auth is fully delegated to Supabase Auth (no custom hashing code).
- **10**: Check `src/lib/supabase/client.ts`/`server.ts` use `createBrowserClient`/`createServerClient` from `@supabase/ssr` (cookie-based), and grep `localStorage` usage sitewide to confirm none of it is auth-related.
- **11**: Find the actual routing-guard file for this Next.js version — it may not be named `middleware.ts` (check `node_modules/next/dist/docs` for the current convention, e.g. `proxy.ts`, since this project's Next.js version differs from training data per `AGENTS.md`). Confirm its matcher covers all routes and confirm the root layout also calls `requireUser()`. Cross-reference with point 4's guard-coverage check.
- **12**: Check every Edge Function's CORS headers for `Access-Control-Allow-Origin: *`; check `next.config.ts` for any custom headers.
- **13**: Confirm there's no public self-signup route; check how admin-created accounts set `email_confirm`.
- **14**: Cross-reference against the RLS policies already pulled for point 3 — for each table, confirm SELECT/UPDATE/DELETE policies scope by `user_has_department()`/ownership, not just `true`.
- **15**: `grep -rn "console\.\(log\|error\|warn\)"` — check whether any of them log a full request/response body or object that could contain secrets.
- **16**: Check for any `/api` webhook route or Edge Function consuming third-party webhooks; verify signature checking.
- **17**: Grep every `actions.ts` for `return { error: ... }` patterns that forward `error.message`/`error?.message`/a raw DB error directly — these bypass Next.js's own production error-masking (which only covers *thrown*, uncaught errors). Check `src/lib/safe-error.ts` exists and is actually used at each site.
- **18**: `npm audit --production`.
- **19**: Check the password-length/complexity check in whatever creates accounts (usually an Edge Function), and check Supabase project auth advisors for "Leaked Password Protection".
- **20**: `grep -rn "upload\|multipart\|\.storage\."`.

## Output format

For each point: **status** (תקין / בעייתי / לא רלוונטי), and if בעייתי — file+line, the concrete risk, and the fix. Assign severity (קריטי / גבוה / בינוני) to every בעייתי finding.

Then:
- A markdown summary table of all 20 points (status + severity).
- A priority-ordered fix list, most dangerous first.
- Fixed code for the top 3 most critical findings.

Write the full report in Hebrew (per this project's standing instruction to always summarize in Hebrew), using ✔/✗-free prose status labels (תקין/בעייתי/לא רלוונטי) as shown above.

## Before touching anything

This is a live production financial system. A finding that's fixable with a small, low-risk, additive code change (e.g. adding a missing auth guard, wrapping an error message) can be applied directly once verified. A finding that requires a destructive or hard-to-reverse action (dropping a DB object, revoking access that might be used by an external system, rewriting a widely-used error path across many files) must be confirmed with the user first — explain the tradeoff, don't just proceed. Never guess at whether an orphaned/unfamiliar DB object (a table or function not referenced anywhere in this repo) is safe to remove — ask.
