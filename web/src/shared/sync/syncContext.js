import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { deleteDb, listSyncDbs } from "./idb";

export const SyncContext = createContext(null);

export const INERT = {
  engine: null, enabled: false, ready: false, active: false, online: true, syncing: false, pending: 0, conflicts: 0,
  lastSyncAt: null, errors: [], locked: false, lockReason: null, rev: {}, syncNow: async () => {},
};

export const useSync = () => useContext(SyncContext) || INERT;

/** Rows of one entity from the local store; re-reads when that entity changed (this tab or another). */
export function useLocalList(entity) {
  const { engine, ready, rev } = useSync();
  const [rows, setRows] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const r = rev?.[entity] || 0;
  useEffect(() => {
    let dead = false;
    if (!engine || !ready) { return undefined; }
    const read = entity === "outbox" ? engine.outbox() : engine.list(entity);
    read.then((x) => { if (!dead) { setRows(x); setLoaded(true); } }).catch(() => {});
    return () => { dead = true; };
  }, [engine, ready, entity, r]);
  return { rows, loaded };
}

/** Call before signing out. Resolves with what the UI must do: { proceed, unsynced }. */
export function useLogoutGuard() {
  const { engine } = useSync();
  return useCallback(async () => {
    if (!engine) return { unsynced: 0, wipe: async () => {} };
    try { await engine.syncNow(); } catch { /* offline */ }
    const unsynced = await engine.unsyncedCount();
    return { unsynced, wipe: (opts) => engine.wipe(opts) };
  }, [engine]);
}

/** Delete every local database of this app (used when the identity is unknown, e.g. forced sign-out). */
export async function wipeAllLocalData() {
  for (const n of await listSyncDbs()) await deleteDb(n);
}


/** On the sign-in page: forget every local copy that holds no unsent orders (a forced sign-out leaves data behind). */
export async function purgeSyncedDatabases() {
  const { makeStore, openDb } = await import("./idb");
  for (const n of await listSyncDbs()) {
    try {
      const st = makeStore(await openDb(n));
      const left = (await st.getAll("outbox")).filter((r) => r.status !== "synced").length;
      st.close();
      if (!left) await deleteDb(n);
    } catch { await deleteDb(n); }
  }
}
