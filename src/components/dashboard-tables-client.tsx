"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateBankBalance } from "@/app/(app)/forecast/actions";
import { useSortFilter, SortFilterTh, type ColumnDef } from "@/components/sortable-table";
import { formatCurrency, daysAgoLabel } from "@/lib/format";

export type BankAccountRow = {
  id: string;
  departmentName: string | null;
  bank_name: string;
  account_number: string;
  current_balance: number;
  balance_as_of: string | null;
  // The bank's own last-reported balance is often stale by days or weeks
  // (balance_as_of) — these two fill the gap: what the balance should
  // actually be right now once every already-due check/transfer is
  // accounted for, and where it's headed by the end of the month, both
  // computed the same way the /forecast page does. Optional: only the
  // dashboard's overview actually wants them (showForecast) — the settings
  // page's plain bank-account list doesn't compute or need them.
  todayBalance?: number;
  endOfMonthBalance?: number;
};

// Lets an admin correct a bank account's own balance right here on the
// dashboard card — the same updateBankBalance action /forecast's
// BankBalancePanel already uses, just inline and compact instead of its own
// section, so fixing a stale balance doesn't require leaving the dashboard
// at all. A refresh after saving recomputes both "צפי יתרה היום" and "צפי
// לסוף החודש" from the new figure too, since those are derived from it.
function BankBalanceQuickEditor({ bankAccountId, currentBalance }: { bankAccountId: string; currentBalance: number }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(currentBalance));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await updateBankBalance(bankAccountId, Number(value) || 0);
      if (result.error) setError(result.error);
      else {
        setEditing(false);
        router.refresh();
      }
    });
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => {
          setValue(String(currentBalance));
          setError(null);
          setEditing(true);
        }}
        className="text-xs text-primary underline"
      >
        עדכון יתרה
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <input
        type="number"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        autoFocus
        className="w-24 rounded border border-border bg-transparent px-1.5 py-0.5 text-xs"
      />
      <button
        type="button"
        disabled={isPending}
        onClick={save}
        className="rounded bg-primary text-primary-foreground text-xs px-2 py-0.5 disabled:opacity-50"
      >
        שמור
      </button>
      <button type="button" onClick={() => setEditing(false)} className="text-xs text-muted">
        ביטול
      </button>
      {error && <span className="text-xs text-danger">{error}</span>}
    </div>
  );
}

// One card per bank account instead of a table row — with a department,
// bank, account number and three separate balance figures per account,
// a handful of accounts squeezed into a table got cramped (the header
// labels alone forced a horizontal scrollbar on anything narrower than
// the full page). A card per account has room to lay its fields out
// however fits, wrapping naturally instead of scrolling.
export function BankAccountCards({ accounts, isAdmin = false }: { accounts: BankAccountRow[]; isAdmin?: boolean }) {
  if (accounts.length === 0) {
    return (
      <p className="text-sm text-muted text-center py-6">
        אין חשבונות בנק מוגדרים.{" "}
        <Link href="/settings" className="text-primary">
          הגדרת חשבון ראשון
        </Link>
      </p>
    );
  }
  return (
    <div className="space-y-3">
      {accounts.map((b) => (
        <div key={b.id} className="rounded-lg border border-border p-3">
          <div className="flex items-center justify-between flex-wrap gap-x-3 gap-y-1 mb-2">
            <span className="font-semibold">{b.departmentName}</span>
            <span className="text-sm text-muted">
              {b.bank_name} · {b.account_number}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <p className="text-xs text-muted mb-0.5">יתרה בבנק</p>
              <p className={`font-semibold ${b.current_balance < 0 ? "text-danger" : ""}`}>{formatCurrency(b.current_balance)}</p>
              <p className="text-xs text-muted mb-1">{daysAgoLabel(b.balance_as_of)}</p>
              {isAdmin && <BankBalanceQuickEditor bankAccountId={b.id} currentBalance={b.current_balance} />}
            </div>
            <div>
              <p className="text-xs text-muted mb-0.5">צפי יתרה היום</p>
              <p className={`font-semibold ${(b.todayBalance ?? b.current_balance) < 0 ? "text-danger" : ""}`}>
                {formatCurrency(b.todayBalance ?? b.current_balance)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted mb-0.5">צפי לסוף החודש</p>
              <p className={`font-semibold ${(b.endOfMonthBalance ?? b.current_balance) < 0 ? "text-danger" : ""}`}>
                {formatCurrency(b.endOfMonthBalance ?? b.current_balance)}
              </p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function BankAccountsTable({ accounts, showForecast = false }: { accounts: BankAccountRow[]; showForecast?: boolean }) {
  const columns: ColumnDef<BankAccountRow>[] = [
    { key: "department", label: "מחלקה", sortValue: (b) => b.departmentName ?? "", filterValue: (b) => b.departmentName ?? "—" },
    { key: "bank", label: "בנק", sortValue: (b) => b.bank_name, filterValue: (b) => b.bank_name },
    { key: "account", label: "מספר חשבון", sortValue: (b) => b.account_number },
    { key: "balance", label: showForecast ? "יתרה בבנק" : "יתרה", sortValue: (b) => b.current_balance },
    ...(showForecast
      ? [
          { key: "today", label: "צפי יתרה היום", sortValue: (b: BankAccountRow) => b.todayBalance ?? b.current_balance },
          { key: "eom", label: "צפי לסוף החודש", sortValue: (b: BankAccountRow) => b.endOfMonthBalance ?? b.current_balance },
        ]
      : []),
  ];
  const { rows: sorted, sort, toggleSort, filters, setColumnFilter } = useSortFilter(accounts, columns);

  return (
    <table className="data-table">
      <thead>
        <tr>
          {columns.map((col) => (
            <SortFilterTh
              key={col.key}
              col={col}
              allRows={accounts}
              sort={sort}
              toggleSort={toggleSort}
              activeFilter={filters[col.key]}
              setColumnFilter={setColumnFilter}
            />
          ))}
        </tr>
      </thead>
      <tbody>
        {sorted.map((b) => (
          <tr key={b.id}>
            <td>{b.departmentName}</td>
            <td>{b.bank_name}</td>
            <td>{b.account_number}</td>
            <td className={b.current_balance < 0 ? "text-danger" : ""}>
              {formatCurrency(b.current_balance)}
              <div className="text-xs text-muted font-normal">{daysAgoLabel(b.balance_as_of)}</div>
            </td>
            {showForecast && (
              <>
                <td className={(b.todayBalance ?? b.current_balance) < 0 ? "text-danger" : ""}>
                  {formatCurrency(b.todayBalance ?? b.current_balance)}
                </td>
                <td className={(b.endOfMonthBalance ?? b.current_balance) < 0 ? "text-danger" : ""}>
                  {formatCurrency(b.endOfMonthBalance ?? b.current_balance)}
                </td>
              </>
            )}
          </tr>
        ))}
        {sorted.length === 0 && (
          <tr>
            <td colSpan={showForecast ? 6 : 4} className="text-center text-muted py-6">
              {accounts.length === 0 ? (
                <>
                  אין חשבונות בנק מוגדרים.{" "}
                  <Link href="/settings" className="text-primary">
                    הגדרת חשבון ראשון
                  </Link>
                </>
              ) : (
                "אין תוצאות"
              )}
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

export type DepartmentBalanceRow = {
  departmentId: string;
  departmentName: string;
  netNow: number;
  netEndOfMonth: number;
};

function balanceLabel(amount: number): string {
  return amount >= 0 ? "זכאית" : "חייבת";
}

// One row per department instead of one per debtor/creditor pair — a pair
// only means something for real cross-account debt (see "חוב בין חשבונות
// בנק"); for everything else, what actually matters to an admin is "where
// does this department stand right now" plus where that's headed by month
// end, not which specific other department's account the money happens to
// sit in at the moment.
export function DepartmentBalanceTable({
  rows,
  emptyMessage,
  departmentHrefBase,
}: {
  rows: DepartmentBalanceRow[];
  emptyMessage: string;
  // Only the full department-reports page (/ledger) wants a department's
  // name to jump straight into its own report — the dashboard just links
  // out to that page in general via its own "לדוח המלא" link instead. A
  // plain string prefix (not a function) — this is a Server Component prop,
  // and a function can't cross that boundary into a "use client" component.
  departmentHrefBase?: string;
}) {
  const columns: ColumnDef<DepartmentBalanceRow>[] = [
    { key: "department", label: "מחלקה", sortValue: (r) => r.departmentName, filterValue: (r) => r.departmentName },
    { key: "now", label: "מצב עכשיו", sortValue: (r) => r.netNow },
  ];
  const { rows: sorted, sort, toggleSort, filters, setColumnFilter } = useSortFilter(rows, columns, {
    key: "department",
    dir: "asc",
  });

  return (
    <table className="data-table">
      <thead>
        <tr>
          {columns.map((col) => (
            <SortFilterTh
              key={col.key}
              col={col}
              allRows={rows}
              sort={sort}
              toggleSort={toggleSort}
              activeFilter={filters[col.key]}
              setColumnFilter={setColumnFilter}
            />
          ))}
        </tr>
      </thead>
      <tbody>
        {sorted.map((r) => (
          <tr key={r.departmentId}>
            <td>
              {departmentHrefBase ? (
                <Link href={`${departmentHrefBase}${r.departmentId}`} className="underline decoration-dotted hover:decoration-solid">
                  {r.departmentName}
                </Link>
              ) : (
                r.departmentName
              )}
            </td>
            <td>
              <span className={`font-semibold ${r.netNow >= 0 ? "text-success" : "text-danger"}`}>
                {balanceLabel(r.netNow)} {formatCurrency(Math.abs(r.netNow))}
              </span>
              <div className="text-xs text-muted font-normal">
                (צפי לסוף החודש: {balanceLabel(r.netEndOfMonth)} {formatCurrency(Math.abs(r.netEndOfMonth))})
              </div>
            </td>
          </tr>
        ))}
        {sorted.length === 0 && (
          <tr>
            <td colSpan={2} className="text-center text-muted py-6">
              {emptyMessage}
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}
