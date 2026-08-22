@AGENTS.md

# Communication

Always summarize work for the user in Hebrew, every time — not just when explicitly asked.

# Security checklist — apply to every change

This is a live financial system. Before considering any change to a server action, API route, DB migration, or auth/permission logic finished, check it against these 20 points (use the `security-audit-20` skill for a full audit; apply this list as a lighter-weight gate on every smaller change):

1. No `.env`/secrets ever get committed to git history.
2. No API key or secret is exposed to the client bundle — only `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY` may be. `service_role` never appears in Next.js code — only inside a Supabase Edge Function, and only after that function independently re-verifies the caller's role.
3. RLS stays enabled with real policies on every table holding financial/user data. Any `SECURITY DEFINER` function must not embed a hardcoded secret in its source, and should not be callable by `anon` unless there's a specific, reviewed reason.
4. Every permission check enforced in the UI (hiding a button) must also be enforced server-side — never rely on the client alone.
5. Consider rate limiting for anything that costs money, sends email, or creates accounts.
6. No SQL is ever built via string concatenation — use the query builder or parameterized values everywhere, including inside DB functions.
7. Validate input server-side (or lean on a DB constraint) — never trust that the client already validated it.
8. Never use `dangerouslySetInnerHTML` on anything derived from user input.
9. Never hand-roll password hashing — this project delegates entirely to Supabase Auth.
10. Session tokens stay in httpOnly cookies via `@supabase/ssr` — never move auth state into `localStorage`.
11. Every new server action must call `requireUser()`/`requireFinanceAdmin()` explicitly, even when RLS would also block an unauthorized call — defense in depth, and it avoids a misleading "success" response when RLS silently filters zero rows.
12. Don't add permissive CORS (`Access-Control-Allow-Origin: *`) to a new Edge Function unless there's a real reason another origin needs to call it.
13. New user accounts are created only by a finance admin (no public self-signup) — keep it that way, or add email verification if that ever changes.
14. Any query scoped by an ID from the client must also be scoped by ownership/department — verify this is actually enforced by RLS, don't just assume it.
15. Never log a full request body, and never log passwords/tokens/payment details, even in a debug console.log.
16. Any new webhook endpoint must verify the sender's signature before trusting the payload.
17. Never return a raw DB/Postgres error message to the client — wrap it with `safeErrorMessage()` (`src/lib/safe-error.ts`). Uncaught thrown errors are already masked by Next.js in production; only explicit `return { error: ... }` responses need this.
18. Run `npm audit --production` periodically and after adding a dependency.
19. Enforce a real minimum password length/complexity for any new account-creation path, and check that Supabase's leaked-password protection is enabled.
20. Any file upload feature must restrict file type, size, and use a generated (not user-supplied) filename.
