import React, { useMemo, useCallback } from "react";
import { Box, Typography, Chip } from "@mui/material";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, PieChart, Pie, Cell,
} from "recharts";
import { useThemeMode } from "@shared/contexts/ThemeContext";
import { useLang } from "@shared/contexts/LangContext";
import { useTranslation } from "react-i18next";

import SectionHeader from "../components/common/SectionHeader";
import GlassCard from "../components/common/GlassCard";

export default function InventorySection({ data }) {
  const { mode } = useThemeMode();
  const { isRtl } = useLang();
  const { t } = useTranslation();
  const isDark = mode === "dark";

  const L = {
    stockValue: t("inv.stockValue"),
    lowStock: t("inv.lowStock"),
    expiring: t("inv.expiring"),
    monthlyWaste: t("inv.monthlyWaste"),
    stockLevel: t("inv.stockLevel"),
    stockFlow: t("inv.stockFlow"),
    wasteBreakdown: t("inv.wasteBreakdown"),
    stockAlerts: t("inv.stockAlerts"),
    expiringItems: t("inv.expiringItems"),
    topUsed: t("inv.topUsed"),
    slowMovers: t("inv.slowMovers"),
    tuman: t("dash.tuman"),
    current: t("inv.current"),
    minLabel: t("inv.minLabel"),
    inbound: t("inv.inbound"),
    outbound: t("inv.outbound"),
    secInventory: t("inv.secInventory"),
    secInventoryDesc: t("inv.secInventoryDesc"),
    secStock: t("inv.secStock"),
    secStockDesc: t("inv.secStockDesc"),
    secWaste: t("inv.secWaste"),
    secWasteDesc: t("inv.secWasteDesc"),
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

  const SEVERITY = {
    critical: { bg: isDark ? "rgba(232,64,87,0.12)" : "rgba(200,48,72,0.1)", color: isDark ? "#E84057" : "#C83048" },
    warning: { bg: isDark ? "rgba(245,158,11,0.12)" : "rgba(217,119,6,0.1)", color: isDark ? "#F59E0B" : "#D97706" },
    ok: { bg: isDark ? "rgba(16,185,129,0.12)" : "rgba(5,150,105,0.1)", color: isDark ? "#10B981" : "#059669" },
  };

  // ★ ایمن‌سازی داده‌ها با || [] تا اگر بک‌اند خالی فرستاد، کرش نکند
  const stockLevelData = (data.stockLevel || []).map(d => ({ ...d, displayName: isRtl ? d.name : d.nameEn }));
  const stockFlowData = (data.stockFlow || []).map(d => ({ ...d, displayName: isRtl ? d.day : d.dayEn }));
  const wastePieData = (data.wastePie || []).map(d => ({ ...d, displayName: isRtl ? d.name : d.nameEn }));
  const stockAlertsData = data.stockAlerts || [];
  const expiringData = data.expiring || [];
  const topUsedData = data.topUsed || [];
  const slowMoversData = data.slowMovers || [];

  const stats = [
    { icon: "📦", color: "#10b981", value: fmtN(data.stats?.stockValue), unit: L.tuman, label: L.stockValue },
    { icon: "⚠️", color: "#f59e0b", value: fmtN(data.stats?.lowStock), unit: "", label: L.lowStock },
    { icon: "⏳", color: "#ef4444", value: fmtN(data.stats?.expiring), unit: "", label: L.expiring },
    { icon: "🗑️", color: "#8b5cf6", value: fmtN(data.stats?.monthlyWaste), unit: L.tuman, label: L.monthlyWaste }
  ];

  return (
    <Box sx={{ width: "100%", mb: 6, overflow: "hidden" }}>
      
      {/* === آمار انبار === */}
      <SectionHeader icon="📦" title={L.secInventory} subtitle={L.secInventoryDesc} C={C} isRtl={isRtl} delay={0.05} />
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
                <Box sx={{ fontSize: 22, background: `${stat.color}1A`, color: stat.color, width: 48, height: 48, borderRadius: "12px", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{stat.icon}</Box>
              </Box>
            </GlassCard>
          </Box>
        ))}
      </Box>

      {/* === سطح موجودی + جریان === */}
      <SectionHeader icon="📊" title={L.secStock} subtitle={L.secStockDesc} C={C} isRtl={isRtl} delay={0.2} />
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "7fr 5fr" }, gap: 3, mb: 5, width: "100%" }}>

        <GlassCard C={C} sx={{ p: 3, width: "100%", height: 500, overflow: "visible" }}>
          <Typography sx={{ fontSize: 18, fontWeight: 800, color: C.text, mb: 3 }}>📊 {L.stockLevel}</Typography>
          <Box sx={{ width: "100%", height: 420 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stockLevelData} layout="vertical" margin={{ top: 20, right: isRtl ? 180 : 30, left: isRtl ? 30 : 180, bottom: 10 }} barGap={8}>
                <CartesianGrid strokeDasharray="3 3" stroke={chartGridStroke} horizontal={true} vertical={false} />
                <XAxis type="number" tick={{ fill: C.sub, fontSize: 13 }} tickLine={false} axisLine={{ stroke: C.glassBorder, strokeWidth: 2 }} dy={10} />
                <YAxis dataKey="displayName" type="category" tick={{ fill: C.text, fontSize: 13, fontWeight: 600, textAnchor: isRtl ? "start" : "end" }} width={160} interval={0} orientation={isRtl ? "left" : "right"} tickLine={false} axisLine={{ stroke: C.glassBorder, strokeWidth: 2 }} tickMargin={isRtl ? 25 : 15} />
                <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "transparent" }} formatter={(v, name) => [v, name === "current" ? L.current : L.minLabel]} />
                <Legend wrapperStyle={{ fontSize: 14, paddingTop: "15px" }} />
                <Bar dataKey="min" name={L.minLabel} fill="#E84057" radius={[0, 8, 8, 0]} opacity={0.4} barSize={14} />
                <Bar dataKey="current" name={L.current} fill={C.olive} radius={[0, 8, 8, 0]} barSize={14} />
              </BarChart>
            </ResponsiveContainer>
          </Box>
        </GlassCard>

        <GlassCard C={C} sx={{ p: 3, width: "100%", height: 500, overflow: "visible" }}>
          <Typography sx={{ fontSize: 18, fontWeight: 800, color: C.text, mb: 3 }}>📈 {L.stockFlow}</Typography>
          <Box sx={{ width: "100%", height: 420 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stockFlowData} margin={{ top: 20, right: 30, left: 10, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={chartGridStroke} vertical={false} />
                <XAxis dataKey="displayName" stroke={C.muted} fontSize={14} tickLine={false} axisLine={false} dy={10} />
                <YAxis stroke={C.muted} fontSize={14} tickLine={false} axisLine={false} dx={-10} />
                <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "transparent" }} formatter={(v, name) => [v, name === "inbound" ? L.inbound : L.outbound]} />
                <Legend wrapperStyle={{ fontSize: 14, paddingTop: "15px" }} />
                <Bar dataKey="inbound" name={L.inbound} fill="#6B9B6E" radius={[6, 6, 0, 0]} barSize={22} />
                <Bar dataKey="outbound" name={L.outbound} fill="#E84057" radius={[6, 6, 0, 0]} barSize={22} />
              </BarChart>
            </ResponsiveContainer>
          </Box>
        </GlassCard>
      </Box>

      {/* === ضایعات + هشدارها === */}
      <SectionHeader icon="🗑️" title={L.secWaste} subtitle={L.secWasteDesc} C={C} isRtl={isRtl} delay={0.4} />
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "5fr 7fr" }, gap: 3, mb: 5, width: "100%" }}>
        
        <GlassCard C={C} sx={{ p: 3, width: "100%", height: 500, overflow: "visible" }}>
          <Typography sx={{ fontSize: 18, fontWeight: 800, color: C.text, mb: 3 }}>🥧 {L.wasteBreakdown}</Typography>
          <Box sx={{ width: "100%", height: 420 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart margin={{ top: 20, right: 20, left: 20, bottom: 20 }}>
                <Pie data={wastePieData} cx="50%" cy="45%" innerRadius={80} outerRadius={130} paddingAngle={3} dataKey="value">
                  {wastePieData.map((e, i) => <Cell key={i} fill={e.color} />)}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} formatter={(v) => [`${v}%`, ""]} />
                <Legend wrapperStyle={{ fontSize: 16, paddingTop: "20px" }} />
              </PieChart>
            </ResponsiveContainer>
          </Box>
        </GlassCard>

        <GlassCard C={C} sx={{ p: 3, width: "100%", height: 500, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <Typography sx={{ fontSize: 18, fontWeight: 800, color: C.text, mb: 3, flexShrink: 0 }}>⚠️ {L.stockAlerts}</Typography>
          <Box sx={{ flex: 1, display: "flex", flexDirection: "column", gap: 2, width: "100%", overflowY: "auto" }}>
            {stockAlertsData.map((alert, i) => {
              const sev = SEVERITY[alert.level] || SEVERITY.ok;
              return (
                <Box key={i} sx={{ p: 2.5, borderRadius: 3, background: sev.bg, border: `1px solid ${sev.color}33`, display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }}>
                  <Box sx={{ minWidth: 0, flex: 1 }}>
                    <Typography sx={{ color: C.text, fontWeight: 700, fontSize: 16, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{isRtl ? alert.name : alert.nameEn}</Typography>
                    <Typography sx={{ color: sev.color, fontSize: 14, mt: 0.5, fontWeight: 600 }}>{isRtl ? alert.message : alert.messageEn}</Typography>
                  </Box>
                  <Chip label={`${fmtN(alert.current)} / ${fmtN(alert.min)}`} sx={{ bgcolor: `${sev.color}22`, color: sev.color, fontWeight: 800, fontSize: 14, flexShrink: 0, mr: 2, ml: 2 }} />
                </Box>
              );
            })}
          </Box>
        </GlassCard>
      </Box>

      {/* === نزدیک انقضا + بیشترین مصرف + کم‌گردش === */}
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "1fr 1fr 1fr" }, gap: 3, mb: 5, width: "100%" }}>
        
        <GlassCard C={C} sx={{ p: 3, width: "100%", minHeight: 450, overflow: "hidden" }}>
          <Typography sx={{ fontSize: 18, fontWeight: 800, color: C.text, mb: 3 }}>⏳ {L.expiringItems}</Typography>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2, width: "100%" }}>
            {expiringData.map((item, i) => {
              const sev = SEVERITY[item.severity] || SEVERITY.ok;
              return (
                <Box key={i} sx={{ p: 2, borderRadius: 2, background: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)", borderRight: `4px solid ${sev.color}`, display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }}>
                  <Box sx={{ minWidth: 0, flex: 1 }}>
                    <Typography sx={{ color: C.text, fontWeight: 700, fontSize: 15, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{isRtl ? item.name : item.nameEn}</Typography>
                    <Typography sx={{ color: C.sub, fontSize: 13, mt: 0.3 }}>{fmtN(item.quantity)} {item.unit}</Typography>
                  </Box>
                  <Chip label={isRtl ? item.expiry : item.expiryEn} sx={{ bgcolor: `${sev.color}22`, color: sev.color, fontWeight: 700, fontSize: 13, flexShrink: 0, mr: 2, ml: 2 }} />
                </Box>
              );
            })}
          </Box>
        </GlassCard>

        <GlassCard C={C} sx={{ p: 3, width: "100%", minHeight: 450, overflow: "hidden" }}>
          <Typography sx={{ fontSize: 18, fontWeight: 800, color: C.text, mb: 3 }}>🆙 {L.topUsed}</Typography>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2, width: "100%" }}>
            {topUsedData.map((item, i) => (
              <Box key={i} sx={{ p: 2, borderRadius: 2, background: i === 0 ? `${C.olive}15` : (isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)"), display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, minWidth: 0, flex: 1 }}>
                  <Box sx={{ width: 32, height: 32, borderRadius: "50%", background: i < 3 ? C.olive : C.glassBorder, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 14, fontWeight: 800, flexShrink: 0 }}>{isRtl ? (i+1).toLocaleString("fa-IR") : i+1}</Box>
                  <Typography sx={{ color: C.text, fontWeight: 700, fontSize: 15, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{isRtl ? item.name : item.nameEn}</Typography>
                </Box>
                <Typography sx={{ color: C.sub, fontWeight: 700, fontSize: 14, flexShrink: 0, mr: 2, ml: 2 }}>{fmtN(item.used)} {item.unit}</Typography>
              </Box>
            ))}
          </Box>
        </GlassCard>

        <GlassCard C={C} sx={{ p: 3, width: "100%", minHeight: 450, overflow: "hidden" }}>
          <Typography sx={{ fontSize: 18, fontWeight: 800, color: C.text, mb: 3 }}>📉 {L.slowMovers}</Typography>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2, width: "100%" }}>
            {slowMoversData.map((item, i) => (
              <Box key={i} sx={{ p: 2, borderRadius: 2, background: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)", display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }}>
                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Typography sx={{ color: C.text, fontWeight: 700, fontSize: 15, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{isRtl ? item.name : item.nameEn}</Typography>
                  <Typography sx={{ color: C.sub, fontSize: 13, mt: 0.3 }}>{isRtl ? item.lastUsed : item.lastUsedEn}</Typography>
                </Box>
                <Typography sx={{ color: "#D97706", fontWeight: 700, fontSize: 14, flexShrink: 0, mr: 2, ml: 2 }}>{fmtN(item.quantity)} {item.unit}</Typography>
              </Box>
            ))}
          </Box>
        </GlassCard>
      </Box>
    </Box>
  );
}