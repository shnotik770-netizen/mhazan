"use client";

import { useRouter } from "next/navigation";
import { SearchableSelect } from "@/components/searchable-select";

// A dropdown instead of a row of quick-switch buttons — scales fine no
// matter how many departments exist, and works the same whether one is
// already selected or not.
export function DepartmentPickerSelect({
  departments,
  selectedId,
}: {
  departments: { id: string; name: string }[];
  selectedId: string;
}) {
  const router = useRouter();

  return (
    <SearchableSelect
      value={selectedId}
      onChange={(id) => router.push(`/ledger?department=${id}`)}
      options={departments.map((d) => ({ id: d.id, label: d.name }))}
      placeholder="בחר מחלקה..."
      className="rounded-lg border border-border bg-transparent px-3 py-2 text-sm w-64"
    />
  );
}
