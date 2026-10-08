"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
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

// Folds the old separate "משך" (duration) column into this one: a one-time
// schedule has no duration concept at all, and a recurring one either repeats
// with no end or stops at some point — "חודשי מוגבל" (עד <date>) says that in
// one place instead of needing a second column just to repeat frequency with
// an end date tacked on.
function frequencyLabel(frequency: string, endDate: string | null) {
  if (frequency === "ONCE") return "חד פעמי";
  const base = frequency === "MONTHLY" ? "חודשי" : frequency === "WEEKLY" ? "שבועי" : frequency === "YEARLY" ? "שנתי" : frequency;
  return endDate ? `${base} מוגבל (עד ${formatDate(endDate)})` : base;
}

function scheduleDateLabel(s: { frequency: string; day_of_month: number | null; day_of_week: number | null; one_time_date: string | null }) {
  if (s.frequency === "WEEKLY" && s.day_of_week !== null) return `יום ${WEEKDAY_LABELS[s.day_of_week] ?? s.day_of_week}`;
  if ((s.frequency === "MONTHLY" || s.frequency === "YEARLY") && s.day_of_month !== null) return `${s.day_of_month} לחודש`;
  if (s.frequency === "ONCE" && s.one_time_date) return s.one_time_date;
  return "—";
}

// These two types never have a *guaranteed* date — VARIABLE_DATE_ESTIMATED_AMOUNT
// never carries a day_of_month at all, and VARIABLE_DATE_FIXED_AMOUNT's is only
// ever an optional best guess (used to start its notification window near
// that day instead of from the 1st of the month) — providing one doesn't
// promote it to a "fixed" date, so it's always labeled as an estimate.
function isVariableDateType(type: string) {
  return type === "VARIABLE_DATE_ESTIMATED_AMOUNT" || type === "VARIABLE_DATE_FIXED_AMOUNT";
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

// A schedule that's inactive, whose end date has already passed, or — for a
// one-time (ONCE) schedule — whose single date has already passed, has
// nothing left to do — it stays in the DB (past occurrences still point to
// it) but has no business cluttering the list of things an admin might
// actually need to act on, so it's archived out of the default view. A
// recurring schedule's own end_date doesn't apply here: ONCE never sets one
// (there's nothing to end), so without this it would otherwise count as
// "no limit" and linger in the active list forever once its date passed.
function isArchived(s: ScheduleRow, today: string): boolean {
  if (!s.is_active) return true;
  if (s.end_date && s.end_date < today) return true;
  if (s.frequency === "ONCE" && s.one_time_date && s.one_time_date < today) return true;
  return false;
}

// Self-contained "+ חיוב קבוע חדש" button + modal, shared between
// RecurringSchedulesSection (its usual home, on the checks page) and the
// checks page's own top action toolbar — a second, independent instance
// with its own open state, not a shared one, so opening one never affects
// the other.
export function NewRecurringScheduleButton({
  departments,
  bankAccounts,
  categories,
  className = "rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold",
}: {
  departments: Department[];
  bankAccounts: BankAccountOption[];
  categories: CategoryOption[];
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>
        + חיוב קבוע חדש
      </button>
      {open && (
        <Modal onClose={() => setOpen(false)}>
          <div className="card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">חיוב קבוע חדש</h2>
              <button type="button" onClick={() => setOpen(false)} className="text-sm text-muted">
                סגור
              </button>
            </div>
            <NewRecurringScheduleForm departments={departments} bankAccounts={bankAccounts} categories={categories} />
          </div>
        </Modal>
      )}
    </>
  );
}

// כרטיס סיכום קטן שחי בדף הצ'קים — לא נושא את טבלת הניהול המלאה בעצמו (זו עברה לדף
// ייעודי, /recurring-schedules, ולא נפתחת יותר כחלון צף מעל דף הצ'קים) אלא רק מקשר
// אליה, לצד הוספה מהירה של חיוב קבוע חדש שנשארת נוחה כחלון קופץ קטן.
export function RecurringSchedulesSection({
  scheduleCount,
  departments,
  bankAccounts,
  categories,
}: {
  scheduleCount: number;
  departments: Department[];
  bankAccounts: BankAccountOption[];
  categories: CategoryOption[];
}) {
  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="font-semibold">הרשאות וחיובים קבועים {scheduleCount > 0 && `(${scheduleCount})`}</h2>
        <div className="flex items-center gap-2">
          <Link
            href="/recurring-schedules"
            className="rounded-lg border border-border px-4 py-2 text-sm font-semibold hover:bg-background"
          >
            ניהול הרשאות וחיובים קבועים
          </Link>
          <NewRecurringScheduleButton departments={departments} bankAccounts={bankAccounts} categories={categories} />
        </div>
      </div>
    </div>
  );
}

// טבלת הניהול המלאה — מוצגת כתוכן רגיל של דף /recurring-schedules, לא כחלון צף מעל
// דף אחר. עריכת שורה בודדת עדיין נפתחת כחלון קטן (דפוס admin-table רגיל), רק רשימת
// כל ההרשאות/חיובים עצמה כבר לא. הרשאות/חיובים שאינם עוד בתוקף (לא פעילים, או
// שתאריך הסיום שלהם עבר) מוסתרים כברירת מחדל, מאחורי תיבת סימון "ארכיון".
export function RecurringSchedulesManager({
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
  const [showArchive, setShowArchive] = useState(false);
  const [editSchedule, setEditSchedule] = useState<ScheduleRow | null>(null);

  const today = new Date().toISOString().slice(0, 10);
  const activeSchedules = schedules.filter((s) => !isArchived(s, today));
  const archivedSchedules = schedules.filter((s) => isArchived(s, today));
  const visibleSchedules = showArchive ? schedules : activeSchedules;

  // One table per bank account instead of a single mixed list — a schedule
  // without a bank account (allowed by the schema) falls into its own group
  // rather than being silently dropped. Bank accounts are listed in the same
  // order as the `bankAccounts` prop, and a group is only shown at all once
  // it actually has a schedule in the current (active/archive) view.
  const groupedByAccount = new Map<string, ScheduleRow[]>();
  for (const s of visibleSchedules) {
    const key = s.bankAccountId ?? "none";
    const list = groupedByAccount.get(key);
    if (list) list.push(s);
    else groupedByAccount.set(key, [s]);
  }
  const accountGroups: { key: string; label: string; schedules: ScheduleRow[] }[] = [
    ...bankAccounts
      .filter((b) => groupedByAccount.has(b.id))
      .map((b) => ({ key: b.id, label: `${b.bank_name} (${b.account_number})`, schedules: groupedByAccount.get(b.id)! })),
    ...(groupedByAccount.has("none")
      ? [{ key: "none", label: "ללא חשבון בנק משויך", schedules: groupedByAccount.get("none")! }]
      : []),
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm text-muted">{schedules.length} הרשאות וחיובים קבועים מוגדרים</p>
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          className="rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold"
        >
          + חיוב קבוע חדש
        </button>
      </div>

      <label className="flex items-center gap-1 text-sm text-muted">
        <input type="checkbox" checked={showArchive} onChange={(e) => setShowArchive(e.target.checked)} />
        הצג גם ארכיון ({archivedSchedules.length} לא בתוקף)
      </label>

      {accountGroups.length > 0 ? (
        <div className="space-y-6">
          {accountGroups.map((g) => (
            <div key={g.key} className="space-y-2">
              <h3 className="text-sm font-semibold">
                {g.label} <span className="text-muted font-normal">({g.schedules.length})</span>
              </h3>
              <ScheduleTable schedules={g.schedules} onEdit={setEditSchedule} />
            </div>
          ))}
        </div>
      ) : (
        <div className="card p-4 text-center text-muted py-4">
          {schedules.length === 0 ? "אין הרשאות וחיובים קבועים מוגדרים" : "אין תוצאות"}
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

// One bank account's own table — its own sort/filter state, independent of
// every other account's table, since the columns no longer need to tell
// accounts apart (that's now the surrounding heading's job).
function ScheduleTable({ schedules, onEdit }: { schedules: ScheduleRow[]; onEdit: (s: ScheduleRow) => void }) {
  const columns: ColumnDef<ScheduleRow>[] = [
    { key: "name", label: "שם", sortValue: (s) => s.name, filterValue: (s) => s.name },
    { key: "department", label: "מחלקה", sortValue: (s) => departmentLabel(s), filterValue: (s) => departmentLabel(s) },
    {
      key: "frequency",
      label: "תדירות",
      sortValue: (s) => s.frequency,
      filterValue: (s) => frequencyLabel(s.frequency, s.end_date),
    },
    {
      key: "date",
      label: "תאריך",
      sortValue: (s) => (isVariableDateType(s.type) ? "" : scheduleDateLabel(s)),
      filterValue: (s) => (isVariableDateType(s.type) ? "משוער" : "קבוע"),
    },
    {
      key: "amount",
      label: "סכום צפוי",
      sortValue: (s) => s.expected_amount,
      filterValue: (s) => (s.type === "FIXED_DATE_FIXED_AMOUNT" || s.type === "VARIABLE_DATE_FIXED_AMOUNT" ? "קבוע" : "משוער"),
    },
    { key: "active", label: "פעיל", sortValue: (s) => (s.is_active ? 1 : 0), filterValue: (s) => (s.is_active ? "פעיל" : "לא פעיל") },
  ];
  const { rows: sorted, sort, toggleSort, filters, setColumnFilter } = useSortFilter(schedules, columns);

  return (
    <div className="card p-4 overflow-x-auto">
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
            <ScheduleRowItem key={s.id} schedule={s} onEdit={() => onEdit(s)} />
          ))}
          {sorted.length === 0 && (
            <tr>
              <td colSpan={7} className="text-center text-muted py-4">
                אין תוצאות
              </td>
            </tr>
          )}
        </tbody>
      </table>
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
      <td>{frequencyLabel(s.frequency, s.end_date)}</td>
      <td>
        {isVariableDateType(s.type) ? (
          <span className="badge bg-background text-muted">
            {s.day_of_month ? `משוער — סביב ה-${s.day_of_month} לחודש` : "משוער — לאורך כל החודש"}
          </span>
        ) : (
          scheduleDateLabel(s)
        )}
      </td>
      <td>
        {formatCurrency(s.expected_amount)}
        {s.type !== "FIXED_DATE_FIXED_AMOUNT" && s.type !== "VARIABLE_DATE_FIXED_AMOUNT" && (
          <span className="badge bg-background text-muted mr-1">משוער</span>
        )}
      </td>
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
