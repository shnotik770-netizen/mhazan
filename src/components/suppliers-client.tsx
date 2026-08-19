"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createSupplier, deleteSupplier, importSuppliersFromCheckHistory } from "@/app/(app)/suppliers/actions";
import { useSortFilter, SortFilterTh, type ColumnDef } from "@/components/sortable-table";
import { formatDate } from "@/lib/format";
import type { Tables } from "@/lib/supabase/database.types";

type Supplier = Tables<"suppliers">;

export function SuppliersTable({ suppliers }: { suppliers: Supplier[] }) {
  const columns: ColumnDef<Supplier>[] = [
    { key: "name", label: "שם ספק", sortValue: (s) => s.name, filterValue: (s) => s.name },
    { key: "notes", label: "הערות", sortValue: (s) => s.notes ?? "" },
    { key: "created_at", label: "נוסף בתאריך", sortValue: (s) => s.created_at },
  ];
  const { rows: sorted, sort, toggleSort, filters, setColumnFilter } = useSortFilter(suppliers, columns);
  return (
    <table className="data-table">
      <thead>
        <tr>
          {columns.map((col) => (
            <SortFilterTh
              key={col.key}
              col={col}
              allRows={suppliers}
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
        {sorted.map((s) => (
          <tr key={s.id}>
            <td>{s.name}</td>
            <td>{s.notes ?? "—"}</td>
            <td>{formatDate(s.created_at)}</td>
            <td>
              <DeleteSupplierButton supplierId={s.id} name={s.name} />
            </td>
          </tr>
        ))}
        {sorted.length === 0 && (
          <tr>
            <td colSpan={4} className="text-center text-muted py-6">
              {suppliers.length === 0
                ? "אין ספקים רשומים עדיין. ניתן להוסיף ידנית או לייבא מתוך היסטוריית הצ׳קים."
                : "אין תוצאות"}
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

export function NewSupplierForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit() {
    setError(null);
    const formData = new FormData();
    formData.set("name", name);
    formData.set("notes", notes);
    startTransition(async () => {
      try {
        await createSupplier(formData);
        setName("");
        setNotes("");
        setOpen(false);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "שגיאה");
      }
    });
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold">
        + ספק חדש
      </button>
    );
  }

  return (
    <div className="card p-3 flex flex-wrap items-center gap-2">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="שם ספק"
        className="rounded border border-border bg-transparent px-2 py-1 text-sm"
      />
      <input
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="הערות (אופציונלי)"
        className="rounded border border-border bg-transparent px-2 py-1 text-sm"
      />
      <button
        disabled={isPending || !name.trim()}
        onClick={submit}
        className="rounded bg-primary text-primary-foreground text-xs px-3 py-1.5 disabled:opacity-50"
      >
        שמור
      </button>
      <button onClick={() => setOpen(false)} className="text-xs text-muted">
        ביטול
      </button>
      {error && <span className="text-xs text-danger">{error}</span>}
    </div>
  );
}

export function DeleteSupplierButton({ supplierId, name }: { supplierId: string; name: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function remove() {
    if (!confirm(`למחוק את הספק "${name}"?`)) return;
    const formData = new FormData();
    formData.set("id", supplierId);
    startTransition(async () => {
      try {
        await deleteSupplier(formData);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "שגיאה");
      }
    });
  }

  return (
    <div className="flex items-center gap-2">
      <button disabled={isPending} onClick={remove} className="text-xs text-danger underline">
        מחיקה
      </button>
      {error && <span className="text-xs text-danger">{error}</span>}
    </div>
  );
}

export function ImportSuppliersButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function run() {
    setMessage(null);
    startTransition(async () => {
      const result = await importSuppliersFromCheckHistory();
      setMessage(result.added > 0 ? `נוספו ${result.added} ספקים מהיסטוריית הצ׳קים` : "אין ספקים חדשים לייבוא");
      router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-2">
      <button
        disabled={isPending}
        onClick={run}
        className="rounded-lg border border-border px-4 py-2 text-sm font-semibold disabled:opacity-50"
      >
        ייבוא מהיסטוריית צ׳קים
      </button>
      {message && <span className="text-xs text-muted">{message}</span>}
    </div>
  );
}
