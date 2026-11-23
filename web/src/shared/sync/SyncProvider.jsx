import { useEffect, useMemo, useState } from "react";
import { dbNameFor, deleteDb, listSyncDbs, makeStore, openDb } from "./idb";
import { INERT, SyncContext } from "./syncContext";
import { createEngine } from "./syncEngine";

const OFF = import.meta.env.VITE_LOCAL_FIRST === "off";

function readIdentity() {
  try {
    const u = JSON.parse(sessionStorage.getItem("user") || localStorage.getItem("user") || "null");
    if (!u || !u.id || !u.business) return null;
    return { userId: u.id, businessId: u.business };
  } catch { return null; }
}

// Leftover databases of other users/businesses are deleted unless they still hold unsynced orders.
async function cleanOthers(keepName) {
  for (const n of await listSyncDbs()) {
    if (n === keepName) continue;
    try {
      const s = makeStore(await openDb(n));
      const left = (await s.getAll("outbox")).filter((r) => r.status !== "synced").length;
      s.close();
      if (!left) await deleteDb(n);
    } catch { await deleteDb(n); }
  }
}

export function SyncProvider({ client, children }) {
  const [engine, setEngine] = useState(null);
  const [state, setState] = useState(null);

  useEffect(() => {
    const id = readIdentity();
    if (OFF || !id || typeof indexedDB === "undefined") return undefined;
    let eng = createEngine({ client, businessId: id.businessId, userId: id.userId });
    let dead = false;
    eng.init().then(() => {
      if (dead) return;
      setEngine(eng);
      setState(eng.getState());
      eng.subscribe(setState);
      eng.start();
      cleanOthers(dbNameFor(id.businessId, id.userId));
    }).catch((e) => { if (dead) return; console.warn("[sync] local storage unavailable, using the server only:", e?.message); });
    return () => { dead = true; eng?.destroy(); eng = null; setEngine(null); setState(null); };
  }, [client]);

  const value = useMemo(() => {
    if (!engine || !state) return INERT;
    return {
      engine, ...state,
      // true when the app may read from / write to the local copy (switch is on and one full sync has finished)
      active: state.enabled && engine.isLocalFirstReady(),
      syncNow: engine.syncNow,
    };
  }, [engine, state]);

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}
