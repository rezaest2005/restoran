// Local-first sync engine (framework-free). One engine per (business, user); data lives in IndexedDB.
// Server stays the source of truth: reads come from the local copy, writes go through the outbox -> /api/sync/push/.
import { ENTITY_STORES, dbNameFor, deleteDb, makeStore, openDb } from "./idb";

export const GRACE_MS = 72 * 3600 * 1000;       // how long the device may work offline without a successful sync
const INTERVAL_MS = 15000;
const BATCH = 25;
const MAX_ERRORS = 20;
const CLOCK_SLACK_MS = 5 * 60 * 1000;

export const uuid = () => {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  const h = (n) => Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join("");
  return `${h(8)}-${h(4)}-4${h(3)}-a${h(3)}-${h(12)}`;
};

export const shortId = (id) => String(id || "").replace(/-/g, "").slice(0, 4).toUpperCase();

export function createEngine({ client, businessId, userId }) {
  const name = dbNameFor(businessId, userId);
  let store = null;
  let timer = null;
  let running = false;
  let syncing = null;
  let fails = 0;
  let nextTryAt = 0;
  let channel = null;
  let destroyed = false;
  let lastStatusAt = 0;
  const listeners = new Set();

  let state = {
    ready: false, enabled: false, online: typeof navigator === "undefined" ? true : navigator.onLine,
    syncing: false, pending: 0, conflicts: 0, lastSyncAt: null, lastError: null, errors: [],
    locked: false, lockReason: null, clockTampered: false, entities: [], rev: {}, persisted: null,
    subscriptionEndsAt: null,
  };
  let meta = { cursor: "0", clock: { maxWall: 0, syncWall: 0 }, enabled: false, subscriptionEndsAt: null, entities: [] };

  const emit = () => listeners.forEach((l) => { try { l(state); } catch { /* listener errors never break sync */ } });
  const set = (patch) => { state = { ...state, ...patch }; emit(); };
  const bump = (...keys) => {
    const rev = { ...state.rev };
    keys.forEach((k) => { rev[k] = (rev[k] || 0) + 1; });
    set({ rev });
    try { channel?.postMessage({ type: "changed", keys }); } catch { /* ignore */ }
  };
  const pushError = (e) => {
    const item = { at: Date.now(), message: e };
    set({ lastError: e, errors: [item, ...state.errors].slice(0, MAX_ERRORS) });
  };

  const saveMeta = () => store.put("meta", { key: "state", ...meta });

  // ── clock / lock: the offline grace window must not be stretched by turning the clock back ──
  function evaluateLock() {
    const now = Date.now();
    const tampered = meta.clock.maxWall && now < meta.clock.maxWall - CLOCK_SLACK_MS;
    const eff = Math.max(now, meta.clock.maxWall || 0);
    if (eff > (meta.clock.maxWall || 0)) { meta.clock.maxWall = eff; }
    let lock = null;
    if (meta.subscriptionEndsAt && eff >= new Date(meta.subscriptionEndsAt).getTime()) lock = "subscription";
    else if (meta.clock.syncWall && eff - meta.clock.syncWall > GRACE_MS) lock = "grace";
    else if (!meta.clock.syncWall) lock = "never_synced";
    if (tampered !== state.clockTampered || (lock !== state.lockReason)) {
      set({ clockTampered: !!tampered, locked: !!lock && lock !== "never_synced", lockReason: lock });
    }
    return lock;
  }

  async function refreshCounts() {
    const rows = await store.getAll("outbox");
    set({
      pending: rows.filter((r) => r.status === "pending" || r.status === "sending").length,
      conflicts: rows.filter((r) => r.status === "conflict" || r.status === "rejected").length,
    });
  }

  async function status() {
    try {
      const r = await client.get("/api/sync/status/");
      const d = r.data;
      meta.enabled = !!d.enabled;
      meta.entities = d.entities || [];
      meta.subscriptionEndsAt = d.subscription?.ends_at || null;
      set({ enabled: meta.enabled, entities: meta.entities, subscriptionEndsAt: meta.subscriptionEndsAt });
      await saveMeta();
      return d;
    } catch (e) {
      if (e?.response?.status === 403 && e.response.data?.code === "sync_disabled") {
        meta.enabled = false; set({ enabled: false }); await saveMeta();
      }
      throw e;
    }
  }

  // ── pull ──
  async function applyChanges(changes) {
    const ops = [];
    const touched = new Set();
    const syncedUuids = [];
    for (const c of changes) {
      touched.add(c.entity);
      if (c.deleted) ops.push({ store: c.entity, del: c.id });
      else {
        ops.push({ store: c.entity, put: c.data });
        if (c.entity === "order" && c.data?.client_uuid) syncedUuids.push(c.data.client_uuid);
      }
    }
    if (ops.length) await store.batch(ops);
    for (const u of syncedUuids) {            // the server copy arrived: the local pending copy is no longer needed
      const row = await store.get("outbox", u);
      if (row && row.status === "synced") await store.delete("outbox", u);
    }
    if (touched.size) bump(...touched, ...(syncedUuids.length ? ["outbox"] : []));
  }

  async function pull() {
    let guard = 0;
    for (;;) {
      const r = await client.get("/api/sync/pull/", { params: { cursor: meta.cursor, limit: 500 } });
      const d = r.data;
      if (d.reset) {
        for (const s of ENTITY_STORES) await store.clear(s);
        meta.cursor = "0";
        await saveMeta();
        bump(...ENTITY_STORES);
        if (++guard > 3) return;
        continue;
      }
      await applyChanges(d.changes || []);
      meta.cursor = d.cursor;
      meta.entities = d.entities || meta.entities;
      await saveMeta();
      if (!d.has_more) break;
    }
  }

  // ── push ──
  async function changeLocalStock(lines, sign) {
    const ops = [];
    for (const l of lines || []) {
      if (!l.food_id) continue;
      const p = await store.get("product", l.food_id);
      if (p) ops.push({ store: "product", put: { ...p, stock: Number(p.stock || 0) + sign * Number(l.quantity || 0) } });
    }
    if (ops.length) { await store.batch(ops); bump("product"); }
  }

  async function push() {
    for (;;) {
      const rows = (await store.getAll("outbox"))
        .filter((r) => r.status === "pending").sort((a, b) => a.createdAt - b.createdAt).slice(0, BATCH);
      if (!rows.length) return;
      for (const r of rows) await store.put("outbox", { ...r, status: "sending" });
      let res;
      try {
        res = await client.post("/api/sync/push/", {
          mutations: rows.map((r) => ({ id: r.id, key: r.key, type: r.type, entity_id: r.id, payload: r.payload })),
        });
      } catch (e) {
        for (const r of rows) await store.put("outbox", { ...r, status: "pending", attempts: (r.attempts || 0) + 1 });
        await refreshCounts();
        const st = e?.response?.status;
        if (st === 403 && e.response.data?.code === "sync_disabled") { meta.enabled = false; set({ enabled: false }); }
        if (st === 429) nextTryAt = Date.now() + (Number(e.response.data?.retry_after) || 30) * 1000;
        throw e;
      }
      const byId = new Map((res.data.results || []).map((x) => [x.id, x]));
      for (const r of rows) {
        const x = byId.get(r.id);
        if (!x) { await store.put("outbox", { ...r, status: "pending" }); continue; }
        if (x.status === "ok" || x.status === "duplicate") {
          await store.put("outbox", { ...r, status: "synced", serverId: x.server_id, serverResult: x.result || {}, syncedAt: Date.now() });
        } else if (x.status === "conflict" || x.status === "rejected") {
          await store.put("outbox", { ...r, status: x.status, code: x.code, error: x.error, details: x.details || {} });
          await changeLocalStock(r.snapshot?.items, +1);
        } else {            // transient server error: retry later
          await store.put("outbox", { ...r, status: "pending", attempts: (r.attempts || 0) + 1, error: x.error || x.code });
        }
      }
      bump("outbox", "order");
      await refreshCounts();
    }
  }

  async function gc() {                          // synced copies that never matched a pulled order (window) expire
    const rows = await store.getAll("outbox");
    const old = rows.filter((r) => r.status === "synced" && Date.now() - (r.syncedAt || 0) > 24 * 3600 * 1000);
    if (old.length) { await store.batch(old.map((r) => ({ store: "outbox", del: r.id }))); bump("outbox"); }
  }

  async function runSync({ manual = false, full = false } = {}) {
    if (syncing) return syncing;
    if (!manual && Date.now() < nextTryAt) return null;
    if (typeof navigator !== "undefined" && !navigator.onLine) { set({ online: false }); return null; }
    syncing = (async () => {
      set({ syncing: true, online: true });
      try {
        // the (cheap) status call only runs at start, on reconnect, on 'sync now' and every 5 minutes
        if (full || !lastStatusAt || Date.now() - lastStatusAt > 300000) { await status(); lastStatusAt = Date.now(); }
        if (!meta.enabled) return;
        await push();
        await pull();
        await gc();
        const wall = Date.now();
        meta.clock = { maxWall: Math.max(meta.clock.maxWall || 0, wall), syncWall: wall };
        await saveMeta();
        fails = 0; nextTryAt = 0;
        set({ lastSyncAt: wall, lastError: null });
      } catch (e) {
        fails += 1;
        nextTryAt = Math.max(nextTryAt, Date.now() + Math.min(60000, 1000 * 2 ** Math.min(fails, 6)));
        const code = e?.response?.data?.code;
        if (!e?.response) set({ online: false });
        if (code !== "sync_disabled") pushError(e?.response?.data?.error || e?.message || "sync failed");
      } finally {
        set({ syncing: false });
        await refreshCounts();
        evaluateLock();
        try { await saveMeta(); } catch { /* ignore */ }
        syncing = null;
      }
    })();
    return syncing;
  }

  // ── public API ──
  const api = {
    name,
    getState: () => state,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },

    async init() {
      store = makeStore(await openDb(name));
      if (destroyed) { store.close(); store = null; throw new Error("destroyed"); }   // (React strict mode mounts twice)
      const m = await store.get("meta", "state");
      if (m) meta = { ...meta, ...m, clock: { ...meta.clock, ...(m.clock || {}) } };
      for (const r of await store.getAll("outbox")) {           // interrupted push: safe to resend (idempotent)
        if (r.status === "sending") await store.put("outbox", { ...r, status: "pending" });
      }
      try { channel = new BroadcastChannel(name); channel.onmessage = (e) => {
        if (e.data?.type === "changed") { const rev = { ...state.rev }; (e.data.keys || []).forEach((k) => { rev[k] = (rev[k] || 0) + 1; }); set({ rev }); refreshCounts(); }
      }; } catch { /* no BroadcastChannel */ }
      set({ ready: true, enabled: !!meta.enabled, entities: meta.entities || [], lastSyncAt: meta.clock.syncWall || null,
        subscriptionEndsAt: meta.subscriptionEndsAt });
      try {
        if (navigator.storage?.persist) set({ persisted: await navigator.storage.persist() });
      } catch { /* ignore */ }
      await refreshCounts();
      evaluateLock();
    },

    start() {
      if (running || destroyed) return;
      running = true;
      const onOnline = () => { set({ online: true }); fails = 0; nextTryAt = 0; runSync({ manual: true, full: true }); };
      const onOffline = () => set({ online: false });
      const onVisible = () => { if (document.visibilityState === "visible") runSync(); };
      window.addEventListener("online", onOnline);
      window.addEventListener("offline", onOffline);
      document.addEventListener("visibilitychange", onVisible);
      timer = setInterval(() => { evaluateLock(); if (document.visibilityState !== "hidden") runSync(); }, INTERVAL_MS);
      api._off = () => {
        window.removeEventListener("online", onOnline);
        window.removeEventListener("offline", onOffline);
        document.removeEventListener("visibilitychange", onVisible);
      };
      runSync({ manual: true, full: true });
    },

    stop() {
      running = false;
      clearInterval(timer);
      api._off?.();
    },

    syncNow: () => { fails = 0; nextTryAt = 0; return runSync({ manual: true, full: true }); },
    list: (entity) => store.getAll(entity),
    outbox: async () => (await store.getAll("outbox")).sort((a, b) => b.createdAt - a.createdAt),
    isLocalFirstReady: () => state.ready && state.enabled && !!meta.clock.syncWall && (meta.cursor || "0") !== "0"
      && !String(meta.cursor).startsWith("s"),

    // Queue an order for the server. `snapshot` is only for showing/printing it locally; the server recomputes everything.
    async enqueueOrder(payload, snapshot) {
      const lock = evaluateLock();
      if (lock && lock !== "never_synced") throw Object.assign(new Error(lock), { code: "locked", reason: lock });
      const id = uuid();
      const row = {
        id, key: id, type: "order.create", payload, snapshot, status: "pending", attempts: 0,
        createdAt: Date.now(), createdIso: new Date().toISOString(),
      };
      await store.put("outbox", row);
      await changeLocalStock(snapshot?.items, -1);
      bump("outbox", "order");
      await refreshCounts();
      setTimeout(() => runSync({ manual: true }), 200);
      return row;
    },

    // Conflict fixes chosen by the cashier: discard | retry | accept_prices | adjust_qty
    async resolve(id, action) {
      const row = await store.get("outbox", id);
      if (!row) return;
      if (action === "discard") {
        await store.delete("outbox", id);
      } else {
        const items = (row.payload.items || []).map((l) => ({ ...l }));
        let snapItems = (row.snapshot?.items || []).map((l) => ({ ...l }));
        let payloadItems = items;
        if (action === "accept_prices") {
          for (const d of row.details?.lines || []) {
            for (const arr of [payloadItems, snapItems]) {
              arr.forEach((l) => {
                if ((l.food_id ?? l.id) === d.food_id && d.now != null) {
                  if (l.price === d.was || l.price == null) l.price = d.now;
                  l.base_price = d.now;
                }
              });
            }
          }
        } else if (action === "adjust_qty") {
          for (const d of row.details?.lines || []) {
            for (const arr of [payloadItems, snapItems]) {
              arr.forEach((l) => { if ((l.food_id ?? l.id) === d.food_id) l.quantity = Math.max(0, Math.min(l.quantity, d.available)); });
            }
          }
          payloadItems = payloadItems.filter((l) => l.quantity > 0);
          snapItems = snapItems.filter((l) => l.quantity > 0);
          if (!payloadItems.length) { await store.delete("outbox", id); bump("outbox"); await refreshCounts(); return; }
        } else if (action === "drop_missing") {
          const gone = new Set((row.details?.lines || []).map((d) => d.food_id));
          payloadItems = payloadItems.filter((l) => !gone.has(l.food_id ?? l.id));
          snapItems = snapItems.filter((l) => !gone.has(l.food_id ?? l.id));
          if (!payloadItems.length) { await store.delete("outbox", id); bump("outbox"); await refreshCounts(); return; }
        }
        const total = snapItems.reduce((s, l) => s + l.price * l.quantity, 0);
        const next = {
          ...row, key: uuid(), status: "pending", attempts: 0, code: null, error: null, details: {},
          payload: { ...row.payload, items: payloadItems }, snapshot: { ...row.snapshot, items: snapItems, total },
        };
        await store.put("outbox", next);
        await changeLocalStock(snapItems, -1);
      }
      bump("outbox", "order");
      await refreshCounts();
      runSync({ manual: true });
    },

    // Remove local data. keepOutbox keeps unsynced orders so nothing is lost; they sync after the next sign-in.
    async wipe({ keepOutbox = false } = {}) {
      api.stop();
      let kept = [];
      if (keepOutbox && store) kept = (await store.getAll("outbox")).filter((r) => r.status !== "synced");
      try { channel?.close(); } catch { /* ignore */ }
      try { store?.close(); } catch { /* ignore */ }
      store = null;
      await deleteDb(name);
      if (kept.length) {                     // recreate with only the unsynced rows (+ a stale clock so it must sync again)
        const s = makeStore(await openDb(name));
        for (const r of kept) await s.put("outbox", { ...r, status: r.status === "sending" ? "pending" : r.status });
        s.close();
      }
      destroyed = true;
    },

    async unsyncedCount() {
      if (!store) return 0;
      return (await store.getAll("outbox")).filter((r) => r.status !== "synced").length;
    },

    destroy() {
      destroyed = true;
      api.stop();
      try { channel?.close(); } catch { /* ignore */ }
      try { store?.close(); } catch { /* ignore */ }
      listeners.clear();
    },
  };
  return api;
}
