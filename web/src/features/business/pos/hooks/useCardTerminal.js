import { useCallback, useEffect, useRef, useState } from "react";
import {
  startCardPayment, getCardAttempt, getLatestCardAttempt, checkCardAttempt, cancelCardAttempt,
  resolveCardAttempt, runLocalBridgePayment, checkLocalBridge, bridgeCancel,
} from "../services/cardTerminal";

/*
 * Card terminal payment of ONE already-created (unpaid) order.
 * phase: idle | waiting | failed | unknown
 *   waiting  - the amount was sent; the customer swipes the card (countdown + Cancel)
 *   failed   - definitely not charged (declined / cancelled / device timeout / unreachable / refused)
 *   unknown  - the amount was sent but the result is unclear: check status / confirm by hand / not paid
 * An approved result calls onPaid(order) with the receipt payload (trace, reference, masked card).
 * Nothing here ever retries a charge by itself.
 */
export default function useCardTerminal({ settings, onPaid }) {
  const [phase, setPhase] = useState("idle");
  const [attempt, setAttempt] = useState(null);
  const [failure, setFailure] = useState(null);      // { code, detail }
  const [busy, setBusy] = useState(false);
  const [deadline, setDeadline] = useState(0);
  const [now, setNow] = useState(0);
  const run = useRef(0);
  const orderRef = useRef(null);
  const attemptRef = useRef(null);
  const onPaidRef = useRef(onPaid);
  useEffect(() => { onPaidRef.current = onPaid; });

  useEffect(() => {
    if (phase !== "waiting") return undefined;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [phase]);

  const secondsLeft = phase === "waiting" ? Math.max(0, Math.ceil((deadline - now) / 1000)) : 0;
  const totalSeconds = attempt?.timeout_seconds || settings?.timeout_seconds || 90;

  const keep = (a) => { attemptRef.current = a; setAttempt(a); };

  // one place that turns a server attempt into a screen
  const apply = useCallback((a, myRun) => {
    if (myRun !== run.current || !a) return;
    keep({ ...(attemptRef.current || {}), ...a, bridge: a.bridge || attemptRef.current?.bridge });
    if (a.status === "approved") {
      setPhase("idle");
      if (a.order) onPaidRef.current?.(a.order);
    } else if (a.status === "unknown") {
      setPhase("unknown");
    } else if (a.open) {
      setPhase("waiting");
    } else {
      setFailure({ code: a.status, detail: a.message || "" });
      setPhase("failed");
    }
  }, []);

  const fail = useCallback((code, detail = "", myRun) => {
    if (myRun !== run.current) return;
    setFailure({ code, detail });
    setPhase("failed");
  }, []);

  // after a lost connection: poll the server until the attempt is no longer in flight
  const pollUntilSettled = useCallback(async (orderId, myRun) => {
    for (let i = 0; i < 120 && myRun === run.current; i += 1) {
      await new Promise((r) => setTimeout(r, 2500));
      if (myRun !== run.current) return;
      try {
        const d = await getLatestCardAttempt(orderId);
        const a = d.attempt;
        if (a && (a.status === "approved" || a.status === "unknown" || !a.open)) { apply(a, myRun); return; }
      } catch { /* keep polling */ }
    }
    fail("lost", "", myRun);
  }, [apply, fail]);

  const start = useCallback(async (order) => {
    orderRef.current = order;
    run.current += 1;
    const myRun = run.current;
    setFailure(null);
    attemptRef.current = null;
    setAttempt(null);
    const timeout = settings?.timeout_seconds || 90;
    setDeadline(Date.now() + timeout * 1000);
    setNow(Date.now());
    setPhase("waiting");
    let data;
    try {
      data = await startCardPayment(order.order_id, order.driver_id, (timeout + 45) * 1000);
    } catch (err) {
      data = err?.response?.data;
      if (!data) { pollUntilSettled(order.order_id, myRun); return; }       // no answer (proxy cut / network)
    }
    if (myRun !== run.current) return;
    if (!data?.success) {
      if (data?.attempt) {                                                    // an attempt is already open (second tab / double click)
        try {
          const full = await getCardAttempt(data.attempt.id);
          apply(full.attempt, myRun);
          if (full.attempt.open && full.attempt.status !== "unknown") pollUntilSettled(order.order_id, myRun);
          return;
        } catch { /* fall through */ }
      }
      fail(data?.code || "server_error", "", myRun);
      return;
    }
    let a = data.attempt;
    keep(a);
    if (a.mode === "local_bridge" && a.status === "created") {
      try {
        const r = await runLocalBridgePayment(a);
        a = r.attempt;
      } catch (err) {
        const d = err?.response?.data;
        if (d?.attempt) a = d.attempt;
        else { pollUntilSettled(order.order_id, myRun); return; }
      }
    }
    apply(a, myRun);
  }, [apply, fail, pollUntilSettled, settings?.timeout_seconds]);

  const currentAttempt = useCallback(async () => {
    let a = attemptRef.current;
    if (!a?.id && orderRef.current) {
      try { a = (await getLatestCardAttempt(orderRef.current.order_id)).attempt; } catch { /* none yet */ }
    }
    if (a && !a.bridge && a.mode === "local_bridge") {
      try { a = (await getCardAttempt(a.id)).attempt; } catch { /* ignore */ }
    }
    return a;
  }, []);

  /** Cancel while waiting. The outcome still comes from the device / the waiting call. */
  const cancel = useCallback(async () => {
    setBusy(true);
    try {
      const a = await currentAttempt();
      if (!a?.id) return;
      if (a.mode === "local_bridge" && a.bridge) await bridgeCancel(a.bridge.base_url, a.bridge.request.rrn);
      try {
        const d = await cancelCardAttempt(a.id);
        apply(d.attempt, run.current);
      } catch (err) {
        const d = err?.response?.data;
        if (d?.attempt) apply(d.attempt, run.current);
      }
    } finally { setBusy(false); }
  }, [apply, currentAttempt]);

  const check = useCallback(async () => {
    setBusy(true);
    try {
      const a = await currentAttempt();
      if (!a?.id) return;
      let d;
      try {
        d = a.mode === "local_bridge" ? await checkLocalBridge(a) : await checkCardAttempt(a.id);
      } catch (err) { d = err?.response?.data; }
      if (d?.attempt) apply(d.attempt, run.current);
    } finally { setBusy(false); }
  }, [apply, currentAttempt]);

  /** outcome: "paid" (needs the trace number from the device slip) | "not_paid". Returns { ok, code }. */
  const resolve = useCallback(async (outcome, trace) => {
    setBusy(true);
    try {
      const a = await currentAttempt();
      if (!a?.id) return { ok: false, code: "not_found" };
      try {
        const d = await resolveCardAttempt(a.id, outcome, trace);
        if (outcome === "not_paid") {                       // closed by the cashier: offer retry / other way / cancel
          keep(d.attempt);
          setFailure({ code: "not_paid", detail: "" });
          setPhase("failed");
        } else apply(d.attempt, run.current);
        return { ok: true };
      } catch (err) {
        return { ok: false, code: err?.response?.data?.code || "server_error" };
      }
    } finally { setBusy(false); }
  }, [apply, currentAttempt]);

  const reset = useCallback(() => {
    run.current += 1;
    orderRef.current = null;
    attemptRef.current = null;
    setAttempt(null);
    setFailure(null);
    setPhase("idle");
  }, []);

  return { phase, attempt, failure, busy, secondsLeft, totalSeconds, start, cancel, check, resolve, reset };
}
