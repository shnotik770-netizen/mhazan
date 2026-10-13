"use client";

import { useEffect } from "react";

// Opens the browser's print dialog automatically once this page has
// rendered, so clicking "הפק PDF" on /forecast leads straight to the
// print/save-as-PDF prompt in the new tab it opens, instead of requiring a
// second manual click once there. A short delay lets the browser finish
// laying out the tables first — printing mid-layout can clip content on some
// browsers. PrintButton (rendered alongside this, hidden in print via
// .no-print) stays available for reprinting without reloading the page.
export function AutoPrintOnLoad() {
  useEffect(() => {
    const timer = setTimeout(() => window.print(), 300);
    return () => clearTimeout(timer);
  }, []);
  return null;
}
