"use client";

import { useState } from "react";
import { Modal } from "@/components/modal";

type DepartmentOption = { id: string; name: string };

// "כל מחלקה במסמך נפרד" — a single combined PDF can't really deliver that
// (page breaks inside one file are still one file), so this opens the
// existing /reports/[departmentId] page (already print-ready, already has
// its own PrintButton) in its own new tab per department, with autoprint so
// each tab's print/save-as-PDF dialog opens on its own immediately. For a
// multi-department batch that means one tab and one save prompt per
// department — an inherent limit of browser printing, not something a
// single click can silently turn into several downloaded files at once.
export function DepartmentReportsPdfExportButton({ departments }: { departments: DepartmentOption[] }) {
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<"all" | "specific">("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function issue() {
    const targetIds = scope === "all" ? departments.map((d) => d.id) : [...selected];
    for (const id of targetIds) {
      window.open(`/reports/${id}?autoprint=1`, "_blank");
    }
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

  const canIssue = scope === "all" ? departments.length > 0 : selected.size > 0;

  return (
    <Modal onClose={() => setOpen(false)}>
      <div className="card p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <h2 className="text-lg font-bold" style={{ fontFamily: "var(--font-display)" }}>
            הנפקת PDF — דוחות מחלקות
          </h2>
          <button type="button" onClick={() => setOpen(false)} className="text-muted hover:text-foreground">
            ✕
          </button>
        </div>

        <div className="flex items-center gap-1 rounded-lg border border-border p-0.5 text-xs w-fit">
          <button
            type="button"
            onClick={() => setScope("all")}
            className={`rounded px-3 py-1.5 ${scope === "all" ? "bg-primary text-primary-foreground" : "text-muted"}`}
          >
            כל המחלקות
          </button>
          <button
            type="button"
            onClick={() => setScope("specific")}
            className={`rounded px-3 py-1.5 ${scope === "specific" ? "bg-primary text-primary-foreground" : "text-muted"}`}
          >
            מחלקות ספציפיות
          </button>
        </div>

        {scope === "specific" && (
          <div className="max-h-60 overflow-y-auto space-y-1 rounded-lg border border-border p-2">
            {departments.map((d) => (
              <label key={d.id} className="flex items-center gap-2 text-sm cursor-pointer rounded px-1.5 py-1 hover:bg-background">
                <input type="checkbox" checked={selected.has(d.id)} onChange={() => toggle(d.id)} />
                {d.name}
              </label>
            ))}
            {departments.length === 0 && <p className="text-sm text-muted text-center py-2">אין מחלקות להצגה</p>}
          </div>
        )}

        <p className="text-xs text-muted">
          כל מחלקה תיפתח בלשונית נפרדת משלה, עם חלון ההדפסה/שמירה כ-PDF של הדפדפן נפתח אוטומטית — כלומר מסמך נפרד לכל
          מחלקה.
        </p>

        <button
          type="button"
          disabled={!canIssue}
          onClick={issue}
          className="rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold disabled:opacity-50"
        >
          הפק PDF
        </button>
      </div>
    </Modal>
  );
}
