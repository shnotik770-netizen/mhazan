"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteIncome } from "@/app/(app)/incomes/actions";

export function DeleteIncomeButton({ incomeId, label }: { incomeId: string; label: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <button
      disabled={isPending}
      onClick={() => {
        if (!confirm(`למחוק את ההכנסה "${label}"? פעולה זו תבטל גם את השפעתה על יתרת הבנק וההתחשבנות הפנימית.`)) return;
        startTransition(async () => {
          await deleteIncome(incomeId);
          router.refresh();
        });
      }}
      className="text-xs text-danger underline disabled:opacity-50"
    >
      מחיקה
    </button>
  );
}
