"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  confirmScheduleOccurrence,
  ignoreScheduleOccurrence,
  updateScheduleExpectedAmount,
  type ScheduleConfirmationAllocation,
} from "@/app/(app)/settings/actions";
import { BankGroupHeading, bankColorFor, groupByBank } from "@/components/bank-grouping";
import { DateInput } from "@/components/date-input";
import { RowActionsMenu, rowActionButtonClass } from "@/components/row-actions-menu";
import { SplitAllocationEditor } from "@/components/split-allocation-editor";
import { formatCurrency, formatDate } from "@/lib/format";
import type { Tables } from "@/lib/supabase/database.types";

type Department = Tables<"departments">;

export type PendingConfirmation = {
  scheduleId: string;
  scheduleName: string;
  direction: string;
  departmentId: string | null;
  departmentName: string | null;
  bank_name: string | null;
  account_number: string | null;
  expectedAmount: number;
  periodDate: string;
  isSplit: boolean;
  splitAllocations: { departmentId: string; departmentName: string; amount: number }[];
};

const COLUMN_COUNT = 7;

export function ScheduleConfirmationsList({
  pending,
  departments,
}: {
  pending: PendingConfirmation[];
  departments: Department[];
}) {
  if (pending.length === 0) return null;
  const grouped = groupByBank(pending);

  return (
    <div className="card p-4 space-y-3">
      <div>
        <h2 className="font-semibold">אישור סכומים בפועל — {pending.length} חיובים קבועים שהגיע תאריכם</h2>
        <details className="text-sm text-muted">
          <summary className="cursor-pointer select-none">איך זה עובד?</summary>
          <p className="mt-1">
            חיובים קבועים עם סכום או תאריך משוער שהתאריך שלהם כבר עבר, וגם חיובים עם סכום ותאריך קבועים שעברו כבר 5 ימים
            מהתאריך המיועד בלי שאושרו — יש לאשר את הסכום שהיה בפועל, ואפשר לשייך אותו למחלקה אחרת מזו שהוגדרה בהוראה או
            לפצל אותו בין כמה מחלקות (מתפריט ⋮). אם ידוע כבר הסכום הנכון אבל החיוב עצמו עדיין לא ירד בפועל, אפשר לבחור
            &quot;שמור סכום בלבד&quot; כדי רק לעדכן את הסכום המשוער להמשך — השורה תישאר ברשימה. אם לא יאושר או יסומן כ&quot;לא
            יצא&quot; תוך 5 ימים, המערכת תניח אוטומטית שהחיוב הקבוע ירד כמתוכנן ותרשום אותו בעצמה.
          </p>
        </details>
      </div>

      {grouped.map(([bankLabel, rows]) => (
        <div key={bankLabel} className={`border-r-4 ${bankColorFor(bankLabel).border} pr-3`}>
          <BankGroupHeading label={bankLabel} count={rows.length} unit="חיובים" />
          <div className="overflow-x-auto">
            {/* Fixed column widths so every bank's table lines up with the next. */}
            <table className="data-table w-full min-w-[900px] table-fixed">
              <colgroup>
                <col className="w-[22%]" />
                <col className="w-[11%]" />
                <col className="w-[10%]" />
                <col className="w-[16%]" />
                <col className="w-[12%]" />
                <col className="w-[16%]" />
                <col className="w-[13%]" />
              </colgroup>
              <thead>
                <tr>
                  <th>חיוב</th>
                  <th>תאריך מיועד</th>
                  <th>צפי</th>
                  <th>תאריך בפועל</th>
                  <th>סכום בפועל</th>
                  <th>מחלקה</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <ConfirmationRow key={`${p.scheduleId}-${p.periodDate}`} item={p} departments={departments} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}

function ConfirmationRow({ item, departments }: { item: PendingConfirmation; departments: Department[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmedDate, setConfirmedDate] = useState(item.periodDate);
  const [amount, setAmount] = useState(String(item.expectedAmount));
  const [departmentId, setDepartmentId] = useState(item.departmentId ?? "");
  const [split, setSplit] = useState(item.isSplit);
  const [allocations, setAllocations] = useState<ScheduleConfirmationAllocation[]>(
    item.isSplit ? item.splitAllocations.map((a) => ({ departmentId: a.departmentId, amount: a.amount })) : [],
  );
  // An existing split stays collapsed to keep the row on one line; a split
  // the admin just turned on opens right away since it needs filling in.
  const [showSplitEditor, setShowSplitEditor] = useState(false);

  const splitTotal = allocations.reduce((sum, a) => sum + (a.amount || 0), 0);

  function run(action: () => Promise<{ error?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  function confirmOccurrence() {
    if (!confirmedDate) {
      setError("יש לבחור תאריך מלא");
      return;
    }
    let payload: ScheduleConfirmationAllocation[];
    if (split) {
      payload = allocations.filter((a) => a.departmentId && a.amount > 0);
      if (payload.length < 2) {
        setShowSplitEditor(true);
        setError("פיצול דורש לפחות שתי מחלקות עם סכום");
        return;
      }
    } else {
      const value = Number(amount);
      if (!value || value <= 0) {
        setError("יש להזין סכום");
        return;
      }
      if (!departmentId) {
        setError("יש לבחור מחלקה");
        return;
      }
      payload = [{ departmentId, amount: value }];
    }
    run(() => confirmScheduleOccurrence(item.scheduleId, item.periodDate, confirmedDate, payload));
  }

  function saveAmountOnly() {
    const value = Number(amount);
    if (!value || value <= 0) {
      setError("יש להזין סכום");
      return;
    }
    run(() => updateScheduleExpectedAmount(item.scheduleId, value));
  }

  function ignore() {
    if (!confirm(`להתעלם מ"${item.scheduleName}" ל${formatDate(item.periodDate)} — כאילו לא יצא בכלל?`)) return;
    run(() => ignoreScheduleOccurrence(item.scheduleId, item.periodDate));
  }

  function toggleSplit() {
    if (split) {
      setSplit(false);
      setShowSplitEditor(false);
      return;
    }
    setSplit(true);
    setAllocations([{ departmentId, amount: Number(amount) || item.expectedAmount }]);
    setShowSplitEditor(true);
  }

  const inputClass = "rounded border border-border bg-transparent px-2 py-1 text-sm";

  return (
    <>
      <tr>
        <td>
          <span className="font-medium">{item.scheduleName}</span>
          {item.direction === "INCOME" && (
            <span className="mr-1.5 rounded bg-success-bg px-1.5 py-0.5 text-xs text-success">הכנסה</span>
          )}
        </td>
        <td className="whitespace-nowrap">{formatDate(item.periodDate)}</td>
        <td className="whitespace-nowrap text-muted">{formatCurrency(item.expectedAmount)}</td>
        <td>
          <DateInput value={confirmedDate} onChange={setConfirmedDate} className={`${inputClass} w-full`} />
        </td>
        <td>
          {split ? (
            <span className="whitespace-nowrap">{formatCurrency(splitTotal)}</span>
          ) : (
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className={`${inputClass} w-full`}
              aria-label="סכום בפועל"
            />
          )}
        </td>
        <td>
          {split ? (
            <button
              type="button"
              onClick={() => setShowSplitEditor((v) => !v)}
              className="whitespace-nowrap text-sm text-primary hover:underline"
              title="הצג/הסתר את חלוקת הסכום בין המחלקות"
            >
              מפוצל ({allocations.filter((a) => a.departmentId).length}) {showSplitEditor ? "▴" : "▾"}
            </button>
          ) : (
            <select
              value={departmentId}
              onChange={(e) => setDepartmentId(e.target.value)}
              className={`${inputClass} w-full`}
              aria-label="מחלקה"
            >
              <option value="">מחלקה...</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          )}
        </td>
        <td>
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={isPending}
              onClick={confirmOccurrence}
              className="rounded bg-primary text-primary-foreground text-sm px-3 py-1 disabled:opacity-50"
            >
              אשר
            </button>
            <RowActionsMenu>
              {!split && (
                <button
                  type="button"
                  disabled={isPending}
                  onClick={saveAmountOnly}
                  title="מעדכן את הסכום המשוער של ההוראה, בלי לאשר שהתקופה הזו באמת יצאה — השורה נשארת ברשימה"
                  className={rowActionButtonClass()}
                >
                  שמור סכום בלבד
                </button>
              )}
              {!item.isSplit && (
                <button type="button" disabled={isPending} onClick={toggleSplit} className={rowActionButtonClass()}>
                  {split ? "בטל פיצול" : "פיצול בין כמה מחלקות"}
                </button>
              )}
              <button
                type="button"
                disabled={isPending}
                onClick={ignore}
                title="מסמן שהתקופה הזו לא יצאה בפועל — לא נרשמת כל הוצאה/הכנסה"
                className={rowActionButtonClass("danger")}
              >
                התעלם — לא יצא הפעם
              </button>
            </RowActionsMenu>
          </div>
        </td>
      </tr>
      {split && showSplitEditor && (
        <tr>
          <td colSpan={COLUMN_COUNT}>
            <SplitAllocationEditor
              departments={departments}
              totalAmount={splitTotal}
              allocations={allocations}
              onChange={setAllocations}
            />
          </td>
        </tr>
      )}
      {error && (
        <tr>
          <td colSpan={COLUMN_COUNT} className="text-xs text-danger">
            {error}
          </td>
        </tr>
      )}
    </>
  );
}
