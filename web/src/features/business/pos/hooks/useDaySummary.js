import { useState, useCallback, useRef, useEffect } from "react";
import { fetchDaySummary } from "../api";
import usePolling from "../common/usePolling";

/** End-of-day summary for `date`, refreshed every 15 s while visible. */
export default function useDaySummary(date, enabled = true) {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const ctrlRef = useRef(null);
  const loadedFor = useRef(null);

  const load = useCallback(async () => {
    ctrlRef.current?.abort();
    const ctrl = new AbortController();
    ctrlRef.current = ctrl;
    if (loadedFor.current !== date) setLoading(true);
    try {
      const data = await fetchDaySummary(date, ctrl.signal);
      if (ctrl.signal.aborted) return;
      setSummary(data?.success ? data : null);
      setError(!data?.success);
      loadedFor.current = date;
    } catch (err) {
      if (ctrl.signal.aborted || err?.code === "ERR_CANCELED") return;
      setError(true);
      if (loadedFor.current !== date) setSummary(null);
    } finally {
      if (!ctrl.signal.aborted) setLoading(false);
    }
  }, [date]);

  usePolling(load, 15000, enabled);
  useEffect(() => () => ctrlRef.current?.abort(), []);

  return { summary, loading, error, reload: load };
}
