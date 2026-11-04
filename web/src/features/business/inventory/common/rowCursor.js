import { useState, useEffect, useCallback } from "react";

/**
 * Keyboard "cursor" over a list of rows (Ctrl+A = next, Ctrl+Z = previous).
 * `index` is -1 until the first move. Active row gets `data-row-cursor` and
 * is scrolled into view.
 */
export function useRowCursor(count) {
  const [index, setIndex] = useState(-1);

  const next = useCallback(
    () => setIndex((i) => (count === 0 ? -1 : Math.min(i + 1, count - 1))),
    [count],
  );
  const prev = useCallback(
    () => setIndex((i) => (count === 0 ? -1 : Math.max(i - 1, 0))),
    [count],
  );
  const reset = useCallback(() => setIndex(-1), []);

  // keep in range when the list shrinks (e.g. search filter)
  const safeIndex = index >= count ? count - 1 : index;

  useEffect(() => {
    if (safeIndex < 0) return;
    const el = document.querySelector('[data-row-cursor="true"]');
    if (el && el.scrollIntoView) el.scrollIntoView({ block: "nearest" });
  }, [safeIndex]);

  return { index: safeIndex, next, prev, reset, isActive: (i) => i === safeIndex };
}

/** Props to spread on a row element: `<Box {...cursorProps(C, active)} sx={{...}}>` — merge sx via `cursorSx`. */
export const cursorAttrs = (active) => (active ? { "data-row-cursor": "true" } : {});
export const cursorSx = (C, active) =>
  active ? { outline: `2px solid ${C.olive}`, outlineOffset: -2 } : {};

/** Bindings for Ctrl+A / Ctrl+Z (labels from shortcuts.next / shortcuts.prev). */
export const cursorBindings = (t, cursor, extra = {}) => [
  { combo: "Ctrl+A", label: t("shortcuts.next"), handler: cursor.next, ...extra },
  { combo: "Ctrl+Z", label: t("shortcuts.prev"), handler: cursor.prev, ...extra },
];
