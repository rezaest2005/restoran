import { useState, useEffect, useMemo, useCallback } from "react";
import { Box, Typography, CircularProgress, Chip } from "@mui/material";
import { useThemeMode } from "@shared/contexts/ThemeContext";
import { useLang } from "@shared/contexts/LangContext";
import { useTranslation } from "react-i18next";
import { animations } from "./components/animations";
import {
  MOCK_STATS, MOCK_SALES_TREND, MOCK_MONTHLY_TREND, MOCK_HOURLY,
  MOCK_CATEGORIES, MOCK_TOP_ITEMS, MOCK_LOW_ITEMS, MOCK_ORDER_STATUS,
  MOCK_ACTIVITIES, MOCK_STOCK_ALERTS, MOCK_WEEKLY_COMPARE,
} from "./data/mockData";

import SectionHeader from "./components/SectionHeader";
import StatCard from "./components/StatCard";
import Grid4 from "./components/Grid4";
import Grid2 from "./components/Grid2";
import Grid3 from "./components/Grid3";
import SalesTrendChart from "./components/SalesTrendChart";
import CategoryPieChart from "./components/CategoryPieChart";
import PeakHoursChart from "./components/PeakHoursChart";
import WeeklyComparison from "./components/WeeklyComparison";
import TopSellers from "./components/TopSellers";
import LeastSellers from "./components/LeastSellers";
import OrderStatus from "./components/OrderStatus";
import LatestActivity from "./components/LatestActivity";
import StockAlerts from "./components/StockAlerts";

export default function Dashboard() {
  const { mode } = useThemeMode();
  const { isRtl, lang } = useLang();
  const { t } = useTranslation();
const isDark = mode === "dark";
const L = {
  greeting: t("dash.greeting"),
  summary: t("dash.summary"),
  loading: t("dash.loading"),
  todaySales: t("dash.todaySales"),
  todayOrders: t("dash.todayOrders"),
  activeCustomers: t("dash.activeCustomers"),
  avgTime: t("dash.avgTime"),
  avgOrder: t("dash.avgOrder"),
  avgValue: t("dash.avgValue"),
  newToday: t("dash.newToday"),
  min: t("dash.min"),
  fromOrderToDelivery: t("dash.fromOrderToDelivery"),
  salesTrend: t("dash.salesTrend"),
  salesByCategory: t("dash.salesByCategory"),
  peakHours: t("dash.peakHours"),
  weeklyComparison: t("dash.weeklyComparison"),
  topSellers: t("dash.topSellers"),
  leastSellers: t("dash.leastSellers"),
  orderStatus: t("dash.orderStatus"),
  latestActivity: t("dash.latestActivity"),
  stockAlerts: t("dash.stockAlerts"),
  week: t("dash.week"),
  month: t("dash.month"),
  sales: t("dash.sales"),
  orders: t("dash.orders"),
  item: t("dash.item"),
  qty: t("dash.qty"),
  revenue: t("dash.revenue"),
  totalSales: t("dash.totalSales"),
  totalOrders: t("dash.totalOrders"),
  lastWeek: t("dash.lastWeek"),
  review: t("dash.review"),
  items: t("dash.items"),
  sold: t("dash.sold"),
  ordersWord: t("dash.ordersWord"),
  tuman: t("dash.tuman"),
  low: t("dash.low"),
  minLabel: t("dash.minLabel"),
  secOverview: t("dash.secOverview"),
  secOverviewDesc: t("dash.secOverviewDesc"),
  secSales: t("dash.secSales"),
  secSalesDesc: t("dash.secSalesDesc"),
  secTime: t("dash.secTime"),
  secTimeDesc: t("dash.secTimeDesc"),
  secMenu: t("dash.secMenu"),
  secMenuDesc: t("dash.secMenuDesc"),
  secOps: t("dash.secOps"),
  secOpsDesc: t("dash.secOpsDesc"),
};

  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [chartView, setChartView] = useState("week");
  const [stats, setStats] = useState(MOCK_STATS);
  const [salesTrend, setSalesTrend] = useState(MOCK_SALES_TREND);
  const [monthlyTrend, setMonthlyTrend] = useState(MOCK_MONTHLY_TREND);
  const [hourly, setHourly] = useState(MOCK_HOURLY);
  const [categories, setCategories] = useState(MOCK_CATEGORIES);
  const [topItems, setTopItems] = useState(MOCK_TOP_ITEMS);
  const [lowItems, setLowItems] = useState(MOCK_LOW_ITEMS);
  const [orderStatus, setOrderStatus] = useState(MOCK_ORDER_STATUS);
  const [activities, setActivities] = useState(MOCK_ACTIVITIES);
  const [stockAlerts, setStockAlerts] = useState(MOCK_STOCK_ALERTS);
  const [weeklyCompare, setWeeklyCompare] = useState(MOCK_WEEKLY_COMPARE);

  useEffect(() => {
    const tmr = setTimeout(() => setMounted(true), 80);
    return () => clearTimeout(tmr);
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        await new Promise(r => setTimeout(r, 600));
        setStats(MOCK_STATS);
        setSalesTrend(MOCK_SALES_TREND);
        setMonthlyTrend(MOCK_MONTHLY_TREND);
        setHourly(MOCK_HOURLY);
        setCategories(MOCK_CATEGORIES);
        setTopItems(MOCK_TOP_ITEMS);
        setLowItems(MOCK_LOW_ITEMS);
        setOrderStatus(MOCK_ORDER_STATUS);
        setActivities(MOCK_ACTIVITIES);
        setStockAlerts(MOCK_STOCK_ALERTS);
        setWeeklyCompare(MOCK_WEEKLY_COMPARE);
      } catch (err) {
        console.error("Dashboard error:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const C = useMemo(() => ({
    bg: isDark ? "#0B0A0B" : "#E4E8F0",
    glass: isDark ? "rgba(16,18,16,0.65)" : "rgba(240,244,252,0.72)",
    glassBorder: isDark ? "rgba(107,155,110,0.12)" : "rgba(80,100,140,0.15)",
    glassShimmer: isDark
      ? "linear-gradient(90deg,transparent 0%,rgba(107,155,110,0.05) 20%,rgba(168,64,96,0.06) 40%,rgba(212,183,106,0.07) 60%,rgba(107,155,110,0.04) 80%,transparent 100%)"
      : "linear-gradient(90deg,transparent 0%,rgba(80,100,160,0.06) 20%,rgba(120,40,70,0.05) 40%,rgba(196,162,101,0.06) 60%,rgba(61,90,62,0.04) 80%,transparent 100%)",
    olive: isDark ? "#6B9B6E" : "#2E4D30",
    oliveSubtle: isDark ? "rgba(107,155,110,0.1)" : "rgba(46,77,48,0.1)",
    text: isDark ? "#F0ECE8" : "#1A1A24",
    sub: isDark ? "#8A8588" : "#555568",
    muted: isDark ? "#4A4548" : "#8A8A9E",
    danger: isDark ? "#E84057" : "#C83048",
    dangerBg: isDark ? "rgba(232,64,87,0.12)" : "rgba(200,48,72,0.1)",
    cardShadow: isDark
      ? "0 8px 60px rgba(0,0,0,0.5), 0 0 80px rgba(107,155,110,0.04)"
      : "0 8px 60px rgba(0,0,0,0.08), 0 0 60px rgba(74,106,148,0.06)",
    cardShadowHover: isDark
      ? "0 16px 60px rgba(0,0,0,0.6), 0 0 80px rgba(107,155,110,0.08)"
      : "0 16px 60px rgba(0,0,0,0.12), 0 0 60px rgba(74,106,148,0.1)",
  }), [isDark]);

  const fmtN = useCallback((n) => {
    if (n == null) return "—";
    return isRtl ? Number(n).toLocaleString("fa-IR") : Number(n).toLocaleString("en-US");
  }, [isRtl]);

  const dateText = useMemo(() => {
    const now = new Date();
    const df = ["یکشنبه","دوشنبه","سه‌شنبه","چهارشنبه","پنجشنبه","جمعه","شنبه"];
    const de = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
    const mf = ["ژانویه","فوریه","مارس","آوریل","مه","ژوئن","ژوئیه","اوت","سپتامبر","اکتبر","نوامبر","دسامبر"];
    const me = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    return isRtl
      ? `${df[now.getDay()]}، ${now.getDate()} ${mf[now.getMonth()]}`
      : `${de[now.getDay()]}, ${now.getDate()} ${me[now.getMonth()]}`;
  }, [isRtl]);

  const chartData = useMemo(() => {
    const src = chartView === "week" ? salesTrend : monthlyTrend;
    return src.map(d => ({ ...d, displayName: isRtl ? d.name : d.nameEn }));
  }, [chartView, salesTrend, monthlyTrend, isRtl]);

  const hourlyData = useMemo(() =>
    hourly.map(d => ({ ...d, displayName: isRtl ? d.hour : d.hourEn })),
    [hourly, isRtl]
  );

  const totalOrders = orderStatus.reduce((s, o) => s + o.count, 0);

  const chartGridStroke = isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.05)";
  const tooltipStyle = {
    background: isDark ? "rgba(16,18,16,0.94)" : "rgba(240,244,252,0.96)",
    border: `1px solid ${C.glassBorder}`, borderRadius: "12px",
    fontFamily: "Vazirmatn", fontSize: 12, color: C.text,
    boxShadow: isDark ? "0 8px 32px rgba(0,0,0,0.5)" : "0 8px 32px rgba(0,0,0,0.1)",
  };

  if (loading) {
    return (
      <Box sx={{
        display: "flex", flexDirection: "column", justifyContent: "center",
        alignItems: "center", height: "60vh", gap: 2,
      }}>
        <CircularProgress sx={{ color: C.olive }} size={40} />
        <Typography sx={{ fontSize: 13, color: C.sub }}>{L.loading}</Typography>
      </Box>
    );
  }

  return (
    <Box dir={isRtl ? "rtl" : "ltr"} sx={{
      maxWidth: 1440, mx: "auto",
      px: { xs: 2, sm: 3, md: 4, xl: 5 },
      pb: 8, width: "100%",
      fontFamily: "'Vazirmatn', 'Plus Jakarta Sans', sans-serif",
      opacity: mounted ? 1 : 0, transition: "opacity 0.6s ease",
      background: isDark
        ? "radial-gradient(ellipse at 15% 30%, rgba(107,155,110,0.04) 0%, transparent 50%), radial-gradient(ellipse at 85% 70%, rgba(168,64,96,0.03) 0%, transparent 50%)"
        : "radial-gradient(ellipse at 15% 30%, rgba(80,100,160,0.04) 0%, transparent 50%), radial-gradient(ellipse at 85% 70%, rgba(120,40,70,0.03) 0%, transparent 50%)",
      minHeight: "100vh",
    }}>
      <style>{animations}</style>

      {/* Header */}
      <Box sx={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        mb: 0.5, flexDirection: { xs: "column", sm: "row" }, gap: 1.5, pt: 1,
      }}>
        <Box sx={{ textAlign: { xs: "center", sm: isRtl ? "right" : "left" } }}>
          <Typography sx={{
            fontSize: { xs: 19, md: 24 }, fontWeight: 900, color: C.text, mb: 0.5,
            fontFamily: "'Plus Jakarta Sans', 'Vazirmatn', sans-serif",
          }}>
            {L.greeting} <span style={{ color: C.olive }}>👋</span>
          </Typography>
          <Typography sx={{ fontSize: 13, color: C.sub }}>{L.summary}</Typography>
        </Box>
        <Chip
          icon={<span style={{ fontSize: 14 }}>📅</span>}
          label={dateText}
          sx={{
            bgcolor: C.glass, color: C.text,
            border: `1px solid ${C.glassBorder}`,
            fontWeight: 600, fontSize: 12, py: 2.5, px: 1,
            backdropFilter: "blur(12px)",
          }}
        />
      </Box>

      {/* Section 1 · Overview */}
      <SectionHeader icon="📊" title={L.secOverview} subtitle={L.secOverviewDesc} C={C} isRtl={isRtl} first delay={0.05} />
      <Grid4>
        <StatCard icon="💰" color="#ff6b35" value={`${fmtN(stats.sales)} ${L.tuman}`} label={L.todaySales} change={stats.salesChange} subValue={`${L.avgOrder}: ${fmtN(stats.avgOrderValue)} ${L.tuman}`} delay={0.1} C={C} />
        <StatCard icon="🧾" color="#3b82f6" value={fmtN(stats.orders)} label={L.todayOrders} change={stats.ordersChange} subValue={`${L.avgValue}: ${fmtN(stats.avgOrderValue)} ${L.tuman}`} delay={0.15} C={C} />
        <StatCard icon="👥" color="#10b981" value={fmtN(stats.customers)} label={L.activeCustomers} subValue={`+${stats.newCustomers} ${L.newToday}`} delay={0.2} C={C} />
        <StatCard icon="⏱️" color="#8b5cf6" value={`${fmtN(stats.avgTime)} ${L.min}`} label={L.avgTime} change={stats.avgTimeChange} subValue={L.fromOrderToDelivery} delay={0.25} C={C} />
      </Grid4>

      {/* Section 2 · Sales Analytics */}
      <SectionHeader icon="📈" title={L.secSales} subtitle={L.secSalesDesc} C={C} isRtl={isRtl} delay={0.3} />
      <Grid2 ratio="7fr 5fr">
        <SalesTrendChart chartView={chartView} setChartView={setChartView} chartData={chartData} L={L} C={C} isDark={isDark} isRtl={isRtl} chartGridStroke={chartGridStroke} tooltipStyle={tooltipStyle} />
        <CategoryPieChart categories={categories} L={L} C={C} isRtl={isRtl} tooltipStyle={tooltipStyle} />
      </Grid2>

      {/* Section 3 · Time Patterns */}
      <SectionHeader icon="🔥" title={L.secTime} subtitle={L.secTimeDesc} C={C} isRtl={isRtl} delay={0.45} />
      <Grid2 ratio="7fr 5fr">
        <PeakHoursChart hourlyData={hourlyData} L={L} C={C} isDark={isDark} chartGridStroke={chartGridStroke} tooltipStyle={tooltipStyle} />
        <WeeklyComparison weeklyCompare={weeklyCompare} L={L} C={C} isRtl={isRtl} isDark={isDark} fmtN={fmtN} />
      </Grid2>

      {/* Section 4 · Menu Performance */}
      <SectionHeader icon="🍽️" title={L.secMenu} subtitle={L.secMenuDesc} C={C} isRtl={isRtl} delay={0.6} />
      <Grid2 ratio="7fr 5fr">
        <TopSellers topItems={topItems} L={L} C={C} isRtl={isRtl} isDark={isDark} fmtN={fmtN} />
        <LeastSellers lowItems={lowItems} L={L} C={C} isRtl={isRtl} isDark={isDark} fmtN={fmtN} />
      </Grid2>

      {/* Section 5 · Operations */}
      <SectionHeader icon="⚙️" title={L.secOps} subtitle={L.secOpsDesc} C={C} isRtl={isRtl} delay={0.75} />
      <Grid3>
        <OrderStatus orderStatus={orderStatus} totalOrders={totalOrders} L={L} C={C} isRtl={isRtl} isDark={isDark} fmtN={fmtN} />
        <LatestActivity activities={activities} C={C} isRtl={isRtl} />
        <StockAlerts stockAlerts={stockAlerts} L={L} C={C} isRtl={isRtl} isDark={isDark} fmtN={fmtN} />
      </Grid3>
    </Box>
  );
}