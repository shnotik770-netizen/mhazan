"use client";

import { useCallback, useState } from "react";

// Radix portals default to document.body — but this app's Modal component
// is a native <dialog> opened via showModal(), which the browser renders in
// a special "top layer" that paints above every ordinary element regardless
// of z-index. Content portaled to document.body lives outside that top
// layer, so a dropdown/popover opened from inside a Modal (e.g. the bank
// account picker in "דרישת תשלום חדשה") would render *behind* the modal —
// present in the DOM, completely inaccessible visually. Portaling into the
// nearest <dialog> ancestor instead keeps it in the same top-layer subtree.
//
// A callback ref (rather than a plain ref read inside a useEffect) resolves
// the container the instant the anchor node mounts, as part of React's
// commit phase — no render where the container is still `undefined` (which
// Radix's Portal would otherwise fall back to document.body for) can exist,
// so there's no window in which a very fast interaction could open the
// popover before its portal target is known to be the dialog.
export function usePortalContainer(): {
  ref: (node: HTMLElement | null) => void;
  container: HTMLElement | undefined;
} {
  const [container, setContainer] = useState<HTMLElement | undefined>(undefined);
  const ref = useCallback((node: HTMLElement | null) => {
    if (!node) return;
    setContainer((node.closest("dialog") as HTMLElement | null) ?? document.body);
  }, []);
  return { ref, container };
}
