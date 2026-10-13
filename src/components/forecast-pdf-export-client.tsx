"use client";

import { useState } from "react";
import { Modal } from "@/components/modal";

type Option = { id: string; label: string };

// Asks the two things the generated PDF needs before opening it: how many
// months out to project (defaulting to 3, but editable), and whether it's
// for one specific account or a single combined file covering every account
// — then opens the dedicated /forecast/print view (a new tab, so the
// interactive forecast page stays open behind it) with those as URL params.
// That page auto-triggers the browser's print/save-as-PDF dialog itself.
export function ForecastPdfExportButton({
  accounts,
  defaultAccountId,
}: {
  accounts: Option[];
  defaultAccountId: string;
}) {
  const [open, setOpen] = useState(false);
  const [months, setMonths] = useState(3);
  const [accountChoice, setAccountChoice] = useState(defaultAccountId || "all");

  function openPrint() {
    window.open(`/forecast/print?months=${months}&account=${accountChoice}`, "_blank");
    setOpen(false);
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg border border-border px-3 py-2 text-sm font-semibold hover:bg-background"
      >
        הנפקת PDF
      </button>
    );
  }

  return (
    <Modal onClose={() => setOpen(false)}>
      <div className="card p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <h2 className="text-lg font-bold" style={{ fontFamily: "var(--font-display)" }}>
            הנפקת PDF — צפי יתרה
          </h2>
          <button type="button" onClick={() => setOpen(false)} className="text-muted hover:text-foreground">
            ✕
          </button>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">כמה חודשים קדימה</label>
          <input
            type="number"
            min={1}
            max={12}
            value={months}
            onChange={(e) => setMonths(Math.min(12, Math.max(1, Number(e.target.value) || 3)))}
            className="w-24 rounded-lg border border-border bg-transparent px-3 py-2 text-sm"
          />
          <p className="text-xs text-muted mt-1">ברירת מחדל: 3 חודשים — ניתן לשנות.</p>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">עבור איזה חשבון</label>
          <select
            value={accountChoice}
            onChange={(e) => setAccountChoice(e.target.value)}
            className="w-full rounded-lg border border-border bg-transparent px-3 py-2 text-sm"
          >
            <option value="all">כל החשבונות (קובץ מאוחד)</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          onClick={openPrint}
          className="rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold"
        >
          הפק PDF
        </button>
      </div>
    </Modal>
  );
}
