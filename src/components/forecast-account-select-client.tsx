"use client";

import { useRouter } from "next/navigation";
import { SearchableSelect } from "@/components/searchable-select";

type Option = { id: string; label: string };

// Just the account picker — navigates on change, keeping whatever horizon
// (month or exact date) is already in the URL. Separate from
// ForecastHorizonPicker since it needs to render first, above the
// account's own balance/expected-income sections, inside one shared card.
export function ForecastAccountSelect({
  bankAccountOptions,
  selectedAccountId,
}: {
  bankAccountOptions: Option[];
  selectedAccountId: string;
}) {
  const router = useRouter();

  function go(accountId: string) {
    const sp = new URLSearchParams(window.location.search);
    sp.set("account", accountId);
    router.push(`/forecast?${sp.toString()}`);
  }

  return (
    <div>
      <label className="block text-sm font-medium mb-1">חשבון בנק</label>
      <SearchableSelect
        value={selectedAccountId}
        onChange={go}
        options={bankAccountOptions}
        placeholder="בחר חשבון..."
        className="rounded-lg border border-border bg-transparent px-3 py-2 text-sm w-64"
      />
    </div>
  );
}
