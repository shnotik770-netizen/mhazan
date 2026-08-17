"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createUser, updateUserAccess } from "@/app/(app)/settings/actions";
import type { Tables } from "@/lib/supabase/database.types";

type Department = Tables<"departments">;

function randomPassword(): string {
  return Math.random().toString(36).slice(2, 8) + Math.random().toString(36).slice(2, 6).toUpperCase();
}

export function NewUserForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState(randomPassword());
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ email: string; password: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await createUser({ email, password, fullName });
      if (result.error) {
        setError(result.error);
      } else {
        setCreated({ email, password });
        setFullName("");
        setEmail("");
        setPassword(randomPassword());
        router.refresh();
      }
    });
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold">
        + הוספת משתמש
      </button>
    );
  }

  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">הוספת משתמש חדש</h3>
        <button onClick={() => setOpen(false)} className="text-sm text-muted">
          סגור
        </button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        <input
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="שם מלא"
          className="rounded border border-border bg-transparent px-2 py-1 text-sm"
        />
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="דוא&quot;ל להתחברות"
          className="rounded border border-border bg-transparent px-2 py-1 text-sm"
        />
        <div className="flex items-center gap-1">
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="סיסמה זמנית"
            className="rounded border border-border bg-transparent px-2 py-1 text-sm flex-1"
          />
          <button type="button" onClick={() => setPassword(randomPassword())} className="text-xs text-primary underline whitespace-nowrap">
            סיסמה חדשה
          </button>
        </div>
      </div>
      <p className="text-xs text-muted">
        לאחר היצירה יש להעביר למשתמש את הדוא&quot;ל והסיסמה בדרך מאובטחת, ולקבוע לו למטה הרשאות ומחלקות.
      </p>
      <div className="flex items-center gap-2">
        <button
          disabled={isPending || !email || !password}
          onClick={submit}
          className="rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold disabled:opacity-50"
        >
          צור משתמש
        </button>
        {error && <span className="text-sm text-danger">{error}</span>}
      </div>
      {created && (
        <div className="card bg-success-bg p-3 text-sm">
          המשתמש נוצר בהצלחה. פרטי התחברות: <strong>{created.email}</strong> / <strong>{created.password}</strong>
        </div>
      )}
    </div>
  );
}

export function UserAccessRow({
  userId,
  fullName,
  role: initialRole,
  grantedDepartmentIds,
  canSetCheckDates: initialCanSetCheckDates,
  departments,
}: {
  userId: string;
  fullName: string;
  role: string;
  grantedDepartmentIds: string[];
  canSetCheckDates: boolean;
  departments: Department[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [role, setRole] = useState(initialRole);
  const [selected, setSelected] = useState<Set<string>>(new Set(grantedDepartmentIds));
  const [canSetCheckDates, setCanSetCheckDates] = useState(initialCanSetCheckDates);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function toggle(deptId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(deptId)) next.delete(deptId);
      else next.add(deptId);
      return next;
    });
  }

  function cancel() {
    setRole(initialRole);
    setSelected(new Set(grantedDepartmentIds));
    setCanSetCheckDates(initialCanSetCheckDates);
    setError(null);
    setEditing(false);
  }

  function save() {
    setError(null);
    startTransition(async () => {
      try {
        await updateUserAccess(
          userId,
          role as "DEPT_MANAGER" | "FINANCE_ADMIN",
          Array.from(selected),
          canSetCheckDates,
        );
        setEditing(false);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "שגיאה בעדכון הרשאות");
      }
    });
  }

  if (!editing) {
    const grantedNames = departments.filter((d) => grantedDepartmentIds.includes(d.id)).map((d) => d.name);
    return (
      <tr>
        <td>{fullName}</td>
        <td>
          <span className="text-sm">
            {initialRole === "FINANCE_ADMIN" ? "מנהל כספים — גישה מלאה" : "צפייה בלבד — מחלקות נבחרות"}
          </span>
        </td>
        <td>
          {initialRole === "FINANCE_ADMIN" ? (
            <span className="text-sm text-muted">רואה את כל המחלקות</span>
          ) : grantedNames.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {grantedNames.map((name) => (
                <span key={name} className="rounded bg-background px-2 py-0.5 text-xs border border-border">
                  {name}
                </span>
              ))}
            </div>
          ) : (
            <span className="text-sm text-muted">אין מחלקות מאושרות</span>
          )}
        </td>
        <td>
          {initialRole !== "FINANCE_ADMIN" && initialCanSetCheckDates && (
            <span className="text-xs text-muted whitespace-nowrap">רשאי לקבוע תאריך</span>
          )}
        </td>
        <td>
          <button
            onClick={() => setEditing(true)}
            className="rounded border border-border text-xs px-3 py-1"
          >
            עריכה
          </button>
        </td>
      </tr>
    );
  }

  return (
    <tr>
      <td>{fullName}</td>
      <td>
        <select
          value={role}
          onChange={(e) => setRole(e.target.value)}
          className="rounded border border-border bg-transparent px-2 py-1 text-sm"
        >
          <option value="DEPT_MANAGER">צפייה בלבד — מחלקות נבחרות</option>
          <option value="FINANCE_ADMIN">מנהל כספים — גישה מלאה</option>
        </select>
      </td>
      <td>
        {role === "FINANCE_ADMIN" ? (
          <span className="text-sm text-muted">רואה את כל המחלקות</span>
        ) : (
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {departments.map((d) => (
              <label key={d.id} className="flex items-center gap-1 text-sm">
                <input type="checkbox" checked={selected.has(d.id)} onChange={() => toggle(d.id)} />
                {d.name}
              </label>
            ))}
            {departments.length === 0 && <span className="text-sm text-muted">אין מחלקות מוגדרות</span>}
          </div>
        )}
      </td>
      <td>
        {role !== "FINANCE_ADMIN" && (
          <label className="flex items-center gap-1 text-sm whitespace-nowrap">
            <input
              type="checkbox"
              checked={canSetCheckDates}
              onChange={(e) => setCanSetCheckDates(e.target.checked)}
            />
            רשאי לקבוע תאריך בבקשות הוצאה
          </label>
        )}
      </td>
      <td>
        <div className="flex items-center gap-2">
          <button
            disabled={isPending}
            onClick={save}
            className="rounded bg-primary text-primary-foreground text-xs px-3 py-1 disabled:opacity-50"
          >
            שמור
          </button>
          <button disabled={isPending} onClick={cancel} className="text-xs text-muted underline">
            ביטול
          </button>
        </div>
        {error && <p className="text-xs text-danger mt-1">{error}</p>}
      </td>
    </tr>
  );
}
