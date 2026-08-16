"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { splitIncome, updateIncomeDepartment } from "@/app/(app)/incomes/actions";
import { SplitAllocationEditor, type Allocation } from "@/components/split-allocation-editor";
import type { Tables } from "@/lib/supabase/database.types";

type Department = Tables<"departments">;

// Lets an admin fix an income's department attribution after the fact —
// reassign it to a single department, or split it across several — from
// wherever the income appears, not just at paste time.
export function IncomeDepartmentEditor({
  incomeId,
  amount,
  currentDepartmentId,
  departments,
}: {
  incomeId: string;
  amount: number;
  currentDepartmentId: string | null;
  departments: Department[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [isSplitting, setIsSplitting] = useState(false);
  const [departmentId, setDepartmentId] = useState(currentDepartmentId ?? "");
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function save() {
    setError(null);
    startTransition(async () => {
      const result = isSplitting
        ? await splitIncome(incomeId, allocations)
        : await updateIncomeDepartment(incomeId, departmentId);
      if (result.error) {
        setError(result.error);
      } else {
        setEditing(false);
        router.refresh();
      }
    });
  }

  if (!editing) {
    return (
      <button onClick={() => setEditing(true)} className="text-xs text-primary underline">
        שיוך מחלקה
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-1 min-w-[200px]">
      <label className="flex items-center gap-1 text-xs">
        <input type="checkbox" checked={isSplitting} onChange={(e) => setIsSplitting(e.target.checked)} />
        פצל בין מחלקות
      </label>
      {!isSplitting ? (
        <select
          value={departmentId}
          onChange={(e) => setDepartmentId(e.target.value)}
          className="rounded border border-border bg-transparent px-2 py-1 text-xs"
        >
          <option value="">בחר מחלקה...</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      ) : (
        <SplitAllocationEditor
          departments={departments}
          totalAmount={amount}
          allocations={allocations}
          onChange={setAllocations}
        />
      )}
      <div className="flex items-center gap-2">
        <button
          disabled={isPending || (!isSplitting && !departmentId)}
          onClick={save}
          className="rounded bg-primary text-primary-foreground text-xs px-3 py-1 disabled:opacity-50"
        >
          שמור
        </button>
        <button onClick={() => setEditing(false)} className="text-xs text-muted">
          ביטול
        </button>
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
