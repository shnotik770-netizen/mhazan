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
    // The backdrop itself scrolls (position:fixed + overflow-y-auto) rather
    // than trying to cap the dialog's height and scroll a region inside it
    // — bounded-height + flex-shrink tricks (max-height: Ndvh, flex-col,
    // min-height:0) turned out unreliable in practice (content still got
    // clipped with no way to reach it). A plain non-fixed child that's
    // simply taller than the viewport, inside a scrolling fixed backdrop,
    // is the boring pattern that actually always works.
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4"
      onClick={onClose}
    >
      <div className="w-full max-w-3xl my-8" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}
