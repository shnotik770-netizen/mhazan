"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { groupChecksIntoSpread, mergeChecks } from "@/app/(app)/checks/actions";
import { IssueCheckRow } from "@/components/checks-client";
import { formatCurrency } from "@/lib/format";
import type { Tables } from "@/lib/supabase/database.types";

type Department = Tables<"departments">;

type QueueRow = {
  id: string | null;
  payee: string | null;
  amount: number | null;
  department_name: string | null;
  payment_method: string | null;
  check_number: string | null;
  due_date: string | null;
};

// Selecting several pending-issuance rows lets an admin either merge them
// into a single check/transfer (summed amount, per-department amounts
// preserved as a split) or group them into a spread to the same payee —
// covers the "several requests to one supplier, handle together" case
// without retyping anything.
export function IssuanceQueueTable({ rows, departments }: { rows: QueueRow[]; departments: Department[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function runMerge() {
    setError(null);
    startTransition(async () => {
      const result = await mergeChecks([...selected]);
      if (result.error) setError(result.error);
      else {
        setSelected(new Set());
        router.refresh();
      }
    });
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
      {selected.size >= 2 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted">{selected.size} נבחרו</span>
          <button
            disabled={isPending}
            onClick={runMerge}
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
      <table className="data-table">
        <thead>
          <tr>
            <th></th>
            <th>מוטב</th>
            <th>סכום</th>
            <th>מחלקה</th>
            <th>אמצעי</th>
            <th>הנפקה</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.id!}>
              <td>
                <input type="checkbox" checked={selected.has(c.id!)} onChange={() => toggle(c.id!)} />
              </td>
              <td>{c.payee}</td>
              <td>{formatCurrency(Number(c.amount))}</td>
              <td>{c.department_name ?? "בהמתנה"}</td>
              <td>{c.payment_method === "TRANSFER" ? "העברה" : "צ׳ק"}</td>
              <td>
                <IssueCheckRow
                  checkId={c.id!}
                  currentCheckNumber={c.check_number}
                  currentDueDate={c.due_date}
                  currentPaymentMethod={c.payment_method ?? undefined}
                  amount={Number(c.amount)}
                  departments={departments}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
