"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createDepartment, deleteDepartment, updateDepartment } from "@/app/(app)/settings/actions";
import type { Tables } from "@/lib/supabase/database.types";

type Department = Tables<"departments">;

export function DepartmentRow({
  department,
  usage,
}: {
  department: Department;
  usage: { bankAccounts: number; categories: number };
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(department.name);
  const [code, setCode] = useState(department.code);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function save() {
    setError(null);
    startTransition(async () => {
      try {
        const fd = new FormData();
        fd.set("id", department.id);
        fd.set("name", name);
        fd.set("code", code);
        await updateDepartment(fd);
        setEditing(false);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "שגיאה בעדכון");
      }
    });
  }

  function remove() {
    if (!confirm(`למחוק את המחלקה "${department.name}"?`)) return;
    setError(null);
    startTransition(async () => {
      try {
        const fd = new FormData();
        fd.set("id", department.id);
        await deleteDepartment(fd);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "שגיאה במחיקה");
      }
    });
  }

  return (
    <tr>
      <td>
        {editing ? (
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="rounded border border-border bg-transparent px-2 py-1 text-sm w-40"
          />
        ) : (
          department.name
        )}
      </td>
      <td>
        {editing ? (
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            className="rounded border border-border bg-transparent px-2 py-1 text-sm w-24"
          />
        ) : (
          department.code
        )}
      </td>
      <td className="text-muted text-sm">
        {usage.bankAccounts} חשבונות · {usage.categories} קטגוריות
      </td>
      <td>
        <div className="flex items-center gap-2">
          {editing ? (
            <>
              <button
                disabled={isPending}
                onClick={save}
                className="rounded bg-primary text-primary-foreground text-xs px-3 py-1 disabled:opacity-50"
              >
                שמור
              </button>
              <button
                disabled={isPending}
                onClick={() => {
                  setEditing(false);
                  setName(department.name);
                  setCode(department.code);
                  setError(null);
                }}
                className="text-xs text-muted"
              >
                ביטול
              </button>
            </>
          ) : (
            <>
              <button onClick={() => setEditing(true)} className="text-xs text-primary underline">
                עריכה
              </button>
              <button disabled={isPending} onClick={remove} className="text-xs text-danger underline">
                מחיקה
              </button>
            </>
          )}
        </div>
        {error && <p className="text-xs text-danger mt-1">{error}</p>}
      </td>
    </tr>
  );
}

export function NewDepartmentForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      try {
        const fd = new FormData();
        fd.set("name", name);
        fd.set("code", code);
        await createDepartment(fd);
        setName("");
        setCode("");
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "שגיאה בהוספה");
      }
    });
  }

  return (
    <div className="space-y-2 pt-2">
      <div className="flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="שם מחלקה (למשל: פנימייה)"
          className="rounded border border-border bg-transparent px-2 py-1 text-sm flex-1"
        />
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="קוד (למשל PNM)"
          className="rounded border border-border bg-transparent px-2 py-1 text-sm w-32"
        />
        <button
          disabled={isPending || !name || !code}
          onClick={submit}
          className="rounded bg-primary text-primary-foreground text-sm px-3 py-1 disabled:opacity-50"
        >
          הוסף מחלקה
        </button>
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
