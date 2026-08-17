"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createCheckBatch,
  createDeptExpenseRequestBatch,
  type BulkCheckRow,
  type BulkExpenseRequestRow,
} from "@/app/(app)/checks/actions";
import { DateInput } from "@/components/date-input";
import { SearchableSelect } from "@/components/searchable-select";
import type { Tables } from "@/lib/supabase/database.types";

type Department = Tables<"departments">;
type BankAccount = Tables<"bank_accounts"> & { departments: { name: string } | null };

type DraftCheckRow = BulkCheckRow & { key: number; error?: string };
type DraftExpenseRow = BulkExpenseRequestRow & { key: number; error?: string };

let nextKey = 1;

// Admin bulk entry: several full checks/transfers-to-issue, typed as rows
// and saved together. Rows that fail stay on screen (tagged with the
// error) instead of blocking the rows that succeeded.
export function BulkCheckEntryForm({
  bankAccounts,
  departments,
}: {
  bankAccounts: BankAccount[];
  departments: Department[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<DraftCheckRow[]>([]);
  const [isPending, startTransition] = useTransition();

  function blankRow(): DraftCheckRow {
    return {
      key: nextKey++,
      paymentMethod: "CHECK",
      bankAccountId: bankAccounts[0]?.id ?? "",
      payee: "",
      amount: 0,
      dueDate: null,
      checkNumber: null,
      departmentId: null,
      notes: null,
    };
  }

  function openForm() {
    setOpen(true);
    if (rows.length === 0) setRows([blankRow(), blankRow(), blankRow()]);
  }

  function update(key: number, patch: Partial<DraftCheckRow>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function addRow() {
    setRows((prev) => [...prev, blankRow()]);
  }

  function removeRow(key: number) {
    setRows((prev) => prev.filter((r) => r.key !== key));
  }

  function saveAll() {
    const savable = rows.filter((r) => r.bankAccountId && r.payee && r.amount > 0 && r.departmentId);
    if (savable.length === 0) return;
    startTransition(async () => {
      const { outcomes } = await createCheckBatch(
        savable.map(({ key: _key, error: _error, ...rest }) => rest),
      );
      const failedKeys = new Set<number>();
      const nextRows: DraftCheckRow[] = [];
      savable.forEach((row, i) => {
        const outcome = outcomes[i];
        if (!outcome.success) {
          failedKeys.add(row.key);
          nextRows.push({ ...row, error: outcome.reason });
        }
      });
      // Keep unsavable rows (missing required fields) untouched, plus any failed ones.
      for (const r of rows) {
        if (!savable.includes(r)) nextRows.push(r);
      }
      setRows(nextRows.length > 0 ? nextRows : [blankRow()]);
      router.refresh();
    });
  }

  if (!open) {
    return (
      <button onClick={openForm} className="rounded-lg border border-border px-4 py-2 text-sm font-semibold">
        + רשימת צ׳קים/העברות ברצף
      </button>
    );
  }

  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">הכנסת רשימת צ׳קים / העברות ברצף</h2>
        <button onClick={() => setOpen(false)} className="text-sm text-muted">
          סגור
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>אמצעי</th>
              <th>חשבון בנק</th>
              <th>מוטב</th>
              <th>סכום</th>
              <th>תאריך</th>
              <th>מס׳ צ׳ק</th>
              <th>מחלקה</th>
              <th>הערות</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key}>
                <td>
                  <select
                    value={row.paymentMethod}
                    onChange={(e) => update(row.key, { paymentMethod: e.target.value as "CHECK" | "TRANSFER" })}
                    className="rounded border border-border bg-transparent px-1 py-1 text-xs"
                  >
                    <option value="CHECK">צ׳ק</option>
                    <option value="TRANSFER">העברה</option>
                  </select>
                </td>
                <td>
                  <SearchableSelect
                    value={row.bankAccountId}
                    onChange={(id) => update(row.key, { bankAccountId: id })}
                    options={bankAccounts.map((b) => ({ id: b.id, label: `${b.departments?.name ?? ""} — ${b.bank_name}` }))}
                    placeholder="בחר..."
                    className="rounded border border-border bg-transparent px-1 py-1 text-xs w-32"
                  />
                </td>
                <td>
                  <input
                    value={row.payee}
                    onChange={(e) => update(row.key, { payee: e.target.value })}
                    list="supplier-names"
                    className="w-28 rounded border border-border bg-transparent px-1 py-1 text-xs"
                  />
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
                    value={row.dueDate ?? ""}
                    onChange={(v) => update(row.key, { dueDate: v || null })}
                    className="rounded border border-border bg-transparent px-1 py-1 text-xs"
                  />
                </td>
                <td>
                  <input
                    value={row.checkNumber ?? ""}
                    onChange={(e) => update(row.key, { checkNumber: e.target.value || null })}
                    className="w-16 rounded border border-border bg-transparent px-1 py-1 text-xs"
                  />
                </td>
                <td>
                  <SearchableSelect
                    value={row.departmentId ?? ""}
                    onChange={(id) => update(row.key, { departmentId: id || null })}
                    options={departments.map((d) => ({ id: d.id, label: d.name }))}
                    placeholder="מחלקה"
                    required
                    className="rounded border border-border bg-transparent px-1 py-1 text-xs w-28"
                  />
                </td>
                <td>
                  <input
                    value={row.notes ?? ""}
                    onChange={(e) => update(row.key, { notes: e.target.value || null })}
                    className="w-24 rounded border border-border bg-transparent px-1 py-1 text-xs"
                  />
                </td>
                <td>
                  <button onClick={() => removeRow(row.key)} className="text-xs text-danger">
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
        <button onClick={addRow} className="text-xs text-primary underline">
          + שורה
        </button>
        <button
          disabled={isPending}
          onClick={saveAll}
          className="rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold disabled:opacity-50"
        >
          שמור הכל
        </button>
      </div>
    </div>
  );
}

// Department-manager bulk entry: several expense requests at once (no
// check number — that's assigned later by finance admin at issuance).
export function BulkExpenseRequestFormMulti({
  departments,
  bankAccounts,
  canSetDates,
}: {
  departments: Department[];
  bankAccounts: BankAccount[];
  canSetDates: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<DraftExpenseRow[]>([]);
  const [isPending, startTransition] = useTransition();

  function blankRow(): DraftExpenseRow {
    return {
      key: nextKey++,
      departmentId: departments[0]?.id ?? "",
      paymentMethod: "CHECK",
      bankAccountId: bankAccounts[0]?.id ?? "",
      payee: "",
      amount: 0,
      dueDate: null,
      notes: null,
    };
  }

  function openForm() {
    setOpen(true);
    if (rows.length === 0) setRows([blankRow(), blankRow(), blankRow()]);
  }

  function update(key: number, patch: Partial<DraftExpenseRow>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function addRow() {
    setRows((prev) => [...prev, blankRow()]);
  }

  function removeRow(key: number) {
    setRows((prev) => prev.filter((r) => r.key !== key));
  }

  function saveAll() {
    const savable = rows.filter((r) => r.departmentId && r.bankAccountId && r.payee && r.amount > 0);
    if (savable.length === 0) return;
    startTransition(async () => {
      const { outcomes } = await createDeptExpenseRequestBatch(
        savable.map(({ key: _key, error: _error, ...rest }) => rest),
      );
      const nextRows: DraftExpenseRow[] = [];
      savable.forEach((row, i) => {
        const outcome = outcomes[i];
        if (!outcome.success) nextRows.push({ ...row, error: outcome.reason });
      });
      for (const r of rows) {
        if (!savable.includes(r)) nextRows.push(r);
      }
      setRows(nextRows.length > 0 ? nextRows : [blankRow()]);
      router.refresh();
    });
  }

  if (!open) {
    return (
      <button onClick={openForm} className="rounded-lg border border-border px-4 py-2 text-sm font-semibold">
        + רשימת דרישות תשלום ברצף
      </button>
    );
  }

  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">הכנסת רשימת דרישות תשלום ברצף</h2>
        <button onClick={() => setOpen(false)} className="text-sm text-muted">
          סגור
        </button>
      </div>
      {departments.length === 1 && <p className="text-xs text-muted">מחלקה: {departments[0].name}</p>}
      <div className="overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              {departments.length > 1 && <th>מחלקה</th>}
              <th>אמצעי</th>
              <th>חשבון בנק</th>
              <th>מוטב</th>
              <th>סכום</th>
              {canSetDates && <th>תאריך</th>}
              <th>הערות</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key}>
                {departments.length > 1 && (
                  <td>
                    <SearchableSelect
                      value={row.departmentId}
                      onChange={(id) => update(row.key, { departmentId: id })}
                      options={departments.map((d) => ({ id: d.id, label: d.name }))}
                      required
                      className="rounded border border-border bg-transparent px-1 py-1 text-xs w-28"
                    />
                  </td>
                )}
                <td>
                  <select
                    value={row.paymentMethod}
                    onChange={(e) => update(row.key, { paymentMethod: e.target.value as "CHECK" | "TRANSFER" })}
                    className="rounded border border-border bg-transparent px-1 py-1 text-xs"
                  >
                    <option value="CHECK">צ׳ק</option>
                    <option value="TRANSFER">העברה</option>
                  </select>
                </td>
                <td>
                  <SearchableSelect
                    value={row.bankAccountId}
                    onChange={(id) => update(row.key, { bankAccountId: id })}
                    options={bankAccounts.map((b) => ({ id: b.id, label: `${b.departments?.name ?? ""} — ${b.bank_name}` }))}
                    placeholder="בחר..."
                    className="rounded border border-border bg-transparent px-1 py-1 text-xs w-32"
                  />
                </td>
                <td>
                  <input
                    value={row.payee}
                    onChange={(e) => update(row.key, { payee: e.target.value })}
                    list="supplier-names"
                    className="w-28 rounded border border-border bg-transparent px-1 py-1 text-xs"
                  />
                </td>
                <td>
                  <input
                    type="number"
                    value={row.amount || ""}
                    onChange={(e) => update(row.key, { amount: Number(e.target.value) || 0 })}
                    className="w-20 rounded border border-border bg-transparent px-1 py-1 text-xs"
                  />
                </td>
                {canSetDates && (
                  <td>
                    <DateInput
                      value={row.dueDate ?? ""}
                      onChange={(v) => update(row.key, { dueDate: v || null })}
                      className="rounded border border-border bg-transparent px-1 py-1 text-xs"
                    />
                  </td>
                )}
                <td>
                  <input
                    value={row.notes ?? ""}
                    onChange={(e) => update(row.key, { notes: e.target.value || null })}
                    className="w-24 rounded border border-border bg-transparent px-1 py-1 text-xs"
                  />
                </td>
                <td>
                  <button onClick={() => removeRow(row.key)} className="text-xs text-danger">
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
        <button onClick={addRow} className="text-xs text-primary underline">
          + שורה
        </button>
        <button
          disabled={isPending}
          onClick={saveAll}
          className="rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold disabled:opacity-50"
        >
          שמור הכל
        </button>
      </div>
    </div>
  );
}
