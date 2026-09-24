"use client";

import { formatCurrency } from "@/lib/format";

export type Allocation = { departmentId: string; amount: number; categoryId?: string | null };

export function SplitAllocationEditor({
  departments,
  totalAmount,
  allocations,
  onChange,
  categories,
}: {
  departments: { id: string; name: string }[];
  totalAmount: number;
  allocations: Allocation[];
  onChange: (allocations: Allocation[]) => void;
  // Optional — only invoice-style splits (checks, petty cash) let each
  // department's portion carry its own category; other allocation editors
  // (recurring schedules, income splits) simply omit this and get the
  // department+amount editor exactly as before.
  categories?: { id: string; name: string }[];
}) {
  const allocatedSum = allocations.reduce((sum, a) => sum + (a.amount || 0), 0);
  const remaining = Math.round((totalAmount - allocatedSum) * 100) / 100;

  function update(i: number, patch: Partial<Allocation>) {
    onChange(allocations.map((a, idx) => (idx === i ? { ...a, ...patch } : a)));
  }

  function add() {
    onChange([...allocations, { departmentId: "", amount: 0 }]);
  }

  function remove(i: number) {
    onChange(allocations.filter((_, idx) => idx !== i));
  }

  return (
    <div className="mt-2 space-y-1 border-t border-border pt-2">
      <p className="text-xs text-muted">פיצול בין מחלקות (סכום מקורי: {formatCurrency(totalAmount)})</p>
      {allocations.map((alloc, i) => (
        <div key={i} className="flex items-center gap-1">
          <select
            className="bg-transparent border-b border-border text-xs"
            value={alloc.departmentId}
            onChange={(e) => update(i, { departmentId: e.target.value })}
          >
            <option value="">מחלקה...</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          <input
            type="number"
            className="w-16 bg-transparent border-b border-border text-xs"
            value={alloc.amount || ""}
            onChange={(e) => update(i, { amount: Number(e.target.value) || 0 })}
          />
          {categories && (
            <select
              className="bg-transparent border-b border-border text-xs"
              value={alloc.categoryId ?? ""}
              onChange={(e) => update(i, { categoryId: e.target.value || null })}
            >
              <option value="">ללא קטגוריה</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
          <button type="button" onClick={() => remove(i)} className="text-xs text-danger">
            ✕
          </button>
        </div>
      ))}
      <button type="button" onClick={add} className="text-xs text-primary underline">
        + הוסף מחלקה
      </button>
      <p className={`text-xs ${remaining === 0 ? "text-muted" : "text-warning"}`}>
        שויך: {formatCurrency(allocatedSum)} · נותר לשייך: {formatCurrency(remaining)}
      </p>
    </div>
  );
}
