import { useState, useEffect, useCallback } from "react";

/** Keyboard cursor over list rows (Ctrl+A next, Ctrl+Z previous). */
export default function useRowCursor(count) {
  const [index, setIndex] = useState(-1);
  const next = useCallback(() => setIndex((i) => (count === 0 ? -1 : Math.min(i + 1, count - 1))), [count]);
  const prev = useCallback(() => setIndex((i) => (count === 0 ? -1 : Math.max(i - 1, 0))), [count]);
  const reset = useCallback(() => setIndex(-1), []);
  const safe = index >= count ? count - 1 : index;

  useEffect(() => {
    if (safe < 0) return;
    const el = document.querySelector('[data-acc-cursor="true"]');
    if (el && el.scrollIntoView) el.scrollIntoView({ block: "nearest" });
  }, [safe]);

  return { index: safe, next, prev, reset };
}

export const cursorBindings = (t, cursor) => [
  { combo: "Ctrl+A", label: t("shortcuts.next"), handler: cursor.next },
  { combo: "Ctrl+Z", label: t("shortcuts.prev"), handler: cursor.prev },
];

/** Spread on a row: `<TableRow {...cursorProps(C, active)}>` */
export const cursorProps = (C, active) =>
  active ? { "data-acc-cursor": "true", sx: { outline: `2px solid ${C.primary}`, outlineOffset: -2 } } : {};
