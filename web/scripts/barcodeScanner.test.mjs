// Run: node --test scripts/barcodeScanner.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { detectCodes, looksLikeBarcode, dedupeScan } from "../src/features/business/pos/common/barcodeScanner.js";

const burst = (code, start = 0, gap = 10) => [
  ...[...code].map((c, i) => [c, start + i * gap]),
  ["Enter", start + code.length * gap + gap],
];

test("fast burst ending with Enter is a scan", () => {
  assert.deepEqual(detectCodes(burst("6260001234567")), ["6260001234567"]);
});

test("human typing (slow keys) is not a scan", () => {
  assert.deepEqual(detectCodes(burst("6260001234567", 0, 120)), []);
});

test("too short burst is ignored", () => {
  assert.deepEqual(detectCodes(burst("123")), []);
});

test("typing then a scan: only the burst counts", () => {
  const ev = [["a", 0], ["b", 400], ["c", 900], ...burst("ABC-1234", 2000)];
  assert.deepEqual(detectCodes(ev), ["ABC-1234"]);
});

test("Shift is transparent, other named keys break the burst", () => {
  assert.deepEqual(detectCodes([["1", 0], ["Shift", 5], ["2", 10], ["3", 15], ["4", 20], ["Enter", 25]]), ["1234"]);
  assert.deepEqual(detectCodes([["1", 0], ["2", 5], ["ArrowLeft", 8], ["3", 10], ["4", 15], ["Enter", 20]]), []);
});

test("two consecutive scans", () => {
  assert.deepEqual(detectCodes([...burst("11112222", 0), ...burst("33334444", 500)]), ["11112222", "33334444"]);
});

test("looksLikeBarcode", () => {
  assert.equal(looksLikeBarcode("6260001234567"), true);
  assert.equal(looksLikeBarcode("pizza"), false);
  assert.equal(looksLikeBarcode("ab 12"), false);
  assert.equal(looksLikeBarcode("123"), false);
});

test("dedupeScan", () => {
  const m = dedupeScan(null, "1111", 0);
  assert.equal(dedupeScan(m, "1111", 500), null);
  assert.deepEqual(dedupeScan(m, "1111", 2000), { code: "1111", time: 2000 });
  assert.deepEqual(dedupeScan(m, "2222", 100), { code: "2222", time: 100 });
});
