import { useEffect, useRef } from "react";
import { feedKey, initialScanState, dedupeScan } from "../common/barcodeScanner";

function isTextField(el) {
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
}

/**
 * Global keyboard-wedge scanner listener. Detects fast key bursts ending with
 * Enter and calls `onScan(code)`. Ignores text fields other than the POS search
 * box, key combos, and anything while a dialog is open.
 */
export default function useBarcodeScanner({ enabled = true, onScan }) {
  const cbRef = useRef(onScan);
  useEffect(() => { cbRef.current = onScan; });

  useEffect(() => {
    if (!enabled) return undefined;
    let state = initialScanState;
    let memo = null;

    const handler = (e) => {
      if (e.isComposing) return;
      const el = e.target;
      if (isTextField(el) && el.dataset?.posSearch !== "1") { state = initialScanState; return; }
      if (e.ctrlKey || e.altKey || e.metaKey) { state = initialScanState; return; }
      if (document.querySelector(".MuiDialog-root, .MuiDrawer-modal")) { state = initialScanState; return; }

      const now = performance.now();
      const r = feedKey(state, e.key, now);
      state = r.state;
      if (!r.code) return;
      const next = dedupeScan(memo, r.code, now);
      e.preventDefault();
      e.stopPropagation();
      if (!next) return;
      memo = next;
      cbRef.current?.(r.code);
    };

    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [enabled]);
}
