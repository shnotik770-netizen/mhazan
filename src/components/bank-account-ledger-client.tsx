"use client";

import Link from "next/link";
import { formatCurrency, formatDate } from "@/lib/format";
import { useSortFilter, SortFilterTh, type ColumnDef } from "@/components/sortable-table";
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

// A full internal report for one pair of bank accounts — mirrors the shape
// of a department's own report (summary cards + a sortable/filterable
// transaction table) instead of just an inline expand arrow, since "how did
// we get to this number" deserves the same treatment here as it does for a
// department.
export function BankAccountPairReport({ pair }: { pair: BankAccountLedgerPair }) {
  const debtorName = nameById(pair, pair.debtorAccountId);
  const creditorName = nameById(pair, pair.creditorAccountId);

  const columns: ColumnDef<BankAccountLedgerTransaction>[] = [
    { key: "date", label: "תאריך", sortValue: (t) => t.date ?? "" },
    { key: "kind", label: "סוג", sortValue: (t) => KIND_LABEL[t.kind], filterValue: (t) => KIND_LABEL[t.kind] },
    { key: "description", label: "תיאור", sortValue: (t) => t.description, filterValue: (t) => t.description },
    {
      key: "direction",
      label: "כיוון",
      sortValue: (t) => nameById(pair, t.fromAccountId),
      filterValue: (t) => `${nameById(pair, t.fromAccountId)} ← ${nameById(pair, t.toAccountId)}`,
    },
    { key: "amount", label: "סכום", sortValue: (t) => t.amount },
  ];
  const { rows: filtered, sort, toggleSort, filters, setColumnFilter } = useSortFilter(pair.transactions, columns, {
    key: "date",
    dir: "desc",
  });

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

      <div className="card p-4 overflow-x-auto">
        <h3 className="font-semibold mb-3">כל התנועות ({pair.transactions.length})</h3>
        <table className="data-table">
          <thead>
            <tr>
              {columns.map((col) => (
                <SortFilterTh
                  key={col.key}
                  col={col}
                  allRows={pair.transactions}
                  sort={sort}
                  toggleSort={toggleSort}
                  activeFilter={filters[col.key]}
                  setColumnFilter={setColumnFilter}
                />
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((tx) => (
              <tr key={tx.id}>
                <td>{tx.date ? formatDate(tx.date) : "—"}</td>
                <td>{KIND_LABEL[tx.kind]}</td>
                <td>{tx.description}</td>
                <td className="text-xs text-muted">
                  {nameById(pair, tx.fromAccountId)} ← {nameById(pair, tx.toAccountId)}
                </td>
                <td className={tx.amount < 0 ? "text-danger" : undefined}>{formatCurrency(tx.amount)}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="text-center text-muted py-6">
                  אין תנועות
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
