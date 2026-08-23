"use client";

export type Allocation = { departmentId: string; amount: number };

export function SplitAllocationEditor({
  departments,
  totalAmount,
  allocations,
  onChange,
}: {
  departments: { id: string; name: string }[];
  totalAmount: number;
  allocations: Allocation[];
  onChange: (allocations: Allocation[]) => void;
}) {
  const allocatedSum = allocations.reduce((sum, a) => sum + (a.amount || 0), 0);

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
      <p className="text-xs text-muted">פיצול בין מחלקות (סכום מקורי: {totalAmount})</p>
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
          <button type="button" onClick={() => remove(i)} className="text-xs text-danger">
            ✕
          </button>
        </div>
      ))}
      <button type="button" onClick={add} className="text-xs text-primary underline">
        + הוסף מחלקה
      </button>
      <p className={`text-xs ${allocatedSum === totalAmount ? "text-muted" : "text-warning"}`}>
        הוקצה: {allocatedSum} מתוך {totalAmount}
      </p>
    </div>
  );
}
