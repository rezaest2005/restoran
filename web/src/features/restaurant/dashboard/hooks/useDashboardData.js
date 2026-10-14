import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import client from "../../api/client";
import { SERVICE_TYPES } from "../config/dashboardConfig";

// ★★★ ایمپورت داده‌های فیک
import {
  MOCK_POS_STATS, MOCK_SALES_TREND, MOCK_MONTHLY_TREND, MOCK_HOURLY,
  MOCK_CATEGORIES, MOCK_TOP_ITEMS, MOCK_LOW_ITEMS, MOCK_ORDER_STATUS,
  MOCK_WEEKLY_COMPARE,
} from "../mocks/posMockData";
import {
  MOCK_INV_STATS, MOCK_STOCK_LEVEL, MOCK_STOCK_FLOW,
  MOCK_WASTE_PIE, MOCK_STOCK_ALERTS, MOCK_EXPIRING,
  MOCK_TOP_USED, MOCK_SLOW_MOVERS, MOCK_INV_WEEKLY,
} from "../mocks/inventoryMockData";

export function useDashboardData(serviceType = SERVICE_TYPES.BOTH) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState({});

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

      // ★★★ بررسی وضعیت دمو از روی جواب بک‌اند
      const isDemo = d.is_demo === true;

      if (isDemo) {
        // نمایش داده‌های فیک
        setData({
          posStats: MOCK_POS_STATS,
          salesTrend: MOCK_SALES_TREND,
          monthlyTrend: MOCK_MONTHLY_TREND,
          hourly: MOCK_HOURLY,
          categories: MOCK_CATEGORIES,
          topItems: MOCK_TOP_ITEMS,
          lowItems: MOCK_LOW_ITEMS,
          orderStatus: MOCK_ORDER_STATUS,
          weeklyCompare: MOCK_WEEKLY_COMPARE,
          invStats: MOCK_INV_STATS,
          stockLevel: MOCK_STOCK_LEVEL,
          stockFlow: MOCK_STOCK_FLOW,
          wastePie: MOCK_WASTE_PIE,
          stockAlerts: MOCK_STOCK_ALERTS,
          expiring: MOCK_EXPIRING,
          topUsed: MOCK_TOP_USED,
          slowMovers: MOCK_SLOW_MOVERS,
          invWeekly: MOCK_INV_WEEKLY,
        });
      } else {
        // نمایش داده‌های واقعی بک‌اند
        setData({
          posStats: d.posStats || { sales: 0, orders: 0, customers: 0, avgTime: 0, delivered: 0, cancelled: 0, avgOrder: 0 },
          salesTrend: d.salesTrend || [],
          monthlyTrend: d.monthlyTrend || [],
          hourly: d.hourly || [],
          categories: d.categories || [],
          topItems: d.topItems || [],
          lowItems: d.lowItems || [],
          orderStatus: d.orderStatus || [],
          weeklyCompare: d.weeklyCompare || { thisWeek: 0, lastWeek: 0, change: 0 },
          invStats: d.invStats || { stockValue: 0, lowStock: 0, expiring: 0, monthlyWaste: 0 },
          stockLevel: d.stockLevel || [],
          stockFlow: d.stockFlow || [],
          wastePie: d.wastePie || [],
          stockAlerts: d.stockAlerts || [],
          expiring: d.expiring || [],
          topUsed: d.topUsed || [],
          slowMovers: d.slowMovers || [],
          invWeekly: d.invWeekly || [],
        });
      }
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
    if (serviceType !== SERVICE_TYPES.POS && serviceType !== SERVICE_TYPES.BOTH) return null;
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
    if (serviceType !== SERVICE_TYPES.INVENTORY && serviceType !== SERVICE_TYPES.BOTH) return null;
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

  return { loading, error, posData, inventoryData, refetch: fetchData };
}

export default useDashboardData;