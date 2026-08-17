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
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4" onClick={onClose}>
      {/* Scrolls internally within a bounded height instead of relying on
          the fixed-position backdrop to scroll — the latter is unreliable
          on long content (mobile browsers in particular can get "stuck"
          partway through instead of reaching the rest of the content). */}
      <div
        className="w-full max-w-3xl my-8 max-h-[calc(100vh-4rem)] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
