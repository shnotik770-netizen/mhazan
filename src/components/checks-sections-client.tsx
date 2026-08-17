"use client";

import { useState } from "react";
import { formatCurrency, formatDate } from "@/lib/format";
import {
  ApprovePaymentRequestRow,
  CheckStatusControls,
  EditDeleteCheckRow,
  VerifyTransferButton,
} from "@/components/checks-client";
import type { CheckAllocationInput } from "@/app/(app)/checks/actions";
import type { Tables } from "@/lib/supabase/database.types";

type Department = Tables<"departments">;

type AllocationInfo = { departmentId: string; departmentName: string | null; amount: number };

function matches(query: string, ...fields: (string | null | undefined)[]) {
  if (!query.trim()) return true;
  const q = query.trim().toLowerCase();
  return fields.some((f) => (f ?? "").toLowerCase().includes(q));
}

// Automatically splits a section's rows into one group per bank account
// instead of one flat list, so it's obvious at a glance which bank each
// batch of checks/transfers is coming out of.
function groupByBank<T extends { bank_name: string | null; account_number: string | null }>(
  rows: T[],
): [string, T[]][] {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const key = `${row.bank_name ?? "?"} (${row.account_number ?? "?"})`;
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
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
  const filtered = rows.filter((r) => matches(query, r.payee, r.notes));

  return (
    <div>
      <SearchBox value={query} onChange={setQuery} placeholder="חיפוש לפי מוטב / הערות" />
      <div className="overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>מוטב</th>
              <th>סכום</th>
              <th>מחלקה</th>
              <th>הערות</th>
              {isAdmin && <th>אישור</th>}
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => (
              <tr key={c.id!}>
                <td>{c.payee}</td>
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
  department_id: string | null;
  department_name: string | null;
  bank_name: string | null;
  account_number: string | null;
  status: string | null;
  notes: string | null;
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
  const filtered = rows.filter((r) => matches(query, r.payee, r.check_number));
  const grouped = groupByBank(filtered);

  return (
    <div>
      <SearchBox value={query} onChange={setQuery} placeholder="חיפוש לפי מוטב / מספר צ׳ק" />
      {grouped.map(([bankLabel, bankRows]) => (
        <div key={bankLabel} className="mb-4">
          <h3 className="text-sm font-semibold text-muted mb-1">
            {bankLabel} — {bankRows.length} צ׳קים
          </h3>
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>מס׳ צ׳ק</th>
                  <th>מוטב</th>
                  <th>סכום</th>
                  <th>תאריך</th>
                  <th>מחלקה</th>
                  <th>סטטוס</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {bankRows.map((c) => (
                  <tr key={c.id!}>
                    <td>{c.check_number}</td>
                    <td>{c.payee}</td>
                    <td>{formatCurrency(Number(c.amount))}</td>
                    <td>{c.due_date ? formatDate(c.due_date) : "—"}</td>
                    <td>
                      <DepartmentCell checkId={c.id!} departmentName={c.department_name} allocationsByCheck={allocationsByCheck} />
                    </td>
                    <td>
                      <CheckStatusControls checkId={c.id!} status={c.status ?? "UNPAID"} paymentMethod="CHECK" />
                    </td>
                    <td>
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

type TransferPendingRow = {
  id: string | null;
  payee: string | null;
  amount: number | null;
  due_date: string | null;
  department_id: string | null;
  department_name: string | null;
  bank_name: string | null;
  account_number: string | null;
  notes: string | null;
};

// "העברות שאושרו עם תאריך ועוד לא שולמו" — reads from
// v_transfers_pending_execution; confirming execution captures the
// internal beneficiary, same as the overdue-transfer verification flow.
// Grouped by bank account automatically.
export function TransfersPendingExecutionTable({
  rows,
  departments,
  allocationsByCheck,
}: {
  rows: TransferPendingRow[];
  departments: Department[];
  allocationsByCheck: Map<string, AllocationInfo[]>;
}) {
  const [query, setQuery] = useState("");
  const filtered = rows.filter((r) => matches(query, r.payee));
  const grouped = groupByBank(filtered);

  return (
    <div>
      <SearchBox value={query} onChange={setQuery} placeholder="חיפוש לפי מוטב" />
      {grouped.map(([bankLabel, bankRows]) => (
        <div key={bankLabel} className="mb-4">
          <h3 className="text-sm font-semibold text-muted mb-1">
            {bankLabel} — {bankRows.length} העברות
          </h3>
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>מוטב</th>
                  <th>סכום</th>
                  <th>תאריך</th>
                  <th>מחלקה</th>
                  <th></th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {bankRows.map((c) => (
                  <tr key={c.id!}>
                    <td>{c.payee}</td>
                    <td>{formatCurrency(Number(c.amount))}</td>
                    <td>{c.due_date ? formatDate(c.due_date) : "—"}</td>
                    <td>
                      <DepartmentCell checkId={c.id!} departmentName={c.department_name} allocationsByCheck={allocationsByCheck} />
                    </td>
                    <td>
                      <VerifyTransferButton checkId={c.id!} label="אשר שההעברה בוצעה" captureInternalBeneficiary />
                    </td>
                    <td>
                      <EditDeleteCheckRow
                        checkId={c.id!}
                        payee={c.payee ?? ""}
                        amount={Number(c.amount)}
                        dueDate={c.due_date}
                        checkNumber={null}
                        departmentId={c.department_id}
                        notes={c.notes}
                        paymentMethod="TRANSFER"
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

type OverdueTransferRow = { id: string; payee: string; amount: number; due_date: string; departments: { name: string } | null };

export function OverdueTransfersTable({ rows }: { rows: OverdueTransferRow[] }) {
  const [query, setQuery] = useState("");
  const filtered = rows.filter((r) => matches(query, r.payee));

  return (
    <div className="mb-4 overflow-x-auto">
      <h2 className="font-semibold mb-1">⚠ {rows.length} העברות שטרם אושרו כבוצעו</h2>
      <SearchBox value={query} onChange={setQuery} placeholder="חיפוש לפי מוטב" />
      <table className="data-table">
        <thead>
          <tr>
            <th>מוטב</th>
            <th>סכום</th>
            <th>תאריך</th>
            <th>מחלקה</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((row) => (
            <tr key={row.id}>
              <td>{row.payee}</td>
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
  const filtered = rows.filter((r) => matches(query, r.payee, r.notes, r.check_number));

  return (
    <div>
      <SearchBox value={query} onChange={setQuery} placeholder="חיפוש לפי מוטב / מספר צ׳ק / הערות" />
      <table className="data-table">
        <thead>
          <tr>
            <th>אמצעי</th>
            <th>מס׳ צ׳ק</th>
            <th>מוטב</th>
            <th>סכום</th>
            <th>תאריך פירעון</th>
            <th>חשבון</th>
            <th>מחלקה</th>
            <th>סטטוס</th>
            {isAdmin && <th></th>}
          </tr>
        </thead>
        <tbody>
          {filtered.map((row) => (
            <tr key={row.id}>
              <td>{row.payment_method === "TRANSFER" ? "העברה" : "צ׳ק"}</td>
              <td>{row.check_number ?? "—"}</td>
              <td>
                {row.payee}
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
                {row.skip_department_ledger && <span className="badge bg-background text-muted mr-1">חוץ מהמאזן הפנימי</span>}
              </td>
              <td>
                <CheckStatusControls checkId={row.id} status={row.status} paymentMethod={row.payment_method} />
              </td>
              {isAdmin && (
                <td>
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
                </td>
              )}
            </tr>
          ))}
          {filtered.length === 0 && (
            <tr>
              <td colSpan={isAdmin ? 9 : 8} className="text-center text-muted py-6">
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
};

export function OverdueChecksTable({ rows }: { rows: OverdueCheckRow[] }) {
  const [query, setQuery] = useState("");
  const filtered = rows.filter((r) => matches(query, r.payee, r.check_number));

  return (
    <div className="overflow-x-auto">
      <h2 className="font-semibold mb-1">⚠ {rows.length} צ׳קים שטרם אושרו כנפרעו</h2>
      <SearchBox value={query} onChange={setQuery} placeholder="חיפוש לפי מוטב / מספר צ׳ק" />
      <table className="data-table">
        <thead>
          <tr>
            <th>מוטב</th>
            <th>מס׳ צ׳ק</th>
            <th>סכום</th>
            <th>תאריך</th>
            <th>מחלקה</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((row) => (
            <tr key={row.id}>
              <td>{row.payee}</td>
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
  );
}
