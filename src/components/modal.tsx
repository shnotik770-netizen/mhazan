"use client";

import { useEffect } from "react";

// A real overlay dialog instead of a card that expands inline and pushes
// the rest of the page down — for actions (import, reconciliation) that
// are their own focused task, not part of reading the checks page itself.
export function Modal({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      {/* max-h-[85dvh] (not 100vh) leaves a deliberate safety margin below
          the outer p-4 padding, and dvh (not vh) accounts for mobile
          browser toolbars — a bare 100vh calc can end up taller than what
          the fixed backdrop actually shows, clipping the bottom of the
          content with no way to scroll to it. flex overflow-hidden on this
          wrapper plus overflow-y-auto on the inner content area (not this
          element) lets a caller pin a footer below the scrolling part. */}
      <div
        className="w-full max-w-3xl max-h-[85dvh] flex flex-col overflow-hidden rounded-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
