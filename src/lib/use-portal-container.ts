"use client";

import { useEffect, useState, type RefObject } from "react";

// Radix portals default to document.body — but this app's Modal component
// is a native <dialog> opened via showModal(), which the browser renders in
// a special "top layer" that paints above every ordinary element regardless
// of z-index. Content portaled to document.body lives outside that top
// layer, so a dropdown/popover opened from inside a Modal (e.g. the bank
// account picker in "דרישת תשלום חדשה") would render *behind* the modal —
// present in the DOM, completely inaccessible visually. Portaling into the
// nearest <dialog> ancestor instead keeps it in the same top-layer subtree.
export function usePortalContainer(anchorRef: RefObject<HTMLElement | null>): HTMLElement | undefined {
  const [container, setContainer] = useState<HTMLElement | undefined>(undefined);

  useEffect(() => {
    const dialog = anchorRef.current?.closest("dialog");
    setContainer((dialog as HTMLElement | null) ?? document.body);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return container;
}
