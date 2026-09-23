"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createInterDepartmentTransferBatch, type InterDepartmentTransferBatchRow } from "@/app/(app)/manual-entries/actions";
import { formatCurrency, addMonthsToDate, todayIso } from "@/lib/format";
import { useSortFilter, SortFilterTh, type ColumnDef } from "@/components/sortable-table";
import { DepartmentTransactionsSection } from "@/components/department-transactions-section-client";
import { DateInput } from "@/components/date-input";
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

function deptNameFromAnyPair(pair: BankAccountLedgerPair, id: string): string | null {
  if (id === pair.departmentAId) return pair.departmentAName;
  if (id === pair.departmentBId) return pair.departmentBName;
  return null;
}

type ResetSuggestion = {
  thirdDeptId: string;
  thirdDeptName: string;
  // "chain-through-debtor": someone (the third department) already owes
  // the CURRENT debtor — they can pay the current creditor directly
  // instead, letting the current debtor's debt to them absorb this one.
  // "chain-through-creditor": the current creditor already owes the third
  // department — the current debtor can pay that department directly
  // instead, so the creditor's own debt shrinks by the same amount.
  via: "chain-through-debtor" | "chain-through-creditor";
  maxAmount: number;
};

// Looks for an existing relationship (anywhere else in this report) that
// touches either side of the current pair, so a debt can be rerouted
// through it instead of the admin having to know the whole department
// graph by heart — see buildResetLegs for what "rerouting" actually
// writes. Only ever looks at OTHER department-manager pairs (never a small
// department without its own account, since those never appear here at
// all — accountManagerOf already resolved them away when this data was
// built), matching how this reset is scoped to "big accounts" only.
function findResetSuggestions(
  debtorId: string,
  creditorId: string,
  allPairs: BankAccountLedgerPair[],
  currentPairId: string,
): ResetSuggestion[] {
  const suggestions: ResetSuggestion[] = [];
  for (const p of allPairs) {
    if (p.pairId === currentPairId) continue;
    if (p.creditorDepartmentId === debtorId) {
      const thirdId = p.debtorDepartmentId;
      const thirdName = deptNameFromAnyPair(p, thirdId);
      if (thirdName) suggestions.push({ thirdDeptId: thirdId, thirdDeptName: thirdName, via: "chain-through-debtor", maxAmount: p.netAmount });
    }
    if (p.debtorDepartmentId === creditorId) {
      const thirdId = p.creditorDepartmentId;
      const thirdName = deptNameFromAnyPair(p, thirdId);
      if (thirdName) suggestions.push({ thirdDeptId: thirdId, thirdDeptName: thirdName, via: "chain-through-creditor", maxAmount: p.netAmount });
    }
  }
  return suggestions;
}

// Three real transfers, not one — the only way to make this show up
// correctly given the report computes each pair's balance by summing real
// transactions: (1) cancel/reduce the original debt with an
// opposite-direction transfer, (2) reduce the third department's existing
// relationship with whichever side it's actually linked to (also
// opposite-direction), (3) create/add the new direct relationship this
// reroute implies. Applying this same reset again to that new relationship
// (once it exists, on a later visit to ITS pair report) is exactly how a
// longer chain gets compressed one hop at a time.
function buildResetLegs(
  debtorId: string,
  creditorId: string,
  suggestion: Pick<ResetSuggestion, "thirdDeptId" | "via">,
  amount: number,
  entryDate: string,
  notes: string | null,
): InterDepartmentTransferBatchRow[] {
  const cancelOriginal: InterDepartmentTransferBatchRow = {
    debtorDepartmentId: creditorId,
    creditorDepartmentId: debtorId,
    amount,
    entryDate,
    notes,
  };
  if (suggestion.via === "chain-through-debtor") {
    // third owed debtor; debtor owed creditor -> reduce third→debtor, add third→creditor
    return [
      cancelOriginal,
      { debtorDepartmentId: debtorId, creditorDepartmentId: suggestion.thirdDeptId, amount, entryDate, notes },
      { debtorDepartmentId: suggestion.thirdDeptId, creditorDepartmentId: creditorId, amount, entryDate, notes },
    ];
  }
  // chain-through-creditor: creditor owed third -> reduce creditor→third, add debtor→third
  return [
    cancelOriginal,
    { debtorDepartmentId: suggestion.thirdDeptId, creditorDepartmentId: creditorId, amount, entryDate, notes },
    { debtorDepartmentId: debtorId, creditorDepartmentId: suggestion.thirdDeptId, amount, entryDate, notes },
  ];
}

// Lets an admin reroute a debt between two departments that each manage
// their own account through a third such department that already has a
// relationship with one side — "שעבודא דרבי נתן" (the debtor now owes the
// third department instead, since it can collect directly). Suggests
// candidates by scanning the other open pairs instead of making the admin
// hunt for one, but any department can be typed in manually too. A small
// department never shows up here as a candidate or a target — it can't be,
// since it never manages its own account (see findResetSuggestions).
function ResetBetweenDepartmentsPanel({
  debtorId,
  debtorName,
  creditorId,
  creditorName,
  maxAmount,
  allPairs,
  currentPairId,
  onClose,
}: {
  debtorId: string;
  debtorName: string;
  creditorId: string;
  creditorName: string;
  maxAmount: number;
  allPairs: BankAccountLedgerPair[];
  currentPairId: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const suggestions = findResetSuggestions(debtorId, creditorId, allPairs, currentPairId);
  const [selected, setSelected] = useState<ResetSuggestion | null>(suggestions[0] ?? null);
  const [amount, setAmount] = useState(suggestions[0] ? Math.min(maxAmount, suggestions[0].maxAmount) : maxAmount);
  const [entryDate, setEntryDate] = useState(todayIso());
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function selectSuggestion(s: ResetSuggestion) {
    setSelected(s);
    setAmount(Math.min(maxAmount, s.maxAmount));
  }

  function submit() {
    if (!selected) {
      setError("יש לבחור מחלקה שלישית");
      return;
    }
    if (!amount || amount <= 0) {
      setError("סכום לא תקין");
      return;
    }
    setError(null);
    const legs = buildResetLegs(debtorId, creditorId, selected, amount, entryDate, notes || `איפוס בין מחלקות דרך ${selected.thirdDeptName}`);
    startTransition(async () => {
      const { outcomes } = await createInterDepartmentTransferBatch(legs);
      const failed = outcomes.find((o) => !o.success);
      if (failed) {
        setError(failed.reason ?? "שגיאה");
        return;
      }
      router.refresh();
      onClose();
    });
  }

  return (
    <div className="card p-4 space-y-3 border-primary/40">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">איפוס מחלקות</h3>
        <button type="button" onClick={onClose} className="text-sm text-muted">
          סגור
        </button>
      </div>
      <p className="text-sm text-muted">
        {debtorName} חייב ל{creditorName} — במקום להעביר ישירות, ניתן להעביר את החוב (כולו או חלקו) דרך מחלקה שלישית
        שכבר יש לה יחס חוב עם אחד הצדדים.
      </p>

      {suggestions.length > 0 ? (
        <div className="space-y-1.5">
          {suggestions.map((s) => (
            <label
              key={`${s.thirdDeptId}-${s.via}`}
              className="flex items-start gap-2 rounded-lg border border-border p-2 text-sm cursor-pointer has-[:checked]:border-primary has-[:checked]:bg-background"
            >
              <input
                type="radio"
                name="reset-suggestion"
                checked={selected?.thirdDeptId === s.thirdDeptId && selected?.via === s.via}
                onChange={() => selectSuggestion(s)}
                className="mt-1"
              />
              <span>
                {s.via === "chain-through-debtor"
                  ? `דרך ${s.thirdDeptName} — חייב כרגע ל${debtorName} ${formatCurrency(s.maxAmount)}`
                  : `דרך ${s.thirdDeptName} — ${creditorName} חייב לה ${formatCurrency(s.maxAmount)}`}
              </span>
            </label>
          ))}
        </div>
      ) : (
        <p className="text-sm text-warning">לא נמצאה מחלקה שלישית עם יחס חוב קיים מול אחד הצדדים — לא ניתן להציע איפוס אוטומטי.</p>
      )}

      {suggestions.length > 0 && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-muted mb-1">סכום להעברה</label>
              <input
                type="number"
                value={amount || ""}
                onChange={(e) => setAmount(Number(e.target.value) || 0)}
                className="w-full rounded-lg border border-border bg-transparent px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm text-muted mb-1">תאריך</label>
              <DateInput value={entryDate} onChange={setEntryDate} className="w-full rounded-lg border border-border bg-transparent px-3 py-2 text-sm" />
            </div>
          </div>
          <div>
            <label className="block text-sm text-muted mb-1">הערות (אופציונלי)</label>
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full rounded-lg border border-border bg-transparent px-3 py-2 text-sm"
            />
          </div>
          {error && <p className="text-sm text-danger">{error}</p>}
          <button
            type="button"
            disabled={isPending}
            onClick={submit}
            className="rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold disabled:opacity-50"
          >
            {isPending ? "מבצע…" : "בצע איפוס"}
          </button>
        </>
      )}
    </div>
  );
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
export function BankAccountPairReport({
  pair,
  allPairs,
  isAdmin,
}: {
  pair: BankAccountLedgerPair;
  // The full list of open pairs, so "איפוס מחלקות" can suggest a third
  // department with an existing relationship to either side — see
  // findResetSuggestions.
  allPairs: BankAccountLedgerPair[];
  isAdmin: boolean;
}) {
  const [resetOpen, setResetOpen] = useState(false);
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
  // Totals for whatever filter is currently applied on the "תנועות עד
  // היום" section below — reported up via onFilteredTotals so this lives
  // in a summary card instead of only inside that section's own table.
  const [filteredTotals, setFilteredTotals] = useState({ income: 0, expense: 0, net: 0 });

  // Memoized so these arrays only get a new reference when the underlying
  // data actually changes (pair or swapped) — DepartmentTransactionsSection
  // reports its filtered totals back up via onFilteredTotals -> setState,
  // which re-renders this component; without memoizing, that re-render used
  // to produce a brand-new pastRows array every time, which the child's own
  // useMemo (keyed on rows) treated as "the data changed", re-firing the
  // totals effect and looping forever — pegging the render cycle and making
  // the whole page feel stuck to any other click or navigation attempt.
  const today = todayIso();
  const allRows: SectionRow[] = useMemo(
    () =>
      pair.transactions.map((tx) => {
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
      }),
    [pair, swapped],
  );

  const pastRows = useMemo(() => allRows.filter((r) => !r.date || r.date <= today), [allRows, today]);
  const futureRows = useMemo(
    () =>
      [...allRows.filter((r) => r.date && r.date > today)].sort((a, b) => (a.date ?? "").localeCompare(b.date ?? "")),
    [allRows, today],
  );
  const pastMonths = useMemo(
    () => [...new Set(pastRows.filter((r) => r.date).map((r) => r.date!.slice(0, 7)))].sort(),
    [pastRows],
  );
  const futureMonths = useMemo(
    () => [...new Set(futureRows.filter((r) => r.date).map((r) => r.date!.slice(0, 7)))].sort(),
    [futureRows],
  );

  // Unfiltered totals for everything up to today — pastRows already has
  // the swap perspective baked into each row's amount sign, so summing it
  // directly stays consistent with the "החלף צדדים" toggle without any
  // extra sign-juggling here. "נטו נוכחי" deliberately uses this (past-only)
  // sum rather than pair.netAmount (which also includes future-dated known
  // legs), so it matches "נטו סינון נוכחי" exactly whenever no filter is
  // applied below — the two are meant to read as the same number until the
  // admin actually narrows the filter.
  const pastIncome = pastRows.filter((r) => r.amount > 0).reduce((sum, r) => sum + r.amount, 0);
  const pastExpense = pastRows.filter((r) => r.amount < 0).reduce((sum, r) => sum + r.amount, 0);
  const pastNet = pastIncome + pastExpense;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-lg font-bold print-title">
          {pair.departmentAName} ⇄ {pair.departmentBName}
        </h2>
        <div className="flex items-center gap-2 no-print">
          <button
            type="button"
            onClick={() => setSwapped((s) => !s)}
            className="rounded-lg border border-border px-3 py-1.5 text-sm font-semibold hover:bg-background whitespace-nowrap"
          >
            החלף צדדים
          </button>
          {isAdmin && (
            <button
              type="button"
              onClick={() => setResetOpen((o) => !o)}
              className="rounded-lg border border-border px-3 py-1.5 text-sm font-semibold hover:bg-background whitespace-nowrap"
            >
              איפוס מחלקות
            </button>
          )}
        </div>
      </div>

      {resetOpen && (
        <div className="no-print">
          <ResetBetweenDepartmentsPanel
            debtorId={displayDebtorId}
            debtorName={deptNameById(pair, displayDebtorId)}
            creditorId={displayCreditorId}
            creditorName={deptNameById(pair, displayCreditorId)}
            maxAmount={pair.netAmount}
            allPairs={allPairs}
            currentPairId={pair.pairId}
            onClose={() => setResetOpen(false)}
          />
        </div>
      )}

      <div className="summary-cards-grid grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card p-4 space-y-1">
          <p className="text-sm text-muted">חייב</p>
          <p className="text-xl font-bold text-danger">{deptNameById(pair, displayDebtorId)}</p>
          <p className="text-sm text-muted pt-1">זכאי</p>
          <p className="text-xl font-bold text-success">{deptNameById(pair, displayCreditorId)}</p>
        </div>
        <div className="card p-4 space-y-1">
          <p className="text-sm text-muted">יתרת נטו</p>
          <p className="text-2xl font-bold">{formatCurrency(pastNet)}</p>
          <p className="text-sm text-danger pt-1">סה״כ הוצאות עד עתה: {formatCurrency(pastExpense)}</p>
          <p className="text-sm text-success">סה״כ הכנסות עד עתה: {formatCurrency(pastIncome)}</p>
        </div>
        <div className="card p-4 space-y-1">
          <p className="text-sm text-muted">נטו סינון נוכחי</p>
          <p className="text-2xl font-bold">{formatCurrency(filteredTotals.net)}</p>
          <p className="text-sm text-danger pt-1">סה״כ הוצאות סינון: {formatCurrency(filteredTotals.expense)}</p>
          <p className="text-sm text-success">סה״כ הכנסות סינון: {formatCurrency(filteredTotals.income)}</p>
        </div>
      </div>

      <DepartmentTransactionsSection
        title="תנועות עד היום"
        rows={pastRows}
        isAdmin={isAdmin}
        monthOptions={pastMonths}
        defaultSortDir="desc"
        defaultFromDate={addMonthsToDate(today, -3)}
        onFilteredTotals={setFilteredTotals}
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
