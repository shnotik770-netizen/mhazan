"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createInterDepartmentTransferBatch,
  createManualEntryBatch,
  reviewManualEntry,
  type InterDepartmentTransferBatchRow,
  type ManualEntryBatchRow,
} from "@/app/(app)/manual-entries/actions";
import { DateInput } from "@/components/date-input";
import { Modal } from "@/components/modal";
import { SearchableSelect } from "@/components/searchable-select";
import { PasteManualEntriesFormInner } from "@/components/paste-manual-entries-form";
import { useSortFilter, SortFilterTh, type ColumnDef } from "@/components/sortable-table";
import type { Tables } from "@/lib/supabase/database.types";

type Department = Tables<"departments">;
type BankAccount = Tables<"bank_accounts">;
type CategoryOption = { id: string; name: string };

type DraftEntryRow = ManualEntryBatchRow & { key: number; error?: string };

let nextEntryKey = 1;

// A top-of-page button that opens the manual-entry form in a modal,
// instead of the form sitting permanently as its own box under the
// report — the form is an occasional action, not something that needs
// to always take up space on the page. A second trigger right beside it
// opens the same modal in "paste a list" mode — folded in here, instead of
// living as its own separate button somewhere else, so every place this
// component already appears (dashboard, department report, quick actions)
// automatically gets bulk-paste too instead of it only being reachable
// from Settings.
export function NewManualEntryButton({
  departments,
  bankAccounts,
  categories,
  isAdmin = false,
  open: controlledOpen,
  onOpenChange,
  hideTrigger = false,
  initialMode = "manual",
}: {
  departments: Department[];
  bankAccounts: BankAccount[];
  categories: CategoryOption[];
  // Only a finance admin may record a transfer between two OTHER
  // departments' debt — this gates the "העברה בין מחלקות" toggle inside the
  // grid (same permission boundary the old standalone transfer button had).
  isAdmin?: boolean;
  // Uncontrolled by default (renders its own trigger button). Passing
  // `open`/`onOpenChange` lets an external trigger (the quick-actions FAB)
  // drive it instead, with `hideTrigger` suppressing the built-in button —
  // same convention as UnifiedCheckForm.
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  hideTrigger?: boolean;
  // Lets an external trigger that only wants the paste flow, or that wants
  // to land straight in inter-department-transfer mode (a dedicated quick
  // action), open straight into it instead of always landing on the plain
  // manual grid first — only meaningful together with hideTrigger, since
  // the built-in trigger buttons always set the mode explicitly themselves.
  initialMode?: "manual" | "paste" | "transfer";
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [mode, setMode] = useState<"manual" | "paste" | "transfer">(initialMode);
  const open = controlledOpen ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;
  if (departments.length === 0) return null;
  return (
    <>
      {!hideTrigger && (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setMode("manual");
              setOpen(true);
            }}
            className="rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold"
          >
            + הכנסה / הוצאה
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("paste");
              setOpen(true);
            }}
            className="rounded-lg border border-border px-4 py-2 text-sm font-semibold hover:bg-background"
          >
            הדבקת רשימה
          </button>
        </div>
      )}
      {open && (
        <Modal onClose={() => setOpen(false)}>
          <div className="p-4">
            {mode === "paste" ? (
              <PasteManualEntriesFormInner
                departments={departments}
                bankAccounts={bankAccounts}
                categories={categories}
                onClose={() => setOpen(false)}
              />
            ) : (
              <NewManualEntryFormMulti
                departments={departments}
                bankAccounts={bankAccounts}
                categories={categories}
                isAdmin={isAdmin}
                initialFormMode={mode === "transfer" ? "transfer" : "entries"}
                onSaved={() => setOpen(false)}
              />
            )}
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
    categoryId: null,
  };
}

type DraftTransferRow = InterDepartmentTransferBatchRow & { key: number; error?: string };

let nextTransferKey = 1;

function blankTransferRow(): DraftTransferRow {
  return { key: nextTransferKey++, debtorDepartmentId: "", creditorDepartmentId: "", amount: 0, entryDate: "", notes: null };
}

// Several manual entries at once — each its own amount/direction/
// department/category/notes — typed in one grid and saved with a single
// click, same pattern as the bulk check/expense-request entry forms
// elsewhere. A single entry is simply this same grid with one row.
//
// A finance admin can also toggle the whole grid into "העברה בין מחלקות"
// mode — recording that one department owes another (e.g. "חבד לנוער
// חייבת 800 ₪ לבית הספר") is conceptually a different shape of row
// (debtor/creditor department pair instead of one department + bank
// account), so it swaps the columns rather than trying to force it into
// the same row shape. This used to be a wholly separate button/screen
// limited to one transfer at a time; folding it in here as a toggle
// avoids a second, mostly-redundant entry point while also picking up
// the multi-row grid for free.
export function NewManualEntryFormMulti({
  departments,
  bankAccounts,
  categories,
  isAdmin = false,
  initialFormMode = "entries",
  onSaved,
}: {
  departments: Department[];
  bankAccounts: BankAccount[];
  categories: CategoryOption[];
  isAdmin?: boolean;
  initialFormMode?: "entries" | "transfer";
  onSaved?: () => void;
}) {
  const router = useRouter();
  const [formMode, setFormMode] = useState<"entries" | "transfer">(initialFormMode);
  const [rows, setRows] = useState<DraftEntryRow[]>(() => [blankEntryRow(departments)]);
  const [transferRows, setTransferRows] = useState<DraftTransferRow[]>(() => [blankTransferRow()]);
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

  function updateTransfer(key: number, patch: Partial<DraftTransferRow>) {
    setTransferRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function addTransferRow() {
    setTransferRows((prev) => [...prev, blankTransferRow()]);
  }

  function removeTransferRow(key: number) {
    setTransferRows((prev) => (prev.length > 1 ? prev.filter((r) => r.key !== key) : prev));
  }

  function saveAllTransfers() {
    const savable = transferRows.filter(
      (r) => r.debtorDepartmentId && r.creditorDepartmentId && r.debtorDepartmentId !== r.creditorDepartmentId && r.amount > 0 && r.entryDate,
    );
    if (savable.length === 0) return;
    startTransition(async () => {
      const { outcomes } = await createInterDepartmentTransferBatch(
        savable.map(({ key: _key, error: _error, ...rest }) => rest),
      );
      const nextRows: DraftTransferRow[] = [];
      savable.forEach((row, i) => {
        const outcome = outcomes[i];
        if (!outcome.success) nextRows.push({ ...row, error: outcome.reason });
      });
      for (const r of transferRows) {
        if (!savable.includes(r)) nextRows.push(r);
      }
      const allSaved = nextRows.length === 0;
      setTransferRows(allSaved ? [blankTransferRow()] : nextRows);
      router.refresh();
      if (allSaved) onSaved?.();
    });
  }

  if (departments.length === 0) return null;

  const canTransfer = isAdmin && departments.length >= 2;

  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="font-semibold">{formMode === "transfer" ? "העברה בין מחלקות" : "רישום ידני של הכנסה / הוצאה"}</h2>
        {canTransfer && (
          <div className="flex items-center gap-1 rounded-lg border border-border p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setFormMode("entries")}
              className={`rounded px-2 py-1 ${formMode === "entries" ? "bg-primary text-primary-foreground" : "text-muted"}`}
            >
              רישום רגיל
            </button>
            <button
              type="button"
              onClick={() => setFormMode("transfer")}
              className={`rounded px-2 py-1 ${formMode === "transfer" ? "bg-primary text-primary-foreground" : "text-muted"}`}
            >
              העברה בין מחלקות
            </button>
          </div>
        )}
      </div>
      {formMode === "transfer" ? (
        <>
          <p className="text-xs text-muted">
            רישום שמחלקה אחת חייבת לשנייה. אם לשתי המחלקות אותו חשבון בית — זו הקצאה פנימית בלבד (מינוס לחייבת, פלוס
            לזכאית, בלי תנועת בנק אמיתית). אם החשבונות שונים, נרשמת הוצאה לחייבת דרך חשבון הבנק של הזכאית, וחוב בין
            המחלקות נוצר אוטומטית ב&quot;התחשבנות הפנימית&quot;.
          </p>
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>מחלקה חייבת</th>
                  <th>מחלקה זכאית</th>
                  <th>סכום</th>
                  <th>תאריך</th>
                  <th>הערות</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {transferRows.map((row) => (
                  <tr key={row.key}>
                    <td>
                      <SearchableSelect
                        value={row.debtorDepartmentId}
                        onChange={(id) => updateTransfer(row.key, { debtorDepartmentId: id })}
                        options={departments.map((d) => ({ id: d.id, label: d.name }))}
                        placeholder="בחר מחלקה..."
                        className="rounded border border-border bg-transparent px-1 py-1 text-xs"
                      />
                    </td>
                    <td>
                      <SearchableSelect
                        value={row.creditorDepartmentId}
                        onChange={(id) => updateTransfer(row.key, { creditorDepartmentId: id })}
                        options={departments.map((d) => ({ id: d.id, label: d.name }))}
                        placeholder="בחר מחלקה..."
                        className="rounded border border-border bg-transparent px-1 py-1 text-xs"
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        value={row.amount || ""}
                        onChange={(e) => updateTransfer(row.key, { amount: Number(e.target.value) || 0 })}
                        className="w-20 rounded border border-border bg-transparent px-1 py-1 text-xs"
                      />
                    </td>
                    <td>
                      <DateInput
                        value={row.entryDate}
                        onChange={(v) => updateTransfer(row.key, { entryDate: v })}
                        className="rounded border border-border bg-transparent px-1 py-1 text-xs"
                      />
                    </td>
                    <td>
                      <input
                        value={row.notes ?? ""}
                        onChange={(e) => updateTransfer(row.key, { notes: e.target.value || null })}
                        placeholder="הערות"
                        className="w-28 rounded border border-border bg-transparent px-1 py-1 text-xs"
                      />
                    </td>
                    <td>
                      <button
                        type="button"
                        onClick={() => removeTransferRow(row.key)}
                        disabled={transferRows.length === 1}
                        className="text-xs text-danger disabled:opacity-30"
                      >
                        ✕
                      </button>
                      {row.error && <p className="text-xs text-danger">{row.error}</p>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={addTransferRow} className="text-xs text-primary underline">
              + שורה
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={saveAllTransfers}
              className="rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold disabled:opacity-50"
            >
              {isPending ? "שומר…" : "שמור הכל"}
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="text-xs text-muted">כל רישום ממתין לאישור מנהל כספים לפני שהוא נכנס לדוחות המחלקה.</p>
          <div className="overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>מחלקה</th>
              <th>סוג</th>
              <th>סכום</th>
              <th>תאריך</th>
              <th>קטגוריה</th>
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
                    <SearchableSelect
                      value={row.departmentId ?? ""}
                      onChange={(id) => updateDepartment(row.key, id)}
                      options={departments.map((d) => ({ id: d.id, label: d.name }))}
                      placeholder="בחר מחלקה..."
                      className="rounded border border-border bg-transparent px-1 py-1 text-xs"
                    />
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
                    <SearchableSelect
                      value={row.categoryId ?? ""}
                      onChange={(id) => update(row.key, { categoryId: id || null })}
                      options={categories.map((c) => ({ id: c.id, label: c.name }))}
                      placeholder="ללא קטגוריה"
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
        </>
      )}
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
