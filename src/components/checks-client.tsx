"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { classifyCheck, createCheck, updateCheckStatus } from "@/app/(app)/checks/actions";
import type { Tables } from "@/lib/supabase/database.types";

type Department = Tables<"departments">;
type Category = Tables<"categories">;
type BankAccount = Tables<"bank_accounts"> & { departments: { name: string } | null };

export function ClassifyCheckRow({
  checkId,
  departments,
  categories,
}: {
  checkId: string;
  departments: Department[];
  categories: Category[];
}) {
  const router = useRouter();
  const [departmentId, setDepartmentId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [isPending, startTransition] = useTransition();

  const filteredCategories = categories.filter((c) => c.department_id === departmentId);

  return (
    <div className="flex items-center gap-2">
      <select
        className="rounded border border-border bg-transparent text-sm px-2 py-1"
        value={departmentId}
        onChange={(e) => {
          setDepartmentId(e.target.value);
          setCategoryId("");
        }}
      >
        <option value="">בחר מחלקה...</option>
        {departments.map((d) => (
          <option key={d.id} value={d.id}>
            {d.name}
          </option>
        ))}
      </select>
      <select
        className="rounded border border-border bg-transparent text-sm px-2 py-1"
        value={categoryId}
        onChange={(e) => setCategoryId(e.target.value)}
        disabled={!departmentId}
      >
        <option value="">קטגוריה (אופציונלי)</option>
        {filteredCategories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <button
        disabled={!departmentId || isPending}
        onClick={() =>
          startTransition(async () => {
            await classifyCheck(checkId, departmentId, categoryId || null);
            router.refresh();
          })
        }
        className="rounded bg-primary text-primary-foreground text-xs px-3 py-1 disabled:opacity-50"
      >
        סווג
      </button>
    </div>
  );
}

export function CheckStatusControls({
  checkId,
  status,
}: {
  checkId: string;
  status: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function setStatus(next: "UNPAID" | "CLEARED" | "CANCELLED") {
    startTransition(async () => {
      await updateCheckStatus(checkId, next);
      router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-1">
      <span
        className={`badge ${
          status === "CLEARED"
            ? "bg-success-bg text-success"
            : status === "CANCELLED"
              ? "bg-danger-bg text-danger"
              : "bg-warning-bg text-warning"
        }`}
      >
        {status === "CLEARED" ? "נפרע" : status === "CANCELLED" ? "בוטל" : "לא נפרע"}
      </span>
      {status === "UNPAID" && (
        <>
          <button
            disabled={isPending}
            onClick={() => setStatus("CLEARED")}
            className="text-xs text-primary underline"
          >
            סמן כנפרע
          </button>
          <button
            disabled={isPending}
            onClick={() => setStatus("CANCELLED")}
            className="text-xs text-danger underline"
          >
            בטל
          </button>
        </>
      )}
    </div>
  );
}

export function NewCheckForm({
  bankAccounts,
  departments,
  categories,
}: {
  bankAccounts: BankAccount[];
  departments: Department[];
  categories: Category[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [departmentId, setDepartmentId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const filteredCategories = categories.filter((c) => c.department_id === departmentId);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold"
      >
        + צ׳ק חדש
      </button>
    );
  }

  return (
    <form
      className="card p-4 grid grid-cols-2 md:grid-cols-4 gap-3"
      action={(formData) =>
        startTransition(async () => {
          const result = await createCheck(formData);
          if (result.error) {
            setError(result.error);
          } else {
            setOpen(false);
            setError(null);
            router.refresh();
          }
        })
      }
    >
      <input
        name="check_number"
        placeholder="מספר צ׳ק"
        required
        className="rounded border border-border bg-transparent px-2 py-1 text-sm"
      />
      <select
        name="bank_account_id"
        required
        className="rounded border border-border bg-transparent px-2 py-1 text-sm"
      >
        <option value="">חשבון בנק...</option>
        {bankAccounts.map((b) => (
          <option key={b.id} value={b.id}>
            {b.departments?.name} — {b.bank_name}
          </option>
        ))}
      </select>
      <input
        name="payee"
        placeholder="מוטב"
        required
        className="rounded border border-border bg-transparent px-2 py-1 text-sm"
      />
      <input
        name="amount"
        type="number"
        placeholder="סכום"
        required
        className="rounded border border-border bg-transparent px-2 py-1 text-sm"
      />
      <input
        name="due_date"
        type="date"
        required
        className="rounded border border-border bg-transparent px-2 py-1 text-sm"
      />
      <select
        name="department_id"
        value={departmentId}
        onChange={(e) => setDepartmentId(e.target.value)}
        className="rounded border border-border bg-transparent px-2 py-1 text-sm"
      >
        <option value="">מחלקה (ניתן להשאיר ריק — ימתין לסיווג)</option>
        {departments.map((d) => (
          <option key={d.id} value={d.id}>
            {d.name}
          </option>
        ))}
      </select>
      <select
        name="category_id"
        disabled={!departmentId}
        className="rounded border border-border bg-transparent px-2 py-1 text-sm"
      >
        <option value="">קטגוריה (אופציונלי)</option>
        {filteredCategories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <input
        name="notes"
        placeholder="הערות"
        className="rounded border border-border bg-transparent px-2 py-1 text-sm"
      />
      <div className="flex items-center gap-2 col-span-2 md:col-span-4">
        <button
          type="submit"
          disabled={isPending}
          className="rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold disabled:opacity-50"
        >
          שמור צ׳ק
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-sm text-muted">
          ביטול
        </button>
        {error && <span className="text-sm text-danger">{error}</span>}
      </div>
    </form>
  );
}
