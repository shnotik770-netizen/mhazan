"use client";

import Link from "next/link";
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

export type LedgerBalanceRow = {
  key: string;
  debtorName: string;
  creditorName: string;
  amount: number;
};

export function LedgerBalancesTable({ rows }: { rows: LedgerBalanceRow[] }) {
  const columns: ColumnDef<LedgerBalanceRow>[] = [
    { key: "debtor", label: "חייב", sortValue: (r) => r.debtorName, filterValue: (r) => r.debtorName },
    { key: "creditor", label: "זכאי", sortValue: (r) => r.creditorName, filterValue: (r) => r.creditorName },
    { key: "amount", label: "סכום", sortValue: (r) => r.amount },
  ];
  const { rows: sorted, sort, toggleSort, filters, setColumnFilter } = useSortFilter(rows, columns);

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
          <tr key={r.key}>
            <td>{r.debtorName}</td>
            <td>{r.creditorName}</td>
            <td>{formatCurrency(r.amount)}</td>
          </tr>
        ))}
        {sorted.length === 0 && (
          <tr>
            <td colSpan={3} className="text-center text-muted py-6">
              {rows.length === 0 ? "אין חובות פנימיים פתוחים" : "אין תוצאות"}
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}
