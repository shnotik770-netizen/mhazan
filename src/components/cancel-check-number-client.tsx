"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { recordCancelledCheckNumber } from "@/app/(app)/checks/actions";
import { Modal } from "@/components/modal";
import type { Tables } from "@/lib/supabase/database.types";

type BankAccount = Tables<"bank_accounts">;

// A check number that was never actually issued through the system (torn,
// spoiled while writing, lost) but still needs to be accounted for so a
// bank reconciliation doesn't flag a gap in the sequence — this records it
// directly as a CANCELLED check without going through the issuance queue.
export function CancelCheckNumberButton({ bankAccounts }: { bankAccounts: BankAccount[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg border border-border px-4 py-2 text-sm font-semibold"
      >
        רישום מספר צ׳ק כמבוטל
      </button>
      {open && (
        <Modal onClose={() => setOpen(false)}>
          <CancelCheckNumberForm bankAccounts={bankAccounts} onClose={() => setOpen(false)} />
        </Modal>
      )}
    </>
  );
}

function CancelCheckNumberForm({ bankAccounts, onClose }: { bankAccounts: BankAccount[]; onClose: () => void }) {
  const router = useRouter();
  const [bankAccountId, setBankAccountId] = useState("");
  const [checkNumber, setCheckNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await recordCancelledCheckNumber(bankAccountId, checkNumber, notes || undefined);
      if (result.error) setError(result.error);
      else {
        router.refresh();
        onClose();
      }
    });
  }

  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">רישום מספר צ׳ק כמבוטל</h2>
        <button type="button" onClick={onClose} className="text-sm text-muted">
          סגור
        </button>
      </div>
      <p className="text-xs text-muted">
        לצ׳ק שמעולם לא הונפק בפועל (נקרע, התקלקל בכתיבה, אבד) אך יש להשאיר עליו רישום כדי שלא ייראה כפער במספור מול
        הבנק — נרשם ישירות כ״בוטל״, ללא מחלקה וללא השפעה על המאזן.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
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
        <input
          value={checkNumber}
          onChange={(e) => setCheckNumber(e.target.value)}
          placeholder="מספר צ׳ק"
          className="rounded border border-border bg-transparent px-2 py-1 text-sm"
        />
        <input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="הערה (אופציונלי)"
          className="rounded border border-border bg-transparent px-2 py-1 text-sm sm:col-span-2"
        />
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
      <div className="flex items-center gap-2">
        <button
          disabled={isPending || !bankAccountId || !checkNumber.trim()}
          onClick={submit}
          className="rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold disabled:opacity-50"
        >
          רישום
        </button>
      </div>
    </div>
  );
}
