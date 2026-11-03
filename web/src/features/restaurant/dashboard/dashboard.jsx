import React, { useState, useEffect, useMemo } from "react";
import { Box, Typography, CircularProgress } from "@mui/material";
import { useThemeMode } from "@shared/contexts/ThemeContext";
import { useLang } from "@shared/contexts/LangContext";
import { useTranslation } from "react-i18next";
import i18n from "i18next";
import { animations } from "./constants/animations";
import useDashboardData from "./hooks/useDashboardData";

import PosSection from "./sections/PosSection";
import InventorySection from "./sections/InventorySection";
import SharedSection from "./sections/SharedSection";
import { buildColors } from "@shared/palette";

class SectionErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, info) {
    console.error(`🔴 خطا در ${this.props.name}:`, error);
  }
  render() {
    if (this.state.hasError) {
      return (
        <Box sx={{ p: 3, m: 2, borderRadius: 3, border: "2px solid #f44336", background: "rgba(244,67,54,0.15)" }}>
          <Typography sx={{ fontSize: 16, fontWeight: 800, color: "#f44336" }}>
            ⚠️ {i18n.t("ui_a.dashboard.error_in", { name: this.props.name })}
          </Typography>
          <Typography sx={{ fontSize: 12, color: "#f44336", fontFamily: "monospace", mt: 1 }}>
            {this.state.error?.message}
          </Typography>
        </Box>
      );
    }
    return this.props.children;
  }
}

export default function Dashboard() {
  const { mode } = useThemeMode();
  const { isRtl, lang } = useLang();
  const { t } = useTranslation();
  const isDark = mode === "dark";

  const L = {
    greeting: t("dash.greeting"),
    summary: t("dash.summary"),
    loading: t("dash.loading"),
  };

  const [mounted, setMounted] = useState(false);

  // ✅ بدون serviceType — همیشه هر دو بخش
  const { loading, posData, inventoryData } = useDashboardData("both");

  useEffect(() => {
    const tmr = setTimeout(() => setMounted(true), 80);
    return () => clearTimeout(tmr);
  }, []);

  const C = useMemo(() => buildColors(isDark), [isDark]);

  const dateText = useMemo(() => {
    const now = new Date();
    return t("ui_a.dashboard.date_format", {
      day: t(`ui_a.dashboard.days.d${now.getDay()}`),
      date: now.getDate(),
      month: t(`ui_a.dashboard.months.m${now.getMonth()}`),
    });
  }, [t]);

  if (loading) {
    return (
      <Box sx={{
        display: "flex", flexDirection: "column",
        justifyContent: "center", alignItems: "center",
        height: "60vh", gap: 2,
      }}>
        <CircularProgress sx={{ color: C.olive }} size={40} />
        <Typography sx={{ fontSize: 13, color: C.sub }}>{L.loading}</Typography>
      </Box>
    );
  }

  return (
    <Box dir={isRtl ? "rtl" : "ltr"} sx={{
      width: "100%",
      px: { xs: 1.5, sm: 2, md: 2.5, xl: 3 },
      pb: 8,
      fontFamily: "'Vazirmatn', 'Plus Jakarta Sans', sans-serif",
      opacity: 1,
      background: isDark
        ? "radial-gradient(ellipse at 15% 30%, rgba(107,155,110,0.04) 0%, transparent 50%), radial-gradient(ellipse at 85% 70%, rgba(168,64,96,0.03) 0%, transparent 50%)"
        : "radial-gradient(ellipse at 15% 30%, rgba(80,100,160,0.04) 0%, transparent 50%), radial-gradient(ellipse at 85% 70%, rgba(120,40,70,0.03) 0%, transparent 50%)",
      minHeight: "100vh",
    }}>
      <style>{animations}</style>

      {/* ── هدر ── */}
      <Box sx={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        mb: 3, flexDirection: { xs: "column", sm: "row" }, gap: 1.5, pt: 1,
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
        <Box sx={{
          display: "flex", alignItems: "center", gap: 1.5,
          bgcolor: C.glass, border: `1px solid ${C.glassBorder}`,
          borderRadius: 2, px: 2, py: 1,
          backdropFilter: "blur(12px)",
        }}>
          <span style={{ fontSize: 16 }}>📅</span>
          <Typography sx={{ fontSize: 13, fontWeight: 600, color: C.text }}>
            {dateText}
          </Typography>
        </Box>
      </Box>

      {/* ✅ بخش ۱: صندوق / فروش */}
      {posData && (
        <SectionErrorBoundary name="PosSection">
          <PosSection data={posData} />
        </SectionErrorBoundary>
      )}

      {/* ✅ بخش ۲: انبار / موجودی */}
      {inventoryData && (
        <SectionErrorBoundary name="InventorySection">
          <InventorySection data={inventoryData} />
        </SectionErrorBoundary>
      )}

      {/* ✅ بخش ۳: گزارش کلی */}
      <SectionErrorBoundary name="SharedSection">
        <SharedSection />
      </SectionErrorBoundary>
    </Box>
  );
}