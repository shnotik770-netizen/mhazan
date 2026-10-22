"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatCurrency, formatDate } from "@/lib/format";
import { confirmTransfersBatch } from "@/app/(app)/checks/actions";
import {
  ApprovePaymentRequestRow,
  CancelAndReplaceCheckButton,
  CancelCheckButton,
  EditCheckButton,
  VerifyTransferButton,
} from "@/components/checks-client";
import { DateInput } from "@/components/date-input";
import type { Tables } from "@/lib/supabase/database.types";
import { PayeeLink } from "@/components/check-detail-client";
import { RowActionsMenu } from "@/components/row-actions-menu";
import { useSortFilter, SortFilterTh, type ColumnDef } from "@/components/sortable-table";
import { groupByBank, bankColorFor, BankGroupHeading } from "@/components/bank-grouping";

type AllocationInfo = { departmentId: string; departmentName: string | null; amount: number };
type BankAccount = { id: string; bank_name: string; account_number: string };
type CategoryOption = { id: string; name: string; departmentId: string | null };

// Small chevron button at the header's edge that collapses/expands a
// section's body — every section on the checks page uses this so a long
// page with many tables can be folded down to just the headings.
export function CollapsibleSection({
  title,
  defaultOpen = true,
  children,
}: {
  title: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-1">
        <div className="flex items-center gap-2 min-w-0">{title}</div>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="shrink-0 rounded p-1 text-muted hover:text-foreground hover:bg-background"
          aria-label={open ? "כווץ" : "הרחב"}
          title={open ? "כווץ" : "הרחב"}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            className={`transition-transform duration-150 ${open ? "" : "-rotate-90"}`}
          >
            <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
      {open && children}
    </div>
  );
}

function matches(query: string, ...fields: (string | null | undefined)[]) {
  if (!query.trim()) return true;
  const q = query.trim().toLowerCase();
  return fields.some((f) => (f ?? "").toLowerCase().includes(q));
}

function DepartmentCell({
  checkId,
  departmentName,
  allocationsByCheck,
}: {
  checkId: string;
  departmentName: string | null;
  allocationsByCheck: Map<string, AllocationInfo[]>;
}) {
  if (departmentName) return <>{departmentName}</>;
  const allocations = allocationsByCheck.get(checkId);
  if (allocations) {
    return (
      <span className="text-xs">
        מפוצל: {allocations.map((a) => `${a.departmentName ?? "?"} (${formatCurrency(a.amount)})`).join(", ")}
      </span>
    );
  }
  return <span className="text-warning">בהמתנה</span>;
}

function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder ?? "חיפוש..."}
      className="w-full max-w-xs rounded-lg border border-border bg-transparent px-3 py-1.5 text-sm mb-2"
    />
  );
}

type PaymentRequestRow = {
  id: string | null;
  payee: string | null;
  amount: number | null;
  department_id: string | null;
  department_name: string | null;
  category_id: string | null;
  notes: string | null;
  payment_method: string | null;
  due_date: string | null;
  check_number: string | null;
  bank_account_id: string | null;
};

// "דרישות תשלום ממתינות לאישור" — includes both transfers and checks, with
// its own local search independent from the rest of the page.
export function PendingApprovalTable({
  rows,
  isAdmin,
  bankAccounts,
  departments,
  categories = [],
  allocationsByCheck,
}: {
  rows: PaymentRequestRow[];
  isAdmin: boolean;
  bankAccounts: BankAccount[];
  departments: Tables<"departments">[];
  categories?: CategoryOption[];
  allocationsByCheck: Map<string, AllocationInfo[]>;
}) {
  const [query, setQuery] = useState("");
  const searched = rows.filter((r) => matches(query, r.payee, r.notes));

  const columns: ColumnDef<PaymentRequestRow>[] = [
    { key: "payee", label: "מוטב", sortValue: (r) => r.payee ?? "", filterValue: (r) => r.payee ?? "" },
    { key: "amount", label: "סכום", sortValue: (r) => Number(r.amount) },
    { key: "department", label: "מחלקה", sortValue: (r) => r.department_name ?? "", filterValue: (r) => r.department_name ?? "בהמתנה" },
    { key: "notes", label: "הערות", sortValue: (r) => r.notes ?? "" },
  ];
  const { rows: filtered, sort, toggleSort, filters, setColumnFilter } = useSortFilter(searched, columns);

  return (
    <div>
      <SearchBox value={query} onChange={setQuery} placeholder="חיפוש לפי מוטב / הערות" />
      <div className="overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              {columns.map((col) => (
                <SortFilterTh
                  key={col.key}
                  col={col}
                  allRows={searched}
                  sort={sort}
                  toggleSort={toggleSort}
                  activeFilter={filters[col.key]}
                  setColumnFilter={setColumnFilter}
                />
              ))}
              {isAdmin && <th>אישור</th>}
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => (
              <tr key={c.id!}>
                <td>
                  <PayeeLink payee={c.payee ?? ""} />
                </td>
                <td>{formatCurrency(Number(c.amount))}</td>
                <td>
                  <DepartmentCell checkId={c.id!} departmentName={c.department_name} allocationsByCheck={allocationsByCheck} />
                </td>
                <td>{c.notes ?? "—"}</td>
                {isAdmin && (
                  <td>
                    <RowActionsMenu>
                      <ApprovePaymentRequestRow
                        checkId={c.id!}
                        paymentMethod={c.payment_method ?? undefined}
                        currentDueDate={c.due_date}
                        currentCheckNumber={c.check_number}
                      />
                      <EditCheckButton
                        checkId={c.id!}
                        payee={c.payee ?? ""}
                        amount={Number(c.amount)}
                        dueDate={c.due_date}
                        checkNumber={c.check_number}
                        departmentId={c.department_id}
                        categoryId={c.category_id}
                        categories={categories}
                        notes={c.notes}
                        paymentMethod={c.payment_method ?? undefined}
                        existingAllocations={allocationsByCheck.get(c.id!)}
                        departments={departments}
                      />
                      <CancelCheckButton checkId={c.id!} variant="menu" />
                      <CancelAndReplaceCheckButton
                        checkId={c.id!}
                        payee={c.payee ?? ""}
                        amount={Number(c.amount)}
                        currentPaymentMethod={c.payment_method}
                        currentDueDate={c.due_date}
                        currentBankAccountId={c.bank_account_id}
                        bankAccounts={bankAccounts}
                        variant="menu"
                      />
                    </RowActionsMenu>
                  </td>
                )}
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={isAdmin ? 5 : 4} className="text-center text-muted py-4">
                  אין תוצאות
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

type OverdueTransferRow = {
  id: string;
  payee: string;
  amount: number;
  due_date: string;
  bank_account_id: string;
  department_id: string | null;
  category_id: string | null;
  notes: string | null;
  departments: { name: string } | null;
  bank_accounts: { bank_name: string; account_number: string } | null;
};

// Grouped by bank account, same as every other checks/transfers section —
// each group gets a colored dot + border stripe (bankColorFor) so it's
// visually obvious at a glance which bank a batch of overdue items belongs
// to, especially important here since these are unresolved/overdue.
type OverdueTransferFlatRow = OverdueTransferRow & { bank_name: string | null; account_number: string | null };

export function OverdueTransfersTable({
  rows,
  bankAccounts,
  departments,
  categories = [],
  allocationsByCheck,
}: {
  rows: OverdueTransferRow[];
  bankAccounts: BankAccount[];
  departments: Tables<"departments">[];
  categories?: CategoryOption[];
  allocationsByCheck: Map<string, AllocationInfo[]>;
}) {
  const [query, setQuery] = useState("");
  const flat: OverdueTransferFlatRow[] = rows.map((r) => ({
    ...r,
    bank_name: r.bank_accounts?.bank_name ?? null,
    account_number: r.bank_accounts?.account_number ?? null,
  }));
  const searched = flat.filter((r) => matches(query, r.payee));

  const columns: ColumnDef<OverdueTransferFlatRow>[] = [
    { key: "payee", label: "מוטב", sortValue: (r) => r.payee, filterValue: (r) => r.payee },
    { key: "amount", label: "סכום", sortValue: (r) => Number(r.amount) },
    { key: "due_date", label: "תאריך", sortValue: (r) => r.due_date },
    { key: "department", label: "מחלקה", sortValue: (r) => r.departments?.name ?? "", filterValue: (r) => r.departments?.name ?? "בהמתנה" },
  ];
  const { rows: filtered, sort, toggleSort, filters, setColumnFilter } = useSortFilter(searched, columns);
  const grouped = groupByBank(filtered);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const selectedRows = flat.filter((r) => selected.has(r.id));

  function toggle(ids: string[], on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }

  return (
    <div className="mb-4">
      <h2 className="font-semibold mb-1">⚠ {rows.length} העברות שטרם אושרו כבוצעו</h2>
      <p className="text-xs text-muted mb-1">
        כמה העברות שיצאו בפועל כהעברה אחת? סמנו אותן בתיבות שבצד ואשרו את כולן יחד.
      </p>
      <SearchBox value={query} onChange={setQuery} placeholder="חיפוש לפי מוטב" />
      {selectedRows.length > 0 && (
        <BatchConfirmTransfersBar rows={selectedRows} onClear={() => setSelected(new Set())} />
      )}
      {grouped.map(([bankLabel, bankRows]) => {
        const groupIds = bankRows.map((r) => r.id);
        const allSelected = groupIds.every((id) => selected.has(id));
        return (
        <div key={bankLabel} className={`mb-3 border-r-4 ${bankColorFor(bankLabel).border} pr-3`}>
          <BankGroupHeading label={bankLabel} count={bankRows.length} unit="העברות" />
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th className="w-8">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={(e) => toggle(groupIds, e.target.checked)}
                      aria-label="בחר את כל ההעברות בחשבון זה"
                      title="בחר הכל בחשבון זה"
                    />
                  </th>
                  {columns.map((col) => (
                    <SortFilterTh
                      key={col.key}
                      col={col}
                      allRows={searched}
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
                {bankRows.map((row) => (
                  <tr key={row.id} className={selected.has(row.id) ? "bg-primary/5" : undefined}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selected.has(row.id)}
                        onChange={(e) => toggle([row.id], e.target.checked)}
                        aria-label={`בחר העברה ל${row.payee}`}
                      />
                    </td>
                    <td>
                      <PayeeLink payee={row.payee} />
                    </td>
                    <td>{formatCurrency(Number(row.amount))}</td>
                    <td>{formatDate(row.due_date)}</td>
                    <td>{row.departments?.name ?? "בהמתנה"}</td>
                    <td>
                      <RowActionsMenu>
                        <VerifyTransferButton
                          checkId={row.id}
                          label="אשר שההעברה בוצעה"
                          currentDueDate={row.due_date}
                          captureInternalBeneficiary
                        />
                        <EditCheckButton
                          checkId={row.id}
                          payee={row.payee}
                          amount={Number(row.amount)}
                          dueDate={row.due_date}
                          checkNumber={null}
                          departmentId={row.department_id}
                          categoryId={row.category_id}
                          categories={categories}
                          notes={row.notes}
                          paymentMethod="TRANSFER"
                          existingAllocations={allocationsByCheck.get(row.id)}
                          departments={departments}
                        />
                        <CancelCheckButton checkId={row.id} variant="menu" />
                        <CancelAndReplaceCheckButton
                          checkId={row.id}
                          payee={row.payee}
                          amount={Number(row.amount)}
                          currentPaymentMethod="TRANSFER"
                          currentDueDate={row.due_date}
                          currentBankAccountId={row.bank_account_id}
                          bankAccounts={bankAccounts}
                          variant="menu"
                        />
                      </RowActionsMenu>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        );
      })}
      {filtered.length === 0 && <p className="text-center text-muted py-4">אין תוצאות</p>}
    </div>
  );
}

// Confirms every selected overdue transfer at once -- the common case being
// several payment requests to one supplier that went out as a single real
// bank transfer, so they share one actual date and one internal beneficiary.
function BatchConfirmTransfersBar({ rows, onClear }: { rows: OverdueTransferFlatRow[]; onClear: () => void }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [beneficiary, setBeneficiary] = useState("");
  // null = follow the selection's latest recorded date, until the admin picks one.
  const [dateOverride, setDateOverride] = useState<string | null>(null);

  const total = rows.reduce((sum, r) => sum + Number(r.amount), 0);
  const payees = new Set(rows.map((r) => r.payee.trim()));
  const latestDueDate = rows.reduce((max, r) => (r.due_date > max ? r.due_date : max), rows[0].due_date);
  const actualDate = dateOverride ?? latestDueDate;

  function submit() {
    setError(null);
    if (!actualDate) {
      setError("יש לבחור תאריך מלא");
      return;
    }
    const message = `לאשר ${rows.length} העברות (סה״כ ${formatCurrency(total)}) כבוצעו בתאריך ${formatDate(actualDate)}?`;
    if (!confirm(message)) return;
    startTransition(async () => {
      const result = await confirmTransfersBatch(
        rows.map((r) => r.id),
        actualDate,
        beneficiary,
      );
      if (result.error) {
        setError(result.error);
        router.refresh();
        return;
      }
      onClear();
      router.refresh();
    });
  }

  return (
    <div className="mb-3 rounded-lg border border-primary/40 bg-primary/5 p-3 space-y-2">
      <p className="text-sm font-semibold">
        נבחרו {rows.length} העברות · סה״כ {formatCurrency(total)}
      </p>
      {payees.size > 1 && (
        <p className="text-xs text-warning">שימו לב: נבחרו העברות לכמה מוטבים שונים ({[...payees].join(", ")}).</p>
      )}
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label className="block text-xs text-muted mb-1">תאריך ההעברה בפועל</label>
          <DateInput
            value={actualDate}
            onChange={setDateOverride}
            className="rounded border border-border bg-transparent px-2 py-1 text-sm"
          />
        </div>
        <div className="flex-1 min-w-[12rem]">
          <label className="block text-xs text-muted mb-1">מוטב פנימי בתוך הספק (אופציונלי, לכל ההעברות)</label>
          <input
            value={beneficiary}
            onChange={(e) => setBeneficiary(e.target.value)}
            maxLength={200}
            className="w-full rounded border border-border bg-transparent px-2 py-1 text-sm"
          />
        </div>
        <button
          type="button"
          disabled={isPending}
          onClick={submit}
          className="rounded bg-primary text-primary-foreground text-sm px-3 py-1.5 disabled:opacity-50"
        >
          אשר את כולן כבוצעו
        </button>
        <button type="button" disabled={isPending} onClick={onClear} className="text-sm text-muted underline">
          נקה בחירה
        </button>
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}

type OverdueCheckRow = {
  id: string;
  payee: string;
  check_number: string | null;
  amount: number;
  due_date: string;
  bank_account_id: string;
  departments: { name: string } | null;
  bank_accounts: { bank_name: string; account_number: string } | null;
};

type OverdueCheckFlatRow = OverdueCheckRow & { bank_name: string | null; account_number: string | null };

export function OverdueChecksTable({ rows, bankAccounts }: { rows: OverdueCheckRow[]; bankAccounts: BankAccount[] }) {
  const [query, setQuery] = useState("");
  const flat: OverdueCheckFlatRow[] = rows.map((r) => ({
    ...r,
    bank_name: r.bank_accounts?.bank_name ?? null,
    account_number: r.bank_accounts?.account_number ?? null,
  }));
  const searched = flat.filter((r) => matches(query, r.payee, r.check_number));

  const columns: ColumnDef<OverdueCheckFlatRow>[] = [
    { key: "payee", label: "מוטב", sortValue: (r) => r.payee, filterValue: (r) => r.payee },
    { key: "check_number", label: "מס׳ צ׳ק", sortValue: (r) => r.check_number ?? "" },
    { key: "amount", label: "סכום", sortValue: (r) => Number(r.amount) },
    { key: "due_date", label: "תאריך", sortValue: (r) => r.due_date },
    { key: "department", label: "מחלקה", sortValue: (r) => r.departments?.name ?? "", filterValue: (r) => r.departments?.name ?? "בהמתנה" },
  ];
  const { rows: filtered, sort, toggleSort, filters, setColumnFilter } = useSortFilter(searched, columns);
  const grouped = groupByBank(filtered);

  return (
    <div>
      <h2 className="font-semibold mb-1">⚠ {rows.length} צ׳קים שטרם אושרו כנפרעו</h2>
      <SearchBox value={query} onChange={setQuery} placeholder="חיפוש לפי מוטב / מספר צ׳ק" />
      {grouped.map(([bankLabel, bankRows]) => (
        <div key={bankLabel} className={`mb-3 border-r-4 ${bankColorFor(bankLabel).border} pr-3`}>
          <BankGroupHeading label={bankLabel} count={bankRows.length} unit="צ׳קים" />
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  {columns.map((col) => (
                    <SortFilterTh
                      key={col.key}
                      col={col}
                      allRows={searched}
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
                {bankRows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <PayeeLink payee={row.payee} />
                    </td>
                    <td>{row.check_number ?? "—"}</td>
                    <td>{formatCurrency(Number(row.amount))}</td>
                    <td>{formatDate(row.due_date)}</td>
                    <td>{row.departments?.name ?? "בהמתנה"}</td>
                    <td>
                      <RowActionsMenu>
                        <VerifyTransferButton checkId={row.id} label="סמן כנפרע" />
                        <CancelCheckButton checkId={row.id} variant="menu" />
                        <CancelAndReplaceCheckButton
                          checkId={row.id}
                          payee={row.payee}
                          amount={Number(row.amount)}
                          currentPaymentMethod="CHECK"
                          currentDueDate={row.due_date}
                          currentBankAccountId={row.bank_account_id}
                          bankAccounts={bankAccounts}
                          variant="menu"
                        />
                      </RowActionsMenu>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
      {filtered.length === 0 && <p className="text-center text-muted py-4">אין תוצאות</p>}
    </div>
  );
}
