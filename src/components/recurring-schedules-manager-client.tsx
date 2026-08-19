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
  departmentName: string | null;
  allocations: { amount: number; departmentName: string | null }[];
};

function departmentLabel(s: ScheduleRow) {
  return s.departmentName ?? `מפוצל (${s.allocations.length} מחלקות)`;
}

// Recurring-schedule creation and management, inline on the checks page —
// not tucked behind a modal, since this is meant to be the one place this
// gets managed from (no longer duplicated into /expenses or /settings).
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
  const { rows: sorted, sort, toggleSort, filters, setColumnFilter } = useSortFilter(schedules, columns);

  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="font-semibold">הוראות קבע</h2>
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          className="rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold"
        >
          + הוראת קבע חדשה
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              {columns.map((col) => (
                <SortFilterTh
                  key={col.key}
                  col={col}
                  allRows={schedules}
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
              <ScheduleRowItem key={s.id} schedule={s} />
            ))}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={8} className="text-center text-muted py-4">
                  {schedules.length === 0 ? "אין הוראות קבע מוגדרות" : "אין תוצאות"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {addOpen && (
        <Modal onClose={() => setAddOpen(false)}>
          <div className="card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">הוראת קבע חדשה</h2>
              <button type="button" onClick={() => setAddOpen(false)} className="text-sm text-muted">
                סגור
              </button>
            </div>
            <NewRecurringScheduleForm departments={departments} bankAccounts={bankAccounts} categories={categories} />
          </div>
        </Modal>
      )}
    </div>
  );
}

function ScheduleRowItem({ schedule: s }: { schedule: ScheduleRow }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function toggleActive() {
    startTransition(async () => {
      await setRecurringScheduleActive(s.id, !s.is_active);
      router.refresh();
    });
  }

  function remove() {
    if (!confirm(`למחוק את הוראת הקבע "${s.name}"?`)) return;
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
      <td>
        <button disabled={isPending} onClick={remove} className="text-xs text-danger underline">
          מחיקה
        </button>
      </td>
    </tr>
  );
}
