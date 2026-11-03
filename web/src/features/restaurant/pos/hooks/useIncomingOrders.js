import { useCallback, useEffect, useRef, useState } from "react";
import { fetchIncomingOrders } from "../api";

const POLL_MS = 5000;
const LS_MUTE = "pos_incoming_muted";
const LS_AUTO = "pos_incoming_autoprint";

const readLS = (k, def) => {
  try {
    const v = localStorage.getItem(k);
    return v === null ? def : v === "1";
  } catch { return def; }
};
const writeLS = (k, v) => { try { localStorage.setItem(k, v ? "1" : "0"); } catch { /* ignore */ } };

let audioCtx = null;
export function playBeep() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    audioCtx = audioCtx || new AC();
    if (audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "sine";
    osc.frequency.value = 880;
    gain.gain.value = 0.2;
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.25);
  } catch { /* audio blocked before user gesture */ }
}

/** Polls pending online orders every 5 s while the page is visible. */
export default function useIncomingOrders({ onNewOrder } = {}) {
  const [orders, setOrders] = useState([]);
  const [error, setError] = useState(false);
  const [muted, setMutedState] = useState(() => readLS(LS_MUTE, false));
  const [autoPrint, setAutoPrintState] = useState(() => readLS(LS_AUTO, true));

  const seen = useRef(new Set());
  const first = useRef(true);
  const mutedRef = useRef(muted);
  const cbRef = useRef(onNewOrder);
  const ctrlRef = useRef(null);
  mutedRef.current = muted;
  cbRef.current = onNewOrder;

  const load = useCallback(async () => {
    ctrlRef.current?.abort();
    const ctrl = new AbortController();
    ctrlRef.current = ctrl;
    try {
      const data = await fetchIncomingOrders("pending", ctrl.signal);
      if (ctrl.signal.aborted) return;
      const list = Array.isArray(data?.orders) ? data.orders : [];
      setOrders(list);
      setError(false);
      const fresh = list.filter((o) => !seen.current.has(o.id));
      list.forEach((o) => seen.current.add(o.id));
      if (first.current) {
        first.current = false;
      } else if (fresh.length) {
        if (!mutedRef.current) playBeep();
        cbRef.current?.(fresh[fresh.length - 1], fresh);
      }
    } catch (err) {
      if (ctrl.signal.aborted || err?.code === "ERR_CANCELED") return;
      setError(true);
    }
  }, []);

  useEffect(() => {
    let timer = null;
    const start = () => {
      if (timer) return;
      load();
      timer = setInterval(load, POLL_MS);
    };
    const stop = () => { if (timer) { clearInterval(timer); timer = null; } };
    const onVis = () => (document.visibilityState === "visible" ? start() : stop());
    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      stop();
      ctrlRef.current?.abort();
    };
  }, [load]);

  const setMuted = useCallback((v) => { setMutedState(v); writeLS(LS_MUTE, v); }, []);
  const setAutoPrint = useCallback((v) => { setAutoPrintState(v); writeLS(LS_AUTO, v); }, []);

  return { orders, error, refresh: load, muted, setMuted, autoPrint, setAutoPrint };
}
