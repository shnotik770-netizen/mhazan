"use client";

import { useState } from "react";
import { Modal } from "@/components/modal";

const KEYS = [
  ["7", "8", "9", "÷"],
  ["4", "5", "6", "×"],
  ["1", "2", "3", "−"],
  ["0", ".", "⌫", "+"],
] as const;

const KEY_VALUE: Record<string, string> = {
  "÷": "/",
  "×": "*",
  "−": "-",
};

// A real numeric keypad instead of a bare text field — typing an expression
// like "1200+850" on a phone means hunting for the "+" key on the number
// row every time. Tapping buttons is faster and never needs the keyboard to
// switch layouts. Still totals/splits an amount before it lands in the
// field above; the expression itself stays visible so a mis-tap is obvious
// before pressing "=".
export function MiniCalculator({ onApply }: { onApply: (value: number) => void }) {
  const [open, setOpen] = useState(false);
  const [expr, setExpr] = useState("");
  const [error, setError] = useState<string | null>(null);

  function press(key: string) {
    setError(null);
    if (key === "⌫") {
      setExpr((prev) => prev.slice(0, -1));
      return;
    }
    setExpr((prev) => prev + (KEY_VALUE[key] ?? key));
  }

  function clear() {
    setExpr("");
    setError(null);
  }

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

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="text-xs text-primary underline">
        מחשבון
      </button>
      {open && (
        <Modal onClose={() => setOpen(false)}>
          <div className="card w-64 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">מחשבון</h3>
              <button type="button" onClick={() => setOpen(false)} className="text-sm text-muted">
                ✕
              </button>
            </div>
            <div
              dir="ltr"
              className="min-h-[2.5rem] break-all rounded-lg border border-border bg-background px-3 py-2 text-left font-mono text-lg"
            >
              {expr || "0"}
            </div>
            {error && <p className="text-xs text-danger">{error}</p>}
            {/* dir="ltr" so the operator column (last item in each KEYS row)
                lands on the right, like a normal calculator — left to the
                app's own RTL flow, it would render mirrored to the left. */}
            <div dir="ltr" className="grid grid-cols-4 gap-2">
              {KEYS.flat().map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => press(key)}
                  className="rounded-lg border border-border py-3 text-base font-semibold hover:bg-background"
                >
                  {key}
                </button>
              ))}
              <button
                type="button"
                onClick={clear}
                className="col-span-3 rounded-lg border border-border py-3 text-sm font-semibold text-danger hover:bg-background"
              >
                נקה
              </button>
              <button
                type="button"
                onClick={compute}
                className="rounded-lg bg-primary text-primary-foreground py-3 text-base font-semibold"
              >
                =
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
