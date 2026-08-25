"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createDepartment, deleteDepartment, updateDepartment } from "@/app/(app)/settings/actions";
import { SearchableSelect } from "@/components/searchable-select";
import { useSortFilter, SortFilterTh, type ColumnDef } from "@/components/sortable-table";
import type { Tables } from "@/lib/supabase/database.types";

type Department = Tables<"departments">;
type BankAccountOption = {
  id: string;
  department_id: string;
  bank_name: string;
  account_number: string;
};

type DepartmentTableRow = Department & { usage: { bankAccounts: number; categories: number } };

export function DepartmentsTable({
  departments,
  categories,
  bankAccounts,
}: {
  departments: Department[];
  categories: { department_id: string | null }[];
  bankAccounts: BankAccountOption[];
}) {
  const usageFor = (departmentId: string) => ({
    bankAccounts: bankAccounts.filter((b) => b.department_id === departmentId).length,
    categories: categories.filter((c) => c.department_id === departmentId).length,
  });
  const rows: DepartmentTableRow[] = departments.map((d) => ({ ...d, usage: usageFor(d.id) }));
  const homeAccountLabel = (r: DepartmentTableRow) => {
    const acc = bankAccounts.find((b) => b.id === r.home_bank_account_id);
    return acc ? `${acc.bank_name} (${acc.account_number})` : "—";
  };
  const columns: ColumnDef<DepartmentTableRow>[] = [
    { key: "name", label: "שם", sortValue: (r) => r.name, filterValue: (r) => r.name },
    { key: "code", label: "קוד", sortValue: (r) => r.code, filterValue: (r) => r.code },
    { key: "home_account", label: "חשבון בית", sortValue: (r) => homeAccountLabel(r), filterValue: (r) => homeAccountLabel(r) },
    { key: "categories_count", label: "שימוש", sortValue: (r) => r.usage.categories },
  ];
  const { rows: sorted, sort, toggleSort, filters, setColumnFilter } = useSortFilter(rows, columns);

  return (
    <table className="data-table">
      <thead>
        <tr>
          {columns.map((col) => (
            <SortFilterTh
              key={col.key}
              col={col}
              allRows={rows}
              sort={sort}
              toggleSort={toggleSort}
              activeFilter={filters[col.key]}
              setColumnFilter={setColumnFilter}
            />
          ))}
          <th>פעולות</th>
        </tr>
      </thead>
      <tbody>
        {sorted.map((d) => (
          <DepartmentRow key={d.id} department={d} usage={d.usage} bankAccounts={bankAccounts} />
        ))}
        {sorted.length === 0 && (
          <tr>
            <td colSpan={5} className="text-center text-muted py-6">
              {departments.length === 0 ? "אין מחלקות מוגדרות עדיין — הוסיפו את המחלקה הראשונה למטה" : "אין תוצאות"}
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

export function DepartmentRow({
  department,
  usage,
  bankAccounts,
}: {
  department: Department;
  usage: { bankAccounts: number; categories: number };
  bankAccounts: BankAccountOption[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(department.name);
  const [code, setCode] = useState(department.code);
  const [homeBankAccountId, setHomeBankAccountId] = useState(department.home_bank_account_id);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const homeAccount = bankAccounts.find((b) => b.id === department.home_bank_account_id);

  function save() {
    setError(null);
    startTransition(async () => {
      try {
        const fd = new FormData();
        fd.set("id", department.id);
        fd.set("name", name);
        fd.set("code", code);
        fd.set("home_bank_account_id", homeBankAccountId);
        await updateDepartment(fd);
        setEditing(false);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "שגיאה בעדכון");
      }
    });
  }

  function remove() {
    if (!confirm(`למחוק את המחלקה "${department.name}"?`)) return;
    setError(null);
    startTransition(async () => {
      try {
        const fd = new FormData();
        fd.set("id", department.id);
        await deleteDepartment(fd);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "שגיאה במחיקה");
      }
    });
  }

  return (
    <tr>
      <td>
        {editing ? (
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="rounded border border-border bg-transparent px-2 py-1 text-sm w-40"
          />
        ) : (
          <Link href={`/reports/${department.id}`} className="text-primary underline" title="לדוח המחלקה">
            {department.name}
          </Link>
        )}
      </td>
      <td>
        {editing ? (
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            className="rounded border border-border bg-transparent px-2 py-1 text-sm w-24"
          />
        ) : (
          department.code
        )}
      </td>
      <td className="text-sm">
        {editing ? (
          <SearchableSelect
            value={homeBankAccountId}
            onChange={setHomeBankAccountId}
            options={bankAccounts.map((b) => ({ id: b.id, label: `${b.bank_name} (${b.account_number})` }))}
            placeholder="חשבון בית..."
            className="rounded border border-border bg-transparent px-2 py-1 text-sm w-56"
          />
        ) : homeAccount ? (
          usage.bankAccounts > 0 ? (
            <>
              <span className="font-semibold text-primary">
                {homeAccount.bank_name} ({homeAccount.account_number})
              </span>
              <span className="badge bg-background text-muted mr-1">מנהלת את החשבון</span>
            </>
          ) : (
            <>
              {homeAccount.bank_name} ({homeAccount.account_number})
            </>
          )
        ) : (
          "—"
        )}
      </td>
      <td className="text-muted text-sm">
        {usage.categories} קטגוריות
      </td>
      <td>
        <div className="flex items-center gap-2">
          {editing ? (
            <>
              <button
                disabled={isPending}
                onClick={save}
                className="rounded bg-primary text-primary-foreground text-xs px-3 py-1 disabled:opacity-50"
              >
                שמור
              </button>
              <button
                disabled={isPending}
                onClick={() => {
                  setEditing(false);
                  setName(department.name);
                  setCode(department.code);
                  setHomeBankAccountId(department.home_bank_account_id);
                  setError(null);
                }}
                className="text-xs text-muted"
              >
                ביטול
              </button>
            </>
          ) : (
            <>
              <button onClick={() => setEditing(true)} className="text-xs text-primary underline">
                עריכה
              </button>
              <button disabled={isPending} onClick={remove} className="text-xs text-danger underline">
                מחיקה
              </button>
            </>
          )}
        </div>
        {error && <p className="text-xs text-danger mt-1">{error}</p>}
      </td>
    </tr>
  );
}

export function NewDepartmentForm({ bankAccounts }: { bankAccounts: BankAccountOption[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [homeBankAccountId, setHomeBankAccountId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      try {
        const fd = new FormData();
        fd.set("name", name);
        fd.set("code", code);
        fd.set("home_bank_account_id", homeBankAccountId);
        await createDepartment(fd);
        setName("");
        setCode("");
        setHomeBankAccountId("");
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "שגיאה בהוספה");
      }
    });
  }

  return (
    <div className="space-y-2 pt-2">
      <div className="flex flex-wrap gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="שם מחלקה (למשל: פנימייה)"
          className="rounded border border-border bg-transparent px-2 py-1 text-sm flex-1"
        />
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="קוד (למשל PNM)"
          className="rounded border border-border bg-transparent px-2 py-1 text-sm w-32"
        />
        <SearchableSelect
          value={homeBankAccountId}
          onChange={setHomeBankAccountId}
          options={bankAccounts.map((b) => ({ id: b.id, label: `${b.bank_name} (${b.account_number})` }))}
          placeholder="חשבון בית..."
          className="rounded border border-border bg-transparent px-2 py-1 text-sm w-56"
        />
        <button
          disabled={isPending || !name || !code || !homeBankAccountId}
          onClick={submit}
          className="rounded bg-primary text-primary-foreground text-sm px-3 py-1 disabled:opacity-50"
        >
          הוסף מחלקה
        </button>
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
