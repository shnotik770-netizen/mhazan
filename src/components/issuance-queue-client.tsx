"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { groupChecksIntoSpread, mergeChecks, type CheckAllocationInput } from "@/app/(app)/checks/actions";
import { EditDeleteCheckRow, IssueCheckRow } from "@/components/checks-client";
import { formatCurrency, formatDate } from "@/lib/format";
import type { Tables } from "@/lib/supabase/database.types";

type Department = Tables<"departments">;

type QueueRow = {
  id: string | null;
  payee: string | null;
  amount: number | null;
  department_id: string | null;
  department_name: string | null;
  payment_method: string | null;
  check_number: string | null;
  due_date: string | null;
  notes: string | null;
  created_at: string | null;
};

type AllocationInfo = { departmentId: string; departmentName: string | null; amount: number };

// Selecting several pending-issuance rows lets an admin either merge them
// into a single check/transfer (summed amount, per-department amounts
// preserved as a split) or group them into a spread to the same payee —
// covers the "several requests to one supplier, handle together" case
// without retyping anything.
export function IssuanceQueueTable({
  rows,
  departments,
  allocationsByCheck,
}: {
  rows: QueueRow[];
  departments: Department[];
  allocationsByCheck: Map<string, AllocationInfo[]>;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [choosingMergeMethod, setChoosingMergeMethod] = useState(false);
  const filteredRows = rows.filter((r) => {
    if (!query.trim()) return true;
    const q = query.trim().toLowerCase();
    return (r.payee ?? "").toLowerCase().includes(q);
  });

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setChoosingMergeMethod(false);
  }

  function runMerge(forcePaymentMethod?: "CHECK" | "TRANSFER") {
    setError(null);
    startTransition(async () => {
      const result = await mergeChecks([...selected], forcePaymentMethod);
      if (result.error) setError(result.error);
      else {
        setSelected(new Set());
        setChoosingMergeMethod(false);
        router.refresh();
      }
    });
  }

  // Merging requires every selected row to share the same payment method —
  // rather than just failing on a mismatch, offer to convert the whole
  // selection to checks or transfers first (with a clear warning) and then
  // actually merge it.
  function attemptMerge() {
    const methods = new Set([...selected].map((id) => rows.find((r) => r.id === id)?.payment_method));
    if (methods.size > 1) {
      setError(null);
      setChoosingMergeMethod(true);
    } else {
      runMerge();
    }
  }

  function runGroup() {
    setError(null);
    startTransition(async () => {
      const result = await groupChecksIntoSpread([...selected]);
      if (result.error) setError(result.error);
      else {
        setSelected(new Set());
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-2">
      {selected.size >= 2 && !choosingMergeMethod && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted">{selected.size} נבחרו</span>
          <button
            disabled={isPending}
            onClick={attemptMerge}
            className="rounded bg-primary text-primary-foreground text-xs px-3 py-1.5 disabled:opacity-50"
          >
            מזג לצ׳ק/העברה אחת
          </button>
          <button
            disabled={isPending}
            onClick={runGroup}
            className="rounded border border-border text-xs px-3 py-1.5 disabled:opacity-50"
          >
            קבץ לפריסה אחת
          </button>
          {error && <span className="text-xs text-danger">{error}</span>}
        </div>
      )}
      {selected.size >= 2 && choosingMergeMethod && (
        <div className="flex items-center gap-2 flex-wrap rounded-lg border border-warning/40 bg-warning-bg px-3 py-2">
          <span className="text-xs text-warning font-medium">
            הנבחרים הם מסוגים שונים (צ׳ק/העברה) — להמיר את כולם לפני המיזוג ל:
          </span>
          <button
            disabled={isPending}
            onClick={() => runMerge("CHECK")}
            className="rounded bg-primary text-primary-foreground text-xs px-3 py-1.5 disabled:opacity-50"
          >
            צ׳ק ומיזוג
          </button>
          <button
            disabled={isPending}
            onClick={() => runMerge("TRANSFER")}
            className="rounded bg-primary text-primary-foreground text-xs px-3 py-1.5 disabled:opacity-50"
          >
            העברה ומיזוג
          </button>
          <button
            disabled={isPending}
            onClick={() => setChoosingMergeMethod(false)}
            className="text-xs text-muted"
          >
            ביטול
          </button>
          {error && <span className="text-xs text-danger">{error}</span>}
        </div>
      )}
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="חיפוש לפי מוטב"
        className="w-full max-w-xs rounded-lg border border-border bg-transparent px-3 py-1.5 text-sm"
      />
      <div className="overflow-x-auto">
      <table className="data-table">
        <thead>
          <tr>
            <th></th>
            <th>מוטב</th>
            <th>סכום</th>
            <th>תאריך הזנה</th>
            <th>תאריך</th>
            <th>מחלקה</th>
            <th>אמצעי</th>
            <th>הנפקה</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {filteredRows.map((c) => (
            <tr key={c.id!}>
              <td>
                <input type="checkbox" checked={selected.has(c.id!)} onChange={() => toggle(c.id!)} />
              </td>
              <td>{c.payee}</td>
              <td>{formatCurrency(Number(c.amount))}</td>
              <td className="text-muted text-xs">{c.created_at ? formatDate(c.created_at) : "—"}</td>
              <td>{c.due_date ? formatDate(c.due_date) : <span className="text-warning">ללא תאריך</span>}</td>
              <td>
                {c.department_name ? (
                  c.department_name
                ) : allocationsByCheck.has(c.id!) ? (
                  <span className="text-xs">
                    מפוצל:{" "}
                    {allocationsByCheck
                      .get(c.id!)!
                      .map((a) => `${a.departmentName ?? "?"} (${formatCurrency(a.amount)})`)
                      .join(", ")}
                  </span>
                ) : (
                  <span className="text-warning">בהמתנה</span>
                )}
              </td>
              <td>{c.payment_method === "TRANSFER" ? "העברה" : "צ׳ק"}</td>
              <td>
                <IssueCheckRow
                  checkId={c.id!}
                  currentCheckNumber={c.check_number}
                  currentDueDate={c.due_date}
                  currentPaymentMethod={c.payment_method ?? undefined}
                  amount={Number(c.amount)}
                  departments={departments}
                  hasExistingDepartmentSplit={allocationsByCheck.has(c.id!)}
                />
              </td>
              <td>
                <EditDeleteCheckRow
                  checkId={c.id!}
                  payee={c.payee ?? ""}
                  amount={Number(c.amount)}
                  dueDate={c.due_date}
                  checkNumber={c.check_number}
                  departmentId={c.department_id}
                  notes={c.notes}
                  paymentMethod={c.payment_method ?? undefined}
                  existingAllocations={
                    (allocationsByCheck.get(c.id!) ?? []).map((a) => ({
                      departmentId: a.departmentId,
                      amount: a.amount,
                    })) as CheckAllocationInput[]
                  }
                  departments={departments}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
}
