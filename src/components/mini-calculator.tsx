"use client";

import { useState } from "react";

// Small inline helper for totalling/splitting an amount before typing it
// into the field above — e.g. "1200+850" or "3600/3". Expression is
// sanitized to digits/operators only before evaluation.
export function MiniCalculator({ onApply }: { onApply: (value: number) => void }) {
  const [open, setOpen] = useState(false);
  const [expr, setExpr] = useState("");
  const [error, setError] = useState<string | null>(null);

  function compute() {
    const sanitized = expr.replace(/[^0-9+\-*/().\s]/g, "");
    if (!sanitized.trim()) return;
    try {
      const result = Function(`"use strict"; return (${sanitized});`)();
      if (typeof result === "number" && isFinite(result)) {
        onApply(Math.round(result * 100) / 100);
        setError(null);
      } else {
        setError("ביטוי לא תקין");
      }
    } catch {
      setError("ביטוי לא תקין");
    }
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-xs text-primary underline">
        מחשבון
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <input
        value={expr}
        onChange={(e) => setExpr(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            compute();
          }
        }}
        placeholder="לדוגמה: 1200+850 או 3600/3"
        className="w-28 rounded border border-border bg-transparent px-1 py-0.5 text-xs"
        autoFocus
      />
      <button type="button" onClick={compute} className="text-xs text-primary underline">
        =
      </button>
      <button type="button" onClick={() => setOpen(false)} className="text-xs text-muted">
        ✕
      </button>
      {error && <span className="text-xs text-danger">{error}</span>}
    </div>
  );
}
