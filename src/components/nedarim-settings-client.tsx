"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  saveNedarimCredentials,
  deleteNedarimCredentials,
  syncNedarimStandingOrders,
  type NedarimSyncResult,
} from "@/app/(app)/settings/actions";

export type NedarimDepartmentRow = {
  id: string;
  name: string;
  configured: boolean;
  updatedAt: string | null;
};

export function NedarimSettingsSection({ departments }: { departments: NedarimDepartmentRow[] }) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncResults, setSyncResults] = useState<NedarimSyncResult[] | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const runSync = (departmentId?: string) => {
    setSyncError(null);
    setSyncResults(null);
    startTransition(async () => {
      const result = await syncNedarimStandingOrders(departmentId);
      if (result.error) setSyncError(result.error);
      else setSyncResults(result.results ?? []);
      router.refresh();
    });
  };

  return (
    <section className="card p-4 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="font-semibold">הוראות קבע — נדרים פלוס (סנכרון אוטומטי)</h2>
          <p className="text-sm text-muted">
            סנכרון חודשי אוטומטי מול נדרים פלוס לכל מחלקה שהוגדר לה מוסד, בתוספת הפעלה ידנית כאן. התוצאה מוצגת
            כשורת &quot;צפי הוראות קבע&quot; בתוך תנועות עתידיות ידועות בדוח כל מחלקה.
          </p>
        </div>
        <button
          type="button"
          disabled={isPending}
          onClick={() => runSync()}
          className="rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold whitespace-nowrap disabled:opacity-60"
        >
          {isPending ? "מסנכרן..." : "מה מצב ההוראות קבע (כל המחלקות)"}
        </button>
      </div>

      {syncError && <p className="text-sm text-danger">{syncError}</p>}
      {syncResults && (
        <div className="rounded-lg border border-border p-3 text-sm space-y-1">
          {syncResults.length === 0 ? (
            <p className="text-muted">לא נמצאו מחלקות עם מפתח נדרים פלוס מוגדר.</p>
          ) : (
            syncResults.map((r) => {
              const dept = departments.find((d) => d.id === r.departmentId);
              return (
                <p key={r.departmentId}>
                  <span className="font-medium">{dept?.name ?? r.departmentId}:</span>{" "}
                  {r.error ? (
                    <span className="text-danger">שגיאה — {r.error}</span>
                  ) : (
                    <span>
                      נמצאו {r.ordersFound ?? 0} הוראות פעילות, הוקרנו {r.monthsProjected ?? 0} חודשים קדימה.
                    </span>
                  )}
                </p>
              );
            })
          )}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>מחלקה</th>
              <th>סטטוס מפתח</th>
              <th>עודכן לאחרונה</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {departments.map((d) => (
              <NedarimDepartmentRow
                key={d.id}
                dept={d}
                isEditing={editingId === d.id}
                onEdit={() => setEditingId(d.id)}
                onCancel={() => setEditingId(null)}
                onSaved={() => {
                  setEditingId(null);
                  router.refresh();
                }}
                onSync={() => runSync(d.id)}
                syncPending={isPending}
              />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function NedarimDepartmentRow({
  dept,
  isEditing,
  onEdit,
  onCancel,
  onSaved,
  onSync,
  syncPending,
}: {
  dept: NedarimDepartmentRow;
  isEditing: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSaved: () => void;
  onSync: () => void;
  syncPending: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleSave = (formData: FormData) => {
    setError(null);
    startTransition(async () => {
      const result = await saveNedarimCredentials(formData);
      if (result.error) setError(result.error);
      else onSaved();
    });
  };

  const handleDelete = () => {
    if (!confirm(`להסיר את מפתח נדרים פלוס של מחלקת ${dept.name}?`)) return;
    startTransition(async () => {
      const result = await deleteNedarimCredentials(dept.id);
      if (result.error) setError(result.error);
      else onSaved();
    });
  };

  if (isEditing) {
    return (
      <tr>
        <td colSpan={4}>
          <form action={handleSave} className="flex flex-wrap items-end gap-2 py-2">
            <input type="hidden" name="department_id" value={dept.id} />
            <span className="text-sm font-medium">{dept.name}</span>
            <input
              name="mosad_id"
              placeholder="מזהה מוסד (MosadId)"
              required
              className="rounded border border-border bg-transparent px-2 py-1 text-sm"
            />
            <input
              name="api_key"
              placeholder="מפתח API (npk_...)"
              required
              className="rounded border border-border bg-transparent px-2 py-1 text-sm w-64"
            />
            <button type="submit" disabled={isPending} className="rounded bg-primary text-primary-foreground text-sm px-3 py-1 disabled:opacity-60">
              שמור
            </button>
            <button type="button" onClick={onCancel} className="rounded border border-border text-sm px-3 py-1">
              ביטול
            </button>
            {error && <span className="text-sm text-danger">{error}</span>}
          </form>
        </td>
      </tr>
    );
  }

  return (
    <tr>
      <td>{dept.name}</td>
      <td>
        {dept.configured ? (
          <span className="badge bg-success-bg text-success">מוגדר</span>
        ) : (
          <span className="badge bg-background text-muted">לא מוגדר</span>
        )}
      </td>
      <td className="text-sm text-muted">
        {dept.updatedAt ? new Intl.DateTimeFormat("he-IL").format(new Date(dept.updatedAt)) : "—"}
      </td>
      <td className="flex gap-2 justify-end">
        <button type="button" onClick={onEdit} className="text-sm text-primary underline">
          {dept.configured ? "עדכן מפתח" : "הגדר מפתח"}
        </button>
        {dept.configured && (
          <>
            <button type="button" disabled={syncPending} onClick={onSync} className="text-sm text-primary underline disabled:opacity-60">
              סנכרן
            </button>
            <button type="button" disabled={isPending} onClick={handleDelete} className="text-sm text-danger underline disabled:opacity-60">
              הסר
            </button>
          </>
        )}
      </td>
    </tr>
  );
}
