import {
  Box, Typography, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Chip, IconButton,
  CircularProgress, TextField,
} from "@mui/material";
import {
  Refresh, Today,
  BarChart as BarChartIcon,
} from "@mui/icons-material";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from "recharts";

/* ── Helpers ─────────────────────────────────── */
const fNum = (n) => String(n || 0).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
const toPersianDigits = (s) =>
  String(s).replace(/\d/g, d => "۰۱۲۳۴۵۶۷۸۹"[d]);

/* ── Chart tooltip ──────────────────────────── */
function ChartTooltip({ active, payload, isRtl, C }) {
  if (!active || !payload?.length) return null;
  const d = payload[0];
  return (
    <Box sx={{
      bgcolor: C.bg, border: `1px solid ${C.glassBorder}`,
      borderRadius: "10px", px: 1.5, py: 1,
      boxShadow: "0 8px 30px rgba(0,0,0,0.2)",
    }}>
      <Typography sx={{
        fontSize: 12, fontWeight: 700, color: C.text,
        fontFamily: "'Vazirmatn', sans-serif",
      }}>
        {d.name || d.payload?.name}
      </Typography>
      <Typography sx={{
        fontSize: 11, color: C.sub,
        fontFamily: "'Vazirmatn', sans-serif",
      }}>
        {isRtl ? "تعداد:" : "Count:"} {toPersianDigits(d.value)}
      </Typography>
    </Box>
  );
}

/* ── Chart label for bars ────────────────────── */
const BarLabel = ({ x, y, width, value, C }) => (
  <text
    x={x + width + 6} y={y + 14}
    fill={C.text} fontSize={11} fontWeight={700}
    fontFamily="'Vazirmatn', sans-serif"
  >
    {toPersianDigits(value)}
  </text>
);

/* ── Date helpers ────────────────────────────── */
const todayStr = () => new Date().toISOString().split("T")[0];
const fmtDate = (s) => {
  try {
    const d = new Date(s + "T12:00:00");
    return d.toLocaleDateString("fa-IR", {
      weekday: "short", month: "short", day: "numeric",
    });
  } catch { return s; }
};

/* ══════════════════════════════════════════════ */
export default function DailyReport({
  orders, loading, onRowClick, onReload, C, isRtl,
  selectedDate, isToday, onPrevDay, onNextDay, onGoToday,
  analytics,
}) {

  const statusInfo = (s) => ({
    delivered: { label: isRtl ? "تحویل" : "Delivered", color: C.olive },
    confirmed: { label: isRtl ? "تایید" : "Confirmed", color: C.gold },
    pending:   { label: isRtl ? "انتظار" : "Pending",   color: C.muted },
    cancelled: { label: isRtl ? "لغو" : "Cancelled",    color: C.danger },
  }[s] || { label: s, color: C.muted });

  const paymentLabel = (m) => ({
    cash: isRtl ? "نقدی" : "Cash",
    card: isRtl ? "کارت" : "Card",
    online: isRtl ? "آنلاین" : "Online",
  }[m] || m || "—");

  const sourceLabel = (s) => ({
    pos: isRtl ? "سالن" : "Hall",
    online: isRtl ? "بیرون" : "Takeout",
  }[s] || s || "—");

  const dayTotal = orders.reduce((s, o) => s + (o.total_price || 0), 0);
  const avgOrder = orders.length ? Math.round(dayTotal / orders.length) : 0;

  if (loading) return (
    <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
      <CircularProgress sx={{ color: C.olive }} />
    </Box>
  );

  /* ═══════════════════════════════════════════ */
  return (
    <Box>
      {/* ── نوار بالا: تاریخ‌پیکر + ناوبری ───── */}
      <Box sx={{
        display: "flex", justifyContent: "space-between",
        alignItems: "center", mb: 2.5,
        direction: isRtl ? "rtl" : "ltr",
        flexWrap: "wrap", gap: 1.5,
      }}>
        <Typography sx={{
          fontWeight: 900, fontSize: 20, color: C.text,
          fontFamily: "'Vazirmatn', sans-serif",
          display: "flex", alignItems: "center", gap: 1,
        }}>
          <BarChartIcon sx={{ fontSize: 22, color: C.olive }} />
          {isRtl ? "گزارش و تحلیل" : "Report & Analytics"}
        </Typography>

        <Box sx={{
          display: "flex", alignItems: "center", gap: 1,
          bgcolor: `${C.olive}06`, borderRadius: "14px",
          border: `1px solid ${C.glassBorder}`,
          px: 1.5, py: 0.8,
        }}>
          {/* دکمه روز قبل */}
          <IconButton onClick={onPrevDay} size="small" sx={{
            color: C.olive, width: 34, height: 34,
            border: `1px solid ${C.olive}20`,
            borderRadius: "10px",
            "&:hover": { bgcolor: `${C.olive}12`, transform: "scale(1.05)" },
            transition: "all 0.15s ease",
          }}>
            {isRtl ? (
              <Typography sx={{ fontSize: 16, fontWeight: 900, lineHeight: 1 }}>{">"}</Typography>
            ) : (
              <Typography sx={{ fontSize: 16, fontWeight: 900, lineHeight: 1 }}>{"<"}</Typography>
            )}
          </IconButton>

          {/* اینپوت تاریخ */}
          <TextField
            type="date"
            size="small"
            value={selectedDate}
            onChange={(e) => {
              const v = e.target.value;
              if (v === todayStr()) onGoToday();
              else if (v < selectedDate) onPrevDay();
              else onNextDay();
            }}
            sx={{
              width: 155,
              "& .MuiOutlinedInput-root": {
                borderRadius: "10px",
                bgcolor: `${C.olive}08`,
                fontFamily: "'Vazirmatn', sans-serif",
                fontSize: 13, fontWeight: 600,
                "& fieldset": { borderColor: `${C.olive}25` },
                "&:hover fieldset": { borderColor: `${C.olive}50` },
                "&.Mui-focused fieldset": { borderColor: C.olive, borderWidth: 2 },
              },
              "& input": { color: C.text, textAlign: "center", py: "7px" },
            }}
          />

          {/* دکمه روز بعد */}
          <IconButton onClick={onNextDay} size="small" sx={{
            color: C.olive, width: 34, height: 34,
            border: `1px solid ${C.olive}20`,
            borderRadius: "10px",
            "&:hover": { bgcolor: `${C.olive}12`, transform: "scale(1.05)" },
            transition: "all 0.15s ease",
          }}>
            {isRtl ? (
              <Typography sx={{ fontSize: 16, fontWeight: 900, lineHeight: 1 }}>{"<"}</Typography>
            ) : (
              <Typography sx={{ fontSize: 16, fontWeight: 900, lineHeight: 1 }}>{">"}</Typography>
            )}
          </IconButton>

          {/* دکمه امروز — فقط وقتی امروز نیست */}
          {!isToday && (
            <IconButton onClick={onGoToday} size="small" sx={{
              color: C.gold, width: 34, height: 34,
              border: `1px solid ${C.gold}30`,
              borderRadius: "10px",
              "&:hover": { bgcolor: `${C.gold}12`, transform: "scale(1.05)" },
              transition: "all 0.15s ease",
            }}>
              <Today sx={{ fontSize: 17 }} />
            </IconButton>
          )}

          {/* رفرش */}
          <IconButton onClick={onReload} size="small" sx={{
            color: C.olive, width: 34, height: 34,
            border: `1px solid ${C.olive}20`,
            borderRadius: "10px",
            "&:hover": { bgcolor: `${C.olive}12`, transform: "rotate(180deg)" },
            transition: "all 0.3s ease",
          }}>
            <Refresh sx={{ fontSize: 17 }} />
          </IconButton>
        </Box>
      </Box>

      {/* ── برچسب تاریخ فارسی ──────────────────── */}
      <Box sx={{
        mb: 2, px: 2, py: 1, borderRadius: "12px",
        bgcolor: isToday ? `${C.olive}0A` : `${C.gold}0A`,
        border: `1px solid ${isToday ? C.olive : C.gold}18`,
        display: "flex", alignItems: "center", justifyContent: "center", gap: 1,
      }}>
        <Typography sx={{
          fontSize: 14, fontWeight: 800,
          color: isToday ? C.olive : C.gold,
          fontFamily: "'Vazirmatn', sans-serif",
        }}>
          {isToday
            ? (isRtl ? "📅 امروز" : "📅 Today")
            : `📅 ${fmtDate(selectedDate)}`
          }
        </Typography>
      </Box>

      {/* ── کارت‌های خلاصه ─────────────────────── */}
      <Box sx={{
        display: "grid",
        gridTemplateColumns: { xs: "repeat(2,1fr)", sm: "repeat(4,1fr)" },
        gap: 1.5, mb: 2.5,
      }}>
        {[
          { label: isRtl ? "سفارشات" : "Orders",   value: toPersianDigits(orders.length), icon: "🧾", bg: `${C.olive}0A`, border: `${C.olive}15`, color: C.olive },
          { label: isRtl ? "جمع فروش" : "Sales",   value: fNum(dayTotal),                  icon: "💰", bg: `${C.gold}0A`,  border: `${C.gold}15`,  color: C.gold },
          { label: isRtl ? "میانگین سفارش" : "Avg", value: fNum(avgOrder),                  icon: "📊", bg: `${C.burgundy}0A`, border: `${C.burgundy}15`, color: C.burgundy },
          { label: isRtl ? "اقلام فروخته" : "Items", value: toPersianDigits(
            orders.reduce((s,o) => s + (o.items||[]).reduce((a,i) => a+(i.quantity||0), 0), 0)
          ), icon: "🍽", bg: `#5B8DB80A`, border: "#5B8DB815", color: "#5B8DB8" },
        ].map((card, i) => (
          <Box key={i} sx={{
            p: 1.5, borderRadius: "14px",
            bgcolor: card.bg, border: `1px solid ${card.border}`,
            textAlign: "center",
            transition: "transform 0.15s ease",
            "&:hover": { transform: "translateY(-2px)" },
          }}>
            <Typography sx={{ fontSize: 18, mb: 0.3 }}>{card.icon}</Typography>
            <Typography sx={{
              fontSize: 11, color: C.muted, fontWeight: 600,
              fontFamily: "'Vazirmatn', sans-serif", mb: 0.3,
            }}>
              {card.label}
            </Typography>
            <Typography sx={{
              fontSize: { xs: 17, sm: 20 }, fontWeight: 900,
              color: card.color, fontFamily: "'Vazirmatn', sans-serif",
            }}>
              {card.value}
              {i === 1 && (
                <Typography component="span" sx={{
                  fontSize: 10, fontWeight: 600, color: C.muted, mr: 0.4,
                }}>
                  {isRtl ? "ت" : "T"}
                </Typography>
              )}
            </Typography>
          </Box>
        ))}
      </Box>

      {/* ── جدول سفارشات ──────────────────────── */}
      {orders.length === 0 ? (
        <Box sx={{
          textAlign: "center", py: 5, borderRadius: "16px",
          bgcolor: `${C.muted}05`, border: `1px dashed ${C.glassBorder}`,
        }}>
          <Typography sx={{ fontSize: 28, mb: 1 }}>📭</Typography>
          <Typography sx={{
            color: C.muted, fontSize: 14,
            fontFamily: "'Vazirmatn', sans-serif",
          }}>
            {isRtl ? "سفارشی ثبت نشده" : "No orders yet"}
          </Typography>
        </Box>
      ) : (
        <TableContainer sx={{
          bgcolor: C.glass, borderRadius: "16px",
          border: `1px solid ${C.glassBorder}`,
          mb: 3, overflow: "auto",
        }}>
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
                ].map(label => (
                  <TableCell key={label} sx={{
                    fontWeight: 800, fontSize: 12,
                    fontFamily: "'Vazirmatn', sans-serif",
                    bgcolor: C.glass, color: C.text,
                    borderBottom: `1px solid ${C.glassBorder}`,
                    whiteSpace: "nowrap", py: 1.2,
                  }}>
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
                  <TableRow key={o.id} onClick={() => onRowClick(o)} sx={{
                    cursor: "pointer", transition: "all 0.15s ease",
                    "&:hover": { bgcolor: `${C.olive}06` },
                    "& td": {
                      borderBottom: `1px solid ${C.glassBorder}`,
                      fontSize: 13, fontFamily: "'Vazirmatn', sans-serif",
                      py: 1, color: C.text,
                    },
                  }}>
                    <TableCell sx={{ fontWeight: 800, color: C.olive }}>
                      #{o.id}
                    </TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>
                      {o.customer_name || (
                        <Typography component="span" sx={{
                          fontSize: 12, color: C.muted, fontStyle: "italic",
                        }}>
                          {isRtl ? "مهمان" : "Guest"}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell sx={{ fontWeight: 800 }}>
                      {fNum(o.total_price)}
                    </TableCell>
                    <TableCell sx={{ maxWidth: 160 }}>
                      {items.slice(0, 2).map((item, i) => (
                        <Typography key={i} sx={{
                          fontSize: 12, whiteSpace: "nowrap",
                          overflow: "hidden", textOverflow: "ellipsis",
                        }}>
                          {item.name} ×{item.quantity}
                        </Typography>
                      ))}
                      {items.length > 2 && (
                        <Typography sx={{ fontSize: 11, color: C.muted }}>
                          +{items.length - 2}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      <Chip label={si.label} size="small" sx={{
                        fontSize: 11, fontWeight: 700, height: 24,
                        bgcolor: si.color + "18", color: si.color,
                        borderRadius: "6px",
                      }} />
                    </TableCell>
                    <TableCell sx={{
                      whiteSpace: "nowrap", fontSize: 12, color: C.sub,
                      direction: "ltr",
                    }}>
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
          <Box sx={{
            display: "flex", alignItems: "center", gap: 1, mb: 2,
          }}>
            <Typography sx={{
              fontWeight: 900, fontSize: 17, color: C.text,
              fontFamily: "'Vazirmatn', sans-serif",
            }}>
              📈 {isRtl ? "تحلیل فروش" : "Sales Analytics"}
            </Typography>
          </Box>

          <Box sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr", md: "repeat(2, 1fr)" },
            gap: 2,
          }}>

            {/* ── ۱. پرفروش‌ترین محصولات ──────── */}
            <Box sx={{
              bgcolor: C.glass, borderRadius: "16px",
              border: `1px solid ${C.glassBorder}`, p: 2.5,
            }}>
              <Typography sx={{
                fontWeight: 800, fontSize: 14, mb: 2,
                fontFamily: "'Vazirmatn', sans-serif", color: C.text,
              }}>
                🏆 {isRtl ? "پرفروش‌ترین محصولات" : "Best Sellers"}
              </Typography>
              {analytics.topItems.length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart
                    data={analytics.topItems}
                    layout="vertical"
                    margin={{ left: 10, right: 30, top: 5, bottom: 5 }}
                  >
                    <XAxis type="number" tick={{ fontSize: 10, fill: C.muted }} />
                    <YAxis
                      type="category" dataKey="name"
                      tick={{ fontSize: 11, fill: C.text, fontFamily: "'Vazirmatn', sans-serif" }}
                      width={90}
                    />
                    <Tooltip content={<ChartTooltip isRtl={isRtl} C={C} />} />
                    <Bar dataKey="quantity" radius={[0, 6, 6, 0]} barSize={18}>
                      {analytics.topItems.map((_, i) => (
                        <Cell key={i} fill={analytics.chartColors[i % analytics.chartColors.length]} />
                      ))}
                      <BarLabel C={C} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <Typography sx={{ textAlign: "center", py: 4, color: C.muted, fontSize: 13 }}>
                  —
                </Typography>
              )}
            </Box>

            {/* ── ۲. شیوه پرداخت ─────────────── */}
            <Box sx={{
              bgcolor: C.glass, borderRadius: "16px",
              border: `1px solid ${C.glassBorder}`, p: 2.5,
            }}>
              <Typography sx={{
                fontWeight: 800, fontSize: 14, mb: 2,
                fontFamily: "'Vazirmatn', sans-serif", color: C.text,
              }}>
                💳 {isRtl ? "شیوه پرداخت" : "Payment Methods"}
              </Typography>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={analytics.paymentBreakdown}
                    cx="50%" cy="50%"
                    innerRadius={50} outerRadius={80}
                    paddingAngle={3} dataKey="count"
                    nameKey="name" label={false}
                  >
                    {analytics.paymentBreakdown.map((entry, i) => (
                      <Cell
                        key={i}
                        fill={analytics.paymentColors[entry.name] || analytics.chartColors[i]}
                      />
                    ))}
                  </Pie>
                  <Tooltip content={<ChartTooltip isRtl={isRtl} C={C} />} />
                  <Legend
                    formatter={(value) => paymentLabel(value)}
                    wrapperStyle={{
                      fontSize: 11, fontFamily: "'Vazirmatn', sans-serif",
                      direction: isRtl ? "rtl" : "ltr",
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </Box>

            {/* ── ۳. توزیع ساعتی ─────────────── */}
            <Box sx={{
              bgcolor: C.glass, borderRadius: "16px",
              border: `1px solid ${C.glassBorder}`, p: 2.5,
            }}>
              <Typography sx={{
                fontWeight: 800, fontSize: 14, mb: 2,
                fontFamily: "'Vazirmatn', sans-serif", color: C.text,
              }}>
                ⏰ {isRtl ? "پیک ساعتی سفارشات" : "Order Time Distribution"}
              </Typography>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={analytics.timeDistribution}>
                  <XAxis
                    dataKey={isRtl ? "labelFa" : "labelEn"}
                    tick={{ fontSize: 11, fill: C.text, fontFamily: "'Vazirmatn', sans-serif" }}
                  />
                  <YAxis tick={{ fontSize: 10, fill: C.muted }} />
                  <Tooltip content={<ChartTooltip isRtl={isRtl} C={C} />} />
                  <Bar dataKey="count" radius={[6, 6, 0, 0]} barSize={35}>
                    {analytics.timeDistribution.map((entry, i) => (
                      <Cell
                        key={i}
                        fill={analytics.chartColors[i % analytics.chartColors.length]}
                        opacity={entry.count === 0 ? 0.25 : 1}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </Box>

            {/* ── ۴. سرویس (سالن/بیرون‌بر) ──── */}
            <Box sx={{
              bgcolor: C.glass, borderRadius: "16px",
              border: `1px solid ${C.glassBorder}`, p: 2.5,
            }}>
              <Typography sx={{
                fontWeight: 800, fontSize: 14, mb: 2,
                fontFamily: "'Vazirmatn', sans-serif", color: C.text,
              }}>
                🏠 {isRtl ? "سالن یا بیرون‌بر" : "Hall vs Takeout"}
              </Typography>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={analytics.sourceBreakdown}
                    cx="50%" cy="50%"
                    innerRadius={50} outerRadius={80}
                    paddingAngle={3} dataKey="count"
                    nameKey="name" label={false}
                  >
                    {analytics.sourceBreakdown.map((entry, i) => (
                      <Cell
                        key={i}
                        fill={analytics.sourceColors[entry.name] || analytics.chartColors[i]}
                      />
                    ))}
                  </Pie>
                  <Tooltip content={<ChartTooltip isRtl={isRtl} C={C} />} />
                  <Legend
                    formatter={(value) => sourceLabel(value)}
                    wrapperStyle={{
                      fontSize: 11, fontFamily: "'Vazirmatn', sans-serif",
                      direction: isRtl ? "rtl" : "ltr",
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </Box>
          </Box>

          {/* ── ۵. مشتریان پرتکرار ──────────── */}
          {analytics.topCustomers.length > 0 && (
            <Box sx={{
              bgcolor: C.glass, borderRadius: "16px",
              border: `1px solid ${C.glassBorder}`, p: 2.5, mt: 2,
            }}>
              <Typography sx={{
                fontWeight: 800, fontSize: 14, mb: 1.5,
                fontFamily: "'Vazirmatn', sans-serif", color: C.text,
              }}>
                👥 {isRtl ? "مشتریان پرتکرار" : "Top Customers"}
              </Typography>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    {[isRtl ? "مشتری" : "Customer", isRtl ? "تعداد" : "Orders", isRtl ? "جمع خرید" : "Revenue"].map(l => (
                      <TableCell key={l} sx={{
                        fontWeight: 800, fontSize: 12, color: C.text,
                        fontFamily: "'Vazirmatn', sans-serif",
                        borderBottom: `1px solid ${C.glassBorder}`,
                      }}>
                        {l}
                      </TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {analytics.topCustomers.map((c, i) => (
                    <TableRow key={i} sx={{
                      "& td": {
                        borderBottom: `1px solid ${C.glassBorder}`,
                        fontSize: 13, fontFamily: "'Vazirmatn', sans-serif",
                        color: C.text,
                      },
                    }}>
                      <TableCell sx={{ fontWeight: 600 }}>
                        <Box sx={{
                          display: "flex", alignItems: "center", gap: 0.8,
                        }}>
                          <Box sx={{
                            width: 26, height: 26, borderRadius: "8px",
                            bgcolor: `${analytics.chartColors[i]}15`,
                            display: "flex", alignItems: "center",
                            justifyContent: "center", fontSize: 11,
                            fontWeight: 900, color: analytics.chartColors[i],
                          }}>
                            {i + 1}
                          </Box>
                          {c.name}
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Chip label={toPersianDigits(c.count)} size="small" sx={{
                          fontSize: 11, fontWeight: 700, height: 24,
                          bgcolor: `${C.olive}15`, color: C.olive,
                          borderRadius: "6px",
                        }} />
                      </TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>
                        {fNum(c.revenue)}
                        <Typography component="span" sx={{
                          fontSize: 10, color: C.muted, mr: 0.3,
                        }}>
                          {isRtl ? "ت" : "T"}
                        </Typography>
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