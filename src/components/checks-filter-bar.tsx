"use client";

import { useState } from "react";
import { SearchableSelect } from "@/components/searchable-select";
import type { Tables } from "@/lib/supabase/database.types";

type Department = Tables<"departments">;
type BankAccount = Tables<"bank_accounts"> & { departments: { name: string } | null };

export function ChecksFilterBar({
  deptFilter,
  bankFilter,
  asOf,
  departments,
  bankAccounts,
}: {
  deptFilter: string;
  bankFilter: string;
  asOf: string;
  departments: Department[];
  bankAccounts: BankAccount[];
}) {
  const [dept, setDept] = useState(deptFilter);
  const [bank, setBank] = useState(bankFilter);

  return (
    <form className="flex items-center gap-2 flex-wrap" method="get">
      <input type="hidden" name="asOf" value={asOf} />
      <input type="hidden" name="dept" value={dept} />
      <SearchableSelect
        value={dept}
        onChange={setDept}
        options={departments.map((d) => ({ id: d.id, label: d.name }))}
        placeholder="כל המחלקות"
        className="rounded-lg border border-border bg-transparent px-3 py-2 text-sm w-40"
      />
      <input type="hidden" name="bank" value={bank} />
      <SearchableSelect
        value={bank}
        onChange={setBank}
        options={bankAccounts.map((b) => ({ id: b.id, label: `${b.departments?.name ?? ""} — ${b.bank_name}` }))}
        placeholder="כל חשבונות הבנק"
        className="rounded-lg border border-border bg-transparent px-3 py-2 text-sm w-52"
      />
      <button type="submit" className="rounded-lg border border-border px-4 py-2 text-sm font-semibold">
        חיפוש / סינון
      </button>
      {(deptFilter || bankFilter) && (
        <a href="/checks" className="text-sm text-muted underline">
          נקה הכל
        </a>
      )}
    </form>
  );
}
