"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateCheckLedgerFlag } from "@/app/(app)/checks/actions";
import { updateIncomeLedgerFlag } from "@/app/(app)/incomes/actions";

// Shown next to a department-report row that's tagged "old" (or not) —
// lets an admin reviewing the list flip a specific row the other way:
// confirm it's really old history excluded from the balance, or flip it
// back to counting because it turns out it was never accounted for.
export function LedgerFlagToggle({
  id,
  kind,
  skipDepartmentLedger,
}: {
  id: string;
  kind: "check" | "income";
  skipDepartmentLedger: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function toggle() {
    startTransition(async () => {
      const action = kind === "check" ? updateCheckLedgerFlag : updateIncomeLedgerFlag;
      await action(id, !skipDepartmentLedger);
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={toggle}
      className="text-xs text-primary underline disabled:opacity-50 whitespace-nowrap"
    >
      {skipDepartmentLedger ? "לא ישנה בפועל — כלול במאזן" : "סמן כישנה (לא לכלול במאזן)"}
    </button>
  );
}
