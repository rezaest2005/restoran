import { useCallback, useEffect, useState } from "react";

/**
 * Fetch on mount and whenever `params` change, without setting state synchronously
 * inside an effect. `loading` is derived: the stored result belongs to an older request key.
 * `fetcher(params)` must return a promise; `reload()` repeats the current request.
 */
export default function useLoad(fetcher, params) {
  const [tick, setTick] = useState(0);
  const key = `${JSON.stringify(params)}|${tick}`;
  const [res, setRes] = useState({ key: null, data: null, error: null });

  useEffect(() => {
    let alive = true;
    fetcher(params)
      .then((data) => { if (alive) setRes({ key, data, error: null }); })
      .catch((error) => { if (alive) setRes({ key, data: null, error }); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const reload = useCallback(() => setTick((n) => n + 1), []);
  return { data: res.data, error: res.error, loading: res.key !== key, reload };
}
