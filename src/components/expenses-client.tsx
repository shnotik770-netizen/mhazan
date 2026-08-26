"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatCurrency, formatDate } from "@/lib/format";
import { SearchableSelect } from "@/components/searchable-select";
import { SplitAllocationEditor } from "@/components/split-allocation-editor";
import { DateInput } from "@/components/date-input";
import { Modal } from "@/components/modal";
import { CheckDetailLink, PayeeLink } from "@/components/check-detail-client";
import { CancelCheckButton } from "@/components/checks-client";
import { RowActionsMenu, rowActionButtonClass } from "@/components/row-actions-menu";
import { useSortFilter, SortFilterTh, type ColumnDef } from "@/components/sortable-table";
import {
  bulkAssignCheckDepartment,
  bulkSetSkipDepartmentLedger,
  updateCheck,
  deleteCheck,
  groupChecksIntoSpread,
  splitSpreadIntoNew,
  splitChecksAcrossDepartments,
  type CheckAllocationInput,
} from "@/app/(app)/checks/actions";
import { updateManualEntry, deleteManualEntry } from "@/app/(app)/manual-entries/actions";

export type ExpenseRow = {
  id: string;
  isCheck: boolean;
  date: string | null;
  source: string;
  description: string;
  payeeName: string;
  notes: string | null;
  amount: number;
  departmentId: string | null;
  departmentName: string | null;
  categoryId: string | null;
  categoryName: string | null;
  bankAccountName: string | null;
  status: string | null;
  checkNumber: string | null;
  paymentMethod: string | null;
  spreadId: string | null;
  isOld: boolean;
  hasInvoice: boolean;
  allocations: { departmentId: string; amount: number }[];
};

export type Option = { id: string; name: string };

const statusLabel = (s: string | null) =>
  s === "CLEARED" ? "נפרע" : s === "APPROVED" ? "מאושר" : s === "CANCELLED" ? "בוטל" : "לא נפרע";

export function ExpensesTable({
  rows,
  departments,
  categories,
  isAdmin,
}: {
  rows: ExpenseRow[];
  departments: Option[];
  categories: Option[];
  isAdmin: boolean;
}) {
  const [query, setQuery] = useState("");
  const [onlyUnclassified, setOnlyUnclassified] = useState(false);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDepartmentId, setBulkDepartmentId] = useState("");
  const [bulkPending, startBulk] = useTransition();
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [groupPending, startGroup] = useTransition();
  const [groupError, setGroupError] = useState<string | null>(null);
  const [oldPending, startOld] = useTransition();
  const [oldError, setOldError] = useState<string | null>(null);
  const [splitOpen, setSplitOpen] = useState(false);
  const [editRow, setEditRow] = useState<ExpenseRow | null>(null);
  const router = useRouter();

  const filtered = rows.filter((r) => {
    if (onlyUnclassified && r.departmentName) return false;
    if (fromDate && (!r.date || r.date < fromDate)) return false;
    if (toDate && (!r.date || r.date > toDate)) return false;
    if (!query.trim()) return true;
    const q = query.trim().toLowerCase();
    return (
      r.description.toLowerCase().includes(q) ||
      (r.departmentName ?? "").toLowerCase().includes(q) ||
      (r.categoryName ?? "").toLowerCase().includes(q) ||
      (r.bankAccountName ?? "").toLowerCase().includes(q)
    );
  });

  const columns: ColumnDef<ExpenseRow>[] = [
    { key: "source", label: "סוג", sortValue: (r) => r.source, filterValue: (r) => r.source },
    {
      key: "description",
      label: "תיאור",
      sortValue: (r) => (r.isCheck ? r.payeeName : r.description),
      filterValue: (r) => (r.isCheck ? r.payeeName : r.description),
    },
    { key: "amount", label: "סכום", sortValue: (r) => r.amount },
    { key: "date", label: "תאריך", sortValue: (r) => r.date ?? "" },
    { key: "department", label: "מחלקה", sortValue: (r) => r.departmentName ?? "", filterValue: (r) => r.departmentName ?? "בהמתנה" },
    { key: "category", label: "קטגוריה", sortValue: (r) => r.categoryName ?? "", filterValue: (r) => r.categoryName ?? "—" },
    { key: "bankAccount", label: "חשבון בנק", sortValue: (r) => r.bankAccountName ?? "", filterValue: (r) => r.bankAccountName ?? "—" },
    { key: "status", label: "סטטוס", sortValue: (r) => r.status ?? "", filterValue: (r) => statusLabel(r.status) },
  ];
  const { rows: sorted, sort, toggleSort, filters, setColumnFilter } = useSortFilter(filtered, columns);

  // Totalled across every row for that spread_id (not just the currently
  // filtered/sorted view), so the badge always reflects the real total.
  const spreadTotals = new Map<string, number>();
  for (const r of rows) {
    if (!r.spreadId) continue;
    spreadTotals.set(r.spreadId, (spreadTotals.get(r.spreadId) ?? 0) + r.amount);
  }

  const selectableIds = new Set(sorted.filter((r) => r.isCheck).map((r) => r.id));
  const allSelectableSelected = selectableIds.size > 0 && [...selectableIds].every((id) => selected.has(id));

  function toggleRow(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected(allSelectableSelected ? new Set() : new Set(selectableIds));
  }

  const selectedRows = rows.filter((r) => selected.has(r.id));
  const selectedTotal = selectedRows.reduce((sum, r) => sum + r.amount, 0);

  // Several bulk actions below overwrite department/spread assignment that
  // may already exist on the selected rows — surfaces a confirmation naming
  // exactly how many of the selection already carry that state, so admins
  // don't silently clobber existing classification/grouping by mistake.
  function existingStateWarning(): string | null {
    const alreadyClassified = selectedRows.filter((r) => r.departmentName).length;
    const alreadyInSpread = selectedRows.filter((r) => r.spreadId).length;
    if (alreadyClassified === 0 && alreadyInSpread === 0) return null;
    const parts: string[] = [];
    if (alreadyClassified > 0) parts.push(`${alreadyClassified} כבר משויכים למחלקה`);
    if (alreadyInSpread > 0) parts.push(`${alreadyInSpread} כבר חלק מפריסה קיימת`);
    return `שים לב: מתוך ${selectedRows.length} הנבחרים, ${parts.join(" ו-")}. הפעולה תשנה את השיוך הקיים. להמשיך?`;
  }

  function applyBulkDepartment() {
    if (!bulkDepartmentId || selected.size === 0) return;
    const warning = existingStateWarning();
    if (warning && !confirm(warning)) return;
    setBulkError(null);
    startBulk(async () => {
      const result = await bulkAssignCheckDepartment([...selected], bulkDepartmentId);
      if (result.error) {
        setBulkError(result.error);
        return;
      }
      setSelected(new Set());
      setBulkDepartmentId("");
      router.refresh();
    });
  }

  function applyGroup() {
    if (selected.size < 2) return;
    const warning = existingStateWarning();
    if (warning && !confirm(warning)) return;
    setGroupError(null);
    startGroup(async () => {
      const result = await groupChecksIntoSpread([...selected]);
      if (result.error) {
        setGroupError(result.error);
        return;
      }
      setSelected(new Set());
      router.refresh();
    });
  }

  function applyBulkOld(skip: boolean) {
    if (selected.size === 0) return;
    setOldError(null);
    startOld(async () => {
      const result = await bulkSetSkipDepartmentLedger([...selected], skip);
      if (result.error) {
        setOldError(result.error);
        return;
      }
      setSelected(new Set());
      router.refresh();
    });
  }

  function applySplitIntoNewSpread() {
    if (selected.size < 1) return;
    if (
      !confirm(
        "לפרק את הנבחרים לפריסה נפרדת חדשה?\n\n" +
          "פעולה זו בלתי הפיכה: הצ׳קים הנבחרים יעברו לפריסה חדשה ונפרדת מהפריסה הקיימת. " +
          "שיוך המחלקה יתאפס ל״ממתין לסיווג״ גם על הנבחרים וגם על שאר הצ׳קים שנשארים בפריסה המקורית — יש לסווג מחדש את שתי הפריסות.",
      )
    )
      return;
    setGroupError(null);
    startGroup(async () => {
      const result = await splitSpreadIntoNew([...selected]);
      if (result.error) {
        setGroupError(result.error);
        return;
      }
      setSelected(new Set());
      router.refresh();
    });
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="חיפוש לפי תיאור / ספק / מחלקה / קטגוריה / בנק"
          className="w-full max-w-sm rounded-lg border border-border bg-transparent px-3 py-2 text-sm"
        />
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={onlyUnclassified}
            onChange={(e) => setOnlyUnclassified(e.target.checked)}
          />
          רק ללא מחלקה
        </label>
        <label className="flex items-center gap-2 text-sm text-muted">
          מתאריך
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="rounded-lg border border-border bg-transparent px-2 py-1.5 text-sm"
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-muted">
          עד תאריך
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="rounded-lg border border-border bg-transparent px-2 py-1.5 text-sm"
          />
        </label>
        {(fromDate || toDate) && (
          <button
            type="button"
            onClick={() => {
              setFromDate("");
              setToDate("");
            }}
            className="text-sm text-muted underline"
          >
            נקה תאריכים
          </button>
        )}
      </div>

      {isAdmin && selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-3 rounded-lg border border-border bg-background p-3">
          <span className="text-sm">
            נבחרו <strong>{selected.size}</strong> צ׳קים/העברות — שיוך למחלקה אחת בבת אחת:
          </span>
          <SearchableSelect
            value={bulkDepartmentId}
            onChange={setBulkDepartmentId}
            options={departments.map((d) => ({ id: d.id, label: d.name }))}
            placeholder="בחר מחלקה"
            className="rounded-lg border border-border bg-transparent px-3 py-1.5 text-sm w-48"
          />
          <button
            type="button"
            disabled={!bulkDepartmentId || bulkPending}
            onClick={applyBulkDepartment}
            className="rounded-lg bg-primary text-primary-foreground px-3 py-1.5 text-sm font-semibold disabled:opacity-50"
          >
            {bulkPending ? "מעדכן…" : "עדכן מחלקה לנבחרים"}
          </button>
          <button
            type="button"
            disabled={selected.size < 2 || groupPending}
            onClick={applyGroup}
            className="rounded-lg border border-border px-3 py-1.5 text-sm font-semibold disabled:opacity-50"
            title="מקבץ צ׳קים/העברות לאותו ספק תחת אותה פריסה, מבלי לשנות סכומים"
          >
            {groupPending ? "מקבץ…" : "קבץ כפריסה"}
          </button>
          <button
            type="button"
            disabled={selected.size < 2}
            onClick={() => {
              const warning = existingStateWarning();
              if (warning && !confirm(warning)) return;
              setSplitOpen(true);
            }}
            className="rounded-lg border border-border px-3 py-1.5 text-sm font-semibold disabled:opacity-50"
            title="פיצול הסכום הכולל של הנבחרים בין כמה מחלקות"
          >
            חלוקה למחלקות מהסכום הכולל
          </button>
          <button
            type="button"
            disabled={selected.size < 1 || groupPending}
            onClick={applySplitIntoNewSpread}
            className="rounded-lg border border-danger/40 text-danger px-3 py-1.5 text-sm font-semibold disabled:opacity-50"
            title="מוציא את הנבחרים מהפריסה הקיימת שלהם לפריסה נפרדת חדשה — בלתי הפיך, מאפס סיווג מחלקה בשתי הפריסות"
          >
            {groupPending ? "מפרק…" : "פרק לפריסה נפרדת"}
          </button>
          <button
            type="button"
            disabled={oldPending}
            onClick={() => applyBulkOld(true)}
            className="rounded-lg border border-border px-3 py-1.5 text-sm font-semibold disabled:opacity-50"
            title="מסמן את הנבחרים כישן — לא ייכללו במאזן המחלקה"
          >
            {oldPending ? "מסמן…" : "סמן כישן — לא נכלל"}
          </button>
          <button
            type="button"
            disabled={oldPending}
            onClick={() => applyBulkOld(false)}
            className="rounded-lg border border-border px-3 py-1.5 text-sm font-semibold disabled:opacity-50"
            title="מבטל את סימון ה'ישן' מהנבחרים — ייכללו שוב במאזן המחלקה"
          >
            {oldPending ? "מסמן…" : "סמן כן נכלל"}
          </button>
          <button type="button" onClick={() => setSelected(new Set())} className="text-sm text-muted underline">
            בטל בחירה
          </button>
          {bulkError && <span className="text-sm text-danger">{bulkError}</span>}
          {groupError && <span className="text-sm text-danger">{groupError}</span>}
          {oldError && <span className="text-sm text-danger">{oldError}</span>}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              {isAdmin && (
                <th>
                  <input type="checkbox" checked={allSelectableSelected} onChange={toggleAll} disabled={selectableIds.size === 0} />
                </th>
              )}
              {columns.map((col) => (
                <SortFilterTh
                  key={col.key}
                  col={col}
                  allRows={filtered}
                  sort={sort}
                  toggleSort={toggleSort}
                  activeFilter={filters[col.key]}
                  setColumnFilter={setColumnFilter}
                />
              ))}
              {isAdmin && <th></th>}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={`${r.source}-${r.id}`}>
                {isAdmin && (
                  <td>
                    {r.isCheck && (
                      <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggleRow(r.id)} />
                    )}
                  </td>
                )}
                <td>{r.source}</td>
                <td>
                  {r.isCheck ? (
                    <>
                      <PayeeLink payee={r.payeeName} />
                      {r.spreadId && (
                        <span className="badge bg-background text-muted mr-1">
                          פריסה · סה״כ {formatCurrency(spreadTotals.get(r.spreadId) ?? 0)}
                        </span>
                      )}
                      {r.notes ? ` — ${r.notes}` : ""}
                    </>
                  ) : (
                    r.description
                  )}
                </td>
                <td>{formatCurrency(r.amount)}</td>
                <td>{r.date ? formatDate(r.date) : "—"}</td>
                <td>{r.departmentName ?? <span className="text-warning">בהמתנה</span>}</td>
                <td>{r.categoryName ?? "—"}</td>
                <td>{r.bankAccountName ?? "—"}</td>
                <td>
                  {r.status === "CLEARED" ? (
                    <span className="badge bg-success-bg text-success">נפרע</span>
                  ) : r.status === "APPROVED" ? (
                    <span className="badge bg-success-bg text-success">מאושר</span>
                  ) : r.status === "CANCELLED" ? (
                    <span className="badge bg-background text-muted">בוטל</span>
                  ) : (
                    <span className="badge bg-warning-bg text-warning">לא נפרע</span>
                  )}
                </td>
                {isAdmin && (
                  <td>
                    <RowActionsMenu>
                      {r.isCheck && <CheckDetailLink checkId={r.id} variant="menu" />}
                      <button type="button" onClick={() => setEditRow(r)} className={rowActionButtonClass("primary")}>
                        עריכה
                      </button>
                      {r.isCheck && r.status !== "CANCELLED" && <CancelCheckButton checkId={r.id} />}
                      <DeleteExpenseButton row={r} />
                    </RowActionsMenu>
                  </td>
                )}
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={isAdmin ? 9 : 7} className="text-center text-muted py-6">
                  אין הוצאות מאושרות עדיין
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {editRow && (
        <Modal onClose={() => setEditRow(null)}>
          <EditExpenseForm
            row={editRow}
            departments={departments}
            categories={categories}
            onClose={() => setEditRow(null)}
          />
        </Modal>
      )}

      {splitOpen && (
        <Modal onClose={() => setSplitOpen(false)}>
          <SplitAcrossDepartmentsForm
            checkIds={[...selected]}
            total={selectedTotal}
            departments={departments}
            onClose={() => setSplitOpen(false)}
            onDone={() => {
              setSelected(new Set());
              setSplitOpen(false);
              router.refresh();
            }}
          />
        </Modal>
      )}
    </div>
  );
}

function SplitAcrossDepartmentsForm({
  checkIds,
  total,
  departments,
  onClose,
  onDone,
}: {
  checkIds: string[];
  total: number;
  departments: Option[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [rows, setRows] = useState<CheckAllocationInput[]>([
    { departmentId: "", amount: 0 },
    { departmentId: "", amount: 0 },
  ]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const allocated = rows.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
  const remaining = Math.round((total - allocated) * 100) / 100;

  function updateRow(idx: number, patch: Partial<CheckAllocationInput>) {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  function addRow() {
    setRows((prev) => [...prev, { departmentId: "", amount: 0 }]);
  }

  function removeRow(idx: number) {
    setRows((prev) => prev.filter((_, i) => i !== idx));
  }

  function save() {
    const valid = rows.filter((r) => r.departmentId && r.amount > 0);
    if (valid.length < 2) {
      setError("יש להזין לפחות שתי מחלקות עם סכום");
      return;
    }
    if (Math.abs(remaining) > 0.01) {
      setError(`הסכום שהוזן (${allocated}) חייב להיות שווה לסכום הכולל של הנבחרים (${total})`);
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await splitChecksAcrossDepartments(checkIds, valid);
      if (result.error) {
        setError(result.error);
        return;
      }
      onDone();
    });
  }

  return (
    <div className="card p-4 space-y-3">
      <h2 className="font-bold">חלוקת {checkIds.length} צ׳קים/העברות למחלקות</h2>
      <p className="text-sm text-muted">
        הסכום הכולל של הנבחרים: <strong>{formatCurrency(total)}</strong> — יחולק בין המחלקות שתבחרו, גם אם זה חוצה בין
        הצ׳קים/העברות עצמם.
      </p>

      <div className="space-y-2">
        {rows.map((r, i) => (
          <div key={i} className="flex items-center gap-2">
            <SearchableSelect
              value={r.departmentId}
              onChange={(id) => updateRow(i, { departmentId: id })}
              options={departments.map((d) => ({ id: d.id, label: d.name }))}
              placeholder="בחר מחלקה"
              className="flex-1 rounded-lg border border-border bg-transparent px-3 py-2 text-sm"
            />
            <input
              type="number"
              value={r.amount || ""}
              onChange={(e) => updateRow(i, { amount: Number(e.target.value) })}
              placeholder="סכום"
              className="w-32 rounded-lg border border-border bg-transparent px-3 py-2 text-sm"
            />
            {rows.length > 2 && (
              <button type="button" onClick={() => removeRow(i)} className="text-sm text-danger">
                הסר
              </button>
            )}
          </div>
        ))}
      </div>

      <button type="button" onClick={addRow} className="text-sm text-primary underline">
        + הוספת מחלקה
      </button>

      <p className={`text-sm ${Math.abs(remaining) > 0.01 ? "text-warning" : "text-success"}`}>
        {Math.abs(remaining) > 0.01 ? `נותר לחלק: ${formatCurrency(remaining)}` : "הסכום מאוזן ✓"}
      </p>

      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="flex items-center gap-2 justify-end">
        <button type="button" onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm">
          ביטול
        </button>
        <button
          type="button"
          onClick={save}
          disabled={isPending}
          className="rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold disabled:opacity-50"
        >
          {isPending ? "שומר…" : "שמירה"}
        </button>
      </div>
    </div>
  );
}

function DeleteExpenseButton({ row }: { row: ExpenseRow }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function remove() {
    if (!confirm(`למחוק לצמיתות את השורה "${row.description}"? פעולה זו אינה הפיכה.`)) return;
    startTransition(async () => {
      const result = row.isCheck ? await deleteCheck(row.id) : await deleteManualEntry(row.id);
      if (result.error) setError(result.error);
      else router.refresh();
    });
  }

  return (
    <div className="flex w-full flex-col items-end gap-0.5">
      <button type="button" disabled={isPending} onClick={remove} className={rowActionButtonClass("danger")}>
        מחיקה
      </button>
      {error && <span className="px-3 text-xs text-danger">{error}</span>}
    </div>
  );
}

export function EditExpenseForm({
  row,
  departments,
  categories,
  onClose,
}: {
  row: ExpenseRow;
  departments: Option[];
  categories: Option[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [payee, setPayee] = useState(row.payeeName);
  const [amount, setAmount] = useState(String(row.amount));
  const [date, setDate] = useState(row.date ?? "");
  const [checkNumber, setCheckNumber] = useState(row.checkNumber ?? "");
  const [departmentId, setDepartmentId] = useState(row.departmentId ?? "");
  const [categoryId, setCategoryId] = useState(row.categoryId ?? "");
  const [notes, setNotes] = useState(row.notes ?? "");
  const [isSplitting, setIsSplitting] = useState(row.allocations.length > 0);
  const [allocations, setAllocations] = useState<CheckAllocationInput[]>(row.allocations);
  const [hasInvoice, setHasInvoice] = useState(row.hasInvoice);
  const [isOld, setIsOld] = useState(row.isOld);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function save() {
    const amountNum = Number(amount);
    if (!amountNum || amountNum <= 0) {
      setError("סכום לא תקין");
      return;
    }
    // A check/transfer is allowed to stay unclassified ("ממתין לסיווג") —
    // only a manual entry, which has no such pending state, still requires one.
    if (!row.isCheck && !departmentId) {
      setError("יש לבחור מחלקה");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = row.isCheck
        ? await updateCheck(row.id, {
            payee,
            amount: amountNum,
            dueDate: date || null,
            checkNumber: checkNumber || null,
            departmentId: isSplitting ? null : departmentId || null,
            categoryId: categoryId || null,
            notes: notes || null,
            hasInvoice,
            skipDepartmentLedger: isOld,
            allocations: isSplitting ? allocations : [],
          })
        : await updateManualEntry(row.id, {
            amount: amountNum,
            entryDate: date,
            departmentId,
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
    <div className="card p-4 space-y-3">
      <h2 className="font-bold">עריכת {row.isCheck ? "צ׳ק / העברה" : "הוצאה ידנית"}</h2>

      {row.isCheck && (
        <div>
          <label className="block text-sm text-muted mb-1">ספק</label>
          <input
            value={payee}
            onChange={(e) => setPayee(e.target.value)}
            className="w-full rounded-lg border border-border bg-transparent px-3 py-2 text-sm"
          />
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm text-muted mb-1">סכום</label>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full rounded-lg border border-border bg-transparent px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm text-muted mb-1">תאריך</label>
          <DateInput value={date} onChange={setDate} className="w-full rounded-lg border border-border bg-transparent px-3 py-2 text-sm" />
        </div>
      </div>

      {row.isCheck && row.paymentMethod === "CHECK" && (
        <div>
          <label className="block text-sm text-muted mb-1">מס׳ צ׳ק</label>
          <input
            value={checkNumber}
            onChange={(e) => setCheckNumber(e.target.value)}
            className="w-full rounded-lg border border-border bg-transparent px-3 py-2 text-sm"
          />
        </div>
      )}

      <div className={row.isCheck ? "grid grid-cols-2 gap-3" : ""}>
        <div>
          <label className="block text-sm text-muted mb-1">מחלקה</label>
          {isSplitting ? (
            <p className="text-xs text-muted flex items-center h-9">פיצול בין מחלקות — למטה</p>
          ) : (
            <SearchableSelect
              value={departmentId}
              onChange={setDepartmentId}
              options={departments.map((d) => ({ id: d.id, label: d.name }))}
              placeholder={row.isCheck ? "ממתין לסיווג" : undefined}
              required={!row.isCheck}
              className="w-full rounded-lg border border-border bg-transparent px-3 py-2 text-sm"
            />
          )}
        </div>
        {row.isCheck && (
          <div>
            <label className="block text-sm text-muted mb-1">קטגוריה</label>
            <SearchableSelect
              value={categoryId}
              onChange={setCategoryId}
              options={categories.map((c) => ({ id: c.id, label: c.name }))}
              placeholder="ללא קטגוריה"
              className="w-full rounded-lg border border-border bg-transparent px-3 py-2 text-sm"
            />
          </div>
        )}
      </div>

      {row.isCheck && isSplitting && (
        <SplitAllocationEditor
          departments={departments}
          totalAmount={Number(amount) || 0}
          allocations={allocations}
          onChange={setAllocations}
        />
      )}

      <div>
        <label className="block text-sm text-muted mb-1">הערות</label>
        <input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="w-full rounded-lg border border-border bg-transparent px-3 py-2 text-sm"
        />
      </div>

      {row.isCheck && (
        <div className="flex flex-wrap items-center gap-4 rounded-lg bg-background p-3">
          <label className="flex items-center gap-1.5 text-sm">
            <input
              type="checkbox"
              checked={isSplitting}
              onChange={(e) => {
                setIsSplitting(e.target.checked);
                if (!e.target.checked) setAllocations([]);
              }}
            />
            פיצול מחלקה
          </label>
          <label className="flex items-center gap-1.5 text-sm">
            <input type="checkbox" checked={hasInvoice} onChange={(e) => setHasInvoice(e.target.checked)} />
            יש חשבונית
          </label>
          <label className="flex items-center gap-1.5 text-sm">
            <input type="checkbox" checked={isOld} onChange={(e) => setIsOld(e.target.checked)} />
            סימון כישן (לא לכלול במאזן המחלקה)
          </label>
        </div>
      )}

      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="flex items-center gap-2 justify-end">
        <button type="button" onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm">
          ביטול
        </button>
        <button
          type="button"
          onClick={save}
          disabled={isPending}
          className="rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold disabled:opacity-50"
        >
          {isPending ? "שומר…" : "שמירה"}
        </button>
      </div>
    </div>
  );
}
