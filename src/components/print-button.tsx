"use client";

export function PrintButton({ label = "הדפס / שמור כ-PDF" }: { label?: string }) {
  return (
    <button
      onClick={() => window.print()}
      className="rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold"
    >
      {label}
    </button>
  );
}
