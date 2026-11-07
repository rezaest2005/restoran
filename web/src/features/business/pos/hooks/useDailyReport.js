import { useState, useCallback, useRef, useEffect } from "react";
import { fetchDailyOrders } from "../api";
import usePolling from "../common/usePolling";

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

  const load = useCallback(async () => {
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
  }, [selectedDate]);

  usePolling(load, REFRESH_MS, enabled);
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
    orders,
    loading,
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
