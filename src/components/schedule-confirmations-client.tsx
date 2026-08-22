"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { confirmScheduleOccurrence, type ScheduleConfirmationAllocation } from "@/app/(app)/settings/actions";
import { SplitAllocationEditor } from "@/components/split-allocation-editor";
import { formatCurrency, formatDate } from "@/lib/format";
import type { Tables } from "@/lib/supabase/database.types";

type Department = Tables<"departments">;

export type PendingConfirmation = {
  scheduleId: string;
  scheduleName: string;
  direction: string;
  departmentId: string | null;
  departmentName: string | null;
  expectedAmount: number;
  periodDate: string;
  isSplit: boolean;
  splitAllocations: { departmentId: string; departmentName: string; amount: number }[];
};

export function ScheduleConfirmationsList({
  pending,
  departments,
}: {
  pending: PendingConfirmation[];
  departments: Department[];
}) {
  if (pending.length === 0) return null;

  return (
    <div className="card p-4 space-y-3">
      <div>
        <h2 className="font-semibold">אישור סכומים בפועל</h2>
        <p className="text-sm text-muted">
          הוראות קבע עם סכום או תאריך משוער שהתאריך שלהן כבר עבר — יש לאשר את הסכום שהיה בפועל, ואפשר לשייך אותו למחלקה
          אחרת מזו שהוגדרה בהוראה או לפצל אותו בין כמה מחלקות.
        </p>
      </div>
      <div className="space-y-3">
        {pending.map((p) => (
          <ConfirmationRow key={`${p.scheduleId}-${p.periodDate}`} item={p} departments={departments} />
        ))}
      </div>
    </div>
  );
}

function ConfirmationRow({ item, departments }: { item: PendingConfirmation; departments: Department[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // A schedule that's inherently split across departments (no single
  // department_id) has no non-split mode to fall back to — start already
  // in split mode, pre-filled with its existing per-department amounts as
  // the default to confirm against.
  const [split, setSplit] = useState(item.isSplit);
  const [amount, setAmount] = useState(String(item.expectedAmount));
  const [confirmedDate, setConfirmedDate] = useState(item.periodDate);
  const [departmentId, setDepartmentId] = useState(item.departmentId ?? "");
  const [allocations, setAllocations] = useState<ScheduleConfirmationAllocation[]>(
    item.isSplit ? item.splitAllocations.map((a) => ({ departmentId: a.departmentId, amount: a.amount })) : [],
  );

  function submit() {
    setError(null);
    let payload: ScheduleConfirmationAllocation[];
    if (split) {
      const valid = allocations.filter((a) => a.departmentId && a.amount > 0);
      if (valid.length < 2) {
        setError("פיצול דורש לפחות שתי מחלקות עם סכום");
        return;
      }
      payload = valid;
    } else {
      const value = Number(amount);
      if (!value || value <= 0) {
        setError("יש להזין סכום");
        return;
      }
      if (!departmentId) {
        setError("יש לבחור מחלקה");
        return;
      }
      payload = [{ departmentId, amount: value }];
    }

    startTransition(async () => {
      const result = await confirmScheduleOccurrence(item.scheduleId, item.periodDate, confirmedDate, payload);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  const totalForSplit = split ? allocations.reduce((sum, a) => sum + (a.amount || 0), 0) : Number(amount) || 0;

  return (
    <div className="border border-border rounded-lg p-3 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <span className="font-medium">{item.scheduleName}</span>
          <span className="text-xs text-muted mr-2">
            {item.direction === "INCOME" ? "הכנסה" : "הוצאה"} · {formatDate(item.periodDate)} · צפי:{" "}
            {formatCurrency(item.expectedAmount)}
            {item.isSplit && ` · מפוצל (${item.splitAllocations.length} מחלקות)`}
          </span>
        </div>
      </div>

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

        {!item.isSplit && (
          <label className="flex items-center gap-1 text-xs text-muted">
            <input
              type="checkbox"
              checked={split}
              onChange={(e) => {
                setSplit(e.target.checked);
                if (e.target.checked) setAllocations([{ departmentId, amount: item.expectedAmount }]);
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
          אשר
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

      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
