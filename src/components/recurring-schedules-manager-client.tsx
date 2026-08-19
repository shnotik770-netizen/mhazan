"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteRecurringSchedule, setRecurringScheduleActive } from "@/app/(app)/settings/actions";
import { NewRecurringScheduleForm } from "@/components/recurring-schedule-form-client";
import { Modal } from "@/components/modal";
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
  earlyByDays: number;
  departmentName: string | null;
  allocations: { amount: number; departmentName: string | null }[];
};

// Recurring-schedule creation and management as an in-page modal — reused
// from the expenses report so managing them doesn't require a trip to
// settings, matching how other occasional-action forms in the app (manual
// entry, spread setup) are handled.
export function RecurringSchedulesButton({
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
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg border border-border px-4 py-2 text-sm font-semibold"
      >
        הוראות קבע
      </button>
      {open && (
        <Modal onClose={() => setOpen(false)}>
          <div className="card p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">הוראות קבע</h2>
              <button type="button" onClick={() => setOpen(false)} className="text-sm text-muted">
                סגור
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>שם</th>
                    <th>מחלקה</th>
                    <th>תדירות</th>
                    <th>תאריך</th>
                    <th>סכום צפוי</th>
                    <th>משך</th>
                    <th>פעיל</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {schedules.map((s) => (
                    <ScheduleRowItem key={s.id} schedule={s} />
                  ))}
                  {schedules.length === 0 && (
                    <tr>
                      <td colSpan={8} className="text-center text-muted py-4">
                        אין הוראות קבע מוגדרות
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="border-t border-border pt-3">
              <h3 className="font-semibold mb-1">הוספת הוראת קבע חדשה</h3>
              <NewRecurringScheduleForm departments={departments} bankAccounts={bankAccounts} categories={categories} />
            </div>
          </div>
        </Modal>
      )}
    </>
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
        {s.earlyByDays > 0 && (
          <div className="text-xs text-muted">יוצא כ-{s.earlyByDays} ימים לפני</div>
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
