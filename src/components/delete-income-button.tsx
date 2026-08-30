"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteIncome } from "@/app/(app)/incomes/actions";
import { rowActionButtonClass } from "@/components/row-actions-menu";

export function DeleteIncomeButton({
  incomeId,
  label,
  variant = "menu",
}: {
  incomeId: string;
  label: string;
  variant?: "link" | "menu";
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function remove() {
    if (!confirm(`למחוק את ההכנסה "${label}"? פעולה זו תבטל גם את השפעתה על יתרת הבנק וההתחשבנות הפנימית.`)) return;
    startTransition(async () => {
      await deleteIncome(incomeId);
      router.refresh();
    });
  }

  return (
    <button
      disabled={isPending}
      onClick={remove}
      className={variant === "menu" ? rowActionButtonClass("danger") : "text-xs text-danger underline disabled:opacity-50"}
    >
      מחיקה
    </button>
  );
}
