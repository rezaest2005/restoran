// Thin promise wrapper over IndexedDB (no dependency). One database per user + business.
export const ENTITY_STORES = ["category", "product", "customer", "order"];
export const STORES = ["meta", "outbox", ...ENTITY_STORES];
export const DB_PREFIX = "bizsuite-sync-";

const req = (r) => new Promise((resolve, reject) => {
  r.onsuccess = () => resolve(r.result);
  r.onerror = () => reject(r.error);
});

export function dbNameFor(businessId, userId) {
  return `${DB_PREFIX}${businessId || 0}-${userId || 0}`;
}

export function openDb(name) {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") { reject(new Error("indexedDB unavailable")); return; }
    const open = indexedDB.open(name, 1);
    open.onupgradeneeded = () => {
      const db = open.result;
      for (const s of STORES) {
        if (db.objectStoreNames.contains(s)) continue;
        if (s === "meta") db.createObjectStore(s, { keyPath: "key" });
        else if (s === "outbox") db.createObjectStore(s, { keyPath: "id" }).createIndex("createdAt", "createdAt");
        else db.createObjectStore(s, { keyPath: "id" });
      }
    };
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error);
    open.onblocked = () => reject(new Error("indexedDB blocked"));
  });
}

export function makeStore(db) {
  const run = (stores, mode, fn) => new Promise((resolve, reject) => {
    const t = db.transaction(stores, mode);
    let out;
    Promise.resolve(fn(t)).then((v) => { out = v; }, reject);
    t.oncomplete = () => resolve(out);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error("aborted"));
  });
  return {
    get: (store, key) => run(store, "readonly", (t) => req(t.objectStore(store).get(key))),
    getAll: (store) => run(store, "readonly", (t) => req(t.objectStore(store).getAll())),
    count: (store) => run(store, "readonly", (t) => req(t.objectStore(store).count())),
    put: (store, value) => run(store, "readwrite", (t) => req(t.objectStore(store).put(value))),
    delete: (store, key) => run(store, "readwrite", (t) => req(t.objectStore(store).delete(key))),
    clear: (store) => run(store, "readwrite", (t) => req(t.objectStore(store).clear())),
    // many puts/deletes of several stores in one transaction: [{store, put?, del?}]
    batch: (ops) => run([...new Set(ops.map((o) => o.store))], "readwrite", (t) => {
      for (const o of ops) {
        const s = t.objectStore(o.store);
        if (o.del !== undefined) s.delete(o.del); else s.put(o.put);
      }
    }),
    close: () => db.close(),
  };
}

export function deleteDb(name) {
  return new Promise((resolve) => {
    if (typeof indexedDB === "undefined") { resolve(); return; }
    const r = indexedDB.deleteDatabase(name);
    r.onsuccess = r.onerror = r.onblocked = () => resolve();
  });
}

export async function listSyncDbs() {
  try {
    const all = (await indexedDB.databases?.()) || [];
    return all.map((d) => d.name).filter((n) => n && n.startsWith(DB_PREFIX));
  } catch { return []; }
}
