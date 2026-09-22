"use client";

import { useState } from "react";
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

function deptNameById(pair: BankAccountLedgerPair, id: string): string {
  return id === pair.departmentAId ? pair.departmentAName : pair.departmentBName;
}

// Summary list — one row per pair of departments (each managing its own
// bank account) with an open balance between them. Each row is a plain
// link into that pair's own report page (BankAccountPairReport below), the
// same way LedgerNetPositionTable links into a department's own report,
// instead of expanding inline in place.
export function BankAccountLedgerTable({ pairs }: { pairs: BankAccountLedgerPair[] }) {
  const columns: ColumnDef<BankAccountLedgerPair>[] = [
    {
      key: "debtor",
      label: "חייב",
      sortValue: (p) => deptNameById(p, p.debtorDepartmentId),
      filterValue: (p) => deptNameById(p, p.debtorDepartmentId),
    },
    {
      key: "creditor",
      label: "זכאי",
      sortValue: (p) => deptNameById(p, p.creditorDepartmentId),
      filterValue: (p) => deptNameById(p, p.creditorDepartmentId),
    },
    { key: "amount", label: "סכום נטו", sortValue: (p) => p.netAmount },
    { key: "count", label: "מס׳ תנועות", sortValue: (p) => p.transactions.length },
  ];
  const { rows: filtered, sort, toggleSort, filters, setColumnFilter } = useSortFilter(pairs, columns, {
    key: "amount",
    dir: "desc",
  });

  if (pairs.length === 0) {
    return <p className="text-sm text-muted py-4 text-center">אין חוב פתוח בין מחלקות שמנהלות חשבונות בנק נפרדים כרגע.</p>;
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
            <td className="font-semibold text-danger">{deptNameById(pair, pair.debtorDepartmentId)}</td>
            <td className="font-semibold text-success">{deptNameById(pair, pair.creditorDepartmentId)}</td>
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

// A full internal report for one pair of departments that each manage their
// own bank account — deliberately reuses DepartmentTransactionsSection (the
// exact same "תנועות עד היום" / "תנועות עתידיות ידועות" split, with the
// exact same search / income-expense-toggle / month / date-range filters a
// department report has) instead of a bespoke table, since this debt
// deserves the same "how did we get to this number, and what's still
// coming" treatment a department gets.
export function BankAccountPairReport({ pair, isAdmin }: { pair: BankAccountLedgerPair; isAdmin: boolean }) {
  // Which side is shown as debtor (red) vs creditor (green) is computed
  // correctly and dynamically from the real balance — this toggle doesn't
  // change that computation, it only lets the viewer flip which side is
  // displayed where, for their own preferred frame of reference (e.g.
  // always seeing "our department" on the same side regardless of who
  // currently owes). Swapping shows the amount as negative, since it's now
  // deliberately displaying the pair from the "wrong" (non-default) side.
  const [swapped, setSwapped] = useState(false);
  const displayDebtorId = swapped ? pair.creditorDepartmentId : pair.debtorDepartmentId;
  const displayCreditorId = swapped ? pair.debtorDepartmentId : pair.creditorDepartmentId;
  const displayNetAmount = swapped ? -pair.netAmount : pair.netAmount;

  const allRows: SectionRow[] = pair.transactions.map((tx) => {
    const amount = tx.fromDepartmentId === pair.departmentAId ? tx.amount : -tx.amount;
    return {
      id: tx.id,
      date: tx.date,
      typeDetail: KIND_LABEL[tx.kind],
      typeCategory: KIND_LABEL[tx.kind],
      description: `${tx.description}${tx.departmentName ? ` — מחלקת ${tx.departmentName}` : ""} (${tx.fromAccountName} ← ${tx.toAccountName})`,
      status: tx.status,
      amount: swapped ? -amount : amount,
      isOld: false,
      kind: tx.kind,
    };
  });

  const today = todayIso();
  const pastRows = allRows.filter((r) => !r.date || r.date <= today);
  const futureRows = [...allRows.filter((r) => r.date && r.date > today)].sort((a, b) =>
    (a.date ?? "").localeCompare(b.date ?? ""),
  );
  const pastMonths = [...new Set(pastRows.filter((r) => r.date).map((r) => r.date!.slice(0, 7)))].sort();
  const futureMonths = [...new Set(futureRows.filter((r) => r.date).map((r) => r.date!.slice(0, 7)))].sort();

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-bold mb-1">
            {pair.departmentAName} ⇄ {pair.departmentBName}
          </h2>
          <p className="text-sm text-muted">כל התנועות שמרכיבות את החוב בין שתי המחלקות האלה, כולל עמלת האשראי במקומות הרלוונטיים.</p>
        </div>
        <button
          type="button"
          onClick={() => setSwapped((s) => !s)}
          className="rounded-lg border border-border px-3 py-1.5 text-sm font-semibold hover:bg-background whitespace-nowrap"
        >
          החלף צדדים
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card p-4">
          <p className="text-sm text-muted mb-1">חייב</p>
          <p className="text-xl font-bold text-danger">{deptNameById(pair, displayDebtorId)}</p>
        </div>
        <div className="card p-4">
          <p className="text-sm text-muted mb-1">זכאי</p>
          <p className="text-xl font-bold text-success">{deptNameById(pair, displayCreditorId)}</p>
        </div>
        <div className="card p-4">
          <p className="text-sm text-muted mb-1">סכום נטו</p>
          <p className="text-2xl font-bold">{formatCurrency(displayNetAmount)}</p>
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
