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
import { useRegisteredShortcuts } from "@shared/common/shortcutKit";
import WebsiteCard from "./WebsiteCard";

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
        <Box sx={{ p: 3, m: 2, borderRadius: 3, border: "2px solid var(--danger)", background: "color-mix(in srgb, var(--danger) 15%, transparent)" }}>
          <Typography sx={{ fontSize: 16, fontWeight: 800, color: "var(--danger)" }}>
            ⚠️ {i18n.t("ui_a.dashboard.error_in", { name: this.props.name })}
          </Typography>
          <Typography sx={{ fontSize: 12, color: "var(--danger)", fontFamily: "monospace", mt: 1 }}>
            {this.state.error?.message}
          </Typography>
        </Box>
      );
    }
    return this.props.children;
  }
}

export default function OverviewTab() {
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

  // ── میان‌برها: Alt+Shift+N پرش به بخش · Ctrl+A/Ctrl+Z بخش بعدی/قبلی (F1 و Alt+N در هاب) ──
  const sections = useMemo(() => [
    posData && { id: "dash-sec-pos", label: t("ui_g.dash.sec_pos") },
    inventoryData && { id: "dash-sec-inventory", label: t("ui_g.dash.sec_inventory") },
    { id: "dash-sec-shared", label: t("ui_g.dash.sec_shared") },
  ].filter(Boolean), [posData, inventoryData, t]);

  const currentSection = () => {
    let idx = 0;
    sections.forEach((s, i) => {
      const el = document.getElementById(s.id);
      if (el && el.getBoundingClientRect().top <= 120) idx = i;
    });
    return idx;
  };
  const jumpTo = (i) => {
    const s = sections[Math.min(Math.max(i, 0), sections.length - 1)];
    document.getElementById(s?.id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const shortcuts = [
    { combo: "Ctrl+A", label: t("ui_g.dash.next_section"), handler: () => jumpTo(currentSection() + 1) },
    { combo: "Ctrl+Z", label: t("ui_g.dash.prev_section"), handler: () => jumpTo(currentSection() - 1) },
    ...sections.map((s, i) => ({
      combo: `Alt+Shift+${i + 1}`,
      label: `${t("ui_g.dash.section_n", { n: i + 1 })} — ${s.label}`,
      handler: () => jumpTo(i),
    })),
  ];
  useRegisteredShortcuts(shortcuts, { enabled: !loading });

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
        ? "radial-gradient(ellipse at 15% 30%, color-mix(in srgb, var(--success) 5%, transparent) 0%, transparent 50%), radial-gradient(ellipse at 85% 70%, color-mix(in srgb, var(--danger) 5%, transparent) 0%, transparent 50%)"
        : "radial-gradient(ellipse at 15% 30%, color-mix(in srgb, var(--info) 5%, transparent) 0%, transparent 50%), radial-gradient(ellipse at 85% 70%, color-mix(in srgb, var(--primary) 5%, transparent) 0%, transparent 50%)",
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
        }}>
          <span style={{ fontSize: 16 }}>📅</span>
          <Typography sx={{ fontSize: 13, fontWeight: 600, color: C.text }}>
            {dateText}
          </Typography>
        </Box>
      </Box>

      <WebsiteCard />

      {/* ✅ بخش ۱: صندوق / فروش */}
      {posData && (
        <Box id="dash-sec-pos" sx={{ scrollMarginTop: 72 }}>
          <SectionErrorBoundary name="PosSection">
            <PosSection data={posData} />
          </SectionErrorBoundary>
        </Box>
      )}

      {/* ✅ بخش ۲: انبار / موجودی */}
      {inventoryData && (
        <Box id="dash-sec-inventory" sx={{ scrollMarginTop: 72 }}>
          <SectionErrorBoundary name="InventorySection">
            <InventorySection data={inventoryData} />
          </SectionErrorBoundary>
        </Box>
      )}

      {/* ✅ بخش ۳: گزارش کلی */}
      <Box id="dash-sec-shared" sx={{ scrollMarginTop: 72 }}>
        <SectionErrorBoundary name="SharedSection">
          <SharedSection />
        </SectionErrorBoundary>
      </Box>

    </Box>
  );
}