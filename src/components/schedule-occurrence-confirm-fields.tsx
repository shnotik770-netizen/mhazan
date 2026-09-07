"use client";

import { useState } from "react";
import { SplitAllocationEditor } from "@/components/split-allocation-editor";
import type { ScheduleConfirmationAllocation } from "@/app/(app)/settings/actions";
import type { Tables } from "@/lib/supabase/database.types";

type Department = Tables<"departments">;

// Shared editable fields for confirming one occurrence of a recurring
// schedule's actual amount/date/department. Used both by the "אישור סכומים
// בפועל" list (an occurrence the system already flagged as due) and by
// editing a schedule directly and choosing "רק החודש הנוכחי" (an occurrence
// the admin is confirming proactively). Holds its own draft state and does
// its own client-side validation; the parent owns the actual submission
// (calling confirmScheduleOccurrence) plus the pending/server-error state,
// so each caller can wrap this with its own surrounding UI (title, ignore
// button, etc).
export function ScheduleOccurrenceConfirmFields({
  departments,
  isSplit: initialIsSplit,
  expectedAmount,
  departmentId: initialDepartmentId,
  splitAllocations: initialSplitAllocations,
  initialConfirmedDate,
  isPending,
  error,
  onSubmit,
  submitLabel = "אשר",
}: {
  departments: Department[];
  isSplit: boolean;
  expectedAmount: number;
  departmentId: string | null;
  splitAllocations: { departmentId: string; amount: number }[];
  initialConfirmedDate: string;
  isPending: boolean;
  error?: string | null;
  onSubmit: (confirmedDate: string, payload: ScheduleConfirmationAllocation[]) => void;
  submitLabel?: string;
}) {
  const [split, setSplit] = useState(initialIsSplit);
  const [amount, setAmount] = useState(String(expectedAmount));
  const [confirmedDate, setConfirmedDate] = useState(initialConfirmedDate);
  const [departmentId, setDepartmentId] = useState(initialDepartmentId ?? "");
  const [allocations, setAllocations] = useState<ScheduleConfirmationAllocation[]>(
    initialIsSplit ? initialSplitAllocations.map((a) => ({ departmentId: a.departmentId, amount: a.amount })) : [],
  );
  const [clientError, setClientError] = useState<string | null>(null);

  function submit() {
    setClientError(null);
    let payload: ScheduleConfirmationAllocation[];
    if (split) {
      const valid = allocations.filter((a) => a.departmentId && a.amount > 0);
      if (valid.length < 2) {
        setClientError("פיצול דורש לפחות שתי מחלקות עם סכום");
        return;
      }
      payload = valid;
    } else {
      const value = Number(amount);
      if (!value || value <= 0) {
        setClientError("יש להזין סכום");
        return;
      }
      if (!departmentId) {
        setClientError("יש לבחור מחלקה");
        return;
      }
      payload = [{ departmentId, amount: value }];
    }
    onSubmit(confirmedDate, payload);
  }

  const totalForSplit = split ? allocations.reduce((sum, a) => sum + (a.amount || 0), 0) : Number(amount) || 0;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label className="block text-xs text-muted mb-1">תאריך בפועל</label>
          <input
            type="date"
            value={confirmedDate}
            onChange={(e) => setConfirmedDate(e.target.value)}
            className="rounded border border-border bg-transparent px-2 py-1 text-sm"
          />
        </div>

        {!split && (
          <>
            <div>
              <label className="block text-xs text-muted mb-1">סכום בפועל</label>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="rounded border border-border bg-transparent px-2 py-1 text-sm w-28"
              />
            </div>
            <div>
              <label className="block text-xs text-muted mb-1">מחלקה</label>
              <select
                value={departmentId}
                onChange={(e) => setDepartmentId(e.target.value)}
                className="rounded border border-border bg-transparent px-2 py-1 text-sm"
              >
                <option value="">מחלקה...</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
          </>
        )}

        {!initialIsSplit && (
          <label className="flex items-center gap-1 text-xs text-muted">
            <input
              type="checkbox"
              checked={split}
              onChange={(e) => {
                setSplit(e.target.checked);
                if (e.target.checked) setAllocations([{ departmentId, amount: expectedAmount }]);
              }}
            />
            פיצול בין כמה מחלקות
          </label>
        )}

        <button
          disabled={isPending}
          onClick={submit}
          className="rounded bg-primary text-primary-foreground text-sm px-3 py-1 disabled:opacity-50"
        >
          {submitLabel}
        </button>
      </div>

      {split && (
        <SplitAllocationEditor
          departments={departments}
          totalAmount={totalForSplit}
          allocations={allocations}
          onChange={setAllocations}
        />
      )}

      {(clientError || error) && <p className="text-xs text-danger">{clientError || error}</p>}
    </div>
  );
}
