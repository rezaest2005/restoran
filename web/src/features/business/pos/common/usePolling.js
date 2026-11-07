import { useEffect, useRef } from "react";

/**
 * Calls `fn` now and every `ms` while the page is visible; pauses when hidden
 * and refreshes immediately when it becomes visible again.
 */
export default function usePolling(fn, ms = 15000, enabled = true) {
  const ref = useRef(fn);
  useEffect(() => { ref.current = fn; });

  useEffect(() => {
    if (!enabled) return undefined;
    let timer = null;
    const run = () => ref.current?.();
    const start = () => {
      if (timer) return;
      run();
      timer = setInterval(run, ms);
    };
    const stop = () => { if (timer) { clearInterval(timer); timer = null; } };
    const onVis = () => (document.visibilityState === "visible" ? start() : stop());
    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVis);
    return () => { document.removeEventListener("visibilitychange", onVis); stop(); };
  }, [ms, enabled]);
}
