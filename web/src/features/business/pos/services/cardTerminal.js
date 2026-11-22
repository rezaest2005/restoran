import client from "../../api/client";

/*
 * Card terminal: server API wrappers + the browser side of the bridge protocol (local_bridge mode).
 * The cashier's browser talks to http://127.0.0.1:<port> (allowed even from an https page) and then REPORTS the
 * answer to the server together with the attempt's HMAC token. See docs/CARD_READER.md.
 */

const API = "/api/card-reader";

const unwrap = (p) => p.then((r) => r.data);

export const getCardSettings = () => unwrap(client.get(`${API}/settings/`));
export const saveCardSettings = (data) => unwrap(client.put(`${API}/settings/`, data));
export const testCardConnection = () => unwrap(client.post(`${API}/test/`));
export const startCardPayment = (orderId, driverId, timeoutMs) =>
  unwrap(client.post(`${API}/pay/`, { order_id: orderId, driver_id: driverId || null }, { timeout: timeoutMs }));
export const getLatestCardAttempt = (orderId) => unwrap(client.get(`${API}/attempts/`, { params: { order_id: orderId } }));
export const getCardAttempt = (id) => unwrap(client.get(`${API}/attempts/${id}/`));
export const checkCardAttempt = (id) => unwrap(client.post(`${API}/attempts/${id}/check/`));
export const cancelCardAttempt = (id) => unwrap(client.post(`${API}/attempts/${id}/cancel/`));
export const reportCardResult = (id, body) => unwrap(client.post(`${API}/attempts/${id}/report/`, body));
export const resolveCardAttempt = (id, outcome, traceNumber) =>
  unwrap(client.post(`${API}/attempts/${id}/resolve/`, { outcome, trace_number: traceNumber || "" }));

export const settleOrder = (orderId, method, driverId) =>
  unwrap(client.post(`/api/pos/orders/${orderId}/settle/`, { payment_method: method, driver_id: driverId || null }));
export const cancelUnpaidOrder = (orderId) => unwrap(client.post(`/api/pos/orders/${orderId}/cancel-unpaid/`));

/* ───────── browser -> bridge (local_bridge mode) ───────── */

function withTimeout(ms) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  return { signal: ctl.signal, abort: () => ctl.abort(), done: () => clearTimeout(timer) };
}

async function bridgeFetch(url, { method = "GET", body, timeoutMs, signal } = {}) {
  const t = withTimeout(timeoutMs);
  const onAbort = () => t.abort();
  if (signal) signal.addEventListener("abort", onAbort);
  try {
    const res = await fetch(url, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: t.signal,
      cache: "no-store",
      credentials: "omit",
      redirect: "error",
    });
    let json = null;
    try { json = await res.json(); } catch { /* not JSON */ }
    return { ok: res.ok, status: res.status, json };
  } finally {
    t.done();
    if (signal) signal.removeEventListener("abort", onAbort);
  }
}

/** Can this browser reach the bridge? Returns { ok, status }. Never throws. */
export async function probeBridge(baseUrl, reference = "__ping__", timeoutMs = 4000) {
  try {
    const r = await bridgeFetch(`${baseUrl}/api/payment/status?rrn=${encodeURIComponent(reference)}`, { timeoutMs });
    return { ok: true, status: r.status };
  } catch {
    return { ok: false, status: null };
  }
}

/** Ask the bridge for the status of a reference. -> { response } | { error } */
export async function bridgeStatus(baseUrl, reference) {
  try {
    const r = await bridgeFetch(`${baseUrl}/api/payment/status?rrn=${encodeURIComponent(reference)}`, { timeoutMs: 8000 });
    return r.json ? { response: r.json } : { error: "bad_response" };
  } catch {
    return { error: "network" };
  }
}

export async function bridgeCancel(baseUrl, reference) {
  try {
    await bridgeFetch(`${baseUrl}/api/payment/cancel`, { method: "POST", body: { rrn: reference }, timeoutMs: 8000 });
  } catch { /* best effort: the waiting payment call reports the outcome */ }
}

/**
 * Runs one local_bridge payment end to end and reports each step to the server.
 * probe -> report "sent" -> POST /api/payment -> report the answer.
 * Returns the last server answer ({ attempt } | { error... }) of the final report.
 */
export async function runLocalBridgePayment(attempt, { signal } = {}) {
  const b = attempt.bridge;
  const report = (body) => reportCardResult(attempt.id, { token: b.token, ...body });
  const probe = await probeBridge(b.base_url, b.request.rrn);
  if (!probe.ok) return report({ source: "pay", error: "unreachable" });
  await report({ source: "sent" });
  let r;
  try {
    r = await bridgeFetch(`${b.base_url}/api/payment`, {
      method: "POST", body: b.request, timeoutMs: (b.timeout_seconds + 5) * 1000, signal,
    });
  } catch (e) {
    return report({ source: "pay", error: e?.name === "AbortError" ? "timeout" : "network" });
  }
  if (r.status >= 500 || !r.json) return report({ source: "pay", error: "bridge_error" });
  return report({ source: "pay", response: r.json });
}

export async function checkLocalBridge(attempt) {
  const b = attempt.bridge;
  const q = await bridgeStatus(b.base_url, b.request.rrn);
  return reportCardResult(attempt.id, { token: b.token, source: "status", ...q });
}
