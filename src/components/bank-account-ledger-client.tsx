"use client";

import Link from "next/link";
import { formatCurrency, addMonthsToDate, todayIso } from "@/lib/format";
import { useSortFilter, SortFilterTh, type ColumnDef } from "@/components/sortable-table";
import { DepartmentTransactionsSection } from "@/components/department-transactions-section-client";
import type { BankAccountLedgerPair, BankAccountLedgerTransaction } from "@/lib/bank-account-ledger-data";

const KIND_LABEL: Record<BankAccountLedgerTransaction["kind"], string> = {
  income: "הכנסה",
  check: "צ׳ק / העברה",
  manual: "רישום ידני",
  commission: "עמלת אשראי",
};

function nameById(pair: BankAccountLedgerPair, id: string): string {
  return id === pair.accountAId ? pair.accountAName : pair.accountBName;
}

// Summary list — one row per pair of bank accounts with an open balance
// between them. Each row is a plain link into that pair's own report page
// (BankAccountPairReport below), the same way LedgerNetPositionTable links
// into a department's own report, instead of expanding inline in place.
export function BankAccountLedgerTable({ pairs }: { pairs: BankAccountLedgerPair[] }) {
  const columns: ColumnDef<BankAccountLedgerPair>[] = [
    {
      key: "debtor",
      label: "חייב",
      sortValue: (p) => nameById(p, p.debtorAccountId),
      filterValue: (p) => nameById(p, p.debtorAccountId),
    },
    {
      key: "creditor",
      label: "זכאי",
      sortValue: (p) => nameById(p, p.creditorAccountId),
      filterValue: (p) => nameById(p, p.creditorAccountId),
    },
    { key: "amount", label: "סכום נטו", sortValue: (p) => p.netAmount },
    { key: "count", label: "מס׳ תנועות", sortValue: (p) => p.transactions.length },
  ];
  const { rows: filtered, sort, toggleSort, filters, setColumnFilter } = useSortFilter(pairs, columns, {
    key: "amount",
    dir: "desc",
  });

  if (pairs.length === 0) {
    return <p className="text-sm text-muted py-4 text-center">אין חוב פתוח בין חשבונות בנק שונים כרגע.</p>;
  }

  return (
    <table className="data-table">
      <thead>
        <tr>
          {columns.map((col) => (
            <SortFilterTh
              key={col.key}
              col={col}
              allRows={pairs}
              sort={sort}
              toggleSort={toggleSort}
              activeFilter={filters[col.key]}
              setColumnFilter={setColumnFilter}
            />
          ))}
          <th></th>
        </tr>
      </thead>
      <tbody>
        {filtered.map((pair) => (
          <tr key={pair.pairId}>
            <td className="font-semibold text-danger">{nameById(pair, pair.debtorAccountId)}</td>
            <td className="font-semibold text-success">{nameById(pair, pair.creditorAccountId)}</td>
            <td className="font-semibold">{formatCurrency(pair.netAmount)}</td>
            <td>{pair.transactions.length}</td>
            <td>
              <Link href={`/ledger?accounts=${pair.pairId}`} className="text-sm text-primary underline">
                פתח דוח מלא ⇦
              </Link>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

type SectionRow = {
  id: string;
  date: string | null;
  typeDetail: string;
  typeCategory: string;
  description: string;
  status?: string | null;
  amount: number;
  isOld: boolean;
  kind: "check" | "income" | "manual" | "commission" | "forecast";
};

// A full internal report for one pair of bank accounts — deliberately
// reuses DepartmentTransactionsSection (the exact same "תנועות עד היום" /
// "תנועות עתידיות ידועות" split, with the exact same search / income-
// expense-toggle / month / date-range filters a department report has)
// instead of a bespoke table, since a bank-account debt deserves the same
// "how did we get to this number, and what's still coming" treatment a
// department gets. Amounts are all signed relative to accountA — positive
// increases what A owes B, negative reduces it — the same convention
// getBankAccountLedgerData used to net the pair's totals in the first
// place, so the "הכנסות/הוצאות" toggle reads consistently even though this
// isn't literally one side's own income/expense ledger.
export function BankAccountPairReport({ pair, isAdmin }: { pair: BankAccountLedgerPair; isAdmin: boolean }) {
  const debtorName = nameById(pair, pair.debtorAccountId);
  const creditorName = nameById(pair, pair.creditorAccountId);

  const allRows: SectionRow[] = pair.transactions.map((tx) => ({
    id: tx.id,
    date: tx.date,
    typeDetail: KIND_LABEL[tx.kind],
    typeCategory: KIND_LABEL[tx.kind],
    description: `${tx.description} (${nameById(pair, tx.fromAccountId)} ← ${nameById(pair, tx.toAccountId)})`,
    status: tx.status,
    amount: tx.fromAccountId === pair.accountAId ? tx.amount : -tx.amount,
    isOld: false,
    kind: tx.kind,
  }));

  const today = todayIso();
  const pastRows = allRows.filter((r) => !r.date || r.date <= today);
  const futureRows = [...allRows.filter((r) => r.date && r.date > today)].sort((a, b) =>
    (a.date ?? "").localeCompare(b.date ?? ""),
  );
  const pastMonths = [...new Set(pastRows.filter((r) => r.date).map((r) => r.date!.slice(0, 7)))].sort();
  const futureMonths = [...new Set(futureRows.filter((r) => r.date).map((r) => r.date!.slice(0, 7)))].sort();

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold mb-1">
          {pair.accountAName} ⇄ {pair.accountBName}
        </h2>
        <p className="text-sm text-muted">כל התנועות שמרכיבות את החוב בין שני חשבונות הבנק האלה, כולל עמלת האשראי במקומות הרלוונטיים.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card p-4">
          <p className="text-sm text-muted mb-1">חייב</p>
          <p className="text-xl font-bold text-danger">{debtorName}</p>
        </div>
        <div className="card p-4">
          <p className="text-sm text-muted mb-1">זכאי</p>
          <p className="text-xl font-bold text-success">{creditorName}</p>
        </div>
        <div className="card p-4">
          <p className="text-sm text-muted mb-1">סכום נטו</p>
          <p className="text-2xl font-bold">{formatCurrency(pair.netAmount)}</p>
        </div>
      </div>

      <DepartmentTransactionsSection
        title="תנועות עד היום"
        rows={pastRows}
        isAdmin={isAdmin}
        monthOptions={pastMonths}
        defaultSortDir="desc"
        defaultFromDate={addMonthsToDate(today, -3)}
      />

      <DepartmentTransactionsSection
        title="תנועות עתידיות ידועות"
        rows={futureRows}
        isAdmin={isAdmin}
        monthOptions={futureMonths}
        defaultSortDir="asc"
        defaultToDate={addMonthsToDate(today, 4)}
      />
    </div>
  );
}
