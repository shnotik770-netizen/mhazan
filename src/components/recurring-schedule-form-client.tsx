"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  confirmScheduleOccurrence,
  createRecurringSchedule,
  updateRecurringSchedule,
  type ScheduleConfirmationAllocation,
} from "@/app/(app)/settings/actions";
import { SplitAllocationEditor, type Allocation } from "@/components/split-allocation-editor";
import { ScheduleOccurrenceConfirmFields } from "@/components/schedule-occurrence-confirm-fields";
import type { ScheduleRow } from "@/components/recurring-schedules-manager-client";
import type { Tables } from "@/lib/supabase/database.types";

type Department = Tables<"departments">;
type BankAccountOption = { id: string; bank_name: string; account_number: string };
type CategoryOption = { id: string; name: string };

// A schedule whose amount and/or date aren't both fully fixed is inherently
// ambiguous to edit: did the actual figure for this one month just come in
// different, or should the rule itself change from now on? We ask this up
// front, the moment an eligible schedule is opened for editing, instead of
// only after the admin happens to retype a different amount/date — that
// older approach couldn't handle confirming this month's *unchanged*
// figure, and only asked reactively once something had already changed.
function isScopeAmbiguous(s: Pick<ScheduleRow, "frequency" | "type">): boolean {
  return s.frequency === "MONTHLY" && s.type !== "FIXED_DATE_FIXED_AMOUNT";
}

// The period a MONTHLY schedule's current-month occurrence falls on — the
// 1st of the month when there's no day_of_month (either variable-date
// type), otherwise that day. Must match get_pending_schedule_confirmations'
// / materialize_known_recurring_occurrences' own period_date computation so
// a confirmation recorded here is recognized as covering that occurrence
// (and doesn't keep showing up as still-pending afterward).
function currentMonthlyPeriodDate(dayOfMonth: number | null): string {
  const d = new Date();
  d.setDate(1);
  if (dayOfMonth) d.setDate(dayOfMonth);
  return d.toISOString().slice(0, 10);
}

// Same form for creating a new schedule and editing an existing one's
// rule — passing `existing` switches every field's initial value to the
// schedule being edited and calls updateRecurringSchedule instead of
// createRecurringSchedule on submit.
export function NewRecurringScheduleForm({
  departments,
  bankAccounts,
  categories,
  existing,
  onSaved,
}: {
  departments: Department[];
  bankAccounts: BankAccountOption[];
  categories: CategoryOption[];
  existing?: ScheduleRow;
  onSaved?: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Editing an eligible existing schedule starts on a scope question
  // instead of the form itself — see isScopeAmbiguous. A brand-new schedule,
  // or an existing one with no such ambiguity (FIXED_DATE_FIXED_AMOUNT, or
  // not MONTHLY), has nothing to ask and goes straight to the form.
  const [scope, setScope] = useState<"ask" | "forever" | "this-month">(
    existing && isScopeAmbiguous(existing) ? "ask" : "forever",
  );

  const existingIsSplit = (existing?.allocations.length ?? 0) >= 2;
  const [name, setName] = useState(existing?.name ?? "");
  const [split, setSplit] = useState(existingIsSplit);
  const [departmentId, setDepartmentId] = useState(existing?.departmentId ?? "");
  const [allocations, setAllocations] = useState<Allocation[]>(
    existingIsSplit ? existing!.allocations.map((a) => ({ departmentId: a.departmentId, amount: a.amount })) : [],
  );
  const [type, setType] = useState(existing?.type ?? "FIXED_DATE_FIXED_AMOUNT");
  const [frequency, setFrequency] = useState(existing?.frequency ?? "MONTHLY");
  // Only "day of month" is actually stored — the month/year picked here
  // just gives the date input a sensible starting point (today, or for an
  // existing schedule, today's month with its existing day) since the
  // recurrence itself starts running from whenever the row is saved.
  const [startDate, setStartDate] = useState(() => {
    const today = new Date();
    const day = existing?.day_of_month ?? today.getDate();
    today.setDate(1);
    today.setDate(day);
    return today.toISOString().slice(0, 10);
  });
  const [oneTimeDate, setOneTimeDate] = useState(existing?.one_time_date ?? "");
  const [expectedAmount, setExpectedAmount] = useState(existing ? String(existing.expected_amount) : "");
  const [bankAccountId, setBankAccountId] = useState(existing?.bankAccountId ?? "");
  const [categoryId, setCategoryId] = useState(existing?.categoryId ?? "");
  const [limited, setLimited] = useState(Boolean(existing?.end_date));
  const [durationMonths, setDurationMonths] = useState("");
  // Only meaningful for type VARIABLE_DATE_FIXED_AMOUNT: whether this
  // schedule happens to have an approximate day at all, or notifies across
  // the whole month instead (see that option's own label below).
  const [hasApproxDay, setHasApproxDay] = useState(() =>
    existing?.type === "VARIABLE_DATE_FIXED_AMOUNT" ? existing.day_of_month !== null : true,
  );

  // A schedule's "recurring day" button already fixes the date it fires on
  // every month/week/year — showing a separate date picker alongside it
  // (only meaningful for ONCE) would be redundant, so only the field that
  // actually matters for the selected frequency/type is shown.
  const isFullyVariableMonthly = frequency === "MONTHLY" && type === "VARIABLE_DATE_ESTIMATED_AMOUNT";
  const isOptionalDayMonthly = frequency === "MONTHLY" && type === "VARIABLE_DATE_FIXED_AMOUNT";
  const showsDayPicker = frequency === "MONTHLY" && !isFullyVariableMonthly && (!isOptionalDayMonthly || hasApproxDay);
  const allocatedSum = allocations.reduce((sum, a) => sum + (a.amount || 0), 0);

  function reset() {
    setName("");
    setSplit(false);
    setDepartmentId("");
    setAllocations([]);
    setStartDate(new Date().toISOString().slice(0, 10));
    setOneTimeDate("");
    setExpectedAmount("");
    setBankAccountId("");
    setCategoryId("");
    setLimited(false);
    setDurationMonths("");
    setHasApproxDay(true);
  }

  function validate(): string | null {
    if (split) {
      const valid = allocations.filter((a) => a.departmentId && a.amount > 0);
      if (valid.length < 2) return "פיצול דורש לפחות שתי מחלקות עם סכום";
      if (Math.abs(allocatedSum - Number(expectedAmount)) > 0.01) {
        return `סכום הפיצול (${allocatedSum}) חייב להיות שווה לסכום הצפוי (${expectedAmount})`;
      }
    } else if (!departmentId) {
      return "יש לבחור מחלקה";
    }
    if (limited && (!durationMonths || Number(durationMonths) <= 0)) {
      return "יש להזין מספר חודשים תקין, או לבטל את הגבלת הזמן";
    }
    return null;
  }

  function submit() {
    setError(null);
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    startTransition(async () => {
      try {
        const fd = new FormData();
        fd.set("name", name);
        fd.set("direction", "EXPENSE");
        fd.set("type", type);
        fd.set("frequency", frequency);
        if (showsDayPicker) {
          fd.set("day_of_month", String(new Date(`${startDate}T00:00:00`).getDate()));
        }
        if (frequency === "ONCE") fd.set("one_time_date", oneTimeDate);
        fd.set("expected_amount", expectedAmount);
        fd.set("bank_account_id", bankAccountId);
        fd.set("category_id", categoryId);
        if (limited && durationMonths) {
          const end = new Date();
          end.setMonth(end.getMonth() + Number(durationMonths));
          fd.set("end_date", end.toISOString().slice(0, 10));
        }
        if (split) {
          for (const a of allocations.filter((x) => x.departmentId && x.amount > 0)) {
            fd.append("allocation_department_id", a.departmentId);
            fd.append("allocation_amount", String(a.amount));
          }
        } else {
          fd.set("department_id", departmentId);
        }
        if (existing) {
          await updateRecurringSchedule(existing.id, fd);
          onSaved?.();
        } else {
          await createRecurringSchedule(fd);
          reset();
        }
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "שגיאה בשמירה");
      }
    });
  }

  // "this month only" never touches the rule itself — it just records this
  // one occurrence's real figure, exactly like confirming it from "אישור
  // סכומים בפועל" would, only reached from the edit button instead of
  // waiting for that list to flag it.
  function confirmThisMonth(confirmedDate: string, payload: ScheduleConfirmationAllocation[]) {
    setError(null);
    startTransition(async () => {
      const periodDate = currentMonthlyPeriodDate(existing!.day_of_month);
      const result = await confirmScheduleOccurrence(existing!.id, periodDate, confirmedDate, payload);
      if (result.error) {
        setError(result.error);
        return;
      }
      onSaved?.();
      router.refresh();
    });
  }

  if (scope === "ask" && existing) {
    return (
      <div className="rounded-lg border border-warning bg-background p-3 space-y-2 text-sm">
        <p>
          לחיוב הזה יש סכום ו/או תאריך שאינם קבועים לגמרי — האם העריכה היא שינוי הכלל עצמו מעכשיו והלאה, או רק אישור/עדכון
          מה באמת יהיה או היה החודש הזה, בלי לשנות את הכלל?
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setScope("this-month")}
            className="rounded border border-border px-3 py-1 hover:bg-background"
          >
            רק החודש הנוכחי
          </button>
          <button
            type="button"
            onClick={() => setScope("forever")}
            className="rounded bg-primary text-primary-foreground px-3 py-1"
          >
            שינוי הכלל (לתמיד)
          </button>
        </div>
      </div>
    );
  }

  if (scope === "this-month" && existing) {
    return (
      <div className="space-y-2">
        <ScheduleOccurrenceConfirmFields
          departments={departments}
          isSplit={existingIsSplit}
          expectedAmount={existing.expected_amount}
          departmentId={existing.departmentId}
          splitAllocations={existing.allocations}
          initialConfirmedDate={currentMonthlyPeriodDate(existing.day_of_month)}
          isPending={isPending}
          error={error}
          onSubmit={confirmThisMonth}
          submitLabel="שמירה — רק החודש הנוכחי"
        />
        <button type="button" onClick={() => setScope("ask")} className="text-xs text-muted underline">
          חזרה
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2 pt-2">
      {existing && isScopeAmbiguous(existing) && (
        <p className="text-xs text-muted">
          עורך כעת את הכלל עצמו, לתמיד —{" "}
          <button type="button" onClick={() => setScope("ask")} className="underline">
            במקום זאת לעדכן רק את החודש הנוכחי
          </button>
        </p>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="שם ההוראה"
          className="rounded border border-border bg-transparent px-2 py-1 text-sm"
        />

        {!split ? (
          <select
            value={departmentId}
            onChange={(e) => setDepartmentId(e.target.value)}
            className="rounded border border-border bg-transparent px-2 py-1 text-sm"
          >
            <option value="">מחלקה...</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        ) : (
          <div className="text-xs text-muted flex items-center">פיצול בין מחלקות — למטה</div>
        )}

        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="rounded border border-border bg-transparent px-2 py-1 text-sm"
        >
          <option value="FIXED_DATE_FIXED_AMOUNT">תאריך קבוע עם סכום קבוע</option>
          <option value="FIXED_DATE_ESTIMATED_AMOUNT">תאריך קבוע עם סכום משוער</option>
          <option value="VARIABLE_DATE_ESTIMATED_AMOUNT">תאריך לא קבוע עם סכום משוער (חודשי בלבד)</option>
          <option value="VARIABLE_DATE_FIXED_AMOUNT">תאריך משוער עם סכום קבוע (חודשי בלבד)</option>
        </select>

        <select
          value={frequency}
          onChange={(e) => {
            const f = e.target.value;
            setFrequency(f);
            if (f !== "MONTHLY" && (type === "VARIABLE_DATE_ESTIMATED_AMOUNT" || type === "VARIABLE_DATE_FIXED_AMOUNT")) {
              setType("FIXED_DATE_FIXED_AMOUNT");
            }
            if (f === "ONCE") {
              setLimited(false);
              setDurationMonths("");
            }
          }}
          className="rounded border border-border bg-transparent px-2 py-1 text-sm"
        >
          <option value="MONTHLY">חודשי</option>
          <option value="ONCE">חד פעמי</option>
        </select>

        {showsDayPicker && (
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            title={
              isOptionalDayMonthly
                ? "תאריך משוער בלבד — ההתראה תתחיל להופיע לקראת היום הזה בכל חודש, גם אם בפועל זה יורד ביום קצת שונה"
                : "היום בחודש שנבחר כאן קובע את יום החיוב החוזר בכל חודש"
            }
            className="rounded border border-border bg-transparent px-2 py-1 text-sm"
          />
        )}
        {frequency === "ONCE" && (
          <input
            type="date"
            value={oneTimeDate}
            onChange={(e) => setOneTimeDate(e.target.value)}
            className="rounded border border-border bg-transparent px-2 py-1 text-sm"
          />
        )}
        {isFullyVariableMonthly && (
          <div className="text-xs text-muted flex items-center">התאריך ייקבע כל חודש בעת אישור הסכום בפועל</div>
        )}
        {isOptionalDayMonthly && (
          <label className="flex items-center gap-1 text-xs text-muted">
            <input type="checkbox" checked={hasApproxDay} onChange={(e) => setHasApproxDay(e.target.checked)} />
            {hasApproxDay ? "יש לי תאריך משוער ליום מסוים" : "אין לי תאריך משוער — יוצג לאורך כל החודש"}
          </label>
        )}

        <input
          type="number"
          value={expectedAmount}
          onChange={(e) => setExpectedAmount(e.target.value)}
          placeholder="סכום צפוי"
          className="rounded border border-border bg-transparent px-2 py-1 text-sm"
        />

        <select
          value={bankAccountId}
          onChange={(e) => setBankAccountId(e.target.value)}
          className="rounded border border-border bg-transparent px-2 py-1 text-sm"
        >
          <option value="">חשבון בנק...</option>
          {bankAccounts.map((b) => (
            <option key={b.id} value={b.id}>
              {b.bank_name} ({b.account_number})
            </option>
          ))}
        </select>

        <select
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          className="rounded border border-border bg-transparent px-2 py-1 text-sm"
        >
          <option value="">קטגוריה (אופציונלי)...</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>

        <label className="flex items-center gap-1 text-xs text-muted">
          <input
            type="checkbox"
            checked={split}
            onChange={(e) => {
              setSplit(e.target.checked);
              if (e.target.checked) setDepartmentId("");
              else setAllocations([]);
            }}
          />
          פיצול בין כמה מחלקות
        </label>

        {frequency !== "ONCE" && (
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1 text-xs text-muted whitespace-nowrap">
              <input
                type="checkbox"
                checked={limited}
                onChange={(e) => {
                  setLimited(e.target.checked);
                  if (!e.target.checked) setDurationMonths("");
                }}
              />
              הגבלה למספר חודשים
            </label>
            {limited ? (
              <input
                type="number"
                min="1"
                value={durationMonths}
                onChange={(e) => setDurationMonths(e.target.value)}
                placeholder="כמה חודשים"
                className="rounded border border-border bg-transparent px-2 py-1 text-sm w-24"
              />
            ) : (
              <span className="text-xs text-muted">קבוע ללא הגבלת זמן</span>
            )}
          </div>
        )}

        <button
          disabled={isPending}
          onClick={submit}
          className="rounded bg-primary text-primary-foreground text-sm px-3 py-1 disabled:opacity-50"
        >
          {existing ? "שמירת שינויים" : "הוסף חיוב קבוע"}
        </button>
      </div>

      {split && (
        <SplitAllocationEditor
          departments={departments}
          totalAmount={Number(expectedAmount) || 0}
          allocations={allocations}
          onChange={setAllocations}
        />
      )}

      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
