import { useMemo } from "react";
import {
  Box,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  IconButton,
  CircularProgress,
  TextField,
} from "@mui/material";
import {
  Refresh,
  Today,
  BarChart as BarChartIcon,
  ChevronRight,
  ChevronLeft,
} from "@mui/icons-material";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";

/* ── Helpers ─────────────────────────────────── */
const fNum = (n) => String(n || 0).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
const toPersianDigits = (s) => String(s).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[d]);

/* ── رنگ‌های نمودار: سبز + طلایی ───────────── */
const CHART_COLORS = [
  "#6B9B6E", // سبز
  "#D4B76A", // طلایی
  "#A84060", // بورگاندی
  "#5B8DB8", // آبی
  "#8B7355", // قهوه‌ای
  "#7B68AE", // بنفش
  "#E07050", // نارنجی
  "#4A8A7A", // سبزآبی
];

const PAYMENT_COLORS = {
  cash: "#6B9B6E",
  card: "#D4B76A",
  online: "#5B8DB8",
};

const SOURCE_COLORS = {
  pos: "#6B9B6E",
  online: "#D4B76A",
};

/* ── Chart tooltip (قابل تنظیم برای تعداد یا مبلغ) ── */
function ChartTooltip({
  active,
  payload,
  isRtl,
  C,
  label = null,
  formatter = null,
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0];
  const fmt = formatter || ((v) => (isRtl ? toPersianDigits(v) : String(v)));
  return (
    <Box
      sx={{
        bgcolor: C.bg,
        border: `1px solid ${C.glassBorder}`,
        borderRadius: "10px",
        px: 1.5,
        py: 1,
        boxShadow: "0 8px 30px rgba(0,0,0,0.2)",
      }}
    >
      <Typography
        sx={{
          fontSize: 12,
          fontWeight: 700,
          color: C.text,
          fontFamily: "'Vazirmatn', sans-serif",
        }}
      >
        {d.payload?.name || d.name}
      </Typography>
      <Typography
        sx={{
          fontSize: 11,
          color: C.sub,
          fontFamily: "'Vazirmatn', sans-serif",
        }}
      >
        {label || (isRtl ? "تعداد:" : "Count:")} {fmt(d.value)}
      </Typography>
    </Box>
  );
}

/* ── Chart label for bars (قابل تنظیم برای تعداد یا مبلغ) ── */
const BarLabel = ({ x, y, width, value, C, formatter = null }) => {
  if (
    x == null ||
    y == null ||
    width == null ||
    isNaN(x) ||
    isNaN(y) ||
    isNaN(width)
  )
    return null;
  const fmt = formatter || ((v) => (isRtl ? toPersianDigits(v) : String(v)));
  return (
    <text
      x={Number(x) + Number(width) + 6}
      y={Number(y) + 14}
      fill={C.text}
      fontSize={11}
      fontWeight={700}
      fontFamily="'Vazirmatn', sans-serif"
    >
      {fmt(value)}
    </text>
  );
};

/* ── Date helpers ────────────────────────────── */
const todayStr = () => new Date().toISOString().split("T")[0];

// تابع تبدیل تاریخ میلادی به رشته شمسی (مثلاً ۱۴۰۳/۰۲/۲۵)
const toJalaliString = (gregorianDateStr) => {
  try {
    const d = new Date(gregorianDateStr + "T12:00:00");
    const formatter = new Intl.DateTimeFormat("en-US-u-ca-persian", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const parts = formatter.formatToParts(d);
    const y = parts.find((p) => p.type === "year")?.value;
    const m = parts.find((p) => p.type === "month")?.value;
    const day = parts.find((p) => p.type === "day")?.value;
    if (!y || !m || !day) return gregorianDateStr;
    return toPersianDigits(`${y}/${m}/${day}`);
  } catch {
    return gregorianDateStr;
  }
};

// ★ آپدیت: پشتیبانی از تقویم شمسی برای فارسی و میلادی برای انگلیسی
const fmtDate = (s, rtl) => {
  try {
    const d = new Date(s + "T12:00:00");
    return d.toLocaleDateString(rtl ? "fa-IR" : "en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return s;
  }
};

/* ── قیمت یک آیتم سفارش رو استخراج می‌کند ───── */
const getItemUnitPrice = (item) =>
  item.effective_price ??
  item.price ??
  (item.total && item.quantity ? item.total / item.quantity : 0) ??
  0;

/* ── استخراج نام آیتم بر اساس زبان ───── */
const getItemName = (item, isRtl) => {
  if (!isRtl) {
    return (
      item.name_en ||
      item.english_name ||
      item.title_en ||
      item.item_name_en ||
      item.product_name_en ||
      item.en_name ||
      item.name ||
      "Unknown"
    );
  }
  return item.name || "نامشخص";
};

/* ── استخراج نام مشتری بر اساس زبان ───── */
const getCustomerName = (c, isRtl) => {
  if (!isRtl) {
    // اگر نام انگلیسی وجود داشت بیاور، اگر نبود و نام فارسی "مشتری" بود، Guest نشون بده
    const enName = c.customer_name_en || c.english_name || c.name_en;
    if (enName) return enName;
    if (c.customer_name === "مشتری" || c.name === "مشتری") return "Guest";
    return c.customer_name || c.name || "Guest";
  }
  return c.customer_name || c.name || "مهمان";
};

/* ══════════════════════════════════════════════ */
export default function DailyReport({
  orders,
  loading,
  onRowClick,
  onReload,
  C,
  isRtl,
  selectedDate,
  isToday,
  onPrevDay,
  onNextDay,
  onGoToday,
  analytics,
}) {
  const statusInfo = (s) =>
    ({
      delivered: { label: isRtl ? "تحویل" : "Delivered", color: C.olive },
      confirmed: { label: isRtl ? "تایید" : "Confirmed", color: C.gold },
      pending: { label: isRtl ? "انتظار" : "Pending", color: C.muted },
      cancelled: { label: isRtl ? "لغو" : "Cancelled", color: C.danger },
    })[s] || { label: s, color: C.muted };

  const paymentLabel = (m) =>
    ({
      cash: isRtl ? "نقدی" : "Cash",
      card: isRtl ? "کارت" : "Card",
      online: isRtl ? "آنلاین" : "Online",
    })[m] ||
    m ||
    "—";

  const sourceLabel = (s) =>
    ({
      pos: isRtl ? "سالن" : "Hall",
      online: isRtl ? "بیرون" : "Takeout",
    })[s] ||
    s ||
    "—";

  // فقط سفارش‌های لغونشده رو برای محاسبه فروش واقعی در نظر می‌گیریم
  const activeOrders = useMemo(
    () => orders.filter((o) => o.status !== "cancelled"),
    [orders],
  );

  const dayTotal = activeOrders.reduce((s, o) => s + (o.total_price || 0), 0);
  const avgOrder = activeOrders.length
    ? Math.round(dayTotal / activeOrders.length)
    : 0;

  /* ── ★ پردرآمدترین محصولات (بر اساس مبلغ فروش) ── */
  const revenueByItem = useMemo(() => {
    const map = new Map();
    activeOrders.forEach((o) => {
      (o.items || []).forEach((item) => {
        const rev = getItemUnitPrice(item) * (item.quantity || 0);
        const key = getItemName(item, isRtl);
        map.set(key, (map.get(key) || 0) + rev);
      });
    });
    return [...map.entries()]
      .map(([name, revenue]) => ({ name, revenue }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 8);
  }, [activeOrders, isRtl]);

  /* ── ★ فروش بر اساس دسته‌بندی ── */
  const categoryBreakdown = useMemo(() => {
    const map = new Map();
    activeOrders.forEach((o) => {
      (o.items || []).forEach((item) => {
        const cat = isRtl
          ? item.category || item.category_name || "سایر"
          : item.category_en ||
            item.english_category ||
            item.category ||
            "Other";
        const rev = getItemUnitPrice(item) * (item.quantity || 0);
        map.set(cat, (map.get(cat) || 0) + rev);
      });
    });
    return [...map.entries()]
      .map(([name, revenue]) => ({ name, revenue }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [activeOrders, isRtl]);

  /* ── ★ سفارش‌های لغوشده و درآمد ازدست‌رفته ── */
  const cancelledStats = useMemo(() => {
    const cancelled = orders.filter((o) => o.status === "cancelled");
    const lostRevenue = cancelled.reduce((s, o) => s + (o.total_price || 0), 0);
    return {
      count: cancelled.length,
      lostRevenue,
      rate: orders.length
        ? Math.round((cancelled.length / orders.length) * 100)
        : 0,
    };
  }, [orders]);

  // بومی‌سازی نام محصولات برای نمودار پرفروش‌ترین‌ها
  const localizedTopItems = useMemo(() => {
    if (!analytics?.topItems) return [];
    return analytics.topItems.map((it) => ({
      ...it,
      name: isRtl
        ? it.name
        : it.name_en ||
          it.english_name ||
          it.title_en ||
          it.item_name_en ||
          it.product_name_en ||
          it.en_name ||
          it.name,
    }));
  }, [analytics?.topItems, isRtl]);

  if (loading)
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
        <CircularProgress sx={{ color: C.olive }} />
      </Box>
    );

  /* ═══════════════════════════════════════════ */
  return (
    <Box>
      {/* ── نوار بالا: تاریخ‌پیکر + ناوبری ───── */}
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          mb: 2.5,
          flexDirection: isRtl ? "row" : "row-reverse", // ★ تاریخ به چپ می‌رود
          flexWrap: "wrap",
          gap: 1.5,
        }}
      >
        <Typography
          sx={{
            fontWeight: 900,
            fontSize: 20,
            color: C.text,
            fontFamily: "'Vazirmatn', sans-serif",
            display: "flex",
            alignItems: "center",
            gap: 1,
          }}
        >
          <BarChartIcon sx={{ fontSize: 22, color: C.olive }} />
          {isRtl ? "گزارش و تحلیل" : "Report & Analytics"}
        </Typography>

        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1,
            bgcolor: `${C.olive}06`,
            borderRadius: "14px",
            border: `1px solid ${C.glassBorder}`,
            px: 1.5,
            py: 0.8,
          }}
        >
          {/* ★ دکمه روز قبل با آیکون و متن زیر آن */}
          <Box
            onClick={onPrevDay}
            sx={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              px: 1,
              py: 0.5,
              color: C.olive,
              borderRadius: "10px",
              border: `1px solid ${C.olive}20`,
              "&:hover": { bgcolor: `${C.olive}12` },
              transition: "all 0.15s ease",
              minWidth: 45,
            }}
          >
            {isRtl ? (
              <ChevronRight sx={{ fontSize: 20, mb: -0.5 }} />
            ) : (
              <ChevronLeft sx={{ fontSize: 20, mb: -0.5 }} />
            )}
            <Typography
              sx={{
                fontSize: 9.5,
                fontWeight: 700,
                fontFamily: "'Vazirmatn', sans-serif",
                lineHeight: 1,
                mt: 0.2,
                whiteSpace: "nowrap",
              }}
            >
              {isRtl ? "روز قبل" : "Prev Day"}
            </Typography>
          </Box>

          <TextField
            type={isRtl ? "text" : "date"} // ★ تبدیل به text در حالت فارسی
            size="small"
            value={isRtl ? toJalaliString(selectedDate) : selectedDate} // ★ نمایش شمسی
            readOnly={isRtl} // ★ فقط خواندنی در حالت فارسی
            onChange={(e) => {
              const v = e.target.value;
              if (v === todayStr()) onGoToday();
              else if (v < selectedDate) onPrevDay();
              else onNextDay();
            }}
            sx={{
              width: isRtl ? 130 : 155, // ★ کمی کوچک‌تر برای جا شدن اعداد شمسی
              "& .MuiOutlinedInput-root": {
                borderRadius: "10px",
                bgcolor: `${C.olive}08`,
                fontFamily: "'Vazirmatn', sans-serif",
                fontSize: 13,
                fontWeight: 600,
                cursor: isRtl ? "default" : "text",
                "& fieldset": { borderColor: `${C.olive}25` },
                "&:hover fieldset": { borderColor: `${C.olive}50` },
                "&.Mui-focused fieldset": {
                  borderColor: C.olive,
                  borderWidth: 2,
                },
              },
              "& input": {
                color: C.text,
                textAlign: "center",
                py: "7px",
                cursor: isRtl ? "default" : "pointer",
              },
            }}
          />

          {/* ★ دکمه روز بعد با آیکون و متن زیر آن */}
          <Box
            onClick={onNextDay}
            sx={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              px: 1,
              py: 0.5,
              color: C.olive,
              borderRadius: "10px",
              border: `1px solid ${C.olive}20`,
              "&:hover": { bgcolor: `${C.olive}12` },
              transition: "all 0.15s ease",
              minWidth: 45,
            }}
          >
            {isRtl ? (
              <ChevronLeft sx={{ fontSize: 20, mb: -0.5 }} />
            ) : (
              <ChevronRight sx={{ fontSize: 20, mb: -0.5 }} />
            )}
            <Typography
              sx={{
                fontSize: 9.5,
                fontWeight: 700,
                fontFamily: "'Vazirmatn', sans-serif",
                lineHeight: 1,
                mt: 0.2,
                whiteSpace: "nowrap",
              }}
            >
              {isRtl ? "روز بعد" : "Next Day"}
            </Typography>
          </Box>

          {!isToday && (
            <IconButton
              onClick={onGoToday}
              size="small"
              sx={{
                color: C.gold,
                width: 34,
                height: 34,
                border: `1px solid ${C.gold}30`,
                borderRadius: "10px",
                "&:hover": { bgcolor: `${C.gold}12`, transform: "scale(1.05)" },
                transition: "all 0.15s ease",
              }}
            >
              <Today sx={{ fontSize: 17 }} />
            </IconButton>
          )}

          <IconButton
            onClick={onReload}
            size="small"
            sx={{
              color: C.olive,
              width: 34,
              height: 34,
              border: `1px solid ${C.olive}20`,
              borderRadius: "10px",
              "&:hover": {
                bgcolor: `${C.olive}12`,
                transform: "rotate(180deg)",
              },
              transition: "all 0.3s ease",
            }}
          >
            <Refresh sx={{ fontSize: 17 }} />
          </IconButton>
        </Box>
      </Box>

      {/* ── برچسب تاریخ (شمسی/میلادی) ──────────────────── */}
      <Box
        sx={{
          mb: 2,
          px: 2,
          py: 1.2,
          borderRadius: "12px",
          bgcolor: isToday ? `${C.olive}0A` : `${C.gold}0A`,
          border: `1px solid ${isToday ? C.olive : C.gold}18`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 1,
        }}
      >
        <Typography
          sx={{
            fontSize: 16,
            fontWeight: 800,
            color: isToday ? C.olive : C.gold,
            fontFamily: "'Vazirmatn', sans-serif",
          }}
        >
          {/* ★ استفاده از fmtDate با پشتیبانی از زبان‌ها */}
          {isToday
            ? isRtl
              ? "📅 امروز"
              : "📅 Today"
            : `📅 ${fmtDate(selectedDate, isRtl)}`}
        </Typography>
      </Box>

      {/* ── کارت‌های خلاصه ─────────────────────── */}
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "repeat(2,1fr)", sm: "repeat(4,1fr)" },
          gap: 1.5,
          mb: 1.5,
        }}
      >
        {[
          {
            label: isRtl ? "سفارشات" : "Orders",
            value: isRtl ? toPersianDigits(orders.length) : orders.length,
            icon: "🧾",
            bg: `${C.olive}0A`,
            border: `${C.olive}15`,
            color: C.olive,
          },
          {
            label: isRtl ? "جمع فروش" : "Sales",
            value: isRtl ? toPersianDigits(fNum(dayTotal)) : fNum(dayTotal),
            icon: "💰",
            bg: `${C.gold}0A`,
            border: `${C.gold}15`,
            color: C.gold,
          },
          {
            label: isRtl ? "میانگین سفارش" : "Avg",
            value: isRtl ? toPersianDigits(fNum(avgOrder)) : fNum(avgOrder),
            icon: "📊",
            bg: `${C.burgundy}0A`,
            border: `${C.burgundy}15`,
            color: C.burgundy,
          },
          {
            label: isRtl ? "اقلام فروخته" : "Items",
            value: isRtl
              ? toPersianDigits(
                  activeOrders.reduce(
                    (s, o) =>
                      s +
                      (o.items || []).reduce(
                        (a, i) => a + (i.quantity || 0),
                        0,
                      ),
                    0,
                  ),
                )
              : activeOrders.reduce(
                  (s, o) =>
                    s +
                    (o.items || []).reduce((a, i) => a + (i.quantity || 0), 0),
                  0,
                ),
            icon: "🍽",
            bg: `#5B8DB80A`,
            border: "#5B8DB815",
            color: "#5B8DB8",
          },
        ].map((card, i) => (
          <Box
            key={i}
            sx={{
              p: 1.5,
              borderRadius: "14px",
              bgcolor: card.bg,
              border: `1px solid ${card.border}`,
              textAlign: "center",
              transition: "transform 0.15s ease",
              "&:hover": { transform: "translateY(-2px)" },
            }}
          >
            <Typography sx={{ fontSize: 18, mb: 0.3 }}>{card.icon}</Typography>
            <Typography
              sx={{
                fontSize: 11,
                color: C.muted,
                fontWeight: 600,
                fontFamily: "'Vazirmatn', sans-serif",
                mb: 0.3,
              }}
            >
              {card.label}
            </Typography>
            <Box
              sx={{
                display: "flex",
                alignItems: "baseline",
                justifyContent: "center",
                gap: 0.3,
              }}
            >
              <Typography
                sx={{
                  fontSize: { xs: 17, sm: 20 },
                  fontWeight: 900,
                  color: card.color,
                  fontFamily: "'Vazirmatn', sans-serif",
                }}
              >
                {card.value}
              </Typography>
              {i === 1 && (
                <Typography
                  sx={{
                    fontSize: 10,
                    fontWeight: 600,
                    color: C.muted,
                    fontFamily: "'Vazirmatn', sans-serif",
                  }}
                >
                  {isRtl ? "تومان" : "Toman"}
                </Typography>
              )}
            </Box>
          </Box>
        ))}
      </Box>

      {/* ── ★ کارت‌های لغو / درآمد ازدست‌رفته ──── */}
      {cancelledStats.count > 0 && (
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "repeat(2,1fr)", sm: "repeat(3,1fr)" },
            gap: 1.5,
            mb: 2.5,
          }}
        >
          {[
            {
              label: isRtl ? "سفارش لغوشده" : "Cancelled",
              value: isRtl
                ? toPersianDigits(cancelledStats.count)
                : cancelledStats.count,
              icon: "❌",
              color: C.danger,
            },
            {
              label: isRtl ? "درآمد ازدست‌رفته" : "Lost Revenue",
              value: isRtl
                ? toPersianDigits(fNum(cancelledStats.lostRevenue))
                : fNum(cancelledStats.lostRevenue),
              icon: "📉",
              color: C.danger,
              unit: isRtl ? "تومان" : "Toman",
            },
            {
              label: isRtl ? "نرخ لغو" : "Cancel Rate",
              value: isRtl
                ? `${toPersianDigits(cancelledStats.rate)}٪`
                : `${cancelledStats.rate}%`,
              icon: "⚠️",
              color: C.danger,
            },
          ].map((card, i) => (
            <Box
              key={i}
              sx={{
                p: 1.5,
                borderRadius: "14px",
                bgcolor: `${C.danger}08`,
                border: `1px solid ${C.danger}18`,
                textAlign: "center",
              }}
            >
              <Typography sx={{ fontSize: 16, mb: 0.3 }}>
                {card.icon}
              </Typography>
              <Typography
                sx={{
                  fontSize: 11,
                  color: C.muted,
                  fontWeight: 600,
                  fontFamily: "'Vazirmatn', sans-serif",
                  mb: 0.3,
                }}
              >
                {card.label}
              </Typography>
              <Box
                sx={{
                  display: "flex",
                  alignItems: "baseline",
                  justifyContent: "center",
                  gap: 0.3,
                }}
              >
                <Typography
                  sx={{
                    fontSize: { xs: 15, sm: 17 },
                    fontWeight: 900,
                    color: card.color,
                    fontFamily: "'Vazirmatn', sans-serif",
                  }}
                >
                  {card.value}
                </Typography>
                {card.unit && (
                  <Typography
                    sx={{
                      fontSize: 10,
                      color: C.muted,
                      fontFamily: "'Vazirmatn', sans-serif",
                    }}
                  >
                    {card.unit}
                  </Typography>
                )}
              </Box>
            </Box>
          ))}
        </Box>
      )}

      {/* ── جدول سفارشات ──────────────────────── */}
      {orders.length === 0 ? (
        <Box
          sx={{
            textAlign: "center",
            py: 5,
            borderRadius: "16px",
            bgcolor: `${C.muted}05`,
            border: `1px dashed ${C.glassBorder}`,
          }}
        >
          <Typography sx={{ fontSize: 28, mb: 1 }}>📭</Typography>
          <Typography
            sx={{
              color: C.muted,
              fontSize: 14,
              fontFamily: "'Vazirmatn', sans-serif",
            }}
          >
            {isRtl ? "سفارشی ثبت نشده" : "No orders yet"}
          </Typography>
        </Box>
      ) : (
        <TableContainer
          sx={{
            bgcolor: C.glass,
            borderRadius: "16px",
            border: `1px solid ${C.glassBorder}`,
            mb: 3,
            overflow: "auto",
          }}
        >
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                {[
                  isRtl ? "شماره" : "Order #",
                  isRtl ? "مشتری" : "Customer",
                  isRtl ? "جمع" : "Total",
                  isRtl ? "اقلام" : "Items",
                  isRtl ? "وضعیت" : "Status",
                  isRtl ? "ساعت" : "Time",
                  isRtl ? "پرداخت" : "Payment",
                ].map((label) => (
                  <TableCell
                    key={label}
                    sx={{
                      fontWeight: 800,
                      fontSize: 12,
                      fontFamily: "'Vazirmatn', sans-serif",
                      bgcolor: C.glass,
                      color: C.text,
                      borderBottom: `1px solid ${C.glassBorder}`,
                      whiteSpace: "nowrap",
                      py: 1.2,
                    }}
                  >
                    {label}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {orders.map((o) => {
                const si = statusInfo(o.status);
                const items = o.items || [];
                return (
                  <TableRow
                    key={o.id}
                    onClick={() => onRowClick(o)}
                    sx={{
                      cursor: "pointer",
                      transition: "all 0.15s ease",
                      "&:hover": { bgcolor: `${C.olive}06` },
                      "& td": {
                        borderBottom: `1px solid ${C.glassBorder}`,
                        fontSize: 13,
                        fontFamily: "'Vazirmatn', sans-serif",
                        py: 1,
                        color: C.text,
                      },
                    }}
                  >
                    <TableCell sx={{ fontWeight: 800, color: C.olive }}>
                      #{isRtl ? toPersianDigits(o.id) : o.id}
                    </TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>
                      {getCustomerName(o, isRtl)}
                    </TableCell>
                    <TableCell sx={{ fontWeight: 800 }}>
                      <Box
                        sx={{
                          display: "inline-flex",
                          alignItems: "baseline",
                          gap: 0.5,
                        }}
                      >
                        <Typography
                          component="span"
                          sx={{
                            fontSize: 13,
                            fontFamily: "'Vazirmatn', sans-serif",
                          }}
                        >
                          {isRtl
                            ? toPersianDigits(fNum(o.total_price))
                            : fNum(o.total_price)}
                        </Typography>
                        <Typography
                          component="span"
                          sx={{
                            fontSize: 12,
                            fontWeight: 700,
                            color: C.sub,
                            fontFamily: "'Vazirmatn', sans-serif",
                          }}
                        >
                          {isRtl ? "تومان" : "Toman"}
                        </Typography>
                      </Box>
                    </TableCell>
                    <TableCell sx={{ maxWidth: 160 }}>
                      {items.slice(0, 2).map((item, i) => (
                        <Typography
                          key={i}
                          sx={{
                            fontSize: 12,
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {getItemName(item, isRtl)} ×
                          {isRtl
                            ? toPersianDigits(item.quantity)
                            : item.quantity}
                        </Typography>
                      ))}
                      {items.length > 2 && (
                        <Typography sx={{ fontSize: 11, color: C.muted }}>
                          +
                          {isRtl
                            ? toPersianDigits(items.length - 2)
                            : items.length - 2}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={si.label}
                        size="small"
                        sx={{
                          fontSize: 11,
                          fontWeight: 700,
                          height: 24,
                          bgcolor: si.color + "18",
                          color: si.color,
                          borderRadius: "6px",
                        }}
                      />
                    </TableCell>
                    <TableCell
                      sx={{
                        whiteSpace: "nowrap",
                        fontSize: 12,
                        color: C.sub,
                        direction: "ltr",
                      }}
                    >
                      {o.created_at}
                    </TableCell>
                    <TableCell sx={{ fontSize: 12 }}>
                      {paymentLabel(o.payment_method)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* ── بخش نمودارها و تحلیل ─────────────── */}
      {orders.length > 0 && analytics && (
        <Box>
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1,
              mb: 2,
            }}
          >
            <Typography
              sx={{
                fontWeight: 900,
                fontSize: 17,
                color: C.text,
                fontFamily: "'Vazirmatn', sans-serif",
              }}
            >
              📈 {isRtl ? "تحلیل فروش" : "Sales Analytics"}
            </Typography>
          </Box>

          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr", md: "repeat(2, 1fr)" },
              gap: 2,
            }}
          >
            {/* ── ۱. پرفروش‌ترین محصولات (بر اساس تعداد) ──────── */}
            <Box
              sx={{
                bgcolor: C.glass,
                borderRadius: "16px",
                border: `1px solid ${C.glassBorder}`,
                p: 2.5,
              }}
            >
              <Typography
                sx={{
                  fontWeight: 800,
                  fontSize: 14,
                  mb: 2,
                  fontFamily: "'Vazirmatn', sans-serif",
                  color: C.text,
                }}
              >
                🏆{" "}
                {isRtl
                  ? "پرفروش‌ترین محصولات (تعداد)"
                  : "Best Sellers (Quantity)"}
              </Typography>
              {analytics.topItems.length > 0 ? (
                <Box dir="ltr" sx={{ width: "100%" }}>
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart
                      data={localizedTopItems}
                      layout="vertical"
                      margin={{ left: 10, right: 40, top: 5, bottom: 20 }}
                    >
                      <XAxis
                        type="number"
                        tick={{ fontSize: 10, fill: C.muted }}
                        stroke={C.glassBorder}
                        label={{
                          value: isRtl ? "تعداد فروخته‌شده" : "Units Sold",
                          position: "insideBottom",
                          offset: -10,
                          fontSize: 11,
                          fontFamily: "'Vazirmatn', sans-serif",
                          fill: C.sub,
                        }}
                      />
                      <YAxis
                        type="category"
                        dataKey="name"
                        tick={{
                          fontSize: 11,
                          fill: C.text,
                          fontFamily: "'Vazirmatn', sans-serif",
                        }}
                        width={Math.min(
                          170,
                          Math.max(
                            90,
                            ...analytics.topItems.map(
                              (d) => d.name.length * 10,
                            ),
                          ),
                        )}
                        tickMargin={10}
                        interval={0}
                        stroke={C.glassBorder}
                      />
                      <Tooltip content={<ChartTooltip isRtl={isRtl} C={C} />} />
                      <Bar
                        dataKey="quantity"
                        radius={[0, 6, 6, 0]}
                        barSize={18}
                      >
                        {analytics.topItems.map((_, i) => (
                          <Cell
                            key={i}
                            fill={CHART_COLORS[i % CHART_COLORS.length]}
                          />
                        ))}
                        <BarLabel C={C} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </Box>
              ) : (
                <Typography
                  sx={{
                    textAlign: "center",
                    py: 4,
                    color: C.muted,
                    fontSize: 13,
                  }}
                >
                  —
                </Typography>
              )}
            </Box>

            {/* ── ★ ۲. پردرآمدترین محصولات (بر اساس مبلغ) ──────── */}
            <Box
              sx={{
                bgcolor: C.glass,
                borderRadius: "16px",
                border: `1px solid ${C.glassBorder}`,
                p: 2.5,
              }}
            >
              <Typography
                sx={{
                  fontWeight: 800,
                  fontSize: 14,
                  mb: 2,
                  fontFamily: "'Vazirmatn', sans-serif",
                  color: C.text,
                }}
              >
                💎 {isRtl ? "پردرآمدترین محصولات" : "Top Revenue Items"}
              </Typography>
              {revenueByItem.length > 0 ? (
                <Box dir="ltr" sx={{ width: "100%" }}>
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart
                      data={revenueByItem}
                      layout="vertical"
                      margin={{ left: 10, right: 60, top: 5, bottom: 20 }}
                    >
                      <XAxis
                        type="number"
                        tick={{ fontSize: 10, fill: C.muted }}
                        stroke={C.glassBorder}
                        label={{
                          value: isRtl ? "درآمد (تومان)" : "Revenue (Toman)",
                          position: "insideBottom",
                          offset: -10,
                          fontSize: 11,
                          fontFamily: "'Vazirmatn', sans-serif",
                          fill: C.sub,
                        }}
                      />
                      <YAxis
                        type="category"
                        dataKey="name"
                        tick={{
                          fontSize: 11,
                          fill: C.text,
                          fontFamily: "'Vazirmatn', sans-serif",
                        }}
                        width={Math.min(
                          170,
                          Math.max(
                            90,
                            ...revenueByItem.map((d) => d.name.length * 10),
                          ),
                        )}
                        tickMargin={10}
                        interval={0}
                        stroke={C.glassBorder}
                      />
                      <Tooltip
                        content={
                          <ChartTooltip
                            isRtl={isRtl}
                            C={C}
                            label={isRtl ? "درآمد:" : "Revenue:"}
                            formatter={(v) =>
                              `${isRtl ? toPersianDigits(fNum(v)) : fNum(v)} ${isRtl ? "تومان" : "Toman"}`
                            }
                          />
                        }
                      />
                      <Bar dataKey="revenue" radius={[0, 6, 6, 0]} barSize={18}>
                        {revenueByItem.map((_, i) => (
                          <Cell
                            key={i}
                            fill={CHART_COLORS[i % CHART_COLORS.length]}
                          />
                        ))}
                        <BarLabel
                          C={C}
                          formatter={(v) =>
                            isRtl ? toPersianDigits(fNum(v)) : fNum(v)
                          }
                        />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </Box>
              ) : (
                <Typography
                  sx={{
                    textAlign: "center",
                    py: 4,
                    color: C.muted,
                    fontSize: 13,
                  }}
                >
                  —
                </Typography>
              )}
            </Box>

            {/* ── ۳. شیوه پرداخت ─────────────── */}
            <Box
              sx={{
                bgcolor: C.glass,
                borderRadius: "16px",
                border: `1px solid ${C.glassBorder}`,
                p: 2.5,
              }}
            >
              <Typography
                sx={{
                  fontWeight: 800,
                  fontSize: 14,
                  mb: 2,
                  fontFamily: "'Vazirmatn', sans-serif",
                  color: C.text,
                }}
              >
                💳 {isRtl ? "شیوه پرداخت" : "Payment Methods"}
              </Typography>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={analytics.paymentBreakdown}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={3}
                    dataKey="count"
                    nameKey="name"
                    label={false}
                  >
                    {analytics.paymentBreakdown.map((entry, i) => (
                      <Cell
                        key={i}
                        fill={PAYMENT_COLORS[entry.name] || CHART_COLORS[i]}
                      />
                    ))}
                  </Pie>
                  <Tooltip content={<ChartTooltip isRtl={isRtl} C={C} />} />
                  <Legend
                    formatter={(value) => paymentLabel(value)}
                    wrapperStyle={{
                      fontSize: 11,
                      fontFamily: "'Vazirmatn', sans-serif",
                      direction: isRtl ? "rtl" : "ltr",
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </Box>

            {/* ── ۴. توزیع ساعتی ─────────────── */}
            <Box
              sx={{
                bgcolor: C.glass,
                borderRadius: "16px",
                border: `1px solid ${C.glassBorder}`,
                p: 2.5,
              }}
            >
              <Typography
                sx={{
                  fontWeight: 800,
                  fontSize: 14,
                  mb: 2,
                  fontFamily: "'Vazirmatn', sans-serif",
                  color: C.text,
                }}
              >
                ⏰ {isRtl ? "پیک ساعتی سفارشات" : "Order Time Distribution"}
              </Typography>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={analytics.timeDistribution}>
                  <XAxis
                    dataKey={isRtl ? "labelFa" : "labelEn"}
                    tick={{
                      fontSize: 11,
                      fill: C.text,
                      fontFamily: "'Vazirmatn', sans-serif",
                    }}
                  />
                  <YAxis tick={{ fontSize: 10, fill: C.muted }} />
                  <Tooltip content={<ChartTooltip isRtl={isRtl} C={C} />} />
                  <Bar dataKey="count" radius={[6, 6, 0, 0]} barSize={35}>
                    {analytics.timeDistribution.map((entry, i) => (
                      <Cell
                        key={i}
                        fill={CHART_COLORS[i % CHART_COLORS.length]}
                        opacity={entry.count === 0 ? 0.25 : 1}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </Box>

            {/* ── ۵. سرویس (سالن/بیرون‌بر) ──── */}
            <Box
              sx={{
                bgcolor: C.glass,
                borderRadius: "16px",
                border: `1px solid ${C.glassBorder}`,
                p: 2.5,
              }}
            >
              <Typography
                sx={{
                  fontWeight: 800,
                  fontSize: 14,
                  mb: 2,
                  fontFamily: "'Vazirmatn', sans-serif",
                  color: C.text,
                }}
              >
                🏠 {isRtl ? "سالن یا بیرون‌بر" : "Hall vs Takeout"}
              </Typography>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={analytics.sourceBreakdown}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={3}
                    dataKey="count"
                    nameKey="name"
                    label={false}
                  >
                    {analytics.sourceBreakdown.map((entry, i) => (
                      <Cell
                        key={i}
                        fill={SOURCE_COLORS[entry.name] || CHART_COLORS[i]}
                      />
                    ))}
                  </Pie>
                  <Tooltip content={<ChartTooltip isRtl={isRtl} C={C} />} />
                  <Legend
                    formatter={(value) => sourceLabel(value)}
                    wrapperStyle={{
                      fontSize: 11,
                      fontFamily: "'Vazirmatn', sans-serif",
                      direction: isRtl ? "rtl" : "ltr",
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </Box>

            {/* ── ★ ۶. فروش بر اساس دسته‌بندی ──── */}
            <Box
              sx={{
                bgcolor: C.glass,
                borderRadius: "16px",
                border: `1px solid ${C.glassBorder}`,
                p: 2.5,
              }}
            >
              <Typography
                sx={{
                  fontWeight: 800,
                  fontSize: 14,
                  mb: 2,
                  fontFamily: "'Vazirmatn', sans-serif",
                  color: C.text,
                }}
              >
                🗂️ {isRtl ? "فروش بر اساس دسته‌بندی" : "Sales by Category"}
              </Typography>
              {categoryBreakdown.length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={categoryBreakdown}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={3}
                      dataKey="revenue"
                      nameKey="name"
                      label={false}
                    >
                      {categoryBreakdown.map((_, i) => (
                        <Cell
                          key={i}
                          fill={CHART_COLORS[i % CHART_COLORS.length]}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      content={
                        <ChartTooltip
                          isRtl={isRtl}
                          C={C}
                          label={isRtl ? "درآمد:" : "Revenue:"}
                          formatter={(v) =>
                            `${isRtl ? toPersianDigits(fNum(v)) : fNum(v)} ${isRtl ? "تومان" : "Toman"}`
                          }
                        />
                      }
                    />
                    <Legend
                      wrapperStyle={{
                        fontSize: 11,
                        fontFamily: "'Vazirmatn', sans-serif",
                        direction: isRtl ? "rtl" : "ltr",
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <Typography
                  sx={{
                    textAlign: "center",
                    py: 4,
                    color: C.muted,
                    fontSize: 13,
                  }}
                >
                  —
                </Typography>
              )}
            </Box>
          </Box>

          {/* ── ۷. مشتریان پرتکرار ──────────── */}
          {analytics.topCustomers.length > 0 && (
            <Box
              sx={{
                bgcolor: C.glass,
                borderRadius: "16px",
                border: `1px solid ${C.glassBorder}`,
                p: 2.5,
                mt: 2,
              }}
            >
              <Typography
                sx={{
                  fontWeight: 800,
                  fontSize: 14,
                  mb: 1.5,
                  fontFamily: "'Vazirmatn', sans-serif",
                  color: C.text,
                }}
              >
                👥 {isRtl ? "مشتریان پرتکرار" : "Top Customers"}
              </Typography>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    {[
                      isRtl ? "مشتری" : "Customer",
                      isRtl ? "تلفن" : "Phone",
                      isRtl ? "تعداد" : "Orders",
                      isRtl ? "جمع خرید" : "Revenue",
                    ].map((l) => (
                      <TableCell
                        key={l}
                        sx={{
                          fontWeight: 800,
                          fontSize: 12,
                          color: C.text,
                          fontFamily: "'Vazirmatn', sans-serif",
                          borderBottom: `1px solid ${C.glassBorder}`,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {l}
                      </TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {analytics.topCustomers.map((c, i) => (
                    <TableRow
                      key={i}
                      sx={{
                        "& td": {
                          borderBottom: `1px solid ${C.glassBorder}`,
                          fontSize: 13,
                          fontFamily: "'Vazirmatn', sans-serif",
                          color: C.text,
                        },
                      }}
                    >
                      <TableCell sx={{ fontWeight: 600 }}>
                        <Box
                          sx={{
                            display: "flex",
                            alignItems: "center",
                            gap: 0.8,
                          }}
                        >
                          <Box
                            sx={{
                              width: 26,
                              height: 26,
                              borderRadius: "8px",
                              bgcolor: `${CHART_COLORS[i]}15`,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontSize: 11,
                              fontWeight: 900,
                              color: CHART_COLORS[i],
                              flexShrink: 0,
                            }}
                          >
                            {isRtl ? toPersianDigits(i + 1) : i + 1}
                          </Box>
                          <Typography
                            sx={{
                              fontSize: 13,
                              fontWeight: 600,
                              fontFamily: "'Vazirmatn', sans-serif",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {getCustomerName(c, isRtl)}
                          </Typography>
                        </Box>
                      </TableCell>
                      <TableCell
                        sx={{
                          direction: "ltr",
                          textAlign: "left",
                          whiteSpace: "nowrap",
                          fontSize: 12,
                          color: c.phone ? C.text : C.muted,
                        }}
                      >
                        {c.phone || "—"}
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={isRtl ? toPersianDigits(c.count) : c.count}
                          size="small"
                          sx={{
                            fontSize: 11,
                            fontWeight: 700,
                            height: 24,
                            bgcolor: `${C.olive}15`,
                            color: C.olive,
                            borderRadius: "6px",
                          }}
                        />
                      </TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>
                        <Box
                          sx={{
                            display: "inline-flex",
                            alignItems: "baseline",
                            gap: 0.5,
                          }}
                        >
                          <Typography
                            component="span"
                            sx={{
                              fontSize: 13,
                              fontWeight: 700,
                              fontFamily: "'Vazirmatn', sans-serif",
                            }}
                          >
                            {isRtl
                              ? toPersianDigits(fNum(c.revenue))
                              : fNum(c.revenue)}
                          </Typography>
                          <Typography
                            component="span"
                            sx={{
                              fontSize: 12, // بزرگتر شد
                              fontWeight: 700, // درشت شد
                              color: C.sub, // واضح‌تر شد
                              fontFamily: "'Vazirmatn', sans-serif",
                            }}
                          >
                            {isRtl ? "تومان" : "Toman"}
                          </Typography>
                        </Box>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
}
