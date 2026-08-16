"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { settleBalances } from "@/app/(app)/ledger/actions";

export function SettleBalancesButton({
  deptA,
  deptB,
  debtorName,
  creditorName,
}: {
  deptA: string;
  deptB: string;
  debtorName: string;
  creditorName: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <button
      disabled={isPending}
      onClick={() => {
        if (!confirm(`לקזז את כל היתרות הפתוחות בין ${debtorName} ל${creditorName}?`)) return;
        startTransition(async () => {
          await settleBalances(deptA, deptB);
          router.refresh();
        });
      }}
      className="rounded bg-primary text-primary-foreground text-xs px-3 py-1 disabled:opacity-50"
    >
      {isPending ? "מקזז..." : "קיזוז פנימי"}
    </button>
  );
}
