import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Box, Typography, Grid, CircularProgress, Chip,
  LinearProgress,
} from "@mui/material";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip,
  Legend, ResponsiveContainer, PieChart, Pie, Cell, BarChart,
} from "recharts";
import { useThemeMode } from "../contexts/ThemeContext";
import { useLang } from "../contexts/LangContext";

/* ═══════════════════════════════════════
   انیمیشن‌ها
═══════════════════════════════════════ */

const animations = `
  @keyframes float { 0%, 100% { transform: translateY(0px); } 50% { transform: translateY(-6px); } }
  @keyframes shimmer { 0% { background-position: -200% center; } 100% { background-position: 200% center; } }
  @keyframes fadeUp { from { opacity: 0; transform: translateY(24px) scale(0.97); } to { opacity: 1; transform: translateY(0) scale(1); } }
  @keyframes pulse { 0%, 100% { box-shadow: 0 0 0 0 rgba(107,155,110,0.3); } 50% { box-shadow: 0 0 0 8px rgba(107,155,110,0); } }
  @keyframes countUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
`;

/* ═══════════════════════════════════════
   متن‌های دوزبانه
═══════════════════════════════════════ */

const T = {
  fa: {
    greeting: "سلام مدیر عزیز",
    summary: "خلاصه عملکرد رستوران شما",
    loading: "در حال بارگذاری آنالیز...",
    todaySales: "فروش امروز",
    todayOrders: "سفارشات امروز",
    activeCustomers: "مشتریان فعال",
    avgTime: "میانگین زمان سفارش",
    avgOrder: "میانگین هر سفارش",
    avgValue: "میانگین ارزش",
    newToday: "مشتری جدید امروز",
    min: "دقیقه",
    fromOrderToDelivery: "از ثبت تا تحویل",
    salesTrend: "روند فروش",
    salesByCategory: "فروش بر اساس دسته‌بندی",
    peakHours: "ساعات اوج سفارشات",
    weeklyComparison: "مقایسه هفتگی",
    topSellers: "پرفروش‌ترین‌ها",
    leastSellers: "کم‌فروش‌ترین‌ها",
    orderStatus: "وضعیت سفارشات",
    latestActivity: "آخرین فعالیت‌ها",
    stockAlerts: "هشدار انبار",
    week: "هفتگی",
    month: "ماهانه",
    sales: "فروش",
    orders: "سفارشات",
    item: "نام غذا",
    qty: "تعداد",
    revenue: "مبلغ",
    totalSales: "فروش کل",
    totalOrders: "تعداد سفارش",
    lastWeek: "هفته قبل",
    review: "بررسی شود",
    items: "آیتم",
    sold: "عدد فروش",
    ordersWord: "سفارش",
    tuman: "تومان",
    low: "کمبود",
    minLabel: "حداقل",
  },
  en: {
    greeting: "Hello, Dear Manager",
    summary: "Your restaurant performance overview",
    loading: "Loading analytics...",
    todaySales: "Today Sales",
    todayOrders: "Today Orders",
    activeCustomers: "Active Customers",
    avgTime: "Avg Order Time",
    avgOrder: "Avg order",
    avgValue: "Avg value",
    newToday: "new today",
    min: "min",
    fromOrderToDelivery: "From order to delivery",
    salesTrend: "Sales Trend",
    salesByCategory: "Sales by Category",
    peakHours: "Peak Order Hours",
    weeklyComparison: "Weekly Comparison",
    topSellers: "Top Sellers",
    leastSellers: "Least Sellers",
    orderStatus: "Order Status",
    latestActivity: "Latest Activity",
    stockAlerts: "Stock Alerts",
    week: "Week",
    month: "Month",
    sales: "Sales",
    orders: "Orders",
    item: "Item",
    qty: "Qty",
    revenue: "Revenue",
    totalSales: "Total Sales",
    totalOrders: "Total Orders",
    lastWeek: "Last week",
    review: "Review",
    items: "items",
    ordersWord: "orders",
    tuman: "T",
    low: "low",
    minLabel: "Min",
  },
};

/* ═══════════════════════════════════════
   داده‌های Mock
═══════════════════════════════════════ */

const MOCK_STATS = {
  sales: 24_500_000, salesChange: 12.5,
  orders: 142, ordersChange: 8.3,
  avgOrderValue: 172_535,
  customers: 89, newCustomers: 12,
  avgTime: 18, avgTimeChange: -5.2,
  stockAlerts: 6,
};

const MOCK_SALES_TREND = [
  { name: "شنبه", nameEn: "Sat", sales: 1_200_000, orders: 45 },
  { name: "یکشنبه", nameEn: "Sun", sales: 1_500_000, orders: 52 },
  { name: "دوشنبه", nameEn: "Mon", sales: 1_100_000, orders: 38 },
  { name: "سه‌شنبه", nameEn: "Tue", sales: 1_800_000, orders: 65 },
  { name: "چهارشنبه", nameEn: "Wed", sales: 2_100_000, orders: 72 },
  { name: "پنجشنبه", nameEn: "Thu", sales: 2_500_000, orders: 85 },
  { name: "جمعه", nameEn: "Fri", sales: 900_000, orders: 25 },
];

const MOCK_MONTHLY_TREND = [
  { name: "هفته ۱", nameEn: "W1", sales: 8_500_000, orders: 320 },
  { name: "هفته ۲", nameEn: "W2", sales: 9_200_000, orders: 350 },
  { name: "هفته ۳", nameEn: "W3", sales: 7_800_000, orders: 290 },
  { name: "هفته ۴", nameEn: "W4", sales: 10_500_000, orders: 410 },
];

const MOCK_HOURLY = [
  { hour: "۸", hourEn: "8", orders: 5 }, { hour: "۹", hourEn: "9", orders: 12 },
  { hour: "۱۰", hourEn: "10", orders: 18 }, { hour: "۱۱", hourEn: "11", orders: 28 },
  { hour: "۱۲", hourEn: "12", orders: 52 }, { hour: "۱۳", hourEn: "13", orders: 45 },
  { hour: "۱۴", hourEn: "14", orders: 32 }, { hour: "۱۵", hourEn: "15", orders: 15 },
  { hour: "۱۶", hourEn: "16", orders: 10 }, { hour: "۱۷", hourEn: "17", orders: 18 },
  { hour: "۱۸", hourEn: "18", orders: 38 }, { hour: "۱۹", hourEn: "19", orders: 48 },
  { hour: "۲۰", hourEn: "20", orders: 55 }, { hour: "۲۱", hourEn: "21", orders: 42 },
  { hour: "۲۲", hourEn: "22", orders: 18 },
];

const MOCK_CATEGORIES = [
  { name: "غذای اصلی", nameEn: "Main", value: 4000, color: "#ff6b35" },
  { name: "پیش‌غذا", nameEn: "Starter", value: 1500, color: "#3b82f6" },
  { name: "نوشیدنی", nameEn: "Drinks", value: 2000, color: "#10b981" },
  { name: "دسر", nameEn: "Dessert", value: 1000, color: "#8b5cf6" },
];

const MOCK_TOP_ITEMS = [
  { id: 1, name: "پیتزا پپرونی", nameEn: "Pepperoni Pizza", qty: 45, total: 5_400_000, pct: 18 },
  { id: 2, name: "برگر مخصوص", nameEn: "Special Burger", qty: 38, total: 4_180_000, pct: 15 },
  { id: 3, name: "پاستا آلفردو", nameEn: "Alfredo Pasta", qty: 22, total: 2_860_000, pct: 10 },
  { id: 4, name: "جوجه کباب", nameEn: "Chicken Kebab", qty: 20, total: 2_400_000, pct: 9 },
  { id: 5, name: "سالاد سزار", nameEn: "Caesar Salad", qty: 18, total: 1_260_000, pct: 7 },
  { id: 6, name: "کباب کوبیده", nameEn: "Koobideh", qty: 16, total: 1_920_000, pct: 6 },
  { id: 7, name: "ساندویچ رپ", nameEn: "Wrap Sandwich", qty: 14, total: 980_000, pct: 5 },
  { id: 8, name: "سوپ قارچ", nameEn: "Mushroom Soup", qty: 12, total: 600_000, pct: 4 },
  { id: 9, name: "فرایز مخصوص", nameEn: "Special Fries", qty: 11, total: 440_000, pct: 3 },
  { id: 10, name: "نوشابه", nameEn: "Soda", qty: 10, total: 200_000, pct: 2 },
];

const MOCK_LOW_ITEMS = [
  { id: 1, name: "سالاد فصل", nameEn: "Season Salad", qty: 1, total: 70_000 },
  { id: 2, name: "دلمه برگ مو", nameEn: "Dolmeh", qty: 2, total: 160_000 },
  { id: 3, name: "آش رشته", nameEn: "Ash Reshteh", qty: 2, total: 120_000 },
  { id: 4, name: "کوکو سبزی", nameEn: "Kuku Sabzi", qty: 3, total: 180_000 },
  { id: 5, name: "ماهی سالمون", nameEn: "Salmon", qty: 3, total: 540_000 },
];

const MOCK_ORDER_STATUS = [
  { label: "در انتظار", labelEn: "Pending", count: 8, color: "#f59e0b", icon: "⏳" },
  { label: "در حال آماده‌سازی", labelEn: "Preparing", count: 12, color: "#3b82f6", icon: "👨‍🍳" },
  { label: "آماده تحویل", labelEn: "Ready", count: 5, color: "#10b981", icon: "✅" },
  { label: "تحویل شده", labelEn: "Delivered", count: 117, color: "#6B9B6E", icon: "📦" },
];

const MOCK_ACTIVITIES = [
  { dot: "orange", text: "سفارش #1045 — پیتزا پپرونی × ۲", textEn: "Order #1045 — Pepperoni Pizza × 2", time: "۱ دقیقه پیش", timeEn: "1m ago" },
  { dot: "blue", text: "سفارش #1044 در حال آماده‌سازی", textEn: "Order #1044 — Preparing", time: "۳ دقیقه پیش", timeEn: "3m ago" },
  { dot: "green", text: "سفارش #1043 تحویل شد", textEn: "Order #1043 — Delivered", time: "۸ دقیقه پیش", timeEn: "8m ago" },
  { dot: "orange", text: "سفارش #1042 — برگر مخصوص", textEn: "Order #1042 — Special Burger", time: "۱۲ دقیقه پیش", timeEn: "12m ago" },
  { dot: "green", text: "سفارش #1041 تحویل شد", textEn: "Order #1041 — Delivered", time: "۱۸ دقیقه پیش", timeEn: "18m ago" },
];

const MOCK_STOCK_ALERTS = [
  { name: "گوشت چرخ‌کرده", nameEn: "Ground Meat", current: 2, min: 5, unit: "کیلو", unitEn: "kg" },
  { name: "پنیر پیتزا", nameEn: "Pizza Cheese", current: 3, min: 8, unit: "کیلو", unitEn: "kg" },
  { name: "قارچ", nameEn: "Mushroom", current: 1, min: 4, unit: "کیلو", unitEn: "kg" },
  { name: "سس گوجه", nameEn: "Tomato Sauce", current: 2, min: 6, unit: "بطری", unitEn: "btl" },
  { name: "روغن زیتون", nameEn: "Olive Oil", current: 1, min: 3, unit: "لیتر", unitEn: "L" },
  { name: "نان پیتزا", nameEn: "Pizza Dough", current: 5, min: 10, unit: "عدد", unitEn: "pcs" },
];

const MOCK_WEEKLY_COMPARE = {
  thisWeek: { sales: 11_200_000, orders: 382, avg: 293_194 },
  lastWeek: { sales: 9_800_000, orders: 345, avg: 284_058 },
};

/* ═══════════════════════════════════════
   کامپوننت‌های کمکی
═══════════════════════════════════════ */

function ChangeChip({ value, suffix = "%" }) {
  const pos = value >= 0;
  return (
    <Chip size="small" label={`${pos ? "+" : ""}${value}${suffix}`}
      sx={{
        height: 22, fontSize: 10, fontWeight: 700, borderRadius: "6px",
        bgcolor: pos ? "rgba(16,185,129,0.12)" : "rgba(239,68,68,0.12)",
        color: pos ? "#10b981" : "#ef4444",
        border: `1px solid ${pos ? "rgba(16,185,129,0.2)" : "rgba(239,68,68,0.2)"}`,
      }}
    />
  );
}

function StatCard({ icon, color, value, label, subValue, change, delay, C }) {
  return (
    <Box sx={{
      bgcolor: C.glass, backdropFilter: "blur(28px)",
      border: `1px solid ${C.glassBorder}`, borderRadius: "18px",
      boxShadow: C.cardShadow, p: 2.5,
      position: "relative", overflow: "hidden",
      opacity: 0, animation: `fadeUp 0.5s ease-out ${delay}s forwards`,
      transition: "all 0.3s ease",
      "&:hover": { transform: "translateY(-3px)" },
    }}>
      <Box sx={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", mb: 1.5 }}>
        <Box sx={{
          width: 46, height: 46, borderRadius: "14px",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 22, background: `${color}18`, border: `1px solid ${color}28`,
          animation: "float 5s ease-in-out infinite",
        }}>
          {icon}
        </Box>
        {change !== undefined && <ChangeChip value={change} />}
      </Box>
      <Typography sx={{
        fontSize: { xs: 20, md: 24 }, fontWeight: 900, color: C.text, lineHeight: 1.1,
        fontFamily: "'Plus Jakarta Sans', sans-serif",
      }}>
        {value}
      </Typography>
      <Typography sx={{ fontSize: 11, fontWeight: 600, color: C.sub, mt: 0.5 }}>
        {label}
      </Typography>
      {subValue && (
        <Typography sx={{ fontSize: 10, color: C.muted, mt: 0.3 }}>{subValue}</Typography>
      )}
    </Box>
  );
}

/* ═══════════════════════════════════════
   کامپوننت اصلی
═══════════════════════════════════════ */

export default function Dashboard() {
  const { mode } = useThemeMode();
  const { isRtl, lang } = useLang();
  const navigate = useNavigate();
  const isDark = mode === "dark";
  const L = isRtl ? T.fa : T.en;

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
    glass: isDark ? "rgba(16,18,16,0.6)" : "rgba(240,244,252,0.7)",
    glassBorder: isDark ? "rgba(107,155,110,0.1)" : "rgba(80,100,140,0.15)",
    glassShimmer: isDark
      ? "linear-gradient(90deg, transparent 0%, rgba(107,155,110,0.05) 20%, rgba(168,64,96,0.06) 40%, rgba(212,183,106,0.07) 60%, rgba(107,155,110,0.04) 80%, transparent 100%)"
      : "linear-gradient(90deg, transparent 0%, rgba(80,100,160,0.06) 20%, rgba(120,40,70,0.05) 40%, rgba(196,162,101,0.06) 60%, rgba(61,90,62,0.04) 80%, transparent 100%)",
    olive: isDark ? "#6B9B6E" : "#2E4D30",
    oliveSubtle: isDark ? "rgba(107,155,110,0.08)" : "rgba(46,77,48,0.08)",
    text: isDark ? "#F0ECE8" : "#1A1A24",
    sub: isDark ? "#8A8588" : "#555568",
    muted: isDark ? "#4A4548" : "#8A8A9E",
    danger: isDark ? "#E84057" : "#C83048",
    dangerBg: isDark ? "rgba(232,64,87,0.12)" : "rgba(200,48,72,0.1)",
    cardShadow: isDark
      ? "0 8px 60px rgba(0,0,0,0.5), 0 0 80px rgba(107,155,110,0.04)"
      : "0 8px 60px rgba(0,0,0,0.1), 0 0 60px rgba(74,106,148,0.08)",
  }), [isDark]);

  const glassSx = {
    bgcolor: C.glass, backdropFilter: "blur(28px)", WebkitBackdropFilter: "blur(28px)",
    border: `1px solid ${C.glassBorder}`, borderRadius: "20px",
    boxShadow: C.cardShadow, position: "relative", overflow: "hidden",
    "&::before": {
      content: '""', position: "absolute", top: 0, left: 0, right: 0, height: 1,
      background: C.glassShimmer, backgroundSize: "200% 100%",
      animation: "shimmer 10s linear infinite", pointerEvents: "none",
    },
  };

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

  if (loading) {
    return (
      <Box sx={{ display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", height: "60vh", gap: 2 }}>
        <CircularProgress sx={{ color: C.olive }} size={40} />
        <Typography sx={{ fontSize: 13, color: C.sub }}>{L.loading}</Typography>
      </Box>
    );
  }

  return (
    <Box dir={isRtl ? "rtl" : "ltr"} sx={{
      position: "relative",
      fontFamily: "'Vazirmatn', 'Plus Jakarta Sans', sans-serif",
      opacity: mounted ? 1 : 0, transition: "opacity 0.6s ease",
      width: "100%",
    }}>
      <style>{animations}</style>

      {/* ── هدر ── */}
      <Box sx={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        mb: 3, flexDirection: { xs: "column", sm: "row" }, gap: 1.5,
      }}>
        <Box sx={{ textAlign: { xs: "center", sm: isRtl ? "right" : "left" } }}>
          <Typography sx={{ fontSize: { xs: 18, md: 22 }, fontWeight: 900, color: C.text, mb: 0.5 }}>
            {L.greeting} <span style={{ color: C.olive }}>👋</span>
          </Typography>
          <Typography sx={{ fontSize: 13, color: C.sub }}>{L.summary}</Typography>
        </Box>
        <Chip icon={<span style={{ fontSize: 14 }}>📅</span>} label={dateText}
          sx={{ bgcolor: C.glass, color: C.text, border: `1px solid ${C.glassBorder}`, fontWeight: 600, fontSize: 12, py: 2.5, px: 1 }} />
      </Box>

      {/* ════════════ ۱. کارت‌های آمار ════════════ */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={6} md={3}>
          <StatCard icon="💰" color="#ff6b35" value={`${fmtN(stats.sales)} ${L.tuman}`}
            label={L.todaySales} change={stats.salesChange}
            subValue={`${L.avgOrder}: ${fmtN(stats.avgOrderValue)} ${L.tuman}`}
            delay={0.1} C={C} />
        </Grid>
        <Grid item xs={6} md={3}>
          <StatCard icon="🧾" color="#3b82f6" value={fmtN(stats.orders)}
            label={L.todayOrders} change={stats.ordersChange}
            subValue={`${L.avgValue}: ${fmtN(stats.avgOrderValue)} ${L.tuman}`}
            delay={0.2} C={C} />
        </Grid>
        <Grid item xs={6} md={3}>
          <StatCard icon="👥" color="#10b981" value={fmtN(stats.customers)}
            label={L.activeCustomers}
            subValue={`+${stats.newCustomers} ${L.newToday}`}
            delay={0.3} C={C} />
        </Grid>
        <Grid item xs={6} md={3}>
          <StatCard icon="⏱️" color="#8b5cf6" value={`${fmtN(stats.avgTime)} ${L.min}`}
            label={L.avgTime} change={stats.avgTimeChange}
            subValue={L.fromOrderToDelivery}
            delay={0.4} C={C} />
        </Grid>
      </Grid>

      {/* ════════════ ۲. نمودار فروش + دسته‌بندی ════════════ */}
      <Grid container spacing={2.5} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={12} md={8}>
          <Box sx={{ ...glassSx, p: { xs: 2, md: 3 }, animation: "fadeUp 0.5s ease-out 0.3s forwards", opacity: 0 }}>
            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2, flexWrap: "wrap", gap: 1 }}>
              <Typography sx={{ fontSize: 15, fontWeight: 800, color: C.text }}>
                📈 {L.salesTrend}
              </Typography>
              <Box sx={{ display: "flex", gap: 0.5, bgcolor: C.oliveSubtle, borderRadius: "8px", p: 0.5 }}>
                {[["week", L.week], ["month", L.month]].map(([v, lbl]) => (
                  <button key={v} onClick={() => setChartView(v)} style={{
                    padding: "5px 14px", borderRadius: "6px", fontSize: 11, fontWeight: 600, cursor: "pointer",
                    border: "none", outline: "none", transition: "all 0.2s",
                    background: chartView === v ? C.olive : "transparent",
                    color: chartView === v ? "#fff" : C.sub,
                  }}>{lbl}</button>
                ))}
              </Box>
            </Box>
            <Box sx={{ width: "100%", height: { xs: 280, md: 360 } }}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke={isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.05)"} />
                  <XAxis dataKey="displayName" stroke={C.muted} tick={{ fontSize: 11, fontFamily: "Vazirmatn" }} />
                  <YAxis stroke={C.muted} tick={{ fontSize: 10 }} tickFormatter={(v) => v >= 1_000_000 ? `${(v/1_000_000).toFixed(1)}M` : v >= 1000 ? `${(v/1000).toFixed(0)}K` : v} />
                  <RTooltip contentStyle={{
                    background: isDark ? "rgba(16,18,16,0.92)" : "rgba(240,244,252,0.95)",
                    border: `1px solid ${C.glassBorder}`, borderRadius: "12px",
                    fontFamily: "Vazirmatn", fontSize: 12, color: C.text,
                  }} />
                  <Legend wrapperStyle={{ fontFamily: "Vazirmatn", fontSize: 12 }} />
                  <defs>
                    <linearGradient id="salesGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#ff6b35" stopOpacity={0.9} />
                      <stop offset="100%" stopColor="#ff6b35" stopOpacity={0.4} />
                    </linearGradient>
                  </defs>
                  <Bar dataKey="sales" name={L.sales} fill="url(#salesGrad)" radius={[6, 6, 0, 0]} barSize={chartView === "week" ? 28 : 50} />
                  <Line type="monotone" dataKey="orders" name={L.orders} stroke="#3b82f6" strokeWidth={3} dot={{ r: 4, fill: "#3b82f6" }} />
                </ComposedChart>
              </ResponsiveContainer>
            </Box>
          </Box>
        </Grid>

        <Grid item xs={12} sm={12} md={4}>
          <Box sx={{ ...glassSx, p: { xs: 2, md: 3 }, animation: "fadeUp 0.5s ease-out 0.4s forwards", opacity: 0 }}>
            <Typography sx={{ fontSize: 15, fontWeight: 800, color: C.text, mb: 2 }}>
              🥧 {L.salesByCategory}
            </Typography>
            <Box sx={{ width: "100%", height: { xs: 220, md: 280 }, display: "flex", justifyContent: "center" }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={categories} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={4} dataKey="value" stroke="none">
                    {categories.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                  <RTooltip contentStyle={{
                    background: isDark ? "rgba(16,18,16,0.92)" : "rgba(240,244,252,0.95)",
                    border: `1px solid ${C.glassBorder}`, borderRadius: "12px", fontFamily: "Vazirmatn", fontSize: 12, color: C.text,
                  }} />
                  <Legend wrapperStyle={{ fontFamily: "Vazirmatn", fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            </Box>
            <Box sx={{ mt: 1.5, display: "flex", flexDirection: "column", gap: 0.8 }}>
              {categories.map((cat, i) => {
                const total = categories.reduce((s, c) => s + c.value, 0);
                const pct = total > 0 ? ((cat.value / total) * 100).toFixed(0) : 0;
                return (
                  <Box key={i} sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: cat.color, flexShrink: 0 }} />
                    <Typography sx={{ fontSize: 11, color: C.sub, flex: 1 }}>{isRtl ? cat.name : cat.nameEn}</Typography>
                    <Typography sx={{ fontSize: 11, fontWeight: 700, color: C.text }}>{pct}%</Typography>
                  </Box>
                );
              })}
            </Box>
          </Box>
        </Grid>
      </Grid>

      {/* ════════════ ۳. ساعات اوج + مقایسه ════════════ */}
      <Grid container spacing={2.5} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={12} md={7}>
          <Box sx={{ ...glassSx, p: { xs: 2, md: 3 }, animation: "fadeUp 0.5s ease-out 0.5s forwards", opacity: 0 }}>
            <Typography sx={{ fontSize: 15, fontWeight: 800, color: C.text, mb: 2 }}>
              🔥 {L.peakHours}
            </Typography>
            <Box sx={{ width: "100%", height: { xs: 250, md: 300 } }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={hourlyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke={isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.05)"} />
                  <XAxis dataKey="displayName" stroke={C.muted} tick={{ fontSize: 10 }} />
                  <YAxis stroke={C.muted} tick={{ fontSize: 10 }} />
                  <RTooltip contentStyle={{
                    background: isDark ? "rgba(16,18,16,0.92)" : "rgba(240,244,252,0.95)",
                    border: `1px solid ${C.glassBorder}`, borderRadius: "12px", fontFamily: "Vazirmatn", fontSize: 12, color: C.text,
                  }} formatter={(v) => [`${v} ${L.ordersWord}`, L.orders]} />
                  <defs>
                    <linearGradient id="hourGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={isDark ? "#6B9B6E" : "#2E4D30"} stopOpacity={0.9} />
                      <stop offset="100%" stopColor={isDark ? "#6B9B6E" : "#2E4D30"} stopOpacity={0.3} />
                    </linearGradient>
                  </defs>
                  <Bar dataKey="orders" fill="url(#hourGrad)" radius={[4, 4, 0, 0]} barSize={16} />
                </BarChart>
              </ResponsiveContainer>
            </Box>
          </Box>
        </Grid>

        <Grid item xs={12} sm={12} md={5}>
          <Box sx={{ ...glassSx, p: { xs: 2, md: 3 }, height: "100%", display: "flex", flexDirection: "column", animation: "fadeUp 0.5s ease-out 0.6s forwards", opacity: 0 }}>
            <Typography sx={{ fontSize: 15, fontWeight: 800, color: C.text, mb: 2 }}>
              📊 {L.weeklyComparison}
            </Typography>
            {[
              { label: L.totalSales, thisW: weeklyCompare.thisWeek.sales, lastW: weeklyCompare.lastWeek.sales, suffix: ` ${L.tuman}` },
              { label: L.totalOrders, thisW: weeklyCompare.thisWeek.orders, lastW: weeklyCompare.lastWeek.orders, suffix: "" },
              { label: L.avgOrder, thisW: weeklyCompare.thisWeek.avg, lastW: weeklyCompare.lastWeek.avg, suffix: ` ${L.tuman}` },
            ].map((row, i) => {
              const pct = row.lastW > 0 ? ((row.thisW - row.lastW) / row.lastW * 100) : 0;
              const barPct = row.thisW > 0 ? Math.min((row.thisW / (row.thisW + row.lastW)) * 100, 100) : 50;
              return (
                <Box key={i} sx={{ mb: 2 }}>
                  <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 0.5 }}>
                    <Typography sx={{ fontSize: 12, fontWeight: 600, color: C.sub }}>{row.label}</Typography>
                    <ChangeChip value={parseFloat(pct.toFixed(1))} />
                  </Box>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    <Box sx={{ flex: 1, height: 8, borderRadius: 4, bgcolor: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)", overflow: "hidden" }}>
                      <Box sx={{ width: `${barPct}%`, height: "100%", borderRadius: 4, bgcolor: C.olive, transition: "width 1s ease" }} />
                    </Box>
                    <Typography sx={{ fontSize: 11, fontWeight: 700, color: C.text, minWidth: 70, textAlign: isRtl ? "left" : "right" }}>
                      {fmtN(row.thisW)}{row.suffix}
                    </Typography>
                  </Box>
                  <Typography sx={{ fontSize: 10, color: C.muted, mt: 0.3, textAlign: isRtl ? "right" : "left" }}>
                    {L.lastWeek}: {fmtN(row.lastW)}{row.suffix}
                  </Typography>
                </Box>
              );
            })}
          </Box>
        </Grid>
      </Grid>

      {/* ════════════ ۴. پرفروش + کم‌فروش ════════════ */}
      <Grid container spacing={2.5} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={12} md={7}>
          <Box sx={{ ...glassSx, p: { xs: 2, md: 3 }, height: "100%", display: "flex", flexDirection: "column", animation: "fadeUp 0.5s ease-out 0.7s forwards", opacity: 0 }}>
            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
              <Typography sx={{ fontSize: 15, fontWeight: 800, color: C.text }}>
                🏆 {L.topSellers}
              </Typography>
              <Chip size="small" label={`${fmtN(topItems.length)} ${L.items}`}
                sx={{ bgcolor: C.oliveSubtle, color: C.olive, fontSize: 10, fontWeight: 600 }} />
            </Box>
            <Box sx={{ display: "flex", alignItems: "center", px: 1.5, pb: 1, borderBottom: `1px solid ${C.glassBorder}`, mb: 0.5 }}>
              <Typography sx={{ width: 30, fontSize: 10, fontWeight: 700, color: C.muted }}>#</Typography>
              <Typography sx={{ flex: 1, fontSize: 10, fontWeight: 700, color: C.muted }}>{L.item}</Typography>
              <Typography sx={{ width: 60, fontSize: 10, fontWeight: 700, color: C.muted, textAlign: "center" }}>{L.qty}</Typography>
              <Typography sx={{ width: 90, fontSize: 10, fontWeight: 700, color: C.muted, textAlign: isRtl ? "left" : "right" }}>{L.revenue}</Typography>
              <Typography sx={{ width: 50, fontSize: 10, fontWeight: 700, color: C.muted, textAlign: "center" }}>%</Typography>
            </Box>
            {topItems.map((item, i) => (
              <Box key={item.id} sx={{
                display: "flex", alignItems: "center", px: 1.5, py: 1.2, borderRadius: "10px",
                transition: "all 0.2s", opacity: 0, animation: `fadeUp 0.4s ease-out ${0.8 + i * 0.05}s forwards`,
                "&:hover": { bgcolor: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)" },
              }}>
                <Box sx={{
                  width: 26, height: 26, borderRadius: "50%",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 11, fontWeight: 700, flexShrink: 0,
                  bgcolor: i === 0 ? "#D4B76A" : i === 1 ? "#8A8588" : i === 2 ? "#A84060" : C.muted + "33",
                  color: i < 3 ? "#fff" : C.sub,
                }}>{fmtN(i + 1)}</Box>
                <Typography sx={{ flex: 1, fontSize: 12.5, fontWeight: 600, color: C.text, mx: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {isRtl ? item.name : item.nameEn}
                </Typography>
                <Typography sx={{ width: 60, fontSize: 12, color: C.sub, textAlign: "center" }}>{fmtN(item.qty)}</Typography>
                <Typography sx={{ width: 90, fontSize: 12, fontWeight: 700, color: C.olive, textAlign: isRtl ? "left" : "right" }}>{fmtN(item.total)}</Typography>
                <Box sx={{ width: 50, textAlign: "center" }}>
                  <Chip size="small" label={`${item.pct}%`} sx={{ height: 20, fontSize: 9, fontWeight: 700, borderRadius: "5px", bgcolor: `${C.olive}15`, color: C.olive }} />
                </Box>
              </Box>
            ))}
          </Box>
        </Grid>

        <Grid item xs={12} sm={12} md={5}>
          <Box sx={{ ...glassSx, p: { xs: 2, md: 3 }, height: "100%", display: "flex", flexDirection: "column", animation: "fadeUp 0.5s ease-out 0.8s forwards", opacity: 0 }}>
            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
              <Typography sx={{ fontSize: 15, fontWeight: 800, color: C.text }}>
                📉 {L.leastSellers}
              </Typography>
              <Chip size="small" label={L.review} sx={{ bgcolor: C.dangerBg, color: C.danger, fontSize: 10, fontWeight: 600 }} />
            </Box>
            {lowItems.map((item, i) => (
              <Box key={item.id} sx={{
                display: "flex", alignItems: "center", gap: 1.5, p: 1.5, borderRadius: "10px",
                mb: 0.5, transition: "all 0.2s",
                opacity: 0, animation: `fadeUp 0.4s ease-out ${0.9 + i * 0.05}s forwards`,
                "&:hover": { bgcolor: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)" },
              }}>
                <Box sx={{
                  width: 28, height: 28, borderRadius: "8px",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 12, bgcolor: C.dangerBg, color: C.danger, fontWeight: 700, flexShrink: 0,
                }}>{fmtN(i + 1)}</Box>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography sx={{ fontSize: 12.5, fontWeight: 600, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {isRtl ? item.name : item.nameEn}
                  </Typography>
                  <Typography sx={{ fontSize: 10, color: C.muted }}>{fmtN(item.qty)} {L.sold}</Typography>
                </Box>
                <Typography sx={{ fontSize: 12, fontWeight: 700, color: C.sub }}>{fmtN(item.total)}</Typography>
              </Box>
            ))}
          </Box>
        </Grid>
      </Grid>

      {/* ════════════ ۵. وضعیت + فعالیت + انبار ════════════ */}
      <Grid container spacing={2.5} sx={{ mb: 4 }}>
        <Grid item xs={12} sm={6} md={4}>
          <Box sx={{ ...glassSx, p: { xs: 2, md: 3 }, animation: "fadeUp 0.5s ease-out 0.9s forwards", opacity: 0 }}>
            <Typography sx={{ fontSize: 15, fontWeight: 800, color: C.text, mb: 2 }}>
              📊 {L.orderStatus}
            </Typography>
            {orderStatus.map((st, i) => {
              const pct = totalOrders > 0 ? ((st.count / totalOrders) * 100).toFixed(0) : 0;
              return (
                <Box key={i} sx={{ mb: 1.5 }}>
                  <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 0.5 }}>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 0.8 }}>
                      <Typography sx={{ fontSize: 14 }}>{st.icon}</Typography>
                      <Typography sx={{ fontSize: 12, fontWeight: 600, color: C.text }}>{isRtl ? st.label : st.labelEn}</Typography>
                    </Box>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                      <Typography sx={{ fontSize: 13, fontWeight: 800, color: st.color }}>{fmtN(st.count)}</Typography>
                      <Typography sx={{ fontSize: 10, color: C.muted }}>({pct}%)</Typography>
                    </Box>
                  </Box>
                  <LinearProgress variant="determinate" value={parseFloat(pct)} sx={{
                    height: 6, borderRadius: 3, bgcolor: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)",
                    "& .MuiLinearProgress-bar": { bgcolor: st.color, borderRadius: 3 },
                  }} />
                </Box>
              );
            })}
          </Box>
        </Grid>

        <Grid item xs={12} sm={6} md={4}>
          <Box sx={{ ...glassSx, p: { xs: 2, md: 3 }, animation: "fadeUp 0.5s ease-out 1s forwards", opacity: 0 }}>
            <Typography sx={{ fontSize: 15, fontWeight: 800, color: C.text, mb: 2 }}>
              ⚡ {L.latestActivity}
            </Typography>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5, maxHeight: 260, overflowY: "auto" }}>
              {activities.map((act, i) => (
                <Box key={i} sx={{ display: "flex", alignItems: "center", gap: 1.2 }}>
                  <Box sx={{
                    width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
                    bgcolor: act.dot === "green" ? "#10b981" : act.dot === "blue" ? "#3b82f6" : "#ff6b35",
                    boxShadow: `0 0 8px ${act.dot === "green" ? "#10b981" : act.dot === "blue" ? "#3b82f6" : "#ff6b35"}44`,
                    animation: "pulse 2s ease-in-out infinite",
                  }} />
                  <Typography sx={{ flex: 1, fontSize: 12, color: C.text, lineHeight: 1.5 }}>{isRtl ? act.text : act.textEn}</Typography>
                  <Typography sx={{ fontSize: 10, color: C.muted, whiteSpace: "nowrap" }}>{isRtl ? act.time : act.timeEn}</Typography>
                </Box>
              ))}
            </Box>
          </Box>
        </Grid>

        <Grid item xs={12} sm={12} md={4}>
          <Box sx={{ ...glassSx, p: { xs: 2, md: 3 }, animation: "fadeUp 0.5s ease-out 1.1s forwards", opacity: 0 }}>
            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
              <Typography sx={{ fontSize: 15, fontWeight: 800, color: C.text }}>
                📦 {L.stockAlerts}
              </Typography>
              <Chip size="small" label={`${fmtN(MOCK_STATS.stockAlerts)} ${L.low}`} sx={{ bgcolor: C.dangerBg, color: C.danger, fontSize: 10, fontWeight: 700 }} />
            </Box>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1, maxHeight: 260, overflowY: "auto" }}>
              {stockAlerts.map((item, i) => {
                const pct = item.min > 0 ? Math.min((item.current / item.min) * 100, 100) : 0;
                const critical = pct < 30;
                return (
                  <Box key={i} sx={{
                    p: 1.2, borderRadius: "10px",
                    border: `1px solid ${critical ? "rgba(232,64,87,0.2)" : C.glassBorder}`,
                    bgcolor: critical ? "rgba(232,64,87,0.05)" : "transparent",
                  }}>
                    <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 0.5 }}>
                      <Typography sx={{ fontSize: 12, fontWeight: 600, color: C.text }}>{isRtl ? item.name : item.nameEn}</Typography>
                      <Typography sx={{ fontSize: 11, fontWeight: 700, color: critical ? C.danger : "#f59e0b" }}>
                        {fmtN(item.current)} {isRtl ? item.unit : item.unitEn}
                      </Typography>
                    </Box>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                      <Box sx={{ flex: 1, height: 5, borderRadius: 3, bgcolor: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)", overflow: "hidden" }}>
                        <Box sx={{ width: `${pct}%`, height: "100%", borderRadius: 3, bgcolor: critical ? C.danger : "#f59e0b", transition: "width 0.8s ease" }} />
                      </Box>
                      <Typography sx={{ fontSize: 9, color: C.muted }}>
                        {L.minLabel}: {fmtN(item.min)}
                      </Typography>
                    </Box>
                  </Box>
                );
              })}
            </Box>
          </Box>
        </Grid>
      </Grid>
    </Box>
  );
}