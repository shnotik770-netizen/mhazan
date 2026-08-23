"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateCheckInvoiceFlag } from "@/app/(app)/checks/actions";

// Quick fix for a mismarked "יש חשבונית" flag directly from a transactions
// list — an invoice arrived after the check/transfer was entered, or turns
// out there isn't one after all, without opening the full edit form.
export function InvoiceFlagToggle({ checkId, hasInvoice }: { checkId: string; hasInvoice: boolean }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function toggle() {
    startTransition(async () => {
      await updateCheckInvoiceFlag(checkId, !hasInvoice);
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={toggle}
      className={`text-xs underline disabled:opacity-50 whitespace-nowrap ${hasInvoice ? "text-success" : "text-muted"}`}
    >
      {hasInvoice ? "יש חשבונית" : "אין חשבונית"}
    </button>
  );
}
