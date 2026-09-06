"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteRecurringSchedule, setRecurringScheduleActive } from "@/app/(app)/settings/actions";
import { NewRecurringScheduleForm } from "@/components/recurring-schedule-form-client";
import { Modal } from "@/components/modal";
import { useSortFilter, SortFilterTh, type ColumnDef } from "@/components/sortable-table";
import { formatCurrency, formatDate } from "@/lib/format";
import type { Tables } from "@/lib/supabase/database.types";

type Department = Tables<"departments">;
type BankAccountOption = { id: string; bank_name: string; account_number: string };
type CategoryOption = { id: string; name: string };

const WEEKDAY_LABELS = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"];

function frequencyLabel(frequency: string) {
  if (frequency === "MONTHLY") return "חודשי";
  if (frequency === "WEEKLY") return "שבועי";
  if (frequency === "YEARLY") return "שנתי";
  return "חד פעמי";
}

function scheduleDateLabel(s: { frequency: string; day_of_month: number | null; day_of_week: number | null; one_time_date: string | null }) {
  if (s.frequency === "WEEKLY" && s.day_of_week !== null) return `יום ${WEEKDAY_LABELS[s.day_of_week] ?? s.day_of_week}`;
  if ((s.frequency === "MONTHLY" || s.frequency === "YEARLY") && s.day_of_month !== null) return `${s.day_of_month} לחודש`;
  if (s.frequency === "ONCE" && s.one_time_date) return s.one_time_date;
  return "—";
}

export type ScheduleRow = {
  id: string;
  name: string;
  direction: string;
  frequency: string;
  type: string;
  day_of_month: number | null;
  day_of_week: number | null;
  one_time_date: string | null;
  expected_amount: number;
  is_active: boolean;
  end_date: string | null;
  departmentId: string | null;
  bankAccountId: string | null;
  categoryId: string | null;
  departmentName: string | null;
  allocations: { departmentId: string; amount: number; departmentName: string | null }[];
};

function departmentLabel(s: ScheduleRow) {
  return s.departmentName ?? `מפוצל (${s.allocations.length} מחלקות)`;
}

// A schedule that's inactive, or whose end date has already passed, has
// nothing left to do — it stays in the DB (past occurrences still point to
// it) but has no business cluttering the list of things an admin might
// actually need to act on, so it's archived out of the default view.
function isArchived(s: ScheduleRow, today: string): boolean {
  return !s.is_active || Boolean(s.end_date && s.end_date < today);
}

// Recurring-schedule creation and management, on the checks page — the one
// place this gets managed from (no longer duplicated into /expenses or
// /settings). The management list expands inline (not a dialog) so it reads
// as part of the page rather than something floating on top of it; the "add
// new" and "edit" forms stay in a Modal since those are focused one-off
// tasks rather than a view to browse.
export function RecurringSchedulesSection({
  schedules,
  departments,
  bankAccounts,
  categories,
}: {
  schedules: ScheduleRow[];
  departments: Department[];
  bankAccounts: BankAccountOption[];
  categories: CategoryOption[];
}) {
  const [addOpen, setAddOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [showArchive, setShowArchive] = useState(false);
  const [editSchedule, setEditSchedule] = useState<ScheduleRow | null>(null);

  const today = new Date().toISOString().slice(0, 10);
  const activeSchedules = schedules.filter((s) => !isArchived(s, today));
  const archivedSchedules = schedules.filter((s) => isArchived(s, today));
  const visibleSchedules = showArchive ? schedules : activeSchedules;

  const columns: ColumnDef<ScheduleRow>[] = [
    { key: "name", label: "שם", sortValue: (s) => s.name, filterValue: (s) => s.name },
    { key: "department", label: "מחלקה", sortValue: (s) => departmentLabel(s), filterValue: (s) => departmentLabel(s) },
    { key: "frequency", label: "תדירות", sortValue: (s) => s.frequency, filterValue: (s) => frequencyLabel(s.frequency) },
    {
      key: "date",
      label: "תאריך",
      sortValue: (s) => (s.type === "VARIABLE_DATE_ESTIMATED_AMOUNT" ? "" : scheduleDateLabel(s)),
    },
    { key: "amount", label: "סכום צפוי", sortValue: (s) => s.expected_amount },
    { key: "end_date", label: "משך", sortValue: (s) => s.end_date ?? "" },
    { key: "active", label: "פעיל", sortValue: (s) => (s.is_active ? 1 : 0), filterValue: (s) => (s.is_active ? "פעיל" : "לא פעיל") },
  ];
  const { rows: sorted, sort, toggleSort, filters, setColumnFilter } = useSortFilter(visibleSchedules, columns);

  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="font-semibold">הרשאות וחיובים קבועים {schedules.length > 0 && `(${schedules.length})`}</h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setManageOpen((o) => !o)}
            className="rounded-lg border border-border px-4 py-2 text-sm font-semibold hover:bg-background"
          >
            {manageOpen ? "סגירת ניהול" : "ניהול הרשאות וחיובים קבועים"}
          </button>
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold"
          >
            + חיוב קבוע חדש
          </button>
        </div>
      </div>
      {manageOpen && (
        <div className="space-y-2 border-t border-border pt-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <label className="flex items-center gap-1 text-sm text-muted">
              <input type="checkbox" checked={showArchive} onChange={(e) => setShowArchive(e.target.checked)} />
              הצג גם ארכיון ({archivedSchedules.length} לא בתוקף)
            </label>
          </div>
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  {columns.map((col) => (
                    <SortFilterTh
                      key={col.key}
                      col={col}
                      allRows={visibleSchedules}
                      sort={sort}
                      toggleSort={toggleSort}
                      activeFilter={filters[col.key]}
                      setColumnFilter={setColumnFilter}
                    />
                  ))}
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((s) => (
                  <ScheduleRowItem key={s.id} schedule={s} onEdit={() => setEditSchedule(s)} />
                ))}
                {sorted.length === 0 && (
                  <tr>
                    <td colSpan={8} className="text-center text-muted py-4">
                      {schedules.length === 0 ? "אין הרשאות וחיובים קבועים מוגדרים" : "אין תוצאות"}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {addOpen && (
        <Modal onClose={() => setAddOpen(false)}>
          <div className="card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">חיוב קבוע חדש</h2>
              <button type="button" onClick={() => setAddOpen(false)} className="text-sm text-muted">
                סגור
              </button>
            </div>
            <NewRecurringScheduleForm departments={departments} bankAccounts={bankAccounts} categories={categories} />
          </div>
        </Modal>
      )}
      {editSchedule && (
        <Modal onClose={() => setEditSchedule(null)}>
          <div className="card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">עריכת חיוב קבוע — {editSchedule.name}</h2>
              <button type="button" onClick={() => setEditSchedule(null)} className="text-sm text-muted">
                סגור
              </button>
            </div>
            <NewRecurringScheduleForm
              departments={departments}
              bankAccounts={bankAccounts}
              categories={categories}
              existing={editSchedule}
              onSaved={() => setEditSchedule(null)}
            />
          </div>
        </Modal>
      )}
    </div>
  );
}

function ScheduleRowItem({ schedule: s, onEdit }: { schedule: ScheduleRow; onEdit: () => void }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function toggleActive() {
    startTransition(async () => {
      await setRecurringScheduleActive(s.id, !s.is_active);
      router.refresh();
    });
  }

  function remove() {
    if (!confirm(`למחוק את החיוב הקבוע "${s.name}"?`)) return;
    startTransition(async () => {
      await deleteRecurringSchedule(s.id);
      router.refresh();
    });
  }

  return (
    <tr>
      <td>{s.name}</td>
      <td>
        {s.departmentName ?? (
          <span title={s.allocations.map((a) => `${a.departmentName}: ${formatCurrency(a.amount)}`).join(", ")}>
            מפוצל ({s.allocations.length} מחלקות)
          </span>
        )}
      </td>
      <td>{frequencyLabel(s.frequency)}</td>
      <td>
        {s.type === "VARIABLE_DATE_ESTIMATED_AMOUNT" ? (
          <span className="badge bg-background text-muted">תאריך לא קבוע</span>
        ) : (
          scheduleDateLabel(s)
        )}
      </td>
      <td>
        {formatCurrency(s.expected_amount)}
        {s.type !== "FIXED_DATE_FIXED_AMOUNT" && <span className="badge bg-background text-muted mr-1">משוער</span>}
      </td>
      <td className="text-xs text-muted">{s.end_date ? `עד ${formatDate(s.end_date)}` : "ללא הגבלה"}</td>
      <td>
        <button disabled={isPending} onClick={toggleActive} className="text-xs text-primary underline">
          {s.is_active ? "פעיל" : "לא פעיל"}
        </button>
      </td>
      <td className="flex items-center gap-2">
        <button type="button" onClick={onEdit} className="text-xs text-primary underline">
          עריכה
        </button>
        <button disabled={isPending} onClick={remove} className="text-xs text-danger underline">
          מחיקה
        </button>
      </td>
    </tr>
  );
}
