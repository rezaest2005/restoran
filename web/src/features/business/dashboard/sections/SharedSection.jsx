import { useMemo } from "react";
import { Box, Typography, Chip, Grid } from "@mui/material";
import { useThemeMode } from "@shared/contexts/ThemeContext";
import { useLang } from "@shared/contexts/LangContext";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

import SectionHeader from "../components/common/SectionHeader";
import GlassCard from "../components/common/GlassCard";
import { buildColors } from "@shared/palette";

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
    quickAccess: t("ui_b.dashShared.quickAccess"),
    pos: t("ui_b.dashShared.pos"),
    inventory: t("ui_b.dashShared.inventory"),
    menu: t("ui_b.dashShared.menu"),
    reports: t("ui_b.dashShared.reports"),
    noActivity: t("ui_b.dashShared.noActivity")
  };

  const C = useMemo(() => buildColors(isDark), [isDark]);

  const quickActions = [
    { id: 1, icon: "💰", label: L.pos, path: "pos", color: "var(--success)", bg: "color-mix(in srgb, var(--success) 10%, transparent)" },
    { id: 2, icon: "📦", label: L.inventory, path: "inventory", color: "var(--info)", bg: "color-mix(in srgb, var(--info) 10%, transparent)" },
    { id: 3, icon: "🍽️", label: L.menu, path: "dictionary", color: "var(--warning)", bg: "color-mix(in srgb, var(--warning) 10%, transparent)" },
    { id: 4, icon: "📊", label: L.reports, path: "reports", color: "var(--chart-4)", bg: "color-mix(in srgb, var(--chart-4) 10%, transparent)" },
  ];

  // ★★★ حذف لیست ثابت فعالیت‌ها. در آینده می‌توان این را از API گرفت ★★★
  const activities = [];

  return (
    <Box>
      <SectionHeader icon="⚡" title={L.quickAccess} subtitle={L.secOpsDesc} C={C} isRtl={isRtl} delay={0.7} />
      
      {/* بخش دسترسی‌های سریع */}
      <Grid container spacing={2} sx={{ mb: 4 }}>
        {quickActions.map((action) => (
          <Grid size={{ xs: 12, sm: 6, md: 3 }} key={action.id}>
            <GlassCard C={C} delay={0.75}>
              <Box 
                role="link" tabIndex={0}
                onClick={() => navigate(action.path)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); navigate(action.path); } }}
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
                    {t("ui_b.dashShared.goToSection")}
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
          {activities.length > 0 ? (
            activities.map((a, i) => (
              <Box key={i} sx={{
                display: "flex", alignItems: "center", gap: 1.5, p: 1.2, borderRadius: 2,
                background: isDark ? "var(--surface-sunken)" : "color-mix(in srgb, var(--ink) 2%, transparent)",
                borderRight: `3px solid ${a.type === "pos" ? "var(--success)" : "var(--info)"}`,
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
                  label={a.type === "pos" ? t("ui_b.dashShared.chipPos") : t("ui_b.dashShared.chipInv")}
                  size="small"
                  sx={{
                    bgcolor: a.type === "pos" ? "color-mix(in srgb, var(--success) 12%, transparent)" : "color-mix(in srgb, var(--info) 12%, transparent)",
                    color: a.type === "pos" ? "var(--success)" : "var(--info)",
                    fontWeight: 600, fontSize: 10,
                  }}
                />
              </Box>
            ))
          ) : (
            // ★★★ نمایش این پیام وقتی فعالیتی وجود ندارد ★★★
            <Box sx={{ textAlign: "center", py: 4 }}>
              <Typography sx={{ color: C.muted, fontSize: 14 }}>
                {L.noActivity}
              </Typography>
            </Box>
          )}
        </Box>
      </GlassCard>
    </Box>
  );
}