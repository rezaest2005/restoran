import React, { useState, useMemo, useCallback } from "react";
import { Box, Typography, Chip } from "@mui/material";
import { useThemeMode } from "@shared/contexts/ThemeContext";
import { useLang } from "@shared/contexts/LangContext";
import { useTranslation } from "react-i18next";
import { 
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, 
  CartesianGrid, Tooltip, Legend, PieChart, Pie, Cell, 
  AreaChart, Area 
} from "recharts";

import SectionHeader from "../components/common/SectionHeader";
import GlassCard from "../components/common/GlassCard";

export default function PosSection({ data }) {
  const { mode } = useThemeMode();
  const { isRtl } = useLang();
  const { t } = useTranslation();
  const isDark = mode === "dark";

  const L = {
    todaySales: t("dash.todaySales"),
    todayOrders: t("dash.todayOrders"),
    activeCustomers: t("dash.activeCustomers"),
    avgTime: t("dash.avgTime"),
    secSales: t("dash.secSales"),
    secSalesDesc: t("dash.secSalesDesc"),
    secTime: t("dash.secTime"),
    secTimeDesc: t("dash.secTimeDesc"),
    secMenu: t("dash.secMenu"),
    secMenuDesc: t("dash.secMenuDesc"),
    tuman: t("dash.tuman"),
    min: t("dash.min"),
  };

  const C = useMemo(() => ({
    glass: isDark ? "rgba(16,18,16,0.65)" : "rgba(240,244,252,0.72)",
    glassBorder: isDark ? "rgba(107,155,110,0.12)" : "rgba(80,100,140,0.15)",
    olive: isDark ? "#6B9B6E" : "#2E4D30",
    text: isDark ? "#F0ECE8" : "#1A1A24",
    sub: isDark ? "#8A8588" : "#555568",
    muted: isDark ? "#4A4548" : "#8A8A9E",
  }), [isDark]);

  const fmtN = useCallback((n) => {
    if (n == null) return "—";
    return isRtl ? Number(n).toLocaleString("fa-IR") : Number(n).toLocaleString("en-US");
  }, [isRtl]);

  const tooltipStyle = {
    background: isDark ? "rgba(16,18,16,0.94)" : "rgba(240,244,252,0.96)",
    border: `1px solid ${C.glassBorder}`, borderRadius: "12px",
    fontFamily: "Vazirmatn", fontSize: 14, color: C.text,
    boxShadow: isDark ? "0 8px 32px rgba(0,0,0,0.5)" : "0 8px 32px rgba(0,0,0,0.1)",
    padding: "12px 16px",
    direction: isRtl ? "rtl" : "ltr",
  };

  const chartGridStroke = isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)";

  const chartData = data.salesTrend.map((d) => ({ ...d, displayName: isRtl ? d.name : d.nameEn }));
  const hourlyData = data.hourly.map((d) => ({ ...d, displayName: isRtl ? d.hour : d.hourEn }));

  const stats = [
    { icon: "💰", color: "#ff6b35", value: `${fmtN(data.stats.sales)}`, unit: L.tuman, label: L.todaySales },
    { icon: "🧾", color: "#3b82f6", value: `${fmtN(data.stats.orders)}`, unit: "", label: L.todayOrders },
    { icon: "👥", color: "#10b981", value: `${fmtN(data.stats.customers)}`, unit: "", label: L.activeCustomers },
    { icon: "⏱️", color: "#8b5cf6", value: `${fmtN(data.stats.avgTime)}`, unit: L.min, label: L.avgTime }
  ];

  return (
    <Box sx={{ width: "100%", mb: 6 }}>
      
      {/* === آمار کلی === */}
      <SectionHeader icon="📊" title={L.todaySales} subtitle={L.secSalesDesc} C={C} isRtl={isRtl} delay={0.05} />
      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 3, mb: 5, width: "100%" }}>
        {stats.map((stat, i) => (
          <Box key={i} sx={{ flexGrow: 1, flexBasis: { xs: "100%", sm: "calc(50% - 12px)", md: "calc(25% - 18px)" }, minWidth: "220px" }}>
            <GlassCard C={C} sx={{ p: 2.5, height: "100%", width: "100%" }}>
              <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
                <Box sx={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                  <Typography sx={{ fontSize: 13, color: C.sub, fontWeight: 600, mb: 1 }}>{stat.label}</Typography>
                  <Box sx={{ display: "flex", alignItems: "baseline", gap: 0.5 }}>
                    <Typography sx={{ fontSize: 24, fontWeight: 800, color: C.text }}>{stat.value}</Typography>
                    {stat.unit && <Typography sx={{ fontSize: 13, color: C.muted, fontWeight: 600 }}>{stat.unit}</Typography>}
                  </Box>
                </Box>
                <Box sx={{ fontSize: 22, background: `${stat.color}1A`, color: stat.color, width: 48, height: 48, borderRadius: "12px", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  {stat.icon}
                </Box>
              </Box>
            </GlassCard>
          </Box>
        ))}
      </Box>

      {/* === تحلیل فروش === */}
      <SectionHeader icon="📈" title={L.secSales} subtitle={L.secSalesDesc} C={C} isRtl={isRtl} delay={0.2} />
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "2fr 1fr" }, gap: 3, mb: 5, width: "100%" }}>
        <GlassCard C={C} sx={{ p: 3, width: "100%", height: 500, overflow: "visible" }}>
          <Typography sx={{ fontSize: 18, fontWeight: 800, color: C.text, mb: 3 }}>روند فروش هفتگی</Typography>
          <Box sx={{ width: "100%", height: 420 }}>
            <ResponsiveContainer width="100%" height="100%">
              {/* افزایش حاشیه های نمودار برای جلوگیری از چسبیدن متن ها */}
              <AreaChart data={chartData} margin={{ top: 20, right: 30, left: 10, bottom: 20 }}>
                <defs>
                  <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ff6b35" stopOpacity={0.8}/>
                    <stop offset="95%" stopColor="#ff6b35" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorOrders" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={chartGridStroke} vertical={false} />
                <XAxis dataKey="displayName" stroke={C.muted} fontSize={16} tickLine={false} axisLine={false} dy={10} />
                <YAxis stroke={C.muted} fontSize={16} tickLine={false} axisLine={false} dx={-10} />
                <Tooltip contentStyle={tooltipStyle} cursor={{ stroke: C.glassBorder, strokeWidth: 1 }} />
                <Legend wrapperStyle={{ fontSize: 16, paddingTop: "20px" }} />
                <Area type="monotone" dataKey="sales" name="فروش" stroke="#ff6b35" strokeWidth={4} fillOpacity={1} fill="url(#colorSales)" />
                <Area type="monotone" dataKey="orders" name="سفارشات" stroke="#3b82f6" strokeWidth={4} fillOpacity={1} fill="url(#colorOrders)" />
              </AreaChart>
            </ResponsiveContainer>
          </Box>
        </GlassCard>

        <GlassCard C={C} sx={{ p: 3, width: "100%", height: 500, overflow: "visible" }}>
          <Typography sx={{ fontSize: 18, fontWeight: 800, color: C.text, mb: 3 }}>دسته‌بندی فروش</Typography>
          <Box sx={{ width: "100%", height: 420 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart margin={{ top: 20, right: 20, left: 20, bottom: 20 }}>
                {/* حذف لیبل خطی و انتقال به Legend پایین برای خوانایی بهتر */}
                <Pie data={data.categories} dataKey="value" nameKey="name" cx="50%" cy="45%" innerRadius={80} outerRadius={130} paddingAngle={3}>
                  {data.categories.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 16, paddingTop: "20px" }} />
              </PieChart>
            </ResponsiveContainer>
          </Box>
        </GlassCard>
      </Box>

      {/* === الگو زمانی === */}
      <SectionHeader icon="🔥" title={L.secTime} subtitle={L.secTimeDesc} C={C} isRtl={isRtl} delay={0.4} />
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "2fr 1fr" }, gap: 3, mb: 5, width: "100%" }}>
        <GlassCard C={C} sx={{ p: 3, width: "100%", height: 500, overflow: "visible" }}>
          <Typography sx={{ fontSize: 18, fontWeight: 800, color: C.text, mb: 3 }}>ساعات اوج تقاضا</Typography>
          <Box sx={{ width: "100%", height: 420 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={hourlyData} margin={{ top: 20, right: 30, left: 10, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={chartGridStroke} vertical={false} />
                <XAxis dataKey="displayName" stroke={C.muted} fontSize={16} tickLine={false} axisLine={false} dy={10} />
                <YAxis stroke={C.muted} fontSize={16} tickLine={false} axisLine={false} dx={-10} />
                <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'transparent' }} />
                <Bar dataKey="orders" name="تعداد سفارشات" fill="#10b981" radius={[8, 8, 0, 0]} barSize={32} />
              </BarChart>
            </ResponsiveContainer>
          </Box>
        </GlassCard>

        <GlassCard C={C} sx={{ p: 3, width: "100%", height: 500, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <Typography sx={{ fontSize: 18, fontWeight: 800, color: C.text, mb: 3, flexShrink: 0 }}>مقایسه هفتگی</Typography>
          <Box sx={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", gap: 3, width: "100%" }}>
            <Box sx={{ background: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)", p: 3, borderRadius: 3, width: "100%" }}>
              <Typography sx={{ fontSize: 14, color: C.sub, mb: 1 }}>فروش این هفته</Typography>
              <Typography sx={{ fontSize: 26, fontWeight: 800, color: C.olive }}>{fmtN(data.weeklyCompare.thisWeek)} <span style={{fontSize: 14, fontWeight: 600}}>{L.tuman}</span></Typography>
            </Box>
            <Box sx={{ background: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)", p: 3, borderRadius: 3, width: "100%" }}>
              <Typography sx={{ fontSize: 14, color: C.sub, mb: 1 }}>فروش هفته قبل</Typography>
              <Typography sx={{ fontSize: 22, fontWeight: 700, color: C.text, opacity: 0.7 }}>{fmtN(data.weeklyCompare.lastWeek)} <span style={{fontSize: 14, fontWeight: 600}}>{L.tuman}</span></Typography>
            </Box>
            <Chip label={`تغییر: ${data.weeklyCompare.change}%`} sx={{ alignSelf: "flex-start", bgcolor: data.weeklyCompare.change > 0 ? "rgba(16,185,129,0.1)" : "rgba(239,68,68,0.1)", color: data.weeklyCompare.change > 0 ? "#10b981" : "#ef4444", fontWeight: 800, fontSize: 16, py: 2, px: 1 }} />
          </Box>
        </GlassCard>
      </Box>

      {/* === منو === */}
      <SectionHeader icon="🍽️" title={L.secMenu} subtitle={L.secMenuDesc} C={C} isRtl={isRtl} delay={0.6} />
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "1fr 1fr" }, gap: 3, mb: 5, width: "100%" }}>
        <GlassCard C={C} sx={{ p: 3, width: "100%", minHeight: 450, overflow: "hidden" }}>
          <Typography sx={{ fontSize: 18, fontWeight: 800, color: C.text, mb: 3 }}>پرفروش‌ترین غذاها</Typography>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 2, width: "100%" }}>
            {data.topItems.map((item, i) => (
              <Box key={i} sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", p: 2, borderRadius: 2, background: i === 0 ? `${C.olive}15` : (isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)") }}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 2, minWidth: 0 }}>
                  <Box sx={{ width: 32, height: 32, borderRadius: "50%", background: i < 3 ? C.olive : C.muted, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 800, flexShrink: 0 }}>{isRtl ? (i+1).toLocaleString("fa-IR") : i+1}</Box>
                  <Typography sx={{ fontSize: 16, fontWeight: 600, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.name}</Typography>
                </Box>
                <Typography sx={{ fontSize: 14, fontWeight: 700, color: C.sub, flexShrink: 0, mr: 2, ml: 2 }}>{fmtN(item.sales)} فروش</Typography>
              </Box>
            ))}
          </Box>
        </GlassCard>

        <GlassCard C={C} sx={{ p: 3, width: "100%", minHeight: 450, overflow: "hidden" }}>
          <Typography sx={{ fontSize: 18, fontWeight: 800, color: C.text, mb: 3 }}>کم‌فروش‌ترین غذاها</Typography>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 2, width: "100%" }}>
            {data.lowItems.map((item, i) => (
              <Box key={i} sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", p: 2, borderRadius: 2, background: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)" }}>
                <Typography sx={{ fontSize: 16, fontWeight: 600, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>{item.name}</Typography>
                <Typography sx={{ fontSize: 14, fontWeight: 700, color: "#ef4444", flexShrink: 0, mr: 2, ml: 2 }}>{fmtN(item.sales)} فروش</Typography>
              </Box>
            ))}
          </Box>
        </GlassCard>
      </Box>
    </Box>
  );
}