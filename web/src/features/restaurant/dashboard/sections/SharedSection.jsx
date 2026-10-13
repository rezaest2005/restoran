import React, { useMemo } from "react";
import { Box, Typography, Chip, Grid, IconButton } from "@mui/material";
import { useThemeMode } from "@shared/contexts/ThemeContext";
import { useLang } from "@shared/contexts/LangContext";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

import SectionHeader from "../components/common/SectionHeader";
import GlassCard from "../components/common/GlassCard";

export default function SharedSection() {
  const { mode } = useThemeMode();
  const { isRtl } = useLang();
  const { t } = useTranslation();
  const isDark = mode === "dark";
  const navigate = useNavigate();

  const L = {
    latestActivity: t("dash.latestActivity"),
    secOps: t("dash.secOps"),
    secOpsDesc: t("dash.secOpsDesc"),
    quickAccess: isRtl ? "دسترسی سریع" : "Quick Access",
    pos: isRtl ? "صندوق فروش" : "POS",
    inventory: isRtl ? "مدیریت انبار" : "Inventory",
    menu: isRtl ? "منو غذاها" : "Menu",
    reports: isRtl ? "گزارش‌ها" : "Reports",
  };

  const C = useMemo(() => ({
    glass: isDark ? "rgba(16,18,16,0.65)" : "rgba(240,244,252,0.72)",
    glassBorder: isDark ? "rgba(107,155,110,0.12)" : "rgba(80,100,140,0.15)",
    olive: isDark ? "#6B9B6E" : "#2E4D30",
    text: isDark ? "#F0ECE8" : "#1A1A24",
    sub: isDark ? "#8A8588" : "#555568",
  }), [isDark]);

  // ★★★ مسیرها بدون اسلش اول هستند تا به انتهای آدرس فعلی (مثل /test1/dashboard/app/) اضافه شوند
  const quickActions = [
    { id: 1, icon: "💰", label: L.pos, path: "pos", color: "#10b981", bg: "rgba(16,185,129,0.1)" },
    { id: 2, icon: "📦", label: L.inventory, path: "inventory", color: "#3b82f6", bg: "rgba(59,130,246,0.1)" },
    { id: 3, icon: "🍽️", label: L.menu, path: "dictionary", color: "#f59e0b", bg: "rgba(245,158,11,0.1)" },
    { id: 4, icon: "📊", label: L.reports, path: "reports", color: "#8b5cf6", bg: "rgba(139,92,246,0.1)" },
  ];

  const activities = [
    { time: "۲ دقیقه پیش", timeEn: "2 min ago", action: "سفارش #۱۲۳۴ ثبت شد", actionEn: "Order #1234 placed", type: "pos", icon: "🛒" },
    { time: "۵ دقیقه پیش", timeEn: "5 min ago", action: "موجودی برنج کم شد", actionEn: "Rice stock low", type: "inventory", icon: "📦" },
    { time: "۱۵ دقیقه پیش", timeEn: "15 min ago", action: "پرداخت نقدی ۵۰۰,۰۰۰ تومان", actionEn: "Cash payment 500k", type: "pos", icon: "💰" },
    { time: "۳۰ دقیقه پیش", timeEn: "30 min ago", action: "ورود کالا: گوشت ۲۰ کیلو", actionEn: "Stock in: Meat 20kg", type: "inventory", icon: "📥" },
    { time: "۱ ساعت پیش", timeEn: "1 hour ago", action: "سفارش #۱۲۳۳ تکمیل شد", actionEn: "Order #1233 completed", type: "pos", icon: "✅" },
    { time: "۲ ساعت پیش", timeEn: "2 hours ago", action: "هشدار انقضای ماست", actionEn: "Yogurt expiry alert", type: "inventory", icon: "⚠️" },
  ];

  return (
    <Box>
      <SectionHeader icon="⚡" title={L.quickAccess} subtitle={L.secOpsDesc} C={C} isRtl={isRtl} delay={0.7} />
      
      {/* ★ بخش دسترسی‌های سریع (کارت‌های خالی را پر می‌کند) */}
      <Grid container spacing={2} sx={{ mb: 4 }}>
        {quickActions.map((action) => (
          <Grid item xs={12} sm={6} md={3} key={action.id}>
            <GlassCard C={C} delay={0.75}>
              <Box 
                onClick={() => navigate(action.path)} 
                sx={{ 
                  p: 2.5, 
                  display: "flex", 
                  alignItems: "center", 
                  gap: 2, 
                  cursor: "pointer",
                  transition: "transform 0.2s",
                  "&:hover": { transform: "translateY(-3px)" }
                }}
              >
                <Box sx={{
                  width: 48, height: 48, borderRadius: "12px",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: "1.5rem", bgcolor: action.bg, color: action.color,
                  flexShrink: 0
                }}>
                  {action.icon}
                </Box>
                <Box>
                  <Typography sx={{ fontSize: 15, fontWeight: 700, color: C.text }}>
                    {action.label}
                  </Typography>
                  <Typography sx={{ fontSize: 12, color: C.sub, mt: 0.3 }}>
                    {isRtl ? "ورود به بخش" : "Go to section"}
                  </Typography>
                </Box>
              </Box>
            </GlassCard>
          </Grid>
        ))}
      </Grid>

      <SectionHeader icon="🕐" title={L.latestActivity} subtitle={L.secOpsDesc} C={C} isRtl={isRtl} delay={0.8} />
      <GlassCard C={C} delay={0.85}>
        <Box sx={{ p: { xs: 2, md: 3 }, display: "flex", flexDirection: "column", gap: 1.5 }}>
          {activities.map((a, i) => (
            <Box key={i} sx={{
              display: "flex", alignItems: "center", gap: 1.5, p: 1.2, borderRadius: 2,
              background: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)",
              borderRight: `3px solid ${a.type === "pos" ? "#6B9B6E" : "#3b82f6"}`,
            }}>
              <span style={{ fontSize: "1.1rem" }}>{a.icon}</span>
              <Box sx={{ flex: 1 }}>
                <Typography sx={{ color: C.text, fontSize: 12.5 }}>
                  {isRtl ? a.action : a.actionEn}
                </Typography>
                <Typography sx={{ color: C.sub, fontSize: 11 }}>
                  {isRtl ? a.time : a.timeEn}
                </Typography>
              </Box>
              <Chip
                label={a.type === "pos" ? (isRtl ? "صندوق" : "POS") : (isRtl ? "انبار" : "Inv")}
                size="small"
                sx={{
                  bgcolor: a.type === "pos" ? "rgba(107,155,110,0.12)" : "rgba(59,130,246,0.12)",
                  color: a.type === "pos" ? "#6B9B6E" : "#3b82f6",
                  fontWeight: 600, fontSize: 10,
                }}
              />
            </Box>
          ))}
        </Box>
      </GlassCard>
    </Box>
  );
}