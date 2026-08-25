"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { syncNedarimStandingOrders, type NedarimSyncResult } from "@/app/(app)/settings/actions";

export type NedarimDepartmentRow = {
  id: string;
  name: string;
};

// Nedarim Plus mosad-id/api-key pairs are never entered here — by design
// they live only as a Supabase Edge Function secret
// (NEDARIM_CREDENTIALS_JSON, keyed by each department's short code), set
// directly on the server by whoever manages the Supabase project. This
// section only ever triggers a sync and shows its result; it has no way to
// know which departments actually have a key configured.
export function NedarimSettingsSection({ departments }: { departments: NedarimDepartmentRow[] }) {
  const [selectedDepartmentId, setSelectedDepartmentId] = useState("");
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
      <div>
        <h2 className="font-semibold">הוראות קבע — נדרים פלוס (סנכרון אוטומטי)</h2>
        <p className="text-sm text-muted">
          סנכרון חודשי אוטומטי מול נדרים פלוס לכל מחלקה שיש לה מפתח מוגדר, בתוספת הפעלה ידנית כאן. התוצאה מוצגת כשורת
          &quot;צפי הוראות קבע&quot; בתוך תנועות עתידיות ידועות בדוח כל מחלקה. מפתחות ה-API עצמם אינם מוזנים דרך המסך הזה —
          הם מוגדרים ישירות כ-Secret בפונקציית ה-Edge בשרת (לא בבסיס הנתונים ולא דרך האפליקציה), ורק מי שמנהל את הגדרות
          השרת יכול לעדכן אותם.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={isPending}
          onClick={() => runSync()}
          className="rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold whitespace-nowrap disabled:opacity-60"
        >
          {isPending ? "מסנכרן..." : "מה מצב ההוראות קבע (כל המחלקות)"}
        </button>
        <select
          value={selectedDepartmentId}
          onChange={(e) => setSelectedDepartmentId(e.target.value)}
          className="rounded border border-border bg-transparent px-2 py-1.5 text-sm"
        >
          <option value="">מחלקה בודדת...</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={isPending || !selectedDepartmentId}
          onClick={() => runSync(selectedDepartmentId)}
          className="rounded-lg border border-border px-3 py-1.5 text-sm font-semibold disabled:opacity-50"
        >
          סנכרן מחלקה זו בלבד
        </button>
      </div>

      {syncError && <p className="text-sm text-danger">{syncError}</p>}
      {syncResults && (
        <div className="rounded-lg border border-border p-3 text-sm space-y-1">
          {syncResults.length === 0 ? (
            <p className="text-muted">לא נמצאו מחלקות עם מפתח נדרים פלוס מוגדר ב-Secret של הפונקציה.</p>
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
    </section>
  );
}
