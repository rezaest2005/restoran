import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { fetchDailyOrders } from "../api";
import usePolling from "../common/usePolling";
import { useSync, useLocalList, reportRowOfOrder, reportRowOfOutbox, dayOf } from "@shared/sync";

const REFRESH_MS = 15000;

export const localDateStr = (d = new Date()) => {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

const shiftDate = (str, days) => {
  const [y, m, d] = str.split("-").map(Number);
  return localDateStr(new Date(y, m - 1, d + days));
};

/** Orders of the selected day, always read from the server (shared by all terminals). */
export default function useDailyReport(enabled = true) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState(() => localDateStr());
  const ctrlRef = useRef(null);
  const loadedFor = useRef(null);

  // local-first: today's list is built from the device (server orders + orders still waiting to be sent)
  const sync = useSync();
  const localOrders = useLocalList("order");
  const localProducts = useLocalList("product");
  const outbox = useLocalList("outbox");
  const local = !!sync.active && selectedDate === localDateStr();
  const localRows = useMemo(() => {
    if (!local) return null;
    const byId = new Map(localProducts.rows.map((p) => [p.id, p]));
    const known = new Set(localOrders.rows.map((o) => o.client_uuid).filter(Boolean));
    const server = localOrders.rows.filter((o) => dayOf(o.created_at) === selectedDate).map((o) => reportRowOfOrder(o, byId));
    const mine = outbox.rows.filter((r) => !known.has(r.id) && dayOf(r.createdIso) === selectedDate).map(reportRowOfOutbox);
    const key = (r) => r.created_at;
    return [...mine, ...server].sort((a, b) => (key(b) < key(a) ? -1 : key(b) > key(a) ? 1 : 0));
  }, [local, localOrders.rows, localProducts.rows, outbox.rows, selectedDate]);

  const load = useCallback(async () => {
    if (local) { sync.syncNow(); return; }
    ctrlRef.current?.abort();
    const ctrl = new AbortController();
    ctrlRef.current = ctrl;
    // Spinner only on the first load of a given day; polling refreshes silently.
    if (loadedFor.current !== selectedDate) setLoading(true);
    try {
      const data = await fetchDailyOrders(selectedDate, ctrl.signal);
      if (ctrl.signal.aborted) return;
      setOrders(data?.success ? data.orders || [] : []);
      loadedFor.current = selectedDate;
    } catch (err) {
      if (ctrl.signal.aborted || err?.code === "ERR_CANCELED") return;
      console.error("Failed to load daily orders:", err);
      if (loadedFor.current !== selectedDate) setOrders([]);
    } finally {
      if (!ctrl.signal.aborted) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate, local]);

  usePolling(load, REFRESH_MS, enabled && !local);
  useEffect(() => () => ctrlRef.current?.abort(), []);

  const openDetail = useCallback((order) => {
    setSelectedOrder(order);
    setDetailOpen(true);
  }, []);

  const closeDetail = useCallback(() => {
    setDetailOpen(false);
    setSelectedOrder(null);
  }, []);

  const goPrevDay = useCallback(() => setSelectedDate((p) => shiftDate(p, -1)), []);
  const goNextDay = useCallback(() => setSelectedDate((p) => shiftDate(p, 1)), []);
  const goToday = useCallback(() => setSelectedDate(localDateStr()), []);

  return {
    orders: localRows || orders,
    loading: local ? !localOrders.loaded : loading,
    selectedOrder,
    detailOpen,
    selectedDate,
    isToday: selectedDate === localDateStr(),
    openDetail,
    closeDetail,
    reload: load,
    goPrevDay,
    goNextDay,
    goToday,
    setSelectedDate,
  };
}
