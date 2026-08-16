"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createSupplier, deleteSupplier, importSuppliersFromCheckHistory } from "@/app/(app)/suppliers/actions";

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
