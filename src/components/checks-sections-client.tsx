"use client";

import { useState } from "react";
import { formatCurrency, formatDate } from "@/lib/format";
import {
  ApprovePaymentRequestRow,
  CheckStatusControls,
  EditDeleteCheckRow,
  VerifyTransferButton,
} from "@/components/checks-client";
import { CheckDetailLink, PayeeLink } from "@/components/check-detail-client";
import { useSortFilter, SortFilterTh, type ColumnDef } from "@/components/sortable-table";
import { groupByBank, bankColorFor, BankGroupHeading } from "@/components/bank-grouping";
import type { CheckAllocationInput } from "@/app/(app)/checks/actions";
import type { Tables } from "@/lib/supabase/database.types";

type Department = Tables<"departments">;

type AllocationInfo = { departmentId: string; departmentName: string | null; amount: number };

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
  department_name: string | null;
  notes: string | null;
  payment_method: string | null;
  due_date: string | null;
  check_number: string | null;
};

// "דרישות תשלום ממתינות לאישור" — includes both transfers and checks, with
// its own local search independent from the rest of the page.
export function PendingApprovalTable({
  rows,
  isAdmin,
  allocationsByCheck,
}: {
  rows: PaymentRequestRow[];
  isAdmin: boolean;
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
                    <ApprovePaymentRequestRow
                      checkId={c.id!}
                      paymentMethod={c.payment_method ?? undefined}
                      currentDueDate={c.due_date}
                      currentCheckNumber={c.check_number}
                    />
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

type IssuedCheckRow = {
  id: string | null;
  check_number: string | null;
  payee: string | null;
  amount: number | null;
  due_date: string | null;
  issued_at: string | null;
  department_id: string | null;
  department_name: string | null;
  bank_name: string | null;
  account_number: string | null;
  status: string | null;
  notes: string | null;
  spread_id: string | null;
};

// "צ׳קים שהונפקו עם מספר לתאריך" — a check that has both a check number
// and a due date, still unpaid: reads from v_checks_issued. Grouped by
// bank account automatically, since that's how these get prepared/handed
// over in practice.
export function IssuedChecksTable({
  rows,
  departments,
  allocationsByCheck,
}: {
  rows: IssuedCheckRow[];
  departments: Department[];
  allocationsByCheck: Map<string, AllocationInfo[]>;
}) {
  const [query, setQuery] = useState("");
  const searched = rows.filter((r) => matches(query, r.payee, r.check_number));

  const statusLabel = (s: string | null) => (s === "CLEARED" ? "נפרע" : s === "CANCELLED" ? "בוטל" : "לא נפרע");
  const columns: ColumnDef<IssuedCheckRow>[] = [
    { key: "check_number", label: "מס׳ צ׳ק", sortValue: (r) => r.check_number ?? "" },
    { key: "payee", label: "מוטב", sortValue: (r) => r.payee ?? "", filterValue: (r) => r.payee ?? "" },
    { key: "amount", label: "סכום", sortValue: (r) => Number(r.amount) },
    { key: "due_date", label: "תאריך פירעון", sortValue: (r) => r.due_date ?? "" },
    { key: "issued_at", label: "תאריך הנפקה", sortValue: (r) => r.issued_at ?? "" },
    { key: "department", label: "מחלקה", sortValue: (r) => r.department_name ?? "", filterValue: (r) => r.department_name ?? "ללא מחלקה" },
    { key: "status", label: "סטטוס", sortValue: (r) => r.status ?? "", filterValue: (r) => statusLabel(r.status) },
  ];
  const { rows: filtered, sort, toggleSort, filters, setColumnFilter } = useSortFilter(searched, columns);
  const grouped = groupByBank(filtered);

  return (
    <div>
      <SearchBox value={query} onChange={setQuery} placeholder="חיפוש לפי מוטב / מספר צ׳ק" />
      {grouped.map(([bankLabel, bankRows]) => (
        <div key={bankLabel} className={`mb-4 border-r-4 ${bankColorFor(bankLabel).border} pr-3`}>
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
                {bankRows.map((c) => (
                  <tr key={c.id!}>
                    <td>{c.check_number}</td>
                    <td>
                      <PayeeLink payee={c.payee ?? ""} />
                      {c.spread_id && <span className="badge bg-background text-muted mr-1">פריסה</span>}
                    </td>
                    <td>{formatCurrency(Number(c.amount))}</td>
                    <td>{c.due_date ? formatDate(c.due_date) : "—"}</td>
                    <td>{c.issued_at ? formatDate(c.issued_at) : "—"}</td>
                    <td>
                      <DepartmentCell checkId={c.id!} departmentName={c.department_name} allocationsByCheck={allocationsByCheck} />
                    </td>
                    <td>
                      <CheckStatusControls checkId={c.id!} status={c.status ?? "UNPAID"} paymentMethod="CHECK" />
                    </td>
                    <td className="flex items-center gap-2">
                      <CheckDetailLink checkId={c.id!} />
                      <EditDeleteCheckRow
                        checkId={c.id!}
                        payee={c.payee ?? ""}
                        amount={Number(c.amount)}
                        dueDate={c.due_date}
                        checkNumber={c.check_number}
                        departmentId={c.department_id}
                        notes={c.notes}
                        paymentMethod="CHECK"
                        existingAllocations={
                          (allocationsByCheck.get(c.id!) ?? []).map((a) => ({
                            departmentId: a.departmentId,
                            amount: a.amount,
                          })) as CheckAllocationInput[]
                        }
                        departments={departments}
                      />
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

type OverdueTransferRow = {
  id: string;
  payee: string;
  amount: number;
  due_date: string;
  departments: { name: string } | null;
  bank_accounts: { bank_name: string; account_number: string } | null;
};

// Grouped by bank account, same as every other checks/transfers section —
// each group gets a colored dot + border stripe (bankColorFor) so it's
// visually obvious at a glance which bank a batch of overdue items belongs
// to, especially important here since these are unresolved/overdue.
type OverdueTransferFlatRow = OverdueTransferRow & { bank_name: string | null; account_number: string | null };

export function OverdueTransfersTable({ rows }: { rows: OverdueTransferRow[] }) {
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

  return (
    <div className="mb-4">
      <h2 className="font-semibold mb-1">⚠ {rows.length} העברות שטרם אושרו כבוצעו</h2>
      <SearchBox value={query} onChange={setQuery} placeholder="חיפוש לפי מוטב" />
      {grouped.map(([bankLabel, bankRows]) => (
        <div key={bankLabel} className={`mb-3 border-r-4 ${bankColorFor(bankLabel).border} pr-3`}>
          <BankGroupHeading label={bankLabel} count={bankRows.length} unit="העברות" />
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
                    <td>{formatCurrency(Number(row.amount))}</td>
                    <td>{formatDate(row.due_date)}</td>
                    <td>{row.departments?.name ?? "בהמתנה"}</td>
                    <td>
                      <VerifyTransferButton checkId={row.id} label="אשר שההעברה בוצעה" captureInternalBeneficiary />
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

type FullCheckRow = {
  id: string;
  check_number: string | null;
  payee: string;
  amount: number;
  due_date: string | null;
  status: string;
  payment_method: string;
  department_id: string | null;
  notes: string | null;
  skip_department_ledger: boolean;
  spread_id: string | null;
  internal_beneficiary: string | null;
  bank_accounts: { bank_name: string; account_number: string } | null;
  departments: { name: string } | null;
};

// "כל הצ׳קים וההעברות" — its own local search on top of the pm/status
// server-side filters, independent from every other section on the page.
export function AllChecksTable({
  rows,
  isAdmin,
  departments,
  allocationsByCheck,
}: {
  rows: FullCheckRow[];
  isAdmin: boolean;
  departments: Department[];
  allocationsByCheck: Map<string, AllocationInfo[]>;
}) {
  const [query, setQuery] = useState("");
  const searched = rows.filter((r) => matches(query, r.payee, r.notes, r.check_number));

  const statusLabel = (s: string) => (s === "CLEARED" ? "נפרע" : s === "CANCELLED" ? "בוטל" : "לא נפרע");
  const columns: ColumnDef<FullCheckRow>[] = [
    {
      key: "payment_method",
      label: "אמצעי",
      sortValue: (r) => r.payment_method,
      filterValue: (r) => (r.payment_method === "TRANSFER" ? "העברה" : "צ׳ק"),
    },
    { key: "check_number", label: "מס׳ צ׳ק", sortValue: (r) => r.check_number ?? "" },
    { key: "payee", label: "מוטב", sortValue: (r) => r.payee, filterValue: (r) => r.payee },
    { key: "amount", label: "סכום", sortValue: (r) => Number(r.amount) },
    { key: "due_date", label: "תאריך פירעון", sortValue: (r) => r.due_date ?? "" },
    {
      key: "bank",
      label: "חשבון",
      sortValue: (r) => `${r.bank_accounts?.bank_name ?? ""} ${r.bank_accounts?.account_number ?? ""}`,
      filterValue: (r) => (r.bank_accounts ? `${r.bank_accounts.bank_name} (${r.bank_accounts.account_number})` : "—"),
    },
    {
      key: "department",
      label: "מחלקה",
      sortValue: (r) => r.departments?.name ?? "",
      filterValue: (r) => r.departments?.name ?? "ללא מחלקה",
    },
    { key: "status", label: "סטטוס", sortValue: (r) => r.status, filterValue: (r) => statusLabel(r.status) },
  ];
  const { rows: filtered, sort, toggleSort, filters, setColumnFilter } = useSortFilter(searched, columns);

  return (
    <div>
      <SearchBox value={query} onChange={setQuery} placeholder="חיפוש לפי מוטב / מספר צ׳ק / הערות" />
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
          {filtered.map((row) => (
            <tr key={row.id}>
              <td>{row.payment_method === "TRANSFER" ? "העברה" : "צ׳ק"}</td>
              <td>{row.check_number ?? "—"}</td>
              <td>
                <PayeeLink payee={row.payee} />
                {row.spread_id && <span className="badge bg-background text-muted mr-1">פריסה</span>}
                {row.internal_beneficiary && <div className="text-xs text-muted">מוטב פנימי: {row.internal_beneficiary}</div>}
              </td>
              <td>{formatCurrency(Number(row.amount))}</td>
              <td>{row.due_date ? formatDate(row.due_date) : <span className="text-muted">ללא תאריך</span>}</td>
              <td>
                {row.bank_accounts?.bank_name} ({row.bank_accounts?.account_number})
              </td>
              <td>
                <DepartmentCell checkId={row.id} departmentName={row.departments?.name ?? null} allocationsByCheck={allocationsByCheck} />
                {row.skip_department_ledger && <span className="badge bg-background text-muted mr-1">חישוב ישן</span>}
              </td>
              <td>
                <CheckStatusControls checkId={row.id} status={row.status} paymentMethod={row.payment_method} />
              </td>
              <td className="flex items-center gap-2">
                <CheckDetailLink checkId={row.id} />
                {isAdmin && (
                  <EditDeleteCheckRow
                    checkId={row.id}
                    payee={row.payee}
                    amount={Number(row.amount)}
                    dueDate={row.due_date}
                    checkNumber={row.check_number}
                    departmentId={row.department_id}
                    notes={row.notes}
                    paymentMethod={row.payment_method}
                    existingAllocations={
                      (allocationsByCheck.get(row.id) ?? []).map((a) => ({
                        departmentId: a.departmentId,
                        amount: a.amount,
                      })) as CheckAllocationInput[]
                    }
                    departments={departments}
                  />
                )}
              </td>
            </tr>
          ))}
          {filtered.length === 0 && (
            <tr>
              <td colSpan={9} className="text-center text-muted py-6">
                אין צ׳קים רשומים עדיין
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

type OverdueCheckRow = {
  id: string;
  payee: string;
  check_number: string | null;
  amount: number;
  due_date: string;
  departments: { name: string } | null;
  bank_accounts: { bank_name: string; account_number: string } | null;
};

type OverdueCheckFlatRow = OverdueCheckRow & { bank_name: string | null; account_number: string | null };

export function OverdueChecksTable({ rows }: { rows: OverdueCheckRow[] }) {
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
                      <VerifyTransferButton checkId={row.id} label="סמן כנפרע" />
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
