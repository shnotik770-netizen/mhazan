"use client";

import { useRouter } from "next/navigation";
import { SearchableSelect } from "@/components/searchable-select";

type Option = { id: string; label: string };

// One filter square: bank account picker + how far ahead to forecast, in
// one card, applying immediately on change instead of needing a separate
// submit button. Uses SearchableSelect (a typed list, not a native
// <select>) for the account picker since it's more reliable to tap on
// mobile than a native picker with a long option list.
export function ForecastFilterBar({
  bankAccountOptions,
  selectedAccountId,
  uptoMonth,
  uptoMonthOptions,
}: {
  bankAccountOptions: Option[];
  selectedAccountId: string;
  uptoMonth: string;
  uptoMonthOptions: { value: string; label: string }[];
}) {
  const router = useRouter();

  function go(next: { account?: string; upto?: string }) {
    const sp = new URLSearchParams();
    sp.set("account", next.account ?? selectedAccountId);
    sp.set("upto", next.upto ?? uptoMonth);
    router.push(`/forecast?${sp.toString()}`);
  }

  return (
    <div className="card p-4 flex flex-wrap items-end gap-4">
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
