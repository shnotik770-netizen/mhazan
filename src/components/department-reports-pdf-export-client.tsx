"use client";

import { useState } from "react";
import { Modal } from "@/components/modal";

type DepartmentOption = { id: string; name: string };

// Downloads a real .pdf file per department, one at a time, via the
// server-rendered /reports/[departmentId]/pdf route (headless Chromium) —
// "כל מחלקה במסמך נפרד" (an actual separate downloaded file per department),
// not a browser print dialog the admin has to save manually. Sequential
// rather than firing every fetch at once: each one spins up its own
// headless-Chromium process server-side, so a big "כל המחלקות" batch stays
// gentle on the server instead of launching N browsers simultaneously.
export function DepartmentReportsPdfExportButton({ departments }: { departments: DepartmentOption[] }) {
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<"all" | "specific">("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isIssuing, setIsIssuing] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function downloadBlob(blob: Blob, fallbackName: string, contentDisposition: string | null) {
    const match = contentDisposition?.match(/filename\*=UTF-8''([^;]+)/);
    const filename = match ? decodeURIComponent(match[1]) : fallbackName;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function issue() {
    const targets = scope === "all" ? departments : departments.filter((d) => selected.has(d.id));
    if (targets.length === 0) return;
    setIsIssuing(true);
    setError(null);
    setProgress({ done: 0, total: targets.length });
    let failedCount = 0;
    for (const d of targets) {
      try {
        const res = await fetch(`/reports/${d.id}/pdf`);
        if (!res.ok) {
          failedCount += 1;
        } else {
          const blob = await res.blob();
          downloadBlob(blob, `דוח ${d.name}.pdf`, res.headers.get("content-disposition"));
        }
      } catch {
        failedCount += 1;
      }
      setProgress((p) => (p ? { done: p.done + 1, total: p.total } : p));
    }
    setIsIssuing(false);
    if (failedCount > 0) setError(`${failedCount} מתוך ${targets.length} דוחות נכשלו בהפקה — נסו שוב`);
    else setOpen(false);
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
    <Modal onClose={() => !isIssuing && setOpen(false)}>
      <div className="card p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <h2 className="text-lg font-bold" style={{ fontFamily: "var(--font-display)" }}>
            הנפקת PDF — דוחות מחלקות
          </h2>
          <button type="button" onClick={() => !isIssuing && setOpen(false)} className="text-muted hover:text-foreground">
            ✕
          </button>
        </div>

        <div className="flex items-center gap-1 rounded-lg border border-border p-0.5 text-xs w-fit">
          <button
            type="button"
            disabled={isIssuing}
            onClick={() => setScope("all")}
            className={`rounded px-3 py-1.5 disabled:opacity-50 ${scope === "all" ? "bg-primary text-primary-foreground" : "text-muted"}`}
          >
            כל המחלקות
          </button>
          <button
            type="button"
            disabled={isIssuing}
            onClick={() => setScope("specific")}
            className={`rounded px-3 py-1.5 disabled:opacity-50 ${scope === "specific" ? "bg-primary text-primary-foreground" : "text-muted"}`}
          >
            מחלקות ספציפיות
          </button>
        </div>

        {scope === "specific" && (
          <div className="max-h-60 overflow-y-auto space-y-1 rounded-lg border border-border p-2">
            {departments.map((d) => (
              <label key={d.id} className="flex items-center gap-2 text-sm cursor-pointer rounded px-1.5 py-1 hover:bg-background">
                <input type="checkbox" disabled={isIssuing} checked={selected.has(d.id)} onChange={() => toggle(d.id)} />
                {d.name}
              </label>
            ))}
            {departments.length === 0 && <p className="text-sm text-muted text-center py-2">אין מחלקות להצגה</p>}
          </div>
        )}

        <p className="text-xs text-muted">
          כל מחלקה תרד כקובץ PDF נפרד משלה. בבחירת &quot;כל המחלקות&quot; ההפקה עשויה לקחת כמה שניות למחלקה — אנא המתינו.
        </p>

        {progress && (
          <p className="text-sm text-muted">
            הופקו {progress.done} מתוך {progress.total}…
          </p>
        )}
        {error && <p className="text-sm text-danger">{error}</p>}

        <button
          type="button"
          disabled={!canIssue || isIssuing}
          onClick={issue}
          className="rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold disabled:opacity-50"
        >
          {isIssuing ? "מפיק…" : "הפק PDF"}
        </button>
      </div>
    </Modal>
  );
}
