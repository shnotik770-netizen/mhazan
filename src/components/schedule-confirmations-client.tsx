"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  confirmScheduleOccurrence,
  ignoreScheduleOccurrence,
  type ScheduleConfirmationAllocation,
} from "@/app/(app)/settings/actions";
import { ScheduleOccurrenceConfirmFields } from "@/components/schedule-occurrence-confirm-fields";
import { formatCurrency, formatDate } from "@/lib/format";
import type { Tables } from "@/lib/supabase/database.types";

type Department = Tables<"departments">;

export type PendingConfirmation = {
  scheduleId: string;
  scheduleName: string;
  direction: string;
  departmentId: string | null;
  departmentName: string | null;
  expectedAmount: number;
  periodDate: string;
  isSplit: boolean;
  splitAllocations: { departmentId: string; departmentName: string; amount: number }[];
};

export function ScheduleConfirmationsList({
  pending,
  departments,
}: {
  pending: PendingConfirmation[];
  departments: Department[];
}) {
  if (pending.length === 0) return null;

  return (
    <div className="card p-4 space-y-3">
      <div>
        <h2 className="font-semibold">אישור סכומים בפועל</h2>
        <p className="text-sm text-muted">
          חיובים קבועים עם סכום או תאריך משוער שהתאריך שלהם כבר עבר, וגם חיובים עם סכום ותאריך קבועים שעברו כבר 5 ימים
          מהתאריך המיועד בלי שאושרו — יש לאשר את הסכום שהיה בפועל, ואפשר לשייך אותו למחלקה אחרת מזו שהוגדרה בהוראה או
          לפצל אותו בין כמה מחלקות. אם לא יאושר או יסומן כ&quot;לא יצא&quot; תוך 5 ימים, המערכת תניח אוטומטית שהחיוב הקבוע
          ירד כמתוכנן ותרשום אותו בעצמה.
        </p>
      </div>
      <div className="space-y-3">
        {pending.map((p) => (
          <ConfirmationRow key={`${p.scheduleId}-${p.periodDate}`} item={p} departments={departments} />
        ))}
      </div>
    </div>
  );
}

function ConfirmationRow({ item, departments }: { item: PendingConfirmation; departments: Department[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit(confirmedDate: string, payload: ScheduleConfirmationAllocation[]) {
    setError(null);
    startTransition(async () => {
      const result = await confirmScheduleOccurrence(item.scheduleId, item.periodDate, confirmedDate, payload);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  function ignore() {
    if (!confirm(`להתעלם מ"${item.scheduleName}" ל${formatDate(item.periodDate)} — כאילו לא יצא בכלל?`)) return;
    setError(null);
    startTransition(async () => {
      const result = await ignoreScheduleOccurrence(item.scheduleId, item.periodDate);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="border border-border rounded-lg p-3 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <span className="font-medium">{item.scheduleName}</span>
          <span className="text-xs text-muted mr-2">
            {item.direction === "INCOME" ? "הכנסה" : "הוצאה"} · {formatDate(item.periodDate)} · צפי:{" "}
            {formatCurrency(item.expectedAmount)}
            {item.isSplit && ` · מפוצל (${item.splitAllocations.length} מחלקות)`}
          </span>
        </div>
      </div>

      <ScheduleOccurrenceConfirmFields
        departments={departments}
        isSplit={item.isSplit}
        expectedAmount={item.expectedAmount}
        departmentId={item.departmentId}
        splitAllocations={item.splitAllocations}
        initialConfirmedDate={item.periodDate}
        isPending={isPending}
        error={error}
        onSubmit={submit}
      />

      <button
        type="button"
        disabled={isPending}
        onClick={ignore}
        title="מסמן שהתקופה הזו לא יצאה בפועל — לא נרשמת כל הוצאה/הכנסה"
        className="rounded border border-border text-sm px-3 py-1 disabled:opacity-50 hover:bg-background"
      >
        התעלם — לא יצא הפעם
      </button>
    </div>
  );
}
