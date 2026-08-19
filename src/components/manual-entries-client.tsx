"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createManualEntry, reviewManualEntry } from "@/app/(app)/manual-entries/actions";
import { DateInput } from "@/components/date-input";
import { Modal } from "@/components/modal";
import { useSortFilter, SortFilterTh, type ColumnDef } from "@/components/sortable-table";
import type { Tables } from "@/lib/supabase/database.types";

type Department = Tables<"departments">;
type BankAccount = Tables<"bank_accounts">;

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
            <NewManualEntryForm departments={departments} bankAccounts={bankAccounts} onSaved={() => setOpen(false)} />
          </div>
        </Modal>
      )}
    </>
  );
}

export function NewManualEntryForm({
  departments,
  bankAccounts,
  onSaved,
}: {
  departments: Department[];
  bankAccounts: BankAccount[];
  onSaved?: () => void;
}) {
  const router = useRouter();
  const [departmentId, setDepartmentId] = useState("");
  const [direction, setDirection] = useState<"INCOME" | "EXPENSE">("EXPENSE");
  const [amount, setAmount] = useState(0);
  const [entryDate, setEntryDate] = useState("");
  const [notes, setNotes] = useState("");
  const [bankAccountId, setBankAccountId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Picking a department auto-fills its own home bank account — the
  // routine case — but stays editable: choosing a DIFFERENT account is
  // exactly what signals a cross-department transaction, and the database
  // picks that up automatically (no separate "third party" field needed).
  function handleDepartmentChange(id: string) {
    setDepartmentId(id);
    const dept = departments.find((d) => d.id === id);
    if (dept) setBankAccountId(dept.home_bank_account_id);
  }

  const selectedBankAccount = bankAccounts.find((b) => b.id === bankAccountId);
  const selectedDepartment = departments.find((d) => d.id === departmentId);
  const isCrossDepartment = Boolean(
    selectedDepartment && selectedBankAccount && selectedBankAccount.department_id !== selectedDepartment.id,
  );

  function submit() {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await createManualEntry({
        departmentId,
        direction,
        amount,
        entryDate,
        notes: notes || null,
        bankAccountId,
      });
      if (result.error) {
        setError(result.error);
      } else {
        setMessage("נשלח לאישור");
        setAmount(0);
        setEntryDate("");
        setNotes("");
        router.refresh();
        onSaved?.();
      }
    });
  }

  if (departments.length === 0) return null;

  return (
    <div className="card p-4 space-y-3">
      <h2 className="font-semibold">רישום ידני של הכנסה / הוצאה</h2>
      <p className="text-xs text-muted">כל רישום ממתין לאישור מנהל כספים לפני שהוא נכנס לדוחות המחלקה.</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2">
        <select
          value={departmentId}
          onChange={(e) => handleDepartmentChange(e.target.value)}
          className="rounded border border-border bg-transparent px-2 py-1 text-sm"
        >
          <option value="">בחר מחלקה...</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
        <select
          value={direction}
          onChange={(e) => setDirection(e.target.value as "INCOME" | "EXPENSE")}
          className="rounded border border-border bg-transparent px-2 py-1 text-sm"
        >
          <option value="EXPENSE">הוצאה</option>
          <option value="INCOME">הכנסה</option>
        </select>
        <input
          type="number"
          value={amount || ""}
          onChange={(e) => setAmount(Number(e.target.value) || 0)}
          placeholder="סכום"
          className="rounded border border-border bg-transparent px-2 py-1 text-sm"
        />
        <DateInput value={entryDate} onChange={setEntryDate} required />
        <input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="הערות ופירוט"
          className="rounded border border-border bg-transparent px-2 py-1 text-sm"
        />
        <select
          value={bankAccountId}
          onChange={(e) => setBankAccountId(e.target.value)}
          className="rounded border border-border bg-transparent px-2 py-1 text-sm"
          title="ברירת המחדל היא חשבון הבית של המחלקה. שינוי לחשבון של מחלקה אחרת נרשם אוטומטית כחוב בין המחלקות."
        >
          <option value="">חשבון בנק...</option>
          {bankAccounts.map((b) => (
            <option key={b.id} value={b.id}>
              {b.bank_name} ({b.account_number})
            </option>
          ))}
        </select>
      </div>
      {isCrossDepartment && (
        <p className="text-xs text-muted">
          חשבון זה שייך למחלקה אחרת — יירשם אוטומטית חוב בין המחלקות ב&quot;התחשבנות הפנימית&quot;.
        </p>
      )}
      <div className="flex items-center gap-2">
        <button
          disabled={isPending || !departmentId || amount <= 0 || !entryDate || !bankAccountId}
          onClick={submit}
          className="rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold disabled:opacity-50"
        >
          שלח
        </button>
        {error && <span className="text-sm text-danger">{error}</span>}
        {message && <span className="text-sm text-success">{message}</span>}
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
