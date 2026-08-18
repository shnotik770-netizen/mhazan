"use client";

import { useRouter } from "next/navigation";
import { SearchableSelect } from "@/components/searchable-select";

type Option = { id: string; label: string };

// One filter square instead of two: account/department picker + how far
// ahead to forecast, in one card, applying immediately on change instead
// of needing a separate submit button. Uses SearchableSelect (a typed
// list, not a native <select>) for the account/department picker since
// it's more reliable to tap on mobile than a native picker with a long
// option list.
export function ForecastFilterBar({
  mode,
  bankAccountOptions,
  departmentOptions,
  selectedAccountId,
  selectedDepartmentId,
  uptoMonth,
  uptoMonthOptions,
}: {
  mode: "bank" | "department";
  bankAccountOptions: Option[];
  departmentOptions: Option[];
  selectedAccountId: string;
  selectedDepartmentId: string;
  uptoMonth: string;
  uptoMonthOptions: { value: string; label: string }[];
}) {
  const router = useRouter();

  function go(next: { account?: string; department?: string; upto?: string }) {
    const sp = new URLSearchParams();
    sp.set("mode", mode);
    if (mode === "bank") sp.set("account", next.account ?? selectedAccountId);
    else sp.set("department", next.department ?? selectedDepartmentId);
    sp.set("upto", next.upto ?? uptoMonth);
    router.push(`/forecast?${sp.toString()}`);
  }

  return (
    <div className="card p-4 flex flex-wrap items-end gap-4">
      {mode === "bank" ? (
        <div>
          <label className="block text-sm font-medium mb-1">חשבון בנק</label>
          <SearchableSelect
            value={selectedAccountId}
            onChange={(id) => go({ account: id })}
            options={bankAccountOptions}
            placeholder="בחר חשבון..."
            className="rounded-lg border border-border bg-transparent px-3 py-2 text-sm w-64"
          />
        </div>
      ) : (
        <div>
          <label className="block text-sm font-medium mb-1">מחלקה</label>
          <SearchableSelect
            value={selectedDepartmentId}
            onChange={(id) => go({ department: id })}
            options={departmentOptions}
            placeholder="בחר מחלקה..."
            className="rounded-lg border border-border bg-transparent px-3 py-2 text-sm w-64"
          />
        </div>
      )}
      <div>
        <label className="block text-sm font-medium mb-1">עד חודש</label>
        <select
          value={uptoMonth}
          onChange={(e) => go({ upto: e.target.value })}
          className="rounded-lg border border-border bg-transparent px-3 py-2 text-sm"
        >
          {uptoMonthOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
