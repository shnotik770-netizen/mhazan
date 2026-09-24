"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createPettyCashEntryBatch,
  deletePettyCashEntry,
  reviewPettyCashEntry,
  settlePettyCashEntries,
  type PettyCashEntryBatchRow,
} from "@/app/(app)/checks/petty-cash-actions";
import type { CheckAllocationInput } from "@/app/(app)/checks/actions";
import { DateInput } from "@/components/date-input";
import { Modal } from "@/components/modal";
import { SearchableSelect } from "@/components/searchable-select";
import { SplitAllocationEditor } from "@/components/split-allocation-editor";
import { formatCurrency, formatDate, todayIso } from "@/lib/format";
import type { Tables } from "@/lib/supabase/database.types";

type Department = { id: string; name: string };
type BankAccount = Tables<"bank_accounts">;
type CategoryOption = { id: string; name: string };

type DraftRow = PettyCashEntryBatchRow & { key: number; error?: string };

let nextRowKey = 1;

function blankRow(departments: Department[]): DraftRow {
  return {
    key: nextRowKey++,
    supplierName: "",
    invoiceNumber: "",
    amount: 0,
    entryDate: todayIso(),
    departmentId: departments[0]?.id ?? "",
    allocations: [],
    categoryId: null,
    paidBy: null,
    notes: null,
  };
}

// Logging one invoice at a time in a repeatable grid, same pattern as the
// manual-entry / bulk-expense-request grids elsewhere — "+ שורה" adds
// another, one submit saves them all, and a row that fails stays on screen
// with its own error instead of losing the whole batch.
function NewPettyCashEntryFormMulti({
  departments,
  categories,
  supplierNames,
  paidByNames,
  isAdmin,
  onClose,
}: {
  departments: Department[];
  categories: CategoryOption[];
  supplierNames: string[];
  paidByNames: string[];
  isAdmin: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [rows, setRows] = useState<DraftRow[]>(() => [blankRow(departments)]);
  const [isPending, startTransition] = useTransition();

  function update(key: number, patch: Partial<DraftRow>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function toggleSplit(key: number, on: boolean) {
    update(key, on ? { departmentId: null, allocations: [{ departmentId: "", amount: 0 }] } : { departmentId: departments[0]?.id ?? "", allocations: [] });
  }

  function addRow() {
    setRows((prev) => [...prev, blankRow(departments)]);
  }

  function removeRow(key: number) {
    setRows((prev) => (prev.length > 1 ? prev.filter((r) => r.key !== key) : prev));
  }

  function saveAll() {
    const savable = rows.filter(
      (r) =>
        r.supplierName.trim() &&
        r.invoiceNumber.trim() &&
        r.amount > 0 &&
        r.entryDate &&
        (r.departmentId || r.allocations.some((a) => a.departmentId && a.amount > 0)),
    );
    if (savable.length === 0) return;
    startTransition(async () => {
      const { outcomes } = await createPettyCashEntryBatch(savable.map(({ key: _key, error: _error, ...rest }) => rest));
      const nextRows: DraftRow[] = [];
      savable.forEach((row, i) => {
        const outcome = outcomes[i];
        if (!outcome.success) nextRows.push({ ...row, error: outcome.reason });
      });
      for (const r of rows) {
        if (!savable.includes(r)) nextRows.push(r);
      }
      const allSaved = nextRows.length === 0;
      setRows(allSaved ? [blankRow(departments)] : nextRows);
      router.refresh();
    });
  }

  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">חשבוניות קופה קטנה חדשות</h3>
        <button type="button" onClick={onClose} className="text-sm text-muted">
          סגור
        </button>
      </div>
      <p className="text-xs text-muted">
        כל חשבונית נרשמת בנפרד עם שם הספק והמספר שלה.
        {!isAdmin && " כל חשבונית ממתינה לאישור מנהל כספים לפני שהיא נכנסת לדוח המחלקה."}
      </p>
      <datalist id="petty-cash-supplier-names">
        {supplierNames.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>
      <datalist id="petty-cash-paid-by-names">
        {paidByNames.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>
      <div className="overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>ספק</th>
              <th>מס׳ חשבונית</th>
              <th>סכום</th>
              <th>תאריך</th>
              <th>מחלקה</th>
              <th>קטגוריה</th>
              <th>מי שילם</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const isSplit = row.departmentId === null;
              return (
                <tr key={row.key}>
                  <td>
                    <input
                      list="petty-cash-supplier-names"
                      value={row.supplierName}
                      onChange={(e) => update(row.key, { supplierName: e.target.value })}
                      placeholder="שם ספק"
                      className="w-28 rounded border border-border bg-transparent px-1 py-1 text-xs"
                    />
                  </td>
                  <td>
                    <input
                      value={row.invoiceNumber}
                      onChange={(e) => update(row.key, { invoiceNumber: e.target.value })}
                      placeholder="מס׳ חשבונית"
                      className="w-24 rounded border border-border bg-transparent px-1 py-1 text-xs"
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
                      value={row.entryDate}
                      onChange={(v) => update(row.key, { entryDate: v })}
                      className="rounded border border-border bg-transparent px-1 py-1 text-xs"
                    />
                  </td>
                  <td>
                    {isSplit ? (
                      <SplitAllocationEditor
                        departments={departments}
                        totalAmount={row.amount}
                        allocations={row.allocations as CheckAllocationInput[]}
                        onChange={(allocations) => update(row.key, { allocations })}
                      />
                    ) : (
                      <SearchableSelect
                        value={row.departmentId ?? ""}
                        onChange={(id) => update(row.key, { departmentId: id })}
                        options={departments.map((d) => ({ id: d.id, label: d.name }))}
                        placeholder="בחר מחלקה..."
                        className="rounded border border-border bg-transparent px-1 py-1 text-xs"
                      />
                    )}
                    {isAdmin && (
                      <label className="flex items-center gap-1 text-xs text-muted mt-1">
                        <input type="checkbox" checked={isSplit} onChange={(e) => toggleSplit(row.key, e.target.checked)} />
                        פיצול
                      </label>
                    )}
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
                      list="petty-cash-paid-by-names"
                      value={row.paidBy ?? ""}
                      onChange={(e) => update(row.key, { paidBy: e.target.value || null })}
                      placeholder="לא חובה"
                      className="w-24 rounded border border-border bg-transparent px-1 py-1 text-xs"
                    />
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

// Toggles between the "+ קופה קטנה" trigger and the full inline grid, in
// the very same spot on the page — same pattern as BulkExpenseRequestFormMulti
// ("+ רשימת דרישות תשלום ברצף"). Deliberately NOT a Modal: a modal's
// max-width constrains the grid's many columns to a much narrower box than
// the page itself, which is exactly the "letters don't fit" scrolling
// people usually associate with a payment-request grid working properly —
// here on the full page width, the grid's own overflow-x-auto only ever
// needs to kick in on a genuinely narrow (mobile) screen, same as every
// other bulk-entry grid in this app.
export function PettyCashEntryButton({
  departments,
  categories,
  supplierNames,
  paidByNames,
  isAdmin,
}: {
  departments: Department[];
  categories: CategoryOption[];
  supplierNames: string[];
  paidByNames: string[];
  isAdmin: boolean;
}) {
  const [open, setOpen] = useState(false);
  if (departments.length === 0) return null;
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg border border-border px-4 py-2 text-sm font-semibold hover:bg-background"
      >
        + קופה קטנה
      </button>
    );
  }
  return (
    <NewPettyCashEntryFormMulti
      departments={departments}
      categories={categories}
      supplierNames={supplierNames}
      paidByNames={paidByNames}
      isAdmin={isAdmin}
      onClose={() => setOpen(false)}
    />
  );
}

export type PettyCashEntryRow = {
  id: string;
  supplierName: string;
  invoiceNumber: string;
  amount: number;
  entryDate: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  departmentName: string | null;
  allocations: { departmentName: string | null; amount: number }[];
  categoryName: string | null;
  paidBy: string | null;
  notes: string | null;
};

function EntryDepartments({ entry }: { entry: PettyCashEntryRow }) {
  if (entry.departmentName) return <>{entry.departmentName}</>;
  if (entry.allocations.length > 0) {
    return <>{entry.allocations.map((a) => `${a.departmentName ?? "—"} (${formatCurrency(a.amount)})`).join(", ")}</>;
  }
  return <>—</>;
}

// A small settlement form: pick how the batch actually went out (bank
// account, check vs transfer, check number if relevant) and pay the whole
// selection as one real check/transfer.
function SettlementModal({
  entryIds,
  totalAmount,
  bankAccounts,
  onClose,
}: {
  entryIds: string[];
  totalAmount: number;
  bankAccounts: BankAccount[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [paymentMethod, setPaymentMethod] = useState<"CHECK" | "TRANSFER">("TRANSFER");
  const [bankAccountId, setBankAccountId] = useState(bankAccounts[0]?.id ?? "");
  const [checkNumber, setCheckNumber] = useState("");
  const [dueDate, setDueDate] = useState(todayIso());
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await settlePettyCashEntries(entryIds, {
        paymentMethod,
        bankAccountId,
        checkNumber: paymentMethod === "CHECK" ? checkNumber || null : null,
        dueDate,
        notes: notes || null,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
      onClose();
    });
  }

  return (
    <Modal onClose={onClose}>
      <div className="card p-4 space-y-3 max-w-md">
        <h3 className="font-semibold">סימון {entryIds.length} חשבוניות כשולמו בצ׳ק/העברה אחת</h3>
        <p className="text-sm text-muted">סכום כולל: {formatCurrency(totalAmount)}</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-sm text-muted mb-1">אמצעי תשלום</label>
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value as "CHECK" | "TRANSFER")}
              className="w-full rounded-lg border border-border bg-transparent px-3 py-2 text-sm"
            >
              <option value="TRANSFER">העברה</option>
              <option value="CHECK">צ׳ק</option>
            </select>
          </div>
          <div>
            <label className="block text-sm text-muted mb-1">חשבון בנק</label>
            <select
              value={bankAccountId}
              onChange={(e) => setBankAccountId(e.target.value)}
              className="w-full rounded-lg border border-border bg-transparent px-3 py-2 text-sm"
            >
              {bankAccounts.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.bank_name} ({b.account_number})
                </option>
              ))}
            </select>
          </div>
          {paymentMethod === "CHECK" && (
            <div>
              <label className="block text-sm text-muted mb-1">מס׳ צ׳ק</label>
              <input
                value={checkNumber}
                onChange={(e) => setCheckNumber(e.target.value)}
                className="w-full rounded-lg border border-border bg-transparent px-3 py-2 text-sm"
              />
            </div>
          )}
          <div>
            <label className="block text-sm text-muted mb-1">תאריך</label>
            <DateInput value={dueDate} onChange={setDueDate} className="w-full rounded-lg border border-border bg-transparent px-3 py-2 text-sm" />
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
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={isPending || !bankAccountId}
            onClick={submit}
            className="rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold disabled:opacity-50"
          >
            {isPending ? "מבצע…" : "אשר תשלום"}
          </button>
          <button type="button" onClick={onClose} className="rounded-lg border border-border px-3 py-1.5 text-sm">
            ביטול
          </button>
        </div>
      </div>
    </Modal>
  );
}

// The actionable queue: entries still awaiting approval or payment. Once an
// entry is settled (paid via a batch) it drops off this list — its own
// department report keeps showing it, tagged "קופה קטנה", which is where
// its history lives from then on, same as any other paid check.
export function PettyCashSection({
  entries,
  bankAccounts,
  isAdmin,
}: {
  entries: PettyCashEntryRow[];
  bankAccounts: BankAccount[];
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [settling, setSettling] = useState(false);
  const [isPending, startTransition] = useTransition();

  const pending = entries.filter((e) => e.status === "PENDING");
  const approved = entries.filter((e) => e.status === "APPROVED");
  const selectedEntries = approved.filter((e) => selected.has(e.id));
  const selectedTotal = selectedEntries.reduce((sum, e) => sum + e.amount, 0);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function review(id: string, decision: "APPROVED" | "REJECTED") {
    startTransition(async () => {
      await reviewPettyCashEntry(id, decision);
      router.refresh();
    });
  }

  function remove(id: string) {
    startTransition(async () => {
      await deletePettyCashEntry(id);
      router.refresh();
    });
  }

  return (
    <div className="card p-4 space-y-4">
      <h2 className="font-semibold">קופה קטנה — חשבוניות ממתינות</h2>
      {entries.length === 0 && (
        <p className="text-sm text-muted">
          אין כרגע חשבוניות קופה קטנה ממתינות. אחרי שמוסיפים חשבונית (למעלה) ומאשרים אותה, היא תופיע כאן — כאן גם מסמנים חשבוניות מאושרות ומשלמים אותן כצ׳ק/העברה אחת.
        </p>
      )}

      {pending.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-warning">ממתינות לאישור מנהל כספים</h3>
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>תאריך</th>
                  <th>ספק</th>
                  <th>מס׳ חשבונית</th>
                  <th>סכום</th>
                  <th>מחלקה</th>
                  <th>קטגוריה</th>
                  <th>מי שילם</th>
                  {isAdmin && <th></th>}
                </tr>
              </thead>
              <tbody>
                {pending.map((e) => (
                  <tr key={e.id}>
                    <td>{formatDate(e.entryDate)}</td>
                    <td>{e.supplierName}</td>
                    <td>{e.invoiceNumber}</td>
                    <td>{formatCurrency(e.amount)}</td>
                    <td>
                      <EntryDepartments entry={e} />
                    </td>
                    <td>{e.categoryName ?? "—"}</td>
                    <td>{e.paidBy ?? "—"}</td>
                    {isAdmin && (
                      <td className="flex items-center gap-2">
                        <button type="button" disabled={isPending} onClick={() => review(e.id, "APPROVED")} className="text-xs text-success underline">
                          אשר
                        </button>
                        <button type="button" disabled={isPending} onClick={() => review(e.id, "REJECTED")} className="text-xs text-danger underline">
                          דחה
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {approved.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">מאושרות, טרם שולמו</h3>
          {isAdmin && (
            <p className="text-xs text-muted">
              יש לסמן חשבוניות (אפשר ממחלקות/ספקים שונים) ולשלם אותן כצ׳ק/העברה אחת — הדוח של כל מחלקה ימשיך להראות כל חשבונית בנפרד.
            </p>
          )}
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  {isAdmin && <th></th>}
                  <th>תאריך</th>
                  <th>ספק</th>
                  <th>מס׳ חשבונית</th>
                  <th>סכום</th>
                  <th>מחלקה</th>
                  <th>קטגוריה</th>
                  <th>מי שילם</th>
                  {isAdmin && <th></th>}
                </tr>
              </thead>
              <tbody>
                {approved.map((e) => (
                  <tr key={e.id}>
                    {isAdmin && (
                      <td>
                        <input type="checkbox" checked={selected.has(e.id)} onChange={() => toggle(e.id)} />
                      </td>
                    )}
                    <td>{formatDate(e.entryDate)}</td>
                    <td>{e.supplierName}</td>
                    <td>{e.invoiceNumber}</td>
                    <td>{formatCurrency(e.amount)}</td>
                    <td>
                      <EntryDepartments entry={e} />
                    </td>
                    <td>{e.categoryName ?? "—"}</td>
                    <td>{e.paidBy ?? "—"}</td>
                    {isAdmin && (
                      <td>
                        <button type="button" disabled={isPending} onClick={() => remove(e.id)} className="text-xs text-danger underline">
                          מחק
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {isAdmin && selected.size > 0 && (
            <button
              type="button"
              onClick={() => setSettling(true)}
              className="rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold"
            >
              סמן {selected.size} חשבוניות כשולמו ({formatCurrency(selectedTotal)}) בצ׳ק/העברה אחת
            </button>
          )}
        </div>
      )}

      {settling && (
        <SettlementModal
          entryIds={[...selected]}
          totalAmount={selectedTotal}
          bankAccounts={bankAccounts}
          onClose={() => {
            setSettling(false);
            setSelected(new Set());
          }}
        />
      )}
    </div>
  );
}
