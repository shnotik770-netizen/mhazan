"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createCategory,
  deleteCategory,
  updateCategory,
} from "@/app/(app)/categories/actions";
import { useSortFilter, SortFilterTh, type ColumnDef } from "@/components/sortable-table";
import type { Tables } from "@/lib/supabase/database.types";

type Department = Tables<"departments">;
type Category = Tables<"categories">;
type PendingCategory = Tables<"v_pending_categories">;

export function PendingCategoriesTable({
  categories,
  departments,
}: {
  categories: PendingCategory[];
  departments: Department[];
}) {
  const columns: ColumnDef<PendingCategory>[] = [{ key: "name", label: "שם קטגוריה", sortValue: (c) => c.name ?? "", filterValue: (c) => c.name ?? "" }];
  const { rows: sorted, sort, toggleSort, filters, setColumnFilter } = useSortFilter(categories, columns);
  return (
    <table className="data-table">
      <thead>
        <tr>
          {columns.map((col) => (
            <SortFilterTh
              key={col.key}
              col={col}
              allRows={categories}
              sort={sort}
              toggleSort={toggleSort}
              activeFilter={filters[col.key]}
              setColumnFilter={setColumnFilter}
            />
          ))}
          <th>מחלקה</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {sorted.map((c) => (
          <PendingCategoryRow key={c.id!} category={c as never} departments={departments} />
        ))}
        {sorted.length === 0 && (
          <tr>
            <td colSpan={3} className="text-center text-muted py-4">
              אין תוצאות
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

export function CategoriesTable({
  categories,
  departments,
}: {
  categories: Category[];
  departments: Department[];
}) {
  const departmentName = (c: Category) => (c.is_split ? "מפוצלת בין מחלקות" : departments.find((d) => d.id === c.department_id)?.name ?? "—");
  const columns: ColumnDef<Category>[] = [
    { key: "name", label: "שם", sortValue: (c) => c.name, filterValue: (c) => c.name },
    { key: "department", label: "מחלקה", sortValue: (c) => departmentName(c), filterValue: (c) => departmentName(c) },
  ];
  const { rows: sorted, sort, toggleSort, filters, setColumnFilter } = useSortFilter(categories, columns);
  return (
    <table className="data-table">
      <thead>
        <tr>
          {columns.map((col) => (
            <SortFilterTh
              key={col.key}
              col={col}
              allRows={categories}
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
        {sorted.map((c) => (
          <CategoryRow key={c.id} category={c} departments={departments} />
        ))}
        {sorted.length === 0 && (
          <tr>
            <td colSpan={3} className="text-center text-muted py-6">
              {categories.length === 0 ? "אין קטגוריות מוגדרות עדיין — הוסיפו את הקטגוריה הראשונה למטה" : "אין תוצאות"}
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

export function PendingCategoryRow({
  category,
  departments,
}: {
  category: Category;
  departments: Department[];
}) {
  const router = useRouter();
  const [departmentId, setDepartmentId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function assign() {
    setError(null);
    startTransition(async () => {
      try {
        const fd = new FormData();
        fd.set("id", category.id);
        fd.set("name", category.name);
        fd.set("department_id", departmentId);
        await updateCategory(fd);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "שגיאה בשיוך");
      }
    });
  }

  // A pending category with nothing worth keeping (e.g. a stray email
  // address that got parsed out of a paste as the "category" text) doesn't
  // need a department at all — just remove it instead of forcing a
  // meaningless assignment. deleteCategory already refuses (with a clear
  // message) if any income ended up recorded under it in the meantime.
  function remove() {
    if (!confirm(`למחוק את הקטגוריה הממתינה "${category.name}"?`)) return;
    setError(null);
    startTransition(async () => {
      try {
        const fd = new FormData();
        fd.set("id", category.id);
        await deleteCategory(fd);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "שגיאה במחיקה");
      }
    });
  }

  return (
    <tr>
      <td>{category.name}</td>
      <td>
        <select
          value={departmentId}
          onChange={(e) => setDepartmentId(e.target.value)}
          className="rounded border border-border bg-transparent px-2 py-1 text-sm"
        >
          <option value="">בחר מחלקה...</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </td>
      <td>
        <div className="flex items-center gap-2">
          <button
            disabled={!departmentId || isPending}
            onClick={assign}
            className="rounded bg-primary text-primary-foreground text-xs px-3 py-1 disabled:opacity-50"
          >
            שייך למחלקה
          </button>
          <button disabled={isPending} onClick={remove} className="text-xs text-danger underline">
            מחיקה
          </button>
        </div>
        {error && <p className="text-xs text-danger mt-1">{error}</p>}
      </td>
    </tr>
  );
}

export function CategoryRow({
  category,
  departments,
}: {
  category: Category;
  departments: Department[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(category.name);
  const [departmentId, setDepartmentId] = useState(category.department_id ?? "");
  const [isSplit, setIsSplit] = useState(category.is_split);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const departmentName = departments.find((d) => d.id === category.department_id)?.name;

  function save() {
    setError(null);
    startTransition(async () => {
      try {
        const fd = new FormData();
        fd.set("id", category.id);
        fd.set("name", name);
        fd.set("department_id", departmentId);
        if (isSplit) fd.set("is_split", "on");
        await updateCategory(fd);
        setEditing(false);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "שגיאה בעדכון");
      }
    });
  }

  function remove() {
    if (!confirm(`למחוק את הקטגוריה "${category.name}"?`)) return;
    setError(null);
    startTransition(async () => {
      try {
        const fd = new FormData();
        fd.set("id", category.id);
        await deleteCategory(fd);
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
          <input value={name} onChange={(e) => setName(e.target.value)} className="rounded border border-border bg-transparent px-2 py-1 text-sm w-40" />
        ) : (
          category.name
        )}
      </td>
      <td>
        {editing ? (
          <div className="space-y-1">
            <label className="flex items-center gap-1 text-xs">
              <input type="checkbox" checked={isSplit} onChange={(e) => setIsSplit(e.target.checked)} />
              מפוצלת בין מחלקות (ללא מחלקה יחידה)
            </label>
            {!isSplit && (
              <select
                value={departmentId}
                onChange={(e) => setDepartmentId(e.target.value)}
                className="rounded border border-border bg-transparent px-2 py-1 text-sm"
              >
                <option value="">ללא מחלקה</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            )}
          </div>
        ) : category.is_split ? (
          <span className="badge bg-background text-muted">מפוצלת בין מחלקות</span>
        ) : (
          departmentName ?? "—"
        )}
      </td>
      <td>
        <div className="flex items-center gap-2">
          {editing ? (
            <>
              <button disabled={isPending} onClick={save} className="rounded bg-primary text-primary-foreground text-xs px-3 py-1 disabled:opacity-50">
                שמור
              </button>
              <button
                disabled={isPending}
                onClick={() => {
                  setEditing(false);
                  setName(category.name);
                  setDepartmentId(category.department_id ?? "");
                  setIsSplit(category.is_split);
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

export function NewCategoryForm({ departments }: { departments: Department[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [isSplit, setIsSplit] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      try {
        const fd = new FormData();
        fd.set("name", name);
        fd.set("department_id", departmentId);
        if (isSplit) fd.set("is_split", "on");
        await createCategory(fd);
        setName("");
        setDepartmentId("");
        setIsSplit(false);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "שגיאה בהוספה");
      }
    });
  }

  return (
    <div className="space-y-2 pt-2">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="שם קטגוריה"
          className="rounded border border-border bg-transparent px-2 py-1 text-sm flex-1"
        />
        {!isSplit && (
          <select
            value={departmentId}
            onChange={(e) => setDepartmentId(e.target.value)}
            className="rounded border border-border bg-transparent px-2 py-1 text-sm"
          >
            <option value="">ללא מחלקה (ימתין לשיוך)</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        )}
        <label className="flex items-center gap-1 text-sm">
          <input type="checkbox" checked={isSplit} onChange={(e) => setIsSplit(e.target.checked)} />
          מפוצלת בין מחלקות
        </label>
        <button
          disabled={isPending || !name}
          onClick={submit}
          className="rounded bg-primary text-primary-foreground text-sm px-3 py-1 disabled:opacity-50"
        >
          הוסף קטגוריה
        </button>
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
