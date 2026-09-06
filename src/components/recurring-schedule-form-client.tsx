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
import type { ScheduleRow } from "@/components/recurring-schedules-manager-client";
import { todayIso } from "@/lib/format";
import type { Tables } from "@/lib/supabase/database.types";

type Department = Tables<"departments">;
type BankAccountOption = { id: string; bank_name: string; account_number: string };
type CategoryOption = { id: string; name: string };

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
  const [askScope, setAskScope] = useState(false);

  // A schedule's "recurring day" button already fixes the date it fires on
  // every month/week/year — showing a separate date picker alongside it
  // (only meaningful for ONCE) would be redundant, so only the field that
  // actually matters for the selected frequency is shown.
  const isVariableMonthly = frequency === "MONTHLY" && type === "VARIABLE_DATE_ESTIMATED_AMOUNT";
  const allocatedSum = allocations.reduce((sum, a) => sum + (a.amount || 0), 0);

  // An amount/date on an estimated schedule is a running guess, not a fixed
  // fact — a change to it is ambiguous: did this month just come in
  // different, or should the whole rule change from now on? Only ask when
  // there's actually something to be ambiguous about (editing an existing
  // MONTHLY estimated-type schedule, and the amount or its day actually
  // changed) — a brand-new schedule or a fixed-amount one has no "this
  // month only" meaning.
  const amountOrDateChanged =
    Boolean(existing) &&
    frequency === "MONTHLY" &&
    type !== "FIXED_DATE_FIXED_AMOUNT" &&
    (Number(expectedAmount) !== existing!.expected_amount ||
      (type === "FIXED_DATE_ESTIMATED_AMOUNT" &&
        new Date(`${startDate}T00:00:00`).getDate() !== existing!.day_of_month));

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
    if (amountOrDateChanged) {
      setAskScope(true);
      return;
    }
    finalizeSubmit(true);
  }

  // `forever` decides whether the new amount/day become the rule itself
  // (updateRecurringSchedule persists them) or only this month's actual
  // figure (the rule keeps its original amount/day, and the new figure is
  // recorded as a one-off confirmed occurrence instead) — see
  // `amountOrDateChanged` above for when this choice is actually offered.
  function finalizeSubmit(forever: boolean) {
    setAskScope(false);
    startTransition(async () => {
      try {
        const fd = new FormData();
        fd.set("name", name);
        fd.set("direction", "EXPENSE");
        fd.set("type", type);
        fd.set("frequency", frequency);
        const ruleAmount = forever ? expectedAmount : String(existing!.expected_amount);
        if (frequency === "MONTHLY" && !isVariableMonthly) {
          const ruleDay = forever ? new Date(`${startDate}T00:00:00`).getDate() : existing!.day_of_month;
          fd.set("day_of_month", String(ruleDay));
        }
        if (frequency === "ONCE") fd.set("one_time_date", oneTimeDate);
        fd.set("expected_amount", ruleAmount);
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
          if (!forever) {
            const day = new Date(`${startDate}T00:00:00`).getDate();
            const periodDate =
              type === "VARIABLE_DATE_ESTIMATED_AMOUNT"
                ? todayIso()
                : (() => {
                    const d = new Date();
                    d.setDate(1);
                    d.setDate(day);
                    return d.toISOString().slice(0, 10);
                  })();
            const payload: ScheduleConfirmationAllocation[] = split
              ? allocations.filter((a) => a.departmentId && a.amount > 0)
              : [{ departmentId, amount: Number(expectedAmount) }];
            const result = await confirmScheduleOccurrence(existing.id, periodDate, periodDate, payload);
            if (result.error) throw new Error(result.error);
          }
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

  return (
    <div className="space-y-2 pt-2">
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
        </select>

        <select
          value={frequency}
          onChange={(e) => {
            const f = e.target.value;
            setFrequency(f);
            if (f !== "MONTHLY" && type === "VARIABLE_DATE_ESTIMATED_AMOUNT") setType("FIXED_DATE_FIXED_AMOUNT");
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

        {frequency === "MONTHLY" && !isVariableMonthly && (
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            title="היום בחודש שנבחר כאן קובע את יום החיוב החוזר בכל חודש"
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
        {isVariableMonthly && (
          <div className="text-xs text-muted flex items-center">התאריך ייקבע כל חודש בעת אישור הסכום בפועל</div>
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

      {askScope && (
        <div className="rounded-lg border border-warning bg-background p-3 space-y-2 text-sm">
          <p>שינית סכום או תאריך של חיוב עם סכום/תאריך משוער — האם זה שינוי לחודש הנוכחי בלבד, או שהחיוב עצמו משתנה מעכשיו והלאה?</p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              disabled={isPending}
              onClick={() => finalizeSubmit(false)}
              className="rounded border border-border px-3 py-1 disabled:opacity-50"
            >
              רק לחודש הנוכחי
            </button>
            <button
              disabled={isPending}
              onClick={() => finalizeSubmit(true)}
              className="rounded bg-primary text-primary-foreground px-3 py-1 disabled:opacity-50"
            >
              לתמיד
            </button>
            <button onClick={() => setAskScope(false)} className="text-xs text-muted">
              ביטול
            </button>
          </div>
        </div>
      )}

      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
