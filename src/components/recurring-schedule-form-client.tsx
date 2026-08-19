"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createRecurringSchedule } from "@/app/(app)/settings/actions";
import { SplitAllocationEditor, type Allocation } from "@/components/split-allocation-editor";
import type { Tables } from "@/lib/supabase/database.types";

type Department = Tables<"departments">;
type BankAccountOption = { id: string; bank_name: string; account_number: string };
type CategoryOption = { id: string; name: string };

const WEEKDAY_LABELS = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"];

export function NewRecurringScheduleForm({
  departments,
  bankAccounts,
  categories,
}: {
  departments: Department[];
  bankAccounts: BankAccountOption[];
  categories: CategoryOption[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [split, setSplit] = useState(false);
  const [departmentId, setDepartmentId] = useState("");
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [type, setType] = useState("FIXED_DATE_FIXED_AMOUNT");
  const [frequency, setFrequency] = useState("MONTHLY");
  const [dayOfMonth, setDayOfMonth] = useState("");
  const [dayOfWeek, setDayOfWeek] = useState("0");
  const [oneTimeDate, setOneTimeDate] = useState("");
  const [expectedAmount, setExpectedAmount] = useState("");
  const [bankAccountId, setBankAccountId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [limited, setLimited] = useState(false);
  const [durationMonths, setDurationMonths] = useState("");
  const [earlyByDays, setEarlyByDays] = useState("");

  // A schedule's "recurring day" button already fixes the date it fires on
  // every month/week/year — showing a separate date picker alongside it
  // (only meaningful for ONCE) would be redundant, so only the field that
  // actually matters for the selected frequency is shown.
  const isVariableMonthly = frequency === "MONTHLY" && type === "VARIABLE_DATE_ESTIMATED_AMOUNT";
  const allocatedSum = allocations.reduce((sum, a) => sum + (a.amount || 0), 0);

  function reset() {
    setName("");
    setSplit(false);
    setDepartmentId("");
    setAllocations([]);
    setDayOfMonth("");
    setOneTimeDate("");
    setExpectedAmount("");
    setBankAccountId("");
    setCategoryId("");
    setLimited(false);
    setDurationMonths("");
    setEarlyByDays("");
  }

  function submit() {
    setError(null);
    if (split) {
      const valid = allocations.filter((a) => a.departmentId && a.amount > 0);
      if (valid.length < 2) {
        setError("פיצול דורש לפחות שתי מחלקות עם סכום");
        return;
      }
      if (Math.abs(allocatedSum - Number(expectedAmount)) > 0.01) {
        setError(`סכום הפיצול (${allocatedSum}) חייב להיות שווה לסכום הצפוי (${expectedAmount})`);
        return;
      }
    } else if (!departmentId) {
      setError("יש לבחור מחלקה");
      return;
    }
    if (limited && (!durationMonths || Number(durationMonths) <= 0)) {
      setError("יש להזין מספר חודשים תקין, או לבטל את הגבלת הזמן");
      return;
    }

    startTransition(async () => {
      try {
        const fd = new FormData();
        fd.set("name", name);
        fd.set("direction", "EXPENSE");
        fd.set("type", type);
        fd.set("frequency", frequency);
        if ((frequency === "MONTHLY" || frequency === "YEARLY") && !isVariableMonthly) fd.set("day_of_month", dayOfMonth);
        if (frequency === "WEEKLY") fd.set("day_of_week", dayOfWeek);
        if (frequency === "ONCE") fd.set("one_time_date", oneTimeDate);
        fd.set("expected_amount", expectedAmount);
        fd.set("bank_account_id", bankAccountId);
        fd.set("category_id", categoryId);
        if (earlyByDays) fd.set("early_by_days", earlyByDays);
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
        await createRecurringSchedule(fd);
        reset();
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "שגיאה בהוספה");
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
          }}
          className="rounded border border-border bg-transparent px-2 py-1 text-sm"
        >
          <option value="MONTHLY">חודשי</option>
          <option value="WEEKLY">שבועי</option>
          <option value="YEARLY">שנתי</option>
          <option value="ONCE">חד פעמי</option>
        </select>

        {(frequency === "MONTHLY" || frequency === "YEARLY") && !isVariableMonthly && (
          <input
            type="number"
            min="1"
            max="31"
            value={dayOfMonth}
            onChange={(e) => setDayOfMonth(e.target.value)}
            placeholder="יום בחודש"
            className="rounded border border-border bg-transparent px-2 py-1 text-sm"
          />
        )}
        {frequency === "WEEKLY" && (
          <select
            value={dayOfWeek}
            onChange={(e) => setDayOfWeek(e.target.value)}
            className="rounded border border-border bg-transparent px-2 py-1 text-sm"
          >
            {WEEKDAY_LABELS.map((label, i) => (
              <option key={i} value={i}>
                {label}
              </option>
            ))}
          </select>
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

        <div className="flex items-center gap-1">
          <input
            type="number"
            min="0"
            value={earlyByDays}
            onChange={(e) => setEarlyByDays(e.target.value)}
            placeholder="0"
            className="rounded border border-border bg-transparent px-2 py-1 text-sm w-16"
          />
          <label className="text-xs text-muted whitespace-nowrap">ימים לפני התאריך זה בדרך כלל כבר יוצא (אופציונלי)</label>
        </div>

        <button
          disabled={isPending}
          onClick={submit}
          className="rounded bg-primary text-primary-foreground text-sm px-3 py-1 disabled:opacity-50"
        >
          הוסף הוראת קבע
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
