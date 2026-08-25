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
export function NedarimSettingsSection({
  departments,
  lastSyncedAt,
}: {
  departments: NedarimDepartmentRow[];
  lastSyncedAt: string | null;
}) {
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncResults, setSyncResults] = useState<NedarimSyncResult[] | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const runSync = () => {
    setSyncError(null);
    setSyncResults(null);
    startTransition(async () => {
      const result = await syncNedarimStandingOrders();
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
          מוזן אוטומטית כל 1 לחודש.{" "}
          {lastSyncedAt
            ? `סונכרן לאחרונה: ${new Intl.DateTimeFormat("he-IL", { dateStyle: "short", timeStyle: "short" }).format(new Date(lastSyncedAt))}.`
            : "טרם בוצע סנכרון."}
        </p>
      </div>

      <button
        type="button"
        disabled={isPending}
        onClick={runSync}
        className="rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold whitespace-nowrap disabled:opacity-60"
      >
        {isPending ? "מסנכרן..." : "מה מצב ההוראות קבע"}
      </button>

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
