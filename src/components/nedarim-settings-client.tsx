"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatCurrency } from "@/lib/format";
import { syncNedarimStandingOrders, type NedarimSyncResult } from "@/app/(app)/settings/actions";

// Nedarim Plus mosad-id/api-key pairs are never entered here — by design
// they live only as a Supabase Edge Function secret
// (NEDARIM_CREDENTIALS_JSON, keyed by an arbitrary label per institution/
// bank account — not per department, since most departments share one
// account and are told apart only by each order's own category), set
// directly on the server by whoever manages the Supabase project.
export function NedarimSettingsSection({ lastSyncedAt }: { lastSyncedAt: string | null }) {
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
        <div className="rounded-lg border border-border p-3 text-sm space-y-2">
          {syncResults.length === 0 ? (
            <p className="text-muted">לא נמצא אף מוסד עם מפתח נדרים פלוס מוגדר ב-Secret של הפונקציה.</p>
          ) : (
            syncResults.map((r) => (
              <div key={r.label}>
                <p>
                  <span className="font-medium">{r.label}:</span>{" "}
                  {r.error ? (
                    <span className="text-danger">שגיאה — {r.error}</span>
                  ) : (
                    <span>
                      נמצאו {r.ordersFound ?? 0} הוראות פעילות ושויכו למחלקות המתאימות
                      {(r.matchedByOrderRef ?? 0) > 0 || (r.matchedByCategory ?? 0) > 0 ? (
                        <span className="text-muted">
                          {" "}
                          ({r.matchedByOrderRef ?? 0} לפי מספר הוראה שכבר קיים בהכנסות, {r.matchedByCategory ?? 0} לפי
                          התאמת קטגוריה)
                        </span>
                      ) : null}
                      .
                    </span>
                  )}
                </p>
                {r.unmatchedGroups && r.unmatchedGroups.length > 0 && (
                  <div className="mt-1 rounded-lg bg-warning-bg border border-warning/40 p-2 text-xs space-y-0.5">
                    <p className="font-medium text-warning">
                      לא נמצאה מחלקה תואמת (לא לפי מספר הוראה קיים בהכנסות ולא לפי שם קטגוריה) עבור:
                    </p>
                    {r.unmatchedGroups.map((u) => (
                      <p key={u.groupe}>
                        &quot;{u.groupe}&quot; — {u.count} הוראות, {formatCurrency(u.amount)} לחודש
                      </p>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </section>
  );
}
