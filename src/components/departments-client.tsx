"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createDepartment, deleteDepartment, updateDepartment } from "@/app/(app)/settings/actions";
import type { Tables } from "@/lib/supabase/database.types";

type Department = Tables<"departments">;
type BankAccountOption = { id: string; department_id: string; bank_name: string; account_number: string };

export function DepartmentRow({
  department,
  usage,
  bankAccounts,
}: {
  department: Department;
  usage: { bankAccounts: number; categories: number };
  bankAccounts: BankAccountOption[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(department.name);
  const [code, setCode] = useState(department.code);
  const [homeBankAccountId, setHomeBankAccountId] = useState(department.home_bank_account_id);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const homeAccount = bankAccounts.find((b) => b.id === department.home_bank_account_id);

  function save() {
    setError(null);
    startTransition(async () => {
      try {
        const fd = new FormData();
        fd.set("id", department.id);
        fd.set("name", name);
        fd.set("code", code);
        fd.set("home_bank_account_id", homeBankAccountId);
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
      <td className="text-sm">
        {editing ? (
          <select
            value={homeBankAccountId}
            onChange={(e) => setHomeBankAccountId(e.target.value)}
            className="rounded border border-border bg-transparent px-2 py-1 text-sm"
          >
            {bankAccounts.map((b) => (
              <option key={b.id} value={b.id}>
                {b.bank_name} ({b.account_number})
              </option>
            ))}
          </select>
        ) : homeAccount ? (
          `${homeAccount.bank_name} (${homeAccount.account_number})`
        ) : (
          "—"
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
                  setHomeBankAccountId(department.home_bank_account_id);
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

export function NewDepartmentForm({ bankAccounts }: { bankAccounts: BankAccountOption[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [homeBankAccountId, setHomeBankAccountId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      try {
        const fd = new FormData();
        fd.set("name", name);
        fd.set("code", code);
        fd.set("home_bank_account_id", homeBankAccountId);
        await createDepartment(fd);
        setName("");
        setCode("");
        setHomeBankAccountId("");
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "שגיאה בהוספה");
      }
    });
  }

  return (
    <div className="space-y-2 pt-2">
      <div className="flex flex-wrap gap-2">
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
        <select
          value={homeBankAccountId}
          onChange={(e) => setHomeBankAccountId(e.target.value)}
          className="rounded border border-border bg-transparent px-2 py-1 text-sm"
          title="חשבון הבית שדרכו המחלקה פועלת — בדרך כלל החשבון המרכזי, אלא אם יש לה חשבון פרטי משלה"
        >
          <option value="">חשבון בית...</option>
          {bankAccounts.map((b) => (
            <option key={b.id} value={b.id}>
              {b.bank_name} ({b.account_number})
            </option>
          ))}
        </select>
        <button
          disabled={isPending || !name || !code || !homeBankAccountId}
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
