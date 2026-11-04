import { useState, useEffect, useCallback } from "react";
import client from "../../api/client";

export default function useDailyReport() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState(() => {
    const d = new Date();
    return d.toISOString().split("T")[0]; // YYYY-MM-DD
  });

  const load = useCallback(async () => {
    try {
      setLoading(true);
      // ★ فراخوانی مستقیم از بک‌اند با استفاده از client
      // این دقیقاً به تابع pos_daily_orders در pos.py می‌رود
      const res = await client.get(`/api/pos/daily-orders/?date=${selectedDate}`);
      const data = res.data;
      
      if (data.success) {
        setOrders(data.orders || []);
      } else {
        setOrders([]);
      }
    } catch (err) {
      console.error("Failed to load daily orders:", err);
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, [selectedDate]);

  useEffect(() => { load(); }, [load]);

  const openDetail = useCallback((order) => {
    setSelectedOrder(order);
    setDetailOpen(true);
  }, []);

  const closeDetail = useCallback(() => {
    setDetailOpen(false);
    setSelectedOrder(null);
  }, []);

  // ★ رفتن به روز قبل
  const goPrevDay = useCallback(() => {
    setSelectedDate(prev => {
      const d = new Date(prev);
      d.setDate(d.getDate() - 1);
      return d.toISOString().split("T")[0];
    });
  }, []);

  // ★ رفتن به روز بعد
  const goNextDay = useCallback(() => {
    setSelectedDate(prev => {
      const d = new Date(prev);
      d.setDate(d.getDate() + 1);
      return d.toISOString().split("T")[0];
    });
  }, []);

  // ★ برگشت به امروز
  const goToday = useCallback(() => {
    const d = new Date();
    setSelectedDate(d.toISOString().split("T")[0]);
  }, []);

  const isToday = selectedDate === new Date().toISOString().split("T")[0];

  return {
    orders,
    loading,
    selectedOrder,
    detailOpen,
    selectedDate,
    isToday,
    openDetail,
    closeDetail,
    reload: load,
    goPrevDay,
    goNextDay,
    goToday,
  };
}