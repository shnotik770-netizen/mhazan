"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatCurrency } from "@/lib/format";
import { dismissMissedStandingOrder } from "@/app/(app)/incomes/actions";

// Kept as a plain local type/helper (not imported from
// department-report-data.ts) since that module also pulls in the
// server-only Supabase client — importing it here would drag next/headers
// into the client bundle.
export type MissedStandingOrderNote = {
  id: number;
  orderRef: string;
  month: string;
  donorName: string;
  categoryName: string | null;
  amount: number;
};

function monthLabel(monthKey: string): string {
  return new Intl.DateTimeFormat("he-IL", { month: "long", year: "numeric" }).format(new Date(`${monthKey}-01T00:00:00`));
}

export function MissedStandingOrdersNote({ notes, isAdmin }: { notes: MissedStandingOrderNote[]; isAdmin: boolean }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  if (notes.length === 0) return null;

  const dismiss = (id: number) => {
    startTransition(async () => {
      await dismissMissedStandingOrder(id);
      router.refresh();
    });
  };

  return (
    <div className="card p-4 bg-warning-bg border border-warning/40 space-y-2">
      <h3 className="font-semibold text-warning">שים לב — הוראות קבע שלא נכנסו בחודש שלהן</h3>
      <p className="text-xs text-muted">
        זוהה כשההכנסות של החודש הוזנו ולא נמצאה התאמה להוראת קבע שהייתה בצפי. בדוק אם זה תקין (ההוראה באמת לא נגבתה) ואז
        סמן כטופל.
      </p>
      <ul className="space-y-1 text-sm">
        {notes.map((n) => (
          <li key={n.id} className="flex items-center justify-between gap-2 flex-wrap">
            <span>
              הוראת קבע {n.orderRef} — {n.donorName}
              {n.categoryName ? ` (${n.categoryName})` : ""}, {formatCurrency(n.amount)}, לא נכנסה ב{monthLabel(n.month)}
            </span>
            {isAdmin && (
              <button
                type="button"
                disabled={isPending}
                onClick={() => dismiss(n.id)}
                className="text-xs text-primary underline disabled:opacity-60 whitespace-nowrap"
              >
                העבר לארכיון
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
