import { useMemo, useState, useEffect, useCallback, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useLang } from "../contexts/LangContext";
import { dashboardApi } from "../api/dashboard";
import { motion } from "framer-motion";
import { useInView } from "react-intersection-observer";
import { format } from "date-fns-jalali";
import {
  Box, Typography, Grid, Paper, Chip, Table, TableBody,
  TableCell, TableHead, TableRow, TableContainer, Skeleton,
  IconButton, Tooltip, alpha, useTheme, useMediaQuery,
  LinearProgress, Divider, Avatar, Alert,
} from "@mui/material";
import {
  AttachMoney, Receipt, Inventory,
  PointOfSale, AddBox, NoteAdd, Restaurant,
  TrendingUp, PieChart, EmojiEvents, LocalActivity,
  Refresh, Schedule, Router, ShoppingCart,
  Warning, CheckCircle, AccessTime, Star, Speed,
} from "@mui/icons-material";
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement,
  LineElement, PointElement, ArcElement,
  Tooltip as CTooltip, Legend, Filler,
} from "chart.js";
import { Bar, Doughnut, Line } from "react-chartjs-2";

ChartJS.register(
  CategoryScale, LinearScale, BarElement, LineElement,
  PointElement, ArcElement, CTooltip, Legend, Filler
);

/* ════════════════════════════════════════════════
   ابزارها
   ════════════════════════════════════════════════ */
const toFa = (n) => (n == null ? "—" : Number(n).toLocaleString("fa-IR"));
const fmtPrice = (v) => toFa(Math.round(v || 0)) + " ت";
const fmtShort = (v) => {
  const n = Math.round(v || 0);
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return Math.round(n / 1_000) + "K";
  return toFa(n);
};

const P = {
  orange: "#ff6b35", orangeLight: "#ff9a3c",
  blue: "#3b82f6", blueLight: "#60a5fa",
  green: "#10b981", greenLight: "#34d399",
  purple: "#8b5cf6", purpleLight: "#a78bfa",
  yellow: "#f59e0b", red: "#ef4444",
  cyan: "#06b6d4", pink: "#ec4899",
};

const STATUS_MAP = {
  fa: {
    pending: { text: "در انتظار", color: P.yellow },
    preparing: { text: "آماده‌سازی", color: P.blue },
    ready: { text: "آماده", color: P.green },
    delivered: { text: "تحویل", color: P.green },
    cancelled: { text: "لغو", color: P.red },
  },
  en: {
    pending: { text: "Pending", color: P.yellow },
    preparing: { text: "Preparing", color: P.blue },
    ready: { text: "Ready", color: P.green },
    delivered: { text: "Delivered", color: P.green },
    cancelled: { text: "Cancelled", color: P.red },
  },
};

/* ════════════════════════════════════════════════
   تاریخ
   ════════════════════════════════════════════════ */
function getTodayDate(isRtl) {
  const now = new Date();
  if (isRtl) {
    try {
      return format(now, "EEEE، d MMMM");
    } catch {
      const days = ["یکشنبه","دوشنبه","سه‌شنبه","چهارشنبه","پنجشنبه","جمعه","شنبه"];
      const months = ["فروردین","اردیبهشت","خرداد","تیر","مرداد","شهریور","مهر","آبان","آذر","دی","بهمن","اسفند"];
      return `${days[now.getDay()]}، ${now.getDate()} ${months[now.getMonth()]}`;
    }
  }
  return now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}

function getTimeNow(isRtl) {
  return new Date().toLocaleTimeString(isRtl ? "fa-IR" : "en-US", { hour: "2-digit", minute: "2-digit" });
}

/* ════════════════════════════════════════════════
   هوک شمارش
   ════════════════════════════════════════════════ */
function useCountUp(end, duration = 1200, active = true) {
  const [val, setVal] = useState(0);
  const prevRef = useRef(0);
  useEffect(() => {
    if (!active) return;
    const from = prevRef.current;
    const to = typeof end === "number" ? end : 0;
    if (from === to) { setVal(to); return; }
    const start = performance.now();
    let raf;
    const tick = (now) => {
      const p = Math.min((now - start) / duration, 1);
      setVal(Math.round(from + (to - from) * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
      else prevRef.current = to;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [end, duration, active]);
  return val;
}

/* ════════════════════════════════════════════════
   انیمیشن‌ها
   ════════════════════════════════════════════════ */
const containerV = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.06 } },
};
const itemV = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 260, damping: 24 } },
};
const hoverV = {
  rest: { scale: 1, y: 0 },
  hover: { scale: 1.02, y: -5, transition: { type: "spring", stiffness: 400, damping: 20 } },
};

/* ════════════════════════════════════════════════
   کامپوننت‌های پایه
   ════════════════════════════════════════════════ */
function LiveDot({ color = P.green, size = 8 }) {
  return (
    <Box component="span" sx={{
      display: "inline-block", width: size, height: size, borderRadius: "50%",
      background: color, boxShadow: `0 0 0 3px ${color}30`,
      mr: 0.75, verticalAlign: "middle",
      "@keyframes pd": {
        "0%,100%": { opacity: 1, transform: "scale(1)" },
        "50%": { opacity: 0.4, transform: "scale(1.6)" },
      },
      animation: "pd 2s ease-in-out infinite",
    }} />
  );
}

function AnimSec({ children, delay = 0 }) {
  const [ref, inView] = useInView({ triggerOnce: true, threshold: 0.15, rootMargin: "-20px" });
  return (
    <motion.div ref={ref} variants={itemV} initial="hidden"
      animate={inView ? "show" : "hidden"} transition={{ delay: delay * 0.05 }}>
      {children}
    </motion.div>
  );
}

function SecHead({ icon, title, right, color }) {
  return (
    <Box sx={{
      display: "flex", justifyContent: "space-between", alignItems: "center",
      mb: { xs: 1, sm: 1.5 }, flexWrap: "wrap", gap: 0.5,
      minHeight: { xs: 26, sm: 32 },
    }}>
      <Box sx={{
        display: "flex", alignItems: "center", gap: { xs: 0.5, sm: 0.75 },
        fontWeight: 800, fontSize: { xs: 12, sm: 15 }, minWidth: 0,
      }}>
        <Box sx={{
          color: color || "primary.main", display: "flex", flexShrink: 0,
          "& .MuiSvgIcon-root": { fontSize: { xs: 16, sm: 20 } },
        }}>{icon}</Box>
        <Box component="span" sx={{
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>{title}</Box>
      </Box>
      {right && <Box sx={{ flexShrink: 0 }}>{right}</Box>}
    </Box>
  );
}

/* ════════════════════════════════════════════════
   کارت آمار
   ════════════════════════════════════════════════ */
function StatCard({ icon, value, label, gradient, color, loading, suffix = "", trend, trendLabel }) {
  const [ref, inView] = useInView({ triggerOnce: true, threshold: 0.3 });
  const displayed = useCountUp(inView ? (value || 0) : 0, 1200, inView);

  return (
    <motion.div ref={ref} variants={hoverV} initial="rest" whileHover="hover" whileTap={{ scale: 0.98 }}>
      <Paper elevation={0} sx={{
        p: { xs: 1.25, sm: 2.5 }, borderRadius: { xs: 2.5, sm: 4 },
        border: "1.5px solid", borderColor: (t) => alpha(t.palette.divider, 0.5),
        position: "relative", overflow: "hidden", cursor: "default",
        transition: "border-color 0.3s, box-shadow 0.3s",
        "&:hover": {
          borderColor: alpha(color, 0.35),
          boxShadow: `0 8px 32px -4px ${alpha(color, 0.18)}`,
        },
      }}>
        <Box sx={{
          position: "absolute", top: 0, left: 0, right: 0, height: 3,
          background: gradient, borderRadius: "14px 14px 0 0",
        }} />
        <Box sx={{
          position: "absolute", top: -20, right: -20,
          width: 70, height: 70, borderRadius: "50%",
          background: alpha(color, 0.04),
        }} />
        <Box sx={{
          width: { xs: 34, sm: 48 }, height: { xs: 34, sm: 48 },
          borderRadius: { xs: 2, sm: 3 },
          display: "flex", alignItems: "center", justifyContent: "center",
          background: alpha(color, 0.1), color, mb: { xs: 0.75, sm: 1.5 },
          "& .MuiSvgIcon-root": { fontSize: { xs: 16, sm: 22 } },
        }}>
          {icon}
        </Box>
        {loading ? (
          <Skeleton variant="rounded" width={60} height={24} animation="wave" sx={{ borderRadius: 2 }} />
        ) : (
          <Box sx={{ minHeight: { xs: 22, sm: 36 } }}>
            <Typography component="div" sx={{
              fontSize: { xs: 16, sm: 28 }, fontWeight: 900,
              letterSpacing: -0.8, lineHeight: 1.1,
              direction: "ltr", textAlign: "left",
              fontVariantNumeric: "tabular-nums",
            }}>
              {toFa(displayed)}{suffix}
            </Typography>
          </Box>
        )}
        <Typography component="div" sx={{
          fontSize: { xs: 9, sm: 13 }, color: "text.secondary",
          fontWeight: 700, mt: { xs: 0.25, sm: 0.5 },
        }}>
          {label}
        </Typography>
        {trend !== undefined && !loading && (
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, mt: { xs: 0.5, sm: 0.75 } }}>
            <Box sx={{
              display: "inline-flex", alignItems: "center", gap: 0.3,
              px: { xs: 0.5, sm: 0.7 }, py: 0.1, borderRadius: 1.5,
              background: alpha(trend >= 0 ? P.green : P.red, 0.1),
              color: trend >= 0 ? P.green : P.red,
              fontSize: { xs: 8, sm: 11 }, fontWeight: 800,
            }}>
              {trend >= 0 ? "▲" : "▼"}{Math.abs(trend)}%
            </Box>
            {trendLabel && (
              <Box component="span" sx={{
                fontSize: { xs: 7, sm: 11 }, color: "text.secondary", fontWeight: 600,
              }}>{trendLabel}</Box>
            )}
          </Box>
        )}
      </Paper>
    </motion.div>
  );
}

/* ════════════════════════════════════════════════
   دکمه سریع
   ════════════════════════════════════════════════ */
function QuickBtn({ icon, label, color, bg, onClick }) {
  return (
    <motion.div variants={hoverV} initial="rest" whileHover="hover" whileTap={{ scale: 0.96 }}>
      <Paper elevation={0} onClick={onClick} sx={{
        display: "flex", flexDirection: "column", alignItems: "center",
        gap: { xs: 0.4, sm: 1 }, p: { xs: 1, sm: 2.5 },
        borderRadius: { xs: 2.5, sm: 4 }, cursor: "pointer",
        border: "1.5px solid", borderColor: (t) => alpha(t.palette.divider, 0.5),
        position: "relative", overflow: "hidden",
        transition: "border-color 0.3s, box-shadow 0.3s",
        "&:hover": {
          borderColor: alpha(color, 0.4),
          boxShadow: `0 8px 28px -4px ${alpha(color, 0.2)}`,
        },
      }}>
        <Box sx={{
          width: { xs: 36, sm: 50 }, height: { xs: 36, sm: 50 },
          borderRadius: { xs: 2, sm: 3 },
          display: "flex", alignItems: "center", justifyContent: "center",
          background: bg, color,
          "& .MuiSvgIcon-root": { fontSize: { xs: 18, sm: 22 } },
        }}>
          {icon}
        </Box>
        <Box sx={{
          fontSize: { xs: 9, sm: 13 }, fontWeight: 800,
          textAlign: "center", lineHeight: 1.2, maxWidth: "100%",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {label}
        </Box>
      </Paper>
    </motion.div>
  );
}

/* ════════════════════════════════════════════════
   نمودار فروش
   ════════════════════════════════════════════════ */
function SalesChart({ data, isRtl, isMobile }) {
  const chartData = {
    labels: data?.labels || [],
    datasets: [
      {
        label: isRtl ? "فروش" : "Sales",
        data: data?.sales || [],
        backgroundColor: (ctx) => {
          if (!ctx.chart?.ctx) return "rgba(255,107,53,0.15)";
          const g = ctx.chart.ctx.createLinearGradient(0, 0, 0, ctx.chart.height);
          g.addColorStop(0, "rgba(255,107,53,0.3)");
          g.addColorStop(1, "rgba(255,107,53,0.01)");
          return g;
        },
        borderColor: P.orange,
        borderWidth: isMobile ? 1 : 2.5,
        borderRadius: isMobile ? 3 : 10,
        borderSkipped: false, yAxisID: "y", order: 2,
      },
      {
        label: isRtl ? "سفارشات" : "Orders",
        data: data?.orders || [],
        type: "line",
        borderColor: P.blue,
        backgroundColor: (ctx) => {
          if (!ctx.chart?.ctx) return "rgba(59,130,246,0.08)";
          const g = ctx.chart.ctx.createLinearGradient(0, 0, 0, ctx.chart.height);
          g.addColorStop(0, "rgba(59,130,246,0.18)");
          g.addColorStop(1, "rgba(59,130,246,0.01)");
          return g;
        },
        borderWidth: isMobile ? 1.5 : 2.5,
        pointRadius: isMobile ? 1.5 : 5,
        pointBackgroundColor: "#fff",
        pointBorderColor: P.blue,
        pointBorderWidth: isMobile ? 1 : 2,
        fill: true, tension: 0.4, yAxisID: "y1", order: 1,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: "index", intersect: false },
    animation: { duration: 900 },
    plugins: {
      legend: {
        display: true, position: "top", rtl: isRtl,
        labels: {
          font: { family: "Vazirmatn", size: isMobile ? 7 : 11 },
          padding: isMobile ? 4 : 14,
          usePointStyle: true,
          boxWidth: isMobile ? 5 : 8,
        },
      },
      tooltip: {
        rtl: isRtl,
        backgroundColor: "rgba(17,17,17,0.94)",
        titleFont: { family: "Vazirmatn", size: isMobile ? 10 : 12 },
        bodyFont: { family: "Vazirmatn", size: isMobile ? 9 : 11 },
        padding: isMobile ? 6 : 12,
        cornerRadius: isMobile ? 8 : 12,
        callbacks: {
          label: (ctx) =>
            ctx.datasetIndex === 0
              ? ` ${fmtPrice(ctx.raw)}`
              : ` ${toFa(ctx.raw)}`,
        },
      },
    },
    scales: {
      x: {
        grid: { display: false }, border: { display: false },
        ticks: {
          font: { family: "Vazirmatn", size: isMobile ? 7 : 11 },
          maxRotation: isMobile ? 60 : 0,
          padding: isMobile ? 2 : 4,
        },
      },
      y: {
        position: isRtl ? "right" : "left",
        grid: { color: "rgba(0,0,0,0.03)" }, border: { display: false },
        ticks: {
          font: { family: "Vazirmatn", size: isMobile ? 7 : 11 },
          padding: isMobile ? 2 : 6,
          callback: (v) => fmtShort(v),
        },
      },
      y1: {
        position: isRtl ? "left" : "right",
        grid: { display: false }, border: { display: false },
        ticks: {
          font: { family: "Vazirmatn", size: isMobile ? 7 : 11 },
          padding: isMobile ? 2 : 6,
        },
      },
    },
  };
  return <Bar data={chartData} options={options} />;
}

/* ════════════════════════════════════════════════
   نمودار دسته‌بندی
   ════════════════════════════════════════════════ */
function CategoryChart({ data, isRtl, isMobile }) {
  const chartData = {
    labels: data?.labels || [],
    datasets: [{
      data: data?.values || [],
      backgroundColor: [P.orange, P.blue, P.green, P.purple, P.yellow, P.red, P.cyan, P.pink],
      borderWidth: 0,
      hoverOffset: isMobile ? 3 : 10,
      borderRadius: 4, spacing: 2,
    }],
  };
  const options = {
    responsive: true, maintainAspectRatio: false,
    cutout: isMobile ? "45%" : "60%",
    animation: { duration: 1000 },
    plugins: {
      legend: {
        position: "bottom", rtl: isRtl,
        labels: {
          font: { family: "Vazirmatn", size: isMobile ? 7 : 11 },
          padding: isMobile ? 4 : 12,
          usePointStyle: true,
          boxWidth: isMobile ? 5 : 8,
        },
      },
      tooltip: {
        rtl: isRtl,
        backgroundColor: "rgba(17,17,17,0.94)",
        titleFont: { family: "Vazirmatn", size: isMobile ? 10 : 12 },
        bodyFont: { family: "Vazirmatn", size: isMobile ? 9 : 11 },
        padding: isMobile ? 6 : 12,
        cornerRadius: isMobile ? 8 : 12,
        callbacks: {
          label: (ctx) => {
            const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
            return ` ${ctx.label}: ${fmtPrice(ctx.raw)} (${total > 0 ? ((ctx.raw / total) * 100).toFixed(1) : 0}%)`;
          },
        },
      },
    },
  };
  return <Doughnut data={chartData} options={options} />;
}

/* ════════════════════════════════════════════════
   مینی sparkline
   ════════════════════════════════════════════════ */
function MiniSparkline({ data = [], color, height = 32 }) {
  const chartData = {
    labels: data.map((_, i) => i),
    datasets: [{
      data, borderColor: color,
      backgroundColor: (ctx) => {
        if (!ctx.chart?.ctx) return "transparent";
        const g = ctx.chart.ctx.createLinearGradient(0, 0, 0, ctx.chart.height);
        g.addColorStop(0, alpha(color, 0.25));
        g.addColorStop(1, "transparent");
        return g;
      },
      borderWidth: 2, fill: true, tension: 0.4, pointRadius: 0,
    }],
  };
  const options = {
    responsive: true, maintainAspectRatio: false,
    animation: { duration: 800 },
    plugins: { legend: { display: false }, tooltip: { enabled: false } },
    scales: { x: { display: false }, y: { display: false } },
  };
  return (
    <Box sx={{ height, width: "100%" }}>
      <Line data={chartData} options={options} />
    </Box>
  );
}

/* ════════════════════════════════════════════════
   بار پیشرفت
   ════════════════════════════════════════════════ */
function CatBar({ name, value, color, maxVal }) {
  const pct = maxVal > 0 ? (value / maxVal) * 100 : 0;
  return (
    <Box sx={{ mb: { xs: 0.75, sm: 1.25 } }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", mb: 0.4, alignItems: "center" }}>
        <Box component="span" sx={{
          fontSize: { xs: 10, sm: 12 }, fontWeight: 700,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          maxWidth: "60%",
        }}>{name}</Box>
        <Box component="span" sx={{
          fontSize: { xs: 9, sm: 11 }, fontWeight: 700,
          color: "text.secondary", direction: "ltr", flexShrink: 0,
        }}>{fmtPrice(value)}</Box>
      </Box>
      <LinearProgress variant="determinate" value={pct} sx={{
        height: { xs: 4, sm: 6 }, borderRadius: 3,
        backgroundColor: alpha(color, 0.08),
        "& .MuiLinearProgress-bar": {
          borderRadius: 3,
          background: `linear-gradient(90deg, ${color}, ${alpha(color, 0.6)})`,
        },
      }} />
    </Box>
  );
}

/* ════════════════════════════════════════════════
   نمودار ساعت شلوغ
   ════════════════════════════════════════════════ */
function PeakHoursChart({ data, isRtl, isMobile }) {
  const hours = data?.hours || ["11","12","13","14","15","16","17","18","19","20","21","22"];
  const values = data?.values || [5,12,25,18,8,6,15,28,35,30,20,10];
  const maxV = Math.max(...values, 1);

  const colors = values.map((v) => {
    const r = v / maxV;
    if (r >= 0.75) return P.red;
    if (r >= 0.5) return P.orange;
    if (r >= 0.25) return P.yellow;
    return P.green;
  });

  const chartData = {
    labels: hours.map((h) => h + (isRtl ? ":۰۰" : ":00")),
    datasets: [{
      data: values,
      backgroundColor: colors.map((c) => alpha(c, 0.7)),
      borderColor: colors,
      borderWidth: isMobile ? 1 : 1.5,
      borderRadius: isMobile ? 3 : 6,
      borderSkipped: false,
    }],
  };

  const options = {
    responsive: true, maintainAspectRatio: false,
    animation: { duration: 900 },
    plugins: {
      legend: { display: false },
      tooltip: {
        rtl: isRtl,
        backgroundColor: "rgba(17,17,17,0.94)",
        titleFont: { family: "Vazirmatn", size: isMobile ? 9 : 11 },
        bodyFont: { family: "Vazirmatn", size: isMobile ? 9 : 11 },
        padding: isMobile ? 6 : 10,
        cornerRadius: isMobile ? 6 : 10,
        callbacks: {
          label: (ctx) => ` ${isRtl ? "سفارش:" : "Orders:"} ${toFa(ctx.raw)}`,
        },
      },
    },
    scales: {
      x: {
        grid: { display: false }, border: { display: false },
        ticks: {
          font: { family: "Vazirmatn", size: isMobile ? 6 : 10 },
          maxRotation: isMobile ? 70 : 0,
          padding: isMobile ? 1 : 4,
        },
      },
      y: {
        grid: { color: "rgba(0,0,0,0.03)" }, border: { display: false },
        ticks: {
          font: { family: "Vazirmatn", size: isMobile ? 7 : 10 },
          padding: isMobile ? 2 : 4,
        },
      },
    },
  };
  return <Bar data={chartData} options={options} />;
}

/* ════════════════════════════════════════════════
   صفحه اصلی داشبورد
   ════════════════════════════════════════════════ */
export default function Dashboard() {
  const { isRtl } = useLang();
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [currentTime, setCurrentTime] = useState(getTimeNow(isRtl));

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(getTimeNow(isRtl)), 60000);
    return () => clearInterval(timer);
  }, [isRtl]);

  /* ── API ── */
  const { data: reportData, isLoading: reportLoading, refetch: refetchReport } = useQuery({
    queryKey: ["dailyReport"],
    queryFn: () => dashboardApi.dailyReport({ date: "" }).then((r) => r.data),
    refetchInterval: 60000, staleTime: 30000,
  });

  const { data: closeData, refetch: refetchClose } = useQuery({
    queryKey: ["closeSummary"],
    queryFn: () => dashboardApi.closeSummary().then((r) => r.data),
    staleTime: 60000,
  });

  const { data: ordersData, refetch: refetchOrders } = useQuery({
    queryKey: ["recentOrders"],
    queryFn: () => dashboardApi.orders({ limit: 10, _: Date.now() }).then((r) => r.data),
    refetchInterval: 30000, staleTime: 15000,
  });

  const handleRefresh = useCallback(() => {
    refetchReport();
    refetchClose();
    refetchOrders();
    setLastRefresh(new Date());
  }, [refetchReport, refetchClose, refetchOrders]);

  /* ── محاسبات ── */
  const stats = useMemo(() => {
    const sales = reportData?.total_sales || 0;
    const orders = reportData?.order_count || 0;
    const stock = closeData?.kitchen_items?.length || 0;
    const avg = orders > 0 ? Math.round(sales / orders) : 0;
    return { sales, orders, stock, avg };
  }, [reportData, closeData]);

  const salesChartData = useMemo(() => {
    const def = isRtl
      ? ["شنبه","یکشنبه","دوشنبه","سه‌شنبه","چهارشنبه","پنجشنبه","جمعه"]
      : ["Sat","Sun","Mon","Tue","Wed","Thu","Fri"];
    if (!reportData?.weekly_sales) {
      return { labels: def, sales: Array(7).fill(0), orders: Array(7).fill(0) };
    }
    return {
      labels: reportData.labels || def,
      sales: reportData.weekly_sales,
      orders: reportData.weekly_orders || Array(7).fill(0),
    };
  }, [reportData, isRtl]);

  const catChartData = useMemo(() => {
    if (!reportData?.category_sales?.length) {
      return {
        labels: isRtl
          ? ["غذای اصلی","پیش‌غذا","نوشیدنی","دسر","سالاد"]
          : ["Main","Appetizer","Drink","Dessert","Salad"],
        values: [35,20,18,15,12],
      };
    }
    return {
      labels: reportData.category_sales.map((c) => c.name),
      values: reportData.category_sales.map((c) => c.total),
    };
  }, [reportData, isRtl]);

  const topItems = useMemo(() => reportData?.top_items || [], [reportData]);
  const peakHoursData = useMemo(() => reportData?.peak_hours || null, [reportData]);

  /* ── فعالیت‌ها ── */
  const activities = useMemo(() => {
    const list = [];
    const orders = ordersData?.results || ordersData || [];
    const sm = STATUS_MAP[isRtl ? "fa" : "en"];
    if (Array.isArray(orders)) {
      orders.slice(0, isMobile ? 3 : 6).forEach((o) => {
        const s = sm[o.status] || { text: o.status, color: P.blue };
        list.push({
          color: s.color,
          text: `#${toFa(o.id)} — ${s.text}`,
          time: o.time || o.created_at || "",
          icon: <ShoppingCart />,
        });
      });
    }
    list.push({
      color: P.green,
      text: isRtl ? "سیستم آماده" : "System ready",
      time: isRtl ? "اکنون" : "Now",
      icon: <Router />,
    });
    return list;
  }, [ordersData, isRtl, isMobile]);

  /* ── آنالیز سفارشات ── */
  const orderAnalysis = useMemo(() => {
    const orders = ordersData?.results || ordersData || [];
    if (!Array.isArray(orders) || orders.length === 0) {
      return {
        byStatus: { pending: 0, preparing: 0, ready: 0, delivered: 0, cancelled: 0 },
        total: 0, cancelRate: 0, activeOrders: 0, statusBreakdown: [],
      };
    }
    const total = orders.length;
    const byStatus = { pending: 0, preparing: 0, ready: 0, delivered: 0, cancelled: 0 };
    orders.forEach((o) => { if (byStatus[o.status] !== undefined) byStatus[o.status]++; });
    const activeOrders = byStatus.pending + byStatus.preparing + byStatus.ready;
    const cancelRate = total > 0 ? Math.round((byStatus.cancelled / total) * 100) : 0;
    const statusBreakdown = Object.entries(byStatus).map(([key, count]) => {
      const s = STATUS_MAP[isRtl ? "fa" : "en"][key] || { text: key, color: P.blue };
      return { ...s, key, count, pct: total > 0 ? Math.round((count / total) * 100) : 0 };
    });
    return { byStatus, total, cancelRate, activeOrders, statusBreakdown };
  }, [ordersData, isRtl]);

  /* ── توصیه‌ها ── */
  const insights = useMemo(() => {
    const list = [];
    const { orders, avg } = stats;
    if (orders === 0 && !reportLoading) {
      list.push({
        type: "info",
        icon: <AccessTime sx={{ fontSize: { xs: 14, sm: 16 } }} />,
        text: isRtl ? "هنوز سفارشی ثبت نشده" : "No orders yet",
      });
    }
    if (orders > 20) {
      list.push({
        type: "success",
        icon: <Star sx={{ fontSize: { xs: 14, sm: 16 } }} />,
        text: isRtl ? `${toFa(orders)} سفارش امروز!` : `${toFa(orders)} orders today!`,
      });
    }
    if (orderAnalysis.cancelRate > 10) {
      list.push({
        type: "warning",
        icon: <Warning sx={{ fontSize: { xs: 14, sm: 16 } }} />,
        text: isRtl ? `نرخ لغو ${orderAnalysis.cancelRate}%` : `Cancel rate ${orderAnalysis.cancelRate}%`,
      });
    }
    if (orderAnalysis.activeOrders > 5) {
      list.push({
        type: "info",
        icon: <Speed sx={{ fontSize: { xs: 14, sm: 16 } }} />,
        text: isRtl ? `${toFa(orderAnalysis.activeOrders)} سفارش فعال` : `${orderAnalysis.activeOrders} active orders`,
      });
    }
    if (avg > 0) {
      list.push({
        type: "success",
        icon: <CheckCircle sx={{ fontSize: { xs: 14, sm: 16 } }} />,
        text: isRtl ? `میانگین: ${fmtPrice(avg)}` : `Avg: ${fmtPrice(avg)}`,
      });
    }
    return list;
  }, [stats, orderAnalysis, reportLoading, isRtl]);

  /* ── لینک‌ها ── */
  const quickLinks = [
    { icon: <PointOfSale />, label: isRtl ? "صندوق" : "POS", color: P.orange, bg: alpha(P.orange, 0.1), path: "/pos" },
    { icon: <AddBox />, label: isRtl ? "سفارش" : "Order", color: P.blue, bg: alpha(P.blue, 0.1), path: "/orders" },
    { icon: <NoteAdd />, label: isRtl ? "فاکتور" : "Invoice", color: P.green, bg: alpha(P.green, 0.1), path: "/invoices" },
    { icon: <Restaurant />, label: isRtl ? "آشپزخانه" : "Kitchen", color: P.purple, bg: alpha(P.purple, 0.1), path: "/kitchen" },
  ];

  const rankC = [
    { bg: alpha(P.orange, 0.14), color: P.orange },
    { bg: alpha(P.blue, 0.12), color: P.blue },
    { bg: alpha(P.green, 0.12), color: P.green },
    { bg: alpha("#6b7280", 0.1), color: "#6b7280" },
  ];

  const papSx = {
    borderRadius: { xs: 2.5, sm: 4 },
    overflow: "hidden",
    border: "1.5px solid",
    borderColor: (t) => alpha(t.palette.divider, 0.5),
    transition: "box-shadow 0.3s",
    "&:hover": { boxShadow: 3 },
  };

  const statCards = [
    {
      icon: <AttachMoney />, value: stats.sales,
      label: isRtl ? "فروش امروز" : "Sales Today",
      gradient: `linear-gradient(90deg, ${P.orange}, ${P.orangeLight})`,
      color: P.orange, suffix: " ت",
      trend: 12, trendLabel: isRtl ? "دیروز" : "vs yesterday",
    },
    {
      icon: <Receipt />, value: stats.orders,
      label: isRtl ? "سفارشات" : "Orders",
      gradient: `linear-gradient(90deg, ${P.blue}, ${P.blueLight})`,
      color: P.blue, trend: 8,
    },
    {
      icon: <Inventory />, value: stats.stock,
      label: isRtl ? "اقلام" : "Items",
      gradient: `linear-gradient(90deg, ${P.purple}, ${P.purpleLight})`,
      color: P.purple,
    },
    {
      icon: <TrendingUp />, value: stats.avg,
      label: isRtl ? "میانگین" : "Avg. Order",
      gradient: `linear-gradient(90deg, ${P.green}, ${P.greenLight})`,
      color: P.green, suffix: " ت",
      trend: -3, trendLabel: isRtl ? "هفته قبل" : "vs last week",
    },
  ];

  return (
    <Box sx={{
      p: { xs: 1.25, sm: 2, md: 3 },
      maxWidth: 1440, mx: "auto",
      overflow: "hidden", width: "100%",
    }}>
      <motion.div variants={containerV} initial="hidden" animate="show">

        {/* ═══ هدر ═══ */}
        <AnimSec delay={0}>
          <Box sx={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            mb: { xs: 1.5, sm: 3 }, flexWrap: "wrap", gap: { xs: 0.5, sm: 1 },
          }}>
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Box sx={{ display: "flex", alignItems: "baseline", gap: 0.5, flexWrap: "wrap" }}>
                <Typography variant="h5" sx={{
                  fontWeight: 900, letterSpacing: -0.5,
                  fontSize: { xs: 15, sm: 20, md: 26 },
                  background: `linear-gradient(135deg, ${P.orange}, ${P.orangeLight})`,
                  backgroundClip: "text", WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                }}>
                  {isRtl ? "خوش آمدید،" : "Welcome,"}
                </Typography>
                <Typography variant="h5" sx={{
                  fontWeight: 900, letterSpacing: -0.5,
                  fontSize: { xs: 15, sm: 20, md: 26 },
                }}>
                  {isRtl ? "مدیر گرامی" : "Dear Manager"}
                </Typography>
              </Box>
              <Typography sx={{
                fontSize: { xs: 10, sm: 12, md: 14 },
                color: "text.secondary", fontWeight: 600, mt: 0.2,
              }}>
                {isRtl ? "خلاصه عملکرد امروز رستوران شما" : "Today's restaurant performance"}
              </Typography>
            </Box>
            <Box sx={{
              display: "flex", alignItems: "center",
              gap: { xs: 0.5, sm: 0.75 }, flexShrink: 0,
            }}>
              <Tooltip title={isRtl ? "بروزرسانی" : "Refresh"} arrow>
                <IconButton onClick={handleRefresh} size="small" sx={{
                  width: { xs: 30, sm: 36 }, height: { xs: 30, sm: 36 },
                  border: "1.5px solid", borderColor: "divider",
                  borderRadius: 2, transition: "all 0.4s",
                  "&:hover": {
                    borderColor: P.orange,
                    background: alpha(P.orange, 0.06),
                    "& svg": { transform: "rotate(180deg)" },
                  },
                  "& svg": { transition: "transform 0.6s ease", fontSize: { xs: 16, sm: 20 } },
                }}>
                  <Refresh fontSize="inherit" />
                </IconButton>
              </Tooltip>
              {!isMobile && (
                <Chip
                  icon={<Schedule sx={{ fontSize: "14px !important" }} />}
                  label={getTodayDate(isRtl)}
                  sx={{
                    fontWeight: 700, fontSize: { sm: 10, md: 12 },
                    px: 0.5, py: 2, borderRadius: 2,
                    border: "1.5px solid", borderColor: "divider",
                    background: "background.paper",
                    "& .MuiChip-icon": { color: "text.secondary" },
                    "& .MuiChip-label": { px: { sm: 0.5, md: 1 } },
                  }}
                />
              )}
            </Box>
          </Box>
        </AnimSec>

        {/* ═══ آمار ═══ */}
        <Grid container spacing={{ xs: 1, sm: 2 }} sx={{ mb: { xs: 1.5, sm: 3 } }}>
          {statCards.map((card, i) => (
            <Grid size={{ xs: 6, sm: 6, md: 3 }} key={i}>
              <AnimSec delay={i + 1}>
                <StatCard
                  {...card}
                  loading={reportLoading && i < 2}
                  trend={reportData?.success ? card.trend : undefined}
                />
              </AnimSec>
            </Grid>
          ))}
        </Grid>

        {/* ═══ دسترسی سریع ═══ */}
        <Grid container spacing={{ xs: 1, sm: 1.5 }} sx={{ mb: { xs: 1.5, sm: 3 } }}>
          {quickLinks.map((link, i) => (
            <Grid size={{ xs: 3, sm: 3, md: 3 }} key={link.path}>
              <AnimSec delay={i + 5}>
                <QuickBtn {...link} onClick={() => navigate(link.path)} />
              </AnimSec>
            </Grid>
          ))}
        </Grid>

        {/* ═══ توصیه‌ها ═══ */}
        {insights.length > 0 && (
          <AnimSec delay={9}>
            <Box sx={{ mb: { xs: 1.5, sm: 3 } }}>
              <Grid container spacing={{ xs: 0.75, sm: 1 }}>
                {insights.map((ins, i) => (
                  <Grid size={{ xs: 12, sm: 6, md: 4 }} key={i}>
                    <Alert severity={ins.type} icon={ins.icon} sx={{
                      borderRadius: { xs: 2, sm: 3 },
                      fontSize: { xs: 10, sm: 13 }, fontWeight: 600,
                      py: { xs: 0.25, sm: 0.5 }, px: { xs: 1, sm: 1.5 },
                      "& .MuiAlert-icon": { fontSize: { xs: 14, sm: 20 } },
                      "& .MuiAlert-message": { py: 0 },
                    }}>
                      {ins.text}
                    </Alert>
                  </Grid>
                ))}
              </Grid>
            </Box>
          </AnimSec>
        )}

        {/* ═══ نمودارها ═══ */}
        <Grid container spacing={{ xs: 1.5, sm: 2 }} sx={{ mb: { xs: 1.5, sm: 3 } }}>
          <Grid size={{ xs: 12, md: 8 }}>
            <AnimSec delay={10}>
              <Paper elevation={0} sx={papSx}>
                <Box sx={{ p: { xs: 1.25, sm: 2.5 } }}>
                  <SecHead icon={<TrendingUp />}
                    title={isRtl ? "فروش ۷ روز اخیر" : "Last 7 Days"}
                    color={P.orange}
                    right={
                      <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
                        {!isMobile && salesChartData.sales.some((v) => v > 0) && (
                          <Box sx={{ width: 50, height: 24 }}>
                            <MiniSparkline data={salesChartData.sales} color={P.orange} height={24} />
                          </Box>
                        )}
                        <Chip label={isRtl ? "هفته" : "Week"} size="small"
                          sx={{
                            fontWeight: 700, fontSize: { xs: 8, sm: 10 },
                            background: `linear-gradient(135deg, ${P.orange}, ${P.orangeLight})`,
                            color: "#fff", borderRadius: 1.5,
                            height: { xs: 18, sm: 22 },
                          }} />
                      </Box>
                    } />
                  <Box sx={{ height: { xs: 170, sm: 250, md: 290 }, minWidth: 0 }}>
                    <SalesChart data={salesChartData} isRtl={isRtl} isMobile={isMobile} />
                  </Box>
                </Box>
              </Paper>
            </AnimSec>
          </Grid>

          <Grid size={{ xs: 12, md: 4 }}>
            <AnimSec delay={11}>
              <Paper elevation={0} sx={papSx}>
                <Box sx={{ p: { xs: 1.25, sm: 2.5 } }}>
                  <SecHead icon={<PieChart />}
                    title={isRtl ? "دسته‌بندی فروش" : "By Category"}
                    color={P.purple} />
                  <Box sx={{ height: { xs: 130, sm: 180 }, mb: { xs: 1, sm: 1.5 }, minWidth: 0 }}>
                    <CategoryChart data={catChartData} isRtl={isRtl} isMobile={isMobile} />
                  </Box>
                  <Divider sx={{ mb: { xs: 0.75, sm: 1.25 } }} />
                  {catChartData.labels.slice(0, isMobile ? 3 : 5).map((name, i) => {
                    const maxVal = Math.max(...(catChartData.values || [1]));
                    const colors = [P.orange, P.blue, P.green, P.purple, P.yellow];
                    return (
                      <CatBar key={i} name={name} value={catChartData.values[i]}
                        color={colors[i % 5]} maxVal={maxVal} />
                    );
                  })}
                </Box>
              </Paper>
            </AnimSec>
          </Grid>
        </Grid>

        {/* ═══ آنالیز + ساعت شلوغ ═══ */}
        <Grid container spacing={{ xs: 1.5, sm: 2 }} sx={{ mb: { xs: 1.5, sm: 3 } }}>
          <Grid size={{ xs: 12, sm: 6 }}>
            <AnimSec delay={12}>
              <Paper elevation={0} sx={papSx}>
                <Box sx={{ p: { xs: 1.25, sm: 2.5 } }}>
                  <SecHead icon={<Speed />}
                    title={isRtl ? "تحلیل وضعیت سفارشات" : "Order Status"}
                    color={P.cyan}
                    right={
                      <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                        <LiveDot color={P.green} size={isMobile ? 5 : 8} />
                        <Box component="span" sx={{
                          fontSize: { xs: 9, sm: 12 },
                          color: "text.secondary", fontWeight: 700,
                        }}>
                          {toFa(orderAnalysis.total)} {isRtl ? "سفارش" : "orders"}
                        </Box>
                      </Box>
                    } />

                  <Box sx={{ display: "flex", flexDirection: "column", gap: { xs: 0.5, sm: 1 } }}>
                    {orderAnalysis.statusBreakdown.map((s) => (
                      <Box key={s.key} sx={{
                        display: "flex", alignItems: "center",
                        gap: { xs: 0.5, sm: 1.5 },
                        p: { xs: 0.75, sm: 1.5 },
                        borderRadius: { xs: 2, sm: 2.5 },
                        background: alpha(s.color, 0.04),
                        border: `1px solid ${alpha(s.color, 0.12)}`,
                      }}>
                        <Box sx={{
                          width: { xs: 28, sm: 40 }, height: { xs: 28, sm: 40 },
                          borderRadius: { xs: 1.5, sm: 2 },
                          display: "flex", alignItems: "center", justifyContent: "center",
                          background: alpha(s.color, 0.12), color: s.color,
                          fontSize: { xs: 12, sm: 18 }, fontWeight: 900, flexShrink: 0,
                        }}>
                          {toFa(s.count)}
                        </Box>
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Box sx={{
                            display: "flex", justifyContent: "space-between",
                            mb: 0.3, alignItems: "center",
                          }}>
                            <Box component="span" sx={{
                              fontSize: { xs: 10, sm: 13 }, fontWeight: 700,
                            }}>{s.text}</Box>
                            <Box component="span" sx={{
                              fontSize: { xs: 9, sm: 12 }, fontWeight: 800,
                              color: s.color, flexShrink: 0,
                            }}>{s.pct}%</Box>
                          </Box>
                          <LinearProgress variant="determinate" value={s.pct} sx={{
                            height: { xs: 3, sm: 6 }, borderRadius: 3,
                            backgroundColor: alpha(s.color, 0.08),
                            "& .MuiLinearProgress-bar": { borderRadius: 3, background: s.color },
                          }} />
                        </Box>
                      </Box>
                    ))}
                  </Box>

                  {orderAnalysis.cancelRate > 0 && (
                    <Box sx={{
                      mt: { xs: 1, sm: 1.5 }, p: { xs: 0.75, sm: 1.25 },
                      borderRadius: 2,
                      background: alpha(orderAnalysis.cancelRate > 10 ? P.red : P.yellow, 0.06),
                      border: `1px solid ${alpha(orderAnalysis.cancelRate > 10 ? P.red : P.yellow, 0.15)}`,
                    }}>
                      <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                        <Warning sx={{
                          fontSize: { xs: 12, sm: 14 },
                          color: orderAnalysis.cancelRate > 10 ? P.red : P.yellow,
                        }} />
                        <Box component="span" sx={{
                          fontSize: { xs: 9, sm: 12 }, fontWeight: 700,
                        }}>
                          {isRtl
                            ? `نرخ لغو: ${orderAnalysis.cancelRate}%`
                            : `Cancel rate: ${orderAnalysis.cancelRate}%`}
                        </Box>
                      </Box>
                    </Box>
                  )}
                </Box>
              </Paper>
            </AnimSec>
          </Grid>

          <Grid size={{ xs: 12, sm: 6 }}>
            <AnimSec delay={13}>
              <Paper elevation={0} sx={papSx}>
                <Box sx={{ p: { xs: 1.25, sm: 2.5 } }}>
                  <SecHead icon={<AccessTime />}
                    title={isRtl ? "ساعات اوج سفارش" : "Peak Hours"}
                    color={P.orange}
                    right={
                      <Chip label={isRtl ? "امروز" : "Today"} size="small"
                        sx={{
                          fontWeight: 700, fontSize: { xs: 8, sm: 10 },
                          background: alpha(P.orange, 0.1), color: P.orange,
                          borderRadius: 1.5, height: { xs: 18, sm: 22 },
                        }} />
                    } />
                  <Box sx={{ height: { xs: 150, sm: 200, md: 220 }, minWidth: 0 }}>
                    <PeakHoursChart data={peakHoursData} isRtl={isRtl} isMobile={isMobile} />
                  </Box>
                </Box>
              </Paper>
            </AnimSec>
          </Grid>
        </Grid>

        {/* ═══ جداول ═══ */}
        <Grid container spacing={{ xs: 1.5, sm: 2 }}>
          {/* پرفروش‌ها */}
          <Grid size={{ xs: 12, md: 6 }}>
            <AnimSec delay={14}>
              <Paper elevation={0} sx={papSx}>
                <Box sx={{
                  px: { xs: 1.25, sm: 2.5 }, py: { xs: 0.75, sm: 1.5 },
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  borderBottom: "1.5px solid",
                  borderColor: (t) => alpha(t.palette.divider, 0.5),
                  background: alpha(P.orange, 0.02),
                }}>
                  <SecHead icon={<EmojiEvents />}
                    title={isRtl ? "پرفروش‌ترین آیتم‌ها" : "Top Items"}
                    color={P.orange}
                    right={
                      <Chip
                        label={`${toFa(topItems.length)} ${isRtl ? "آیتم" : "items"}`}
                        size="small"
                        sx={{
                          fontWeight: 800, fontSize: { xs: 8, sm: 10 },
                          background: alpha(P.orange, 0.1), color: P.orange,
                          borderRadius: 1.5, height: { xs: 18, sm: 22 },
                        }} />
                    } />
                </Box>
                <TableContainer sx={{
                  overflow: "auto",
                  "&::-webkit-scrollbar": { height: 3 },
                  "&::-webkit-scrollbar-thumb": { background: "rgba(0,0,0,0.1)", borderRadius: 3 },
                }}>
                  <Table size="small" sx={{ minWidth: isMobile ? 260 : 300 }}>
                    <TableHead>
                      <TableRow>
                        {(isRtl
                          ? ["رتبه","نام","تعداد","فروش"]
                          : ["#","Name","Qty","Sales"]
                        ).map((h) => (
                          <TableCell key={h} sx={{
                            fontWeight: 700, fontSize: { xs: 9, sm: 12 },
                            color: "text.secondary", textAlign: "center",
                            borderBottom: "1.5px solid", borderColor: "divider",
                            py: { xs: 0.5, sm: 1.2 }, px: { xs: 0.5, sm: 1.5 },
                          }}>{h}</TableCell>
                        ))}
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {topItems.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={4} sx={{
                            textAlign: "center",
                            py: { xs: 2, sm: 4 },
                            color: "text.secondary",
                            fontSize: { xs: 11, sm: 13 },
                          }}>
                            {reportLoading
                              ? <Skeleton variant="rounded" width={80} height={16}
                                  animation="wave" sx={{ borderRadius: 1, mx: "auto" }} />
                              : (isRtl ? "هنوز سفارشی ثبت نشده" : "No orders yet")}
                          </TableCell>
                        </TableRow>
                      ) : topItems.slice(0, isMobile ? 5 : 10).map((item, i) => {
                        const rc = rankC[Math.min(i, 3)];
                        return (
                          <TableRow key={i} sx={{
                            transition: "background 0.2s",
                            "&:hover": { background: alpha(P.orange, 0.04) },
                            "&:last-child td": { border: 0 },
                          }}>
                            <TableCell sx={{
                              textAlign: "center",
                              py: { xs: 0.5, sm: 1.2 },
                              px: { xs: 0.5, sm: 1.5 },
                            }}>
                              <Box sx={{
                                width: { xs: 20, sm: 28 }, height: { xs: 20, sm: 28 },
                                borderRadius: 1.5, display: "inline-flex",
                                alignItems: "center", justifyContent: "center",
                                fontSize: { xs: 9, sm: 12 }, fontWeight: 900,
                                background: rc.bg, color: rc.color,
                              }}>{toFa(i + 1)}</Box>
                            </TableCell>
                            <TableCell sx={{
                              fontWeight: 600, textAlign: "center",
                              fontSize: { xs: 10, sm: 13 },
                              py: { xs: 0.5, sm: 1.2 }, px: { xs: 0.5, sm: 1.5 },
                              maxWidth: { xs: 80, sm: 120 },
                              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                            }}>{item.name}</TableCell>
                            <TableCell sx={{
                              textAlign: "center",
                              py: { xs: 0.5, sm: 1.2 },
                              px: { xs: 0.5, sm: 1.5 },
                            }}>
                              <Chip label={toFa(item.qty)} size="small" sx={{
                                fontWeight: 700, fontSize: { xs: 8, sm: 10 },
                                background: alpha(rc.color, 0.1), color: rc.color,
                                borderRadius: 1.5,
                                minWidth: { xs: 22, sm: 28 },
                                height: { xs: 17, sm: 20 },
                              }} />
                            </TableCell>
                            <TableCell sx={{
                              textAlign: "center", fontWeight: 700,
                              fontSize: { xs: 10, sm: 13 },
                              py: { xs: 0.5, sm: 1.2 }, px: { xs: 0.5, sm: 1.5 },
                              color: P.orange,
                            }}>{fmtPrice(item.total)}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Paper>
            </AnimSec>
          </Grid>

          {/* فعالیت‌ها */}
          <Grid size={{ xs: 12, md: 6 }}>
            <AnimSec delay={15}>
              <Paper elevation={0} sx={papSx}>
                <Box sx={{
                  px: { xs: 1.25, sm: 2.5 }, py: { xs: 0.75, sm: 1.5 },
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  borderBottom: "1.5px solid",
                  borderColor: (t) => alpha(t.palette.divider, 0.5),
                  background: alpha(P.blue, 0.02),
                }}>
                  <Box sx={{
                    display: "flex", alignItems: "center", gap: 0.75,
                    fontWeight: 800, fontSize: { xs: 12, sm: 15 },
                  }}>
                    <LocalActivity sx={{ color: P.blue, fontSize: { xs: 16, sm: 20 } }} />
                    {isRtl ? "آخرین فعالیت‌ها" : "Recent Activity"}
                  </Box>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                    <LiveDot color={P.green} size={isMobile ? 5 : 8} />
                    <Box component="span" sx={{
                      fontSize: { xs: 9, sm: 12 },
                      color: "text.secondary", fontWeight: 700,
                    }}>{isRtl ? "زنده" : "Live"}</Box>
                  </Box>
                </Box>
                <Box sx={{ py: 0.25 }}>
                  {activities.map((a, i) => (
                    <Box key={i} sx={{
                      display: "flex", alignItems: "center",
                      gap: { xs: 0.75, sm: 1.5 },
                      px: { xs: 1.25, sm: 2.5 },
                      py: { xs: 0.75, sm: 1.4 },
                      borderBottom: i < activities.length - 1 ? "1px solid" : "none",
                      borderColor: (t) => alpha(t.palette.divider, 0.35),
                      transition: "background 0.2s",
                      "&:hover": { background: alpha(a.color, 0.04) },
                    }}>
                      <Avatar sx={{
                        width: { xs: 24, sm: 30 }, height: { xs: 24, sm: 30 },
                        background: alpha(a.color, 0.12), color: a.color,
                        "& .MuiSvgIcon-root": { fontSize: { xs: 12, sm: 16 } },
                      }}>{a.icon}</Avatar>
                      <Box component="span" sx={{
                        flex: 1, fontSize: { xs: 10, sm: 13 }, fontWeight: 600,
                        lineHeight: 1.3, overflow: "hidden",
                        textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0,
                      }}>{a.text}</Box>
                      <Box component="span" sx={{
                        fontSize: { xs: 8, sm: 11 }, color: "text.secondary",
                        fontWeight: 700, whiteSpace: "nowrap", flexShrink: 0,
                      }}>{a.time}</Box>
                    </Box>
                  ))}
                </Box>
              </Paper>
            </AnimSec>
          </Grid>
        </Grid>

        {/* ═══ فوتر ═══ */}
        <AnimSec delay={16}>
          <Box sx={{
            mt: { xs: 2, sm: 4 }, pt: { xs: 1.5, sm: 2.5 },
            borderTop: "1.5px solid",
            borderColor: (t) => alpha(t.palette.divider, 0.3),
            display: "flex", justifyContent: "space-between", alignItems: "center",
            flexWrap: "wrap", gap: 0.75,
          }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
              <LiveDot color={P.green} size={isMobile ? 5 : 7} />
              <Box component="span" sx={{
                fontSize: { xs: 9, sm: 12 }, color: "text.secondary", fontWeight: 600,
              }}>{isRtl ? "سیستم فعال" : "Active"}</Box>
              <Chip size="small" label={currentTime} sx={{
                fontSize: { xs: 8, sm: 10 }, fontWeight: 700,
                height: { xs: 17, sm: 20 },
                background: alpha(P.green, 0.08), color: P.green,
                "& .MuiChip-label": { px: 0.75 },
              }} />
            </Box>
            <Box component="span" sx={{
              fontSize: { xs: 9, sm: 12 }, color: "text.secondary",
              fontWeight: 600, fontVariantNumeric: "tabular-nums",
            }}>
              {isRtl ? "بروزرسانی:" : "Updated:"}{" "}
              {lastRefresh.toLocaleTimeString(isRtl ? "fa-IR" : "en-US", {
                hour: "2-digit", minute: "2-digit",
              })}
            </Box>
          </Box>
        </AnimSec>

      </motion.div>
    </Box>
  );
}