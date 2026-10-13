import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import client from "../../api/client";
import { SERVICE_TYPES } from "../config/dashboardConfig";

export function useDashboardData(serviceType = SERVICE_TYPES.BOTH) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // ★ مقادیر پیش‌فرض خالی (بدون هیچ داده فیک)
  const [data, setData] = useState({
    posStats: null,
    salesTrend: [],
    monthlyTrend: [],
    hourly: [],
    categories: [],
    topItems: [],
    lowItems: [],
    orderStatus: [],
    weeklyCompare: {},
    invStats: null,
    stockLevel: [],
    stockFlow: [],
    wastePie: [],
    stockAlerts: [],
    expiring: [],
    topUsed: [],
    slowMovers: [],
    invWeekly: [],
  });

  const abortRef = useRef(null);

  const fetchData = useCallback(async () => {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    try {
      const res = await client.get("/api/dashboard/analytics/", {
        signal: controller.signal,
      });

      const d = res.data;

      // ★ فقط داده‌های واقعی دریافت شده از سرور را ست می‌کنیم
      setData({
        posStats: d.posStats || null,
        salesTrend: d.salesTrend || [],
        monthlyTrend: d.monthlyTrend || [],
        hourly: d.hourly || [],
        categories: d.categories || [],
        topItems: d.topItems || [],
        lowItems: d.lowItems || [],
        orderStatus: d.orderStatus || [],
        weeklyCompare: d.weeklyCompare || {},
        invStats: d.invStats || null,
        stockLevel: d.stockLevel || [],
        stockFlow: d.stockFlow || [],
        wastePie: d.wastePie || [],
        stockAlerts: d.stockAlerts || [],
        expiring: d.expiring || [],
        topUsed: d.topUsed || [],
        slowMovers: d.slowMovers || [],
        invWeekly: d.invWeekly || [],
      });
    } catch (err) {
      if (err.name !== "CanceledError" && err.name !== "AbortError") {
        console.error("Dashboard API error:", err);
        setError("خطا در دریافت اطلاعات داشبورد");
      }
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    return () => {
      if (abortRef.current) abortRef.current.abort();
    };
  }, [fetchData]);

  useEffect(() => {
    const interval = setInterval(fetchData, 60_000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const posData = useMemo(() => {
    if (
      serviceType !== SERVICE_TYPES.POS &&
      serviceType !== SERVICE_TYPES.BOTH
    )
      return null;

    return {
      stats: data.posStats,
      salesTrend: data.salesTrend,
      monthlyTrend: data.monthlyTrend,
      hourly: data.hourly,
      categories: data.categories,
      topItems: data.topItems,
      lowItems: data.lowItems,
      orderStatus: data.orderStatus,
      weeklyCompare: data.weeklyCompare,
    };
  }, [serviceType, data]);

  const inventoryData = useMemo(() => {
    if (
      serviceType !== SERVICE_TYPES.INVENTORY &&
      serviceType !== SERVICE_TYPES.BOTH
    )
      return null;

    return {
      stats: data.invStats,
      stockLevel: data.stockLevel,
      stockFlow: data.stockFlow,
      wastePie: data.wastePie,
      stockAlerts: data.stockAlerts,
      expiring: data.expiring,
      topUsed: data.topUsed,
      slowMovers: data.slowMovers,
      weeklyCompare: data.invWeekly,
    };
  }, [serviceType, data]);

  return {
    loading,
    error,
    posData,
    inventoryData,
    refetch: fetchData,
  };
}

export default useDashboardData;