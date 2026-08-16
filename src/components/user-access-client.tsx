"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateUserAccess } from "@/app/(app)/settings/actions";
import type { Tables } from "@/lib/supabase/database.types";

type Department = Tables<"departments">;

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
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "שגיאה בעדכון הרשאות");
      }
    });
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
        <button
          disabled={isPending}
          onClick={save}
          className="rounded bg-primary text-primary-foreground text-xs px-3 py-1 disabled:opacity-50"
        >
          שמור
        </button>
        {error && <p className="text-xs text-danger mt-1">{error}</p>}
      </td>
    </tr>
  );
}
