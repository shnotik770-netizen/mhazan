"use client";

import { useState } from "react";

export type ExportColumn = { header: string; key: string; width?: number; numeric?: boolean };

// Exports exactly the rows the caller is already showing — whatever
// survives its own search box / column filters (an untouched filter simply
// means "everything currently on screen"), generated server-side via
// POST /api/export-table.
export function ExportExcelButton<T>({
  filename,
  columns,
  rows,
  toRow,
}: {
  filename: string;
  columns: ExportColumn[];
  rows: T[];
  toRow: (row: T) => Record<string, string | number | null>;
}) {
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleExport() {
    setError(null);
    setIsExporting(true);
    try {
      const response = await fetch("/api/export-table", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: filename, columns, rows: rows.map(toRow) }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? "הייצוא נכשל");
        return;
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${filename}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setError("הייצוא נכשל");
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <div className="flex items-center gap-2 no-print">
      <button
        type="button"
        onClick={handleExport}
        disabled={isExporting || rows.length === 0}
        className="rounded-lg border border-border px-3 py-1.5 text-sm font-semibold hover:bg-background disabled:opacity-50"
      >
        {isExporting ? "מייצא…" : "ייצוא לאקסל ⇩"}
      </button>
      {error && <span className="text-xs text-danger">{error}</span>}
    </div>
  );
}
