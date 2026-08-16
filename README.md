# מערכת כספים מוסדית — Multi-Department Financial System

Next.js (App Router) + Supabase implementation of a multi-department institutional
ledger: internal inter-department settlement, checks/pending-allocation tracking,
and a recurring-schedule cash-flow forecast engine.

## Stack

- **Frontend:** Next.js 16 (App Router, Server Components + Server Actions), TypeScript, Tailwind CSS
- **Backend/DB:** Supabase (Postgres) — project `label-printer` (`rwlhmbghdtuofnimizmf`), shared with the existing `print_queue` table
- **Auth:** Supabase Auth (email/password), with `user_profiles.role` (`FINANCE_ADMIN` / `DEPT_MANAGER`) driving RLS

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). `.env.local` already points at the
Supabase project (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`).

The database starts empty of financial data — create your first department, bank
account, and categories from **הגדרות / Settings** (requires a `FINANCE_ADMIN` user;
promote a user via SQL/Table editor in Supabase the first time, since there is no
seeded admin).

## Data model

| Table | Purpose |
| --- | --- |
| `departments`, `categories`, `bank_accounts` | Reference data: who owns what |
| `incomes` | Pasted-in income rows. A trigger derives `owner_department_id` (from the category) and `issuing_department_id` (from the bank account), flags `requires_inter_settlement`, and auto-creates the matching `inter_department_ledger` debt row when they differ |
| `inter_department_ledger` | Inter-department debt entries (`OPEN` / `SETTLED`); `settle_ledger_between()` nets and clears a pair |
| `checks` | Check lifecycle (`UNPAID`/`CLEARED`/`CANCELLED`); `department_id IS NULL` = pending allocation |
| `bank_transactions` | Imported bank statement lines, classified into a department over time |
| `recurring_schedules` | Standing orders / recurring income & expense feeding the forecast engine |
| `get_cash_flow_forecast(bank_account_id, horizon_days)` | Projects balance forward from unpaid checks + recurring schedules |

All financial tables have RLS: `FINANCE_ADMIN` sees/edits everything, `DEPT_MANAGER`
sees only rows touching their own `department_id`.

## Project structure

```
src/app/(app)/        Authenticated screens (dashboard, incomes, checks, ledger, forecast, settings)
src/app/login/        Auth
src/components/       Client components (paste-income grid, checks actions, settle button)
src/lib/supabase/     Browser/server/middleware Supabase clients + generated DB types
src/lib/auth.ts        requireUser / requireFinanceAdmin helpers
```
