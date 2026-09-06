import { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Box, Typography, Grid, IconButton, CircularProgress, Chip } from "@mui/material";
import {
  BarChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ComposedChart, PieChart, Pie, Cell
} from "recharts"; // یا react-chartjs-2
import { useThemeMode } from "../contexts/ThemeContext";
import { useLang } from "../contexts/LangContext";
import superClient from "../api/super_client"; // یا axios

// اگر از recharts استفاده می‌کنی، این خط رو اضافه کن
// npm install recharts

const animations = `
  @keyframes orb1 { 0%, 100% { transform: translate(0, 0) scale(1); } 25% { transform: translate(60px, -80px) scale(1.1); } 50% { transform: translate(-20px, -40px) scale(0.95); } 75% { transform: translate(-50px, 50px) scale(1.05); } }
  @keyframes orb2 { 0%, 100% { transform: translate(0, 0) scale(1); } 33% { transform: translate(-70px, 60px) scale(0.92); } 66% { transform: translate(50px, -70px) scale(1.12); } }
  @keyframes float { 0%, 100% { transform: translateY(0px); } 50% { transform: translateY(-6px); } }
  @keyframes shimmer { 0% { background-position: -200% center; } 100% { background-position: 200% center; } }
  @keyframes breathe { 0%, 100% { opacity: 0.3; transform: scale(1); } 50% { opacity: 0.6; transform: scale(1.02); } }
  @keyframes fadeUp { from { opacity: 0; transform: translateY(20px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
`;

export default function Dashboard() {
  const { mode } = useThemeMode();
  const { isRtl, lang } = useLang();
  const { t } = useTranslation();
  const isDark = mode === "dark";

  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ sales: 0, orders: 0, customers: 0, stock: 0 });
  const [topItems, setTopItems] = useState([]);
  const [activities, setActivities] = useState([]);
  const [chartView, setChartView] = useState("week");
  const [salesData, setSalesData] = useState({ week: [], month: [] });
  const [catData, setCatData] = useState([]);

  useEffect(() => {
    const tmr = setTimeout(() => setMounted(true), 80);
    return () => clearTimeout(tmr);
  }, []);

  // Mock Data Fetching (شما این رو با API های واقعی خودت عوض کن)
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        // شبیه‌سازی درخواست API
        // const { data: report } = await superClient.get("/api/pos/daily-report/");
        // const { data: loyalty } = await superClient.get("/api/loyalty/dashboard/");
        
        // داده‌های فرضی برای نمایش
        setTimeout(() => {
          setStats({ sales: 2450000, orders: 142, customers: 89, stock: 34 });
          setTopItems([
            { id: 1, name: "پیتزا پپرونی", qty: 45, total: 1200000 },
            { id: 2, name: "برگر مخصوص", qty: 38, total: 950000 },
            { id: 3, name: "پاستا آلفردو", qty: 22, total: 660000 },
          ]);
          setActivities([
            { dot: "orange", text: "سفارش جدید در انتظار", time: "۲ دقیقه پیش" },
            { dot: "blue", text: "در حال آماده‌سازی سفارش #1023", time: "۵ دقیقه پیش" },
            { dot: "green", text: "سفارش #1022 تحویل شد", time: "۱۵ دقیقه پیش" },
          ]);
          setSalesData({
            week: [
              { name: "شنبه", sales: 1200000, orders: 45 },
              { name: "یکشنبه", sales: 1500000, orders: 52 },
              { name: "دوشنبه", sales: 1100000, orders: 38 },
              { name: "سه‌شنبه", sales: 1800000, orders: 65 },
              { name: "چهارشنبه", sales: 2100000, orders: 72 },
              { name: "پنجشنبه", sales: 2500000, orders: 85 },
              { name: "جمعه", sales: 900000, orders: 25 },
            ],
            month: [
              { name: "هفته ۱", sales: 8500000, orders: 320 },
              { name: "هفته ۲", sales: 9200000, orders: 350 },
              { name: "هفته ۳", sales: 7800000, orders: 290 },
              { name: "هفته ۴", sales: 10500000, orders: 410 },
            ]
          });
          setCatData([
            { name: "غذای اصلی", value: 4000 },
            { name: "پیش‌غذا", value: 1500 },
            { name: "نوشیدنی", value: 2000 },
            { name: "دسر", value: 1000 },
          ]);
          setLoading(false);
        }, 1000);
      } catch (err) {
        console.error("Dashboard load error:", err);
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const C = useMemo(() => ({
    bg: isDark ? "#0B0A0B" : "#E4E8F0",
    glass: isDark ? "rgba(16,18,16,0.6)" : "rgba(240,244,252,0.7)",
    glassBorder: isDark ? "rgba(107,155,110,0.1)" : "rgba(80,100,140,0.15)",
    glassShimmer: isDark ? "linear-gradient(90deg, transparent 0%, rgba(107,155,110,0.05) 20%, rgba(168,64,96,0.06) 40%, rgba(212,183,106,0.07) 60%, rgba(107,155,110,0.04) 80%, transparent 100%)" : "linear-gradient(90deg, transparent 0%, rgba(80,100,160,0.06) 20%, rgba(120,40,70,0.05) 40%, rgba(196,162,101,0.06) 60%, rgba(61,90,62,0.04) 80%, transparent 100%)",
    olive: isDark ? "#6B9B6E" : "#2E4D30",
    oliveSubtle: isDark ? "rgba(107,155,110,0.08)" : "rgba(46,77,48,0.08)",
    burgundy: isDark ? "#A84060" : "#7A2845",
    gold: isDark ? "#D4B76A" : "#A08040",
    text: isDark ? "#F0ECE8" : "#1A1A24",
    sub: isDark ? "#8A8588" : "#555568",
    muted: isDark ? "#4A4548" : "#8A8A9E",
    cardShadow: isDark ? "0 8px 60px rgba(0,0,0,0.5), 0 0 80px rgba(107,155,110,0.04), 0 0 120px rgba(168,64,96,0.03)" : "0 8px 60px rgba(0,0,0,0.1), 0 0 60px rgba(74,106,148,0.08), 0 0 100px rgba(46,77,48,0.04)",
    orb1: isDark ? "rgba(107,155,110,0.09)" : "rgba(74,106,148,0.12)",
    orb2: isDark ? "rgba(168,64,96,0.07)" : "rgba(122,40,69,0.1)",
  }), [isDark]);

  const glassCardSx = {
    bgcolor: C.glass, backdropFilter: "blur(28px)", WebkitBackdropFilter: "blur(28px)",
    border: `1px solid ${C.glassBorder}`, borderRadius: "20px",
    boxShadow: C.cardShadow, position: "relative", overflow: "hidden",
    "&::before": { content: '""', position: "absolute", top: 0, left: 0, right: 0, height: 1, background: C.glassShimmer, backgroundSize: "200% 100%", animation: "shimmer 10s linear infinite", pointerEvents: "none" }
  };

  const fmtN = (n) => {
    if (n == null) return "—";
    return lang === "fa" ? Number(n).toLocaleString("fa-IR") : Number(n).toLocaleString("en-US");
  };

  const dateText = useMemo(() => {
    const now = new Date();
    const days = ["یکشنبه","دوشنبه","سه‌شنبه","چهارشنبه","پنجشنبه","جمعه","شنبه"];
    const months = ["ژانویه","فوریه","مارس","آوریل","مه","ژوئن","ژوئیه","اوت","سپتامبر","اکتبر","نوامبر","دسامبر"];
    return lang === "fa" 
      ? `${days[now.getDay() - 1]}، ${now.getDate()} ${months[now.getMonth()]}` // ساده‌سازی شده
      : `${days[now.getDay()]}, ${now.getDate()} ${months[now.getMonth()]}`;
  }, [lang]);

  const COLORS = ["#ff6b35", "#3b82f6", "#10b981", "#8b5cf6", "#f59e0b", "#ec4899"];

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", height: "80vh" }}>
        <CircularProgress sx={{ color: C.olive }} />
      </Box>
    );
  }

  return (
    <Box dir={isRtl ? "rtl" : "ltr"} sx={{ position: "relative", fontFamily: "'Vazirmatn', sans-serif", opacity: mounted ? 1 : 0, transition: "opacity 0.6s ease" }}>
      <style>{animations}</style>

      {/* Greeting */}
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 3, flexDirection: isRtl ? "row" : "row-reverse" }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 800, color: C.text, mb: 0.5 }}>
            {t("dash.greeting")} <span style={{ color: C.olive }}>{t("dash.greetingName")}</span> 👋
          </Typography>
          <Typography sx={{ fontSize: 13.5, color: C.sub, fontFamily: "'Vazirmatn', sans-serif" }}>
            {t("dash.summary")}
          </Typography>
        </Box>
        <Chip 
          icon={<span style={{ fontSize: 14 }}>📅</span>} 
          label={dateText} 
          sx={{ bgcolor: C.glass, color: C.text, border: `1px solid ${C.glassBorder}`, backdropFilter: "blur(8px)", fontWeight: 600, fontSize: 12, py: 2.5, px: 1 }} 
        />
      </Box>

      {/* Stats Grid */}
      <Grid container spacing={2.5} sx={{ mb: 3 }}>
        {[
          { icon: "💰", color: "#ff6b35", value: fmtN(stats.sales) + " ت", label: t("dash.todaySales") },
          { icon: "🧾", color: "#3b82f6", value: fmtN(stats.orders), label: t("dash.todayOrders") },
          { icon: "👥", color: "#10b981", value: fmtN(stats.customers), label: t("dash.clubMembers") },
          { icon: "📦", color: "#8b5cf6", value: fmtN(stats.stock), label: t("dash.stockItems") },
        ].map((stat, i) => (
          <Grid item xs={12} sm={6} md={3} key={i}>
            <Box sx={{ ...glassCardSx, p: 2.5, display: "flex", alignItems: "center", gap: 2 }}>
              <Box sx={{ 
                width: 48, height: 48, borderRadius: "12px", display: "flex", alignItems: "center", justifyContent: "center", 
                fontSize: 22, background: `${stat.color}22`, border: `1px solid ${stat.color}33`, 
                animation: "float 5s ease-in-out infinite", flexShrink: 0 
              }}>
                {stat.icon}
              </Box>
              <Box>
                <Typography sx={{ fontSize: 20, fontWeight: 800, color: C.text, lineHeight: 1.2, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                  {stat.value}
                </Typography>
                <Typography sx={{ fontSize: 11, fontWeight: 600, color: C.sub, letterSpacing: "0.02em" }}>
                  {stat.label}
                </Typography>
              </Box>
            </Box>
          </Grid>
        ))}
      </Grid>

      {/* Quick Access */}
      <Grid container spacing={2.5} sx={{ mb: 3 }}>
        {[
          { icon: "💻", label: t("dash.quickPos"), path: "/dashboard/app/pos", color: "#ff6b35" },
          { icon: "➕", label: t("dash.quickOrder"), path: "/dashboard/app/orders", color: "#3b82f6" },
          { icon: "🧾", label: t("dash.quickInvoice"), path: "/dashboard/app/invoices", color: "#10b981" },
          { icon: "🍳", label: t("dash.quickKitchen"), path: "/dashboard/app/kitchen", color: "#8b5cf6" },
        ].map((q, i) => (
          <Grid item xs={6} sm={3} key={i}>
            <Box 
              component="button" 
              onClick={() => navigate(q.path)} // ensure navigate is imported if used, or use Link
              sx={{ 
                ...glassCardSx, p: 2, width: "100%", cursor: "pointer", textAlign: "center",
                display: "flex", flexDirection: "column", alignItems: "center", gap: 1,
                bgcolor: "transparent", border: "none", outline: "none",
                "&:hover": { transform: "translateY(-2px)" }, transition: "all 0.3s ease"
              }}
            >
              <Box sx={{ width: 40, height: 40, borderRadius: "10px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, background: `${q.color}22` }}>
                {q.icon}
              </Box>
              <Typography sx={{ fontSize: 11, fontWeight: 600, color: C.text }}>{q.label}</Typography>
            </Box>
          </Grid>
        ))}
      </Grid>

      {/* Charts Grid */}
      <Grid container spacing={2.5} sx={{ mb: 3 }}>
        {/* Sales Chart */}
        <Grid item xs={12} lg={8}>
          <Box sx={{ ...glassCardSx, p: 3, height: 400 }}>
            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 3 }}>
              <Typography sx={{ fontSize: 15, fontWeight: 800, color: C.text }}>📈 {t("dash.chartSales")}</Typography>
              <Box sx={{ display: "flex", gap: 0.5, bgcolor: C.oliveSubtle, borderRadius: "8px", p: 0.5 }}>
                {["week", "month"].map((v) => (
                  <button 
                    key={v} 
                    onClick={() => setChartView(v)}
                    style={{
                      padding: "4px 12px", borderRadius: "6px", fontSize: 11, fontWeight: 600, cursor: "pointer",
                      border: "none", outline: "none", transition: "all 0.2s",
                      background: chartView === v ? C.olive : "transparent",
                      color: chartView === v ? "#fff" : C.sub
                    }}
                  >
                    {t(`dash.${v}`)}
                  </button>
                ))}
              </Box>
            </Box>
            <Box sx={{ width: "100%", height: 300 }}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={salesData[chartView]}>
                  <CartesianGrid strokeDasharray="3 3" stroke={isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)"} />
                  <XAxis dataKey="name" stroke={C.muted} style={{ fontSize: 11, fontFamily: "Vazirmatn" }} />
                  <YAxis stroke={C.muted} style={{ fontSize: 11, fontFamily: "Vazirmatn" }} />
                  <Tooltip 
                    contentStyle={{ 
                      background: isDark ? "rgba(16,18,16,0.9)" : "rgba(240,244,252,0.9)", 
                      border: `1px solid ${C.glassBorder}`, borderRadius: "12px", 
                      backdropFilter: "blur(8px)", color: C.text, fontFamily: "Vazirmatn", fontSize: 12 
                    }} 
                  />
                  <Legend wrapperStyle={{ fontFamily: "Vazirmatn", fontSize: 12 }} />
                  <Bar dataKey="sales" name={t("dash.todaySales")} fill="#ff6b35" radius={[8, 8, 0, 0]} barSize={20} />
                  <Line type="monotone" dataKey="orders" name={t("dash.todayOrders")} stroke="#3b82f6" strokeWidth={3} dot={{ r: 4 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </Box>
          </Box>
        </Grid>

        {/* Category Chart */}
        <Grid item xs={12} lg={4}>
          <Box sx={{ ...glassCardSx, p: 3, height: 400 }}>
            <Typography sx={{ fontSize: 15, fontWeight: 800, color: C.text, mb: 3 }}>🥧 {t("dash.chartCategory")}</Typography>
            <Box sx={{ width: "100%", height: 300, display: "flex", justifyContent: "center", alignItems: "center" }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={catData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={90}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {catData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ 
                      background: isDark ? "rgba(16,18,16,0.9)" : "rgba(240,244,252,0.9)", 
                      border: `1px solid ${C.glassBorder}`, borderRadius: "12px", 
                      backdropFilter: "blur(8px)", color: C.text, fontFamily: "Vazirmatn", fontSize: 12 
                    }} 
                  />
                  <Legend wrapperStyle={{ fontFamily: "Vazirmatn", fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            </Box>
          </Box>
        </Grid>
      </Grid>

      {/* Bottom Grid */}
      <Grid container spacing={2.5}>
        {/* Top Items */}
        <Grid item xs={12} md={6}>
          <Box sx={{ ...glassCardSx, p: 3 }}>
            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
              <Typography sx={{ fontSize: 15, fontWeight: 800, color: C.text }}>🏆 {t("dash.topItems")}</Typography>
              <Chip label={`${fmtN(topItems.length)} ${t("dash.itemsCount")}`} size="small" sx={{ bgcolor: C.oliveSubtle, color: C.olive, fontSize: 10, fontWeight: 600 }} />
            </Box>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
              {topItems.map((item, i) => (
                <Box key={item.id} sx={{ display: "flex", alignItems: "center", gap: 1.5, p: 1.5, borderRadius: "10px", bgcolor: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)" }}>
                  <Box sx={{ width: 28, height: 28, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, bgcolor: i === 0 ? "#D4B76A" : i === 1 ? "#8A8588" : i === 2 ? "#A84060" : C.muted, color: "#fff" }}>
                    {fmtN(i + 1)}
                  </Box>
                  <Typography sx={{ flex: 1, fontSize: 13, fontWeight: 600, color: C.text }}>{item.name}</Typography>
                  <Typography sx={{ fontSize: 12, color: C.sub }}>{fmtN(item.qty)} عدد</Typography>
                  <Typography sx={{ fontSize: 13, fontWeight: 700, color: C.olive, minWidth: 80, textAlign: "left" }}>{fmtN(item.total)}</Typography>
                </Box>
              ))}
              {topItems.length === 0 && (
                <Typography sx={{ textAlign: "center", color: C.muted, py: 4, fontSize: 13 }}>{t("dash.emptyItems")}</Typography>
              )}
            </Box>
          </Box>
        </Grid>

        {/* Latest Activity */}
        <Grid item xs={12} md={6}>
          <Box sx={{ ...glassCardSx, p: 3 }}>
            <Typography sx={{ fontSize: 15, fontWeight: 800, color: C.text, mb: 2 }}>⚡ {t("dash.latestActivity")}</Typography>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {activities.map((act, i) => (
                <Box key={i} sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                  <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: act.dot === "green" ? "#10b981" : act.dot === "blue" ? "#3b82f6" : "#ff6b35", boxShadow: `0 0 8px ${act.dot === "green" ? "#10b981" : act.dot === "blue" ? "#3b82f6" : "#ff6b35"}` }} />
                  <Typography sx={{ flex: 1, fontSize: 13, color: C.text }}>{act.text}</Typography>
                  <Typography sx={{ fontSize: 11, color: C.muted }}>{act.time}</Typography>
                </Box>
              ))}
              {activities.length === 0 && (
                <Typography sx={{ textAlign: "center", color: C.muted, py: 4, fontSize: 13 }}>{t("dash.emptyActivity")}</Typography>
              )}
            </Box>
          </Box>
        </Grid>
      </Grid>

    </Box>
  );
}