import { useState, useEffect, useCallback, useRef } from "react";

/** Move focus out of a dialog before it hides (avoids aria-hidden on a focused node). */
export const blurFocused = () => {
  const el = typeof document !== "undefined" ? document.activeElement : null;
  if (el && el !== document.body && typeof el.blur === "function") el.blur();
};

/** Keyboard cursor over rows: Ctrl+A next, Ctrl+Z previous. -1 until the first move. */
export function useRowCursor(count) {
  const [index, setIndex] = useState(-1);
  const next = useCallback(() => setIndex((i) => (count === 0 ? -1 : Math.min(i + 1, count - 1))), [count]);
  const prev = useCallback(() => setIndex((i) => (count === 0 ? -1 : Math.max(i - 1, 0))), [count]);
  const safe = index >= count ? count - 1 : index;
  useEffect(() => {
    if (safe < 0) return;
    const el = document.querySelector('[data-row-cursor="true"]');
    if (el && el.scrollIntoView) el.scrollIntoView({ block: "nearest" });
  }, [safe]);
  return { index: safe, next, prev, isActive: (i) => i === safe };
}
export const cursorAttrs = (active) => (active ? { "data-row-cursor": "true" } : {});
export const cursorSx = (C, active) => (active ? { outline: `2px solid ${C.primary}`, outlineOffset: -2 } : {});
export const cursorBindings = (t, cursor) => [
  { combo: "Ctrl+A", label: t("shortcuts.next"), handler: cursor.next },
  { combo: "Ctrl+Z", label: t("shortcuts.prev"), handler: cursor.prev },
];

/** Toast state: { toast, showToast(message, type), closeToast }. */
export function useToast() {
  const [toast, setToast] = useState({ open: false, message: "", type: "info" });
  const showToast = useCallback((message, type = "info") => setToast({ open: true, message, type }), []);
  const closeToast = useCallback(() => setToast((s) => ({ ...s, open: false })), []);
  return { toast, showToast, closeToast };
}

/** Debounced copy of a value. */
export function useDebounced(value, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

export const fmtNum = (v) =>
  v !== null && v !== "" && v !== undefined && Number.isFinite(Number(v))
    ? Number(v).toLocaleString("en-US", { maximumFractionDigits: 3 })
    : "—";

export const fmtMoney = (v) =>
  v !== null && v !== "" && v !== undefined && Number.isFinite(Number(v))
    ? Number(v).toLocaleString("en-US", { maximumFractionDigits: 0 })
    : "—";

/**
 * Data loader without synchronous setState in effects.
 * `key` identifies the request (filters, page); `reload()` refetches.
 * Returns { data, loading, error, reload }; `data` keeps the last result while a new one loads.
 */
export function useLoader(fetcher, key, fallbackError = "") {
  const [state, setState] = useState({ id: null, data: null, error: "" });
  const [tick, setTick] = useState(0);
  const ref = useRef(fetcher);
  useEffect(() => { ref.current = fetcher; });
  const id = `${key}#${tick}`;
  useEffect(() => {
    let alive = true;
    Promise.resolve()
      .then(() => ref.current())
      .then((data) => { if (alive) setState({ id, data, error: "" }); })
      .catch((e) => {
        if (!alive) return;
        const d = e?.response?.data;
        setState((s) => ({ id, data: s.data, error: d?.error || d?.message || d?.detail || e?.message || fallbackError }));
      });
    return () => { alive = false; };
  }, [id, fallbackError]);
  const reload = useCallback(() => setTick((n) => n + 1), []);
  const settled = state.id === id;
  return { data: state.data, loading: !settled, error: settled ? state.error : "", reload };
}
