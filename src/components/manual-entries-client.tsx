"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createManualEntryBatch,
  reviewManualEntry,
  type ManualEntryBatchRow,
} from "@/app/(app)/manual-entries/actions";
import { DateInput } from "@/components/date-input";
import { Modal } from "@/components/modal";
import { useSortFilter, SortFilterTh, type ColumnDef } from "@/components/sortable-table";
import type { Tables } from "@/lib/supabase/database.types";

type Department = Tables<"departments">;
type BankAccount = Tables<"bank_accounts">;

type DraftEntryRow = ManualEntryBatchRow & { key: number; error?: string };

let nextEntryKey = 1;

// A top-of-page button that opens the manual-entry form in a modal,
// instead of the form sitting permanently as its own box under the
// report — the form is an occasional action, not something that needs
// to always take up space on the page.
export function NewManualEntryButton({
  departments,
  bankAccounts,
}: {
  departments: Department[];
  bankAccounts: BankAccount[];
}) {
  const [open, setOpen] = useState(false);
  if (departments.length === 0) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold"
      >
        + הכנסה / הוצאה
      </button>
      {open && (
        <Modal onClose={() => setOpen(false)}>
          <div className="p-4">
            <NewManualEntryFormMulti departments={departments} bankAccounts={bankAccounts} onSaved={() => setOpen(false)} />
          </div>
        </Modal>
      )}
    </>
  );
}

function blankEntryRow(departments: Department[]): DraftEntryRow {
  const dept = departments[0];
  return {
    key: nextEntryKey++,
    departmentId: dept?.id ?? "",
    direction: "EXPENSE",
    amount: 0,
    entryDate: "",
    notes: null,
    bankAccountId: dept?.home_bank_account_id ?? "",
  };
}

// Several manual entries at once — each its own amount/direction/
// department/notes — typed in one grid and saved with a single click,
// same pattern as the bulk check/expense-request entry forms elsewhere.
export function NewManualEntryFormMulti({
  departments,
  bankAccounts,
  onSaved,
}: {
  departments: Department[];
  bankAccounts: BankAccount[];
  onSaved?: () => void;
}) {
  const router = useRouter();
  const [rows, setRows] = useState<DraftEntryRow[]>(() => [blankEntryRow(departments)]);
  const [isPending, startTransition] = useTransition();

  function update(key: number, patch: Partial<DraftEntryRow>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  // Picking a department auto-fills its own home bank account — the
  // routine case — but stays editable: choosing a DIFFERENT account is
  // exactly what signals a cross-department transaction, and the database
  // picks that up automatically (no separate "third party" field needed).
  function updateDepartment(key: number, departmentId: string) {
    const dept = departments.find((d) => d.id === departmentId);
    update(key, { departmentId, bankAccountId: dept?.home_bank_account_id ?? "" });
  }

  function addRow() {
    setRows((prev) => [...prev, blankEntryRow(departments)]);
  }

  function removeRow(key: number) {
    setRows((prev) => (prev.length > 1 ? prev.filter((r) => r.key !== key) : prev));
  }

  function saveAll() {
    const savable = rows.filter((r) => r.departmentId && r.bankAccountId && r.amount > 0 && r.entryDate);
    if (savable.length === 0) return;
    startTransition(async () => {
      const { outcomes } = await createManualEntryBatch(
        savable.map(({ key: _key, error: _error, ...rest }) => rest),
      );
      const nextRows: DraftEntryRow[] = [];
      savable.forEach((row, i) => {
        const outcome = outcomes[i];
        if (!outcome.success) nextRows.push({ ...row, error: outcome.reason });
      });
      for (const r of rows) {
        if (!savable.includes(r)) nextRows.push(r);
      }
      const allSaved = nextRows.length === 0;
      setRows(allSaved ? [blankEntryRow(departments)] : nextRows);
      router.refresh();
      if (allSaved) onSaved?.();
    });
  }

  if (departments.length === 0) return null;

  return (
    <div className="card p-4 space-y-3">
      <h2 className="font-semibold">רישום ידני של הכנסה / הוצאה</h2>
      <p className="text-xs text-muted">כל רישום ממתין לאישור מנהל כספים לפני שהוא נכנס לדוחות המחלקה.</p>
      <div className="overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>מחלקה</th>
              <th>סוג</th>
              <th>סכום</th>
              <th>תאריך</th>
              <th>הערות</th>
              <th>חשבון בנק</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const selectedBankAccount = bankAccounts.find((b) => b.id === row.bankAccountId);
              const isCrossDepartment = Boolean(
                row.departmentId && selectedBankAccount && selectedBankAccount.department_id !== row.departmentId,
              );
              return (
                <tr key={row.key}>
                  <td>
                    <select
                      value={row.departmentId}
                      onChange={(e) => updateDepartment(row.key, e.target.value)}
                      className="rounded border border-border bg-transparent px-1 py-1 text-xs"
                    >
                      <option value="">בחר מחלקה...</option>
                      {departments.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <select
                      value={row.direction}
                      onChange={(e) => update(row.key, { direction: e.target.value as "INCOME" | "EXPENSE" })}
                      className="rounded border border-border bg-transparent px-1 py-1 text-xs"
                    >
                      <option value="EXPENSE">הוצאה</option>
                      <option value="INCOME">הכנסה</option>
                    </select>
                  </td>
                  <td>
                    <input
                      type="number"
                      value={row.amount || ""}
                      onChange={(e) => update(row.key, { amount: Number(e.target.value) || 0 })}
                      className="w-20 rounded border border-border bg-transparent px-1 py-1 text-xs"
                    />
                  </td>
                  <td>
                    <DateInput
                      value={row.entryDate}
                      onChange={(v) => update(row.key, { entryDate: v })}
                      className="rounded border border-border bg-transparent px-1 py-1 text-xs"
                    />
                  </td>
                  <td>
                    <input
                      value={row.notes ?? ""}
                      onChange={(e) => update(row.key, { notes: e.target.value || null })}
                      placeholder="הערות ופירוט"
                      className="w-28 rounded border border-border bg-transparent px-1 py-1 text-xs"
                    />
                  </td>
                  <td>
                    <select
                      value={row.bankAccountId}
                      onChange={(e) => update(row.key, { bankAccountId: e.target.value })}
                      className="rounded border border-border bg-transparent px-1 py-1 text-xs"
                      title="ברירת המחדל היא חשבון הבית של המחלקה. שינוי לחשבון של מחלקה אחרת נרשם אוטומטית כחוב בין המחלקות."
                    >
                      <option value="">חשבון בנק...</option>
                      {bankAccounts.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.bank_name} ({b.account_number})
                        </option>
                      ))}
                    </select>
                    {isCrossDepartment && (
                      <p className="text-xs text-muted">חוב בין מחלקות אוטומטי</p>
                    )}
                  </td>
                  <td>
                    <button
                      type="button"
                      onClick={() => removeRow(row.key)}
                      disabled={rows.length === 1}
                      className="text-xs text-danger disabled:opacity-30"
                    >
                      ✕
                    </button>
                    {row.error && <p className="text-xs text-danger">{row.error}</p>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-2">
        <button type="button" onClick={addRow} className="text-xs text-primary underline">
          + שורה
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={saveAll}
          className="rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold disabled:opacity-50"
        >
          {isPending ? "שומר…" : "שמור הכל"}
        </button>
      </div>
    </div>
  );
}

export type PendingManualEntry = {
  id: string;
  departmentName: string;
  direction: string;
  amount: number;
  entryDate: string | null;
  notes: string | null;
  bankAccountLabel: string | null;
};

export function PendingManualEntriesTable({ entries }: { entries: PendingManualEntry[] }) {
  const columns: ColumnDef<PendingManualEntry>[] = [
    { key: "date", label: "תאריך", sortValue: (e) => e.entryDate ?? "" },
    { key: "department", label: "מחלקה", sortValue: (e) => e.departmentName, filterValue: (e) => e.departmentName },
    {
      key: "direction",
      label: "סוג",
      sortValue: (e) => (e.direction === "INCOME" ? 0 : 1),
      filterValue: (e) => (e.direction === "INCOME" ? "הכנסה" : "הוצאה"),
    },
    { key: "amount", label: "סכום", sortValue: (e) => e.amount },
    { key: "bank", label: "חשבון בנק", sortValue: (e) => e.bankAccountLabel ?? "" },
    { key: "notes", label: "הערות", sortValue: (e) => e.notes ?? "" },
  ];
  const { rows: sorted, sort, toggleSort, filters, setColumnFilter } = useSortFilter(entries, columns);

  return (
    <table className="data-table">
      <thead>
        <tr>
          {columns.map((col) => (
            <SortFilterTh
              key={col.key}
              col={col}
              allRows={entries}
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
        {sorted.map((e) => (
          <ManualEntryApprovalRow
            key={e.id}
            entryId={e.id}
            departmentName={e.departmentName}
            direction={e.direction}
            amount={e.amount}
            entryDate={e.entryDate}
            notes={e.notes}
            bankAccountLabel={e.bankAccountLabel}
          />
        ))}
      </tbody>
    </table>
  );
}

export function ManualEntryApprovalRow({
  entryId,
  departmentName,
  direction,
  amount,
  entryDate,
  notes,
  bankAccountLabel = null,
}: {
  entryId: string;
  departmentName: string;
  direction: string;
  amount: number;
  entryDate: string | null;
  notes: string | null;
  bankAccountLabel?: string | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function decide(decision: "APPROVED" | "REJECTED") {
    startTransition(async () => {
      await reviewManualEntry(entryId, decision);
      router.refresh();
    });
  }

  return (
    <tr>
      <td>{entryDate ?? "—"}</td>
      <td>{departmentName}</td>
      <td>{direction === "INCOME" ? "הכנסה" : "הוצאה"}</td>
      <td>{amount}</td>
      <td className="text-xs text-muted">{bankAccountLabel ?? "—"}</td>
      <td>{notes ?? "—"}</td>
      <td>
        <div className="flex items-center gap-2">
          <button
            disabled={isPending}
            onClick={() => decide("APPROVED")}
            className="rounded bg-primary text-primary-foreground text-xs px-3 py-1 disabled:opacity-50"
          >
            אשר
          </button>
          <button
            disabled={isPending}
            onClick={() => decide("REJECTED")}
            className="text-xs text-danger underline"
          >
            דחה
          </button>
        </div>
      </td>
    </tr>
  );
}
