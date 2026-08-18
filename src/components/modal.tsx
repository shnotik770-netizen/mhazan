"use client";

import { useEffect, useRef } from "react";

// The custom div-based overlay (fixed inset-0 + overflow-y-auto backdrop)
// kept getting reported as "stuck" for different modals (quick issuance,
// check detail, payee history) even after being simplified back to the
// pattern that used to work — likely a mobile-Safari quirk with scrolling
// inside a position:fixed + overflow-y:auto container. The native <dialog>
// element sidesteps all of that: the browser renders it in the top layer
// (no z-index/stacking issues), handles its own scrolling, backdrop, and
// Escape-to-close natively, and that behavior is consistent across
// browsers/devices instead of being something we hand-roll.
export function Modal({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();

    function handleClose() {
      onClose();
    }
    dialog.addEventListener("close", handleClose);
    return () => {
      dialog.removeEventListener("close", handleClose);
      if (dialog.open) dialog.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <dialog
      ref={ref}
      className="m-auto max-h-[calc(100vh-2rem)] w-[calc(100vw-2rem)] max-w-3xl overflow-y-auto rounded-2xl border-0 bg-transparent p-0 backdrop:bg-black/50"
      onClick={(e) => {
        // A click lands directly on the <dialog> element itself (not a
        // child) only when it hits the dialog's own box outside any
        // content — i.e. effectively the backdrop area right around the
        // centered box, since the true ::backdrop is a separate layer.
        if (e.target === ref.current) onClose();
      }}
    >
      <div onClick={(e) => e.stopPropagation()}>{children}</div>
    </dialog>
  );
}
