// Keyboard-wedge barcode scanner support.
//
// A USB scanner "types" the code very fast (<= ~50 ms between keys) and ends
// with Enter. `feedKey` is a pure reducer that detects such a burst; the React
// hook lives in hooks/useBarcodeScanner.js.

export const SCAN_MAX_GAP_MS = 50;
export const SCAN_MIN_LENGTH = 4;
export const SCAN_DEDUPE_MS = 1200;

export const initialScanState = Object.freeze({ buffer: "", lastTime: 0 });

/**
 * Feed one key press. Returns `{ state, code }`; `code` is a string only when
 * `key` is Enter and the buffered burst is long enough.
 */
export function feedKey(state, key, now, opts = {}) {
  const maxGap = opts.maxGap ?? SCAN_MAX_GAP_MS;
  const minLength = opts.minLength ?? SCAN_MIN_LENGTH;
  const prev = state || initialScanState;
  const fresh = prev.buffer && now - prev.lastTime <= maxGap;

  if (key === "Enter") {
    const code = fresh && prev.buffer.length >= minLength ? prev.buffer : null;
    return { state: initialScanState, code };
  }
  if (typeof key !== "string" || key.length !== 1) {
    // Shift/Control/etc. are ignored; any other named key breaks the burst.
    const modifier = key === "Shift" || key === "CapsLock" || key === "AltGraph";
    return { state: modifier ? prev : initialScanState, code: null };
  }
  const buffer = fresh || !prev.buffer ? prev.buffer + key : key;
  // A gap longer than maxGap restarts the buffer with this key.
  return { state: { buffer, lastTime: now }, code: null };
}

/** Run a list of [key, time] pairs through feedKey; returns every emitted code. */
export function detectCodes(events, opts) {
  let state = initialScanState;
  const codes = [];
  for (const [key, time] of events) {
    const r = feedKey(state, key, time, opts);
    state = r.state;
    if (r.code) codes.push(r.code);
  }
  return codes;
}

/** True when typed text looks like a barcode (no spaces, has a digit, 4-40 chars). */
export function looksLikeBarcode(value) {
  const v = String(value || "").trim();
  return /^[0-9A-Za-z\-._]{4,40}$/.test(v) && /\d/.test(v);
}

/** Drops a repeated code seen within `windowMs`. Returns the new `{code,time}` memo or null when duplicate. */
export function dedupeScan(memo, code, now, windowMs = SCAN_DEDUPE_MS) {
  if (memo && memo.code === code && now - memo.time < windowMs) return null;
  return { code, time: now };
}
