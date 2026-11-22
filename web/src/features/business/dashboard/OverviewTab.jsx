import React, { useMemo } from "react";
import { Alert, Box, Typography, CircularProgress } from "@mui/material";
import { useThemeMode } from "@shared/contexts/ThemeContext";
import { useLang } from "@shared/contexts/LangContext";
import { useTranslation } from "react-i18next";
import i18n from "i18next";
import { animations } from "./constants/animations";
import useDashboardData from "./hooks/useDashboardData";
import useDashboardSummary from "./hooks/useDashboardSummary";
import { useNumberFormat } from "./common";

import PosSection from "./sections/PosSection";
import InventorySection from "./sections/InventorySection";
import KpiWidgets from "./home/KpiWidgets";
import AlertsPanel from "./home/AlertsPanel";
import QuickActions from "./home/QuickActions";
import { buildColors } from "@shared/palette";
import { useRegisteredShortcuts } from "@shared/common/shortcutKit";

class SectionErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error) {
    console.error(`dashboard section ${this.props.name} failed:`, error);
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

/**
 * Main business home: works for every business type. Everything below the header comes from
 * /api/dashboard/summary/, which only contains modules the business has and the user may see:
 * alerts → KPI widgets (ordered by the business-type preset) → quick actions →
 * the detailed POS / inventory chart sections (only when those modules are present).
 */
export default function OverviewTab() {
  const { mode } = useThemeMode();
  const { isRtl } = useLang();
  const { t } = useTranslation();
  const isDark = mode === "dark";
  const fmt = useNumberFormat(isRtl);
  const C = useMemo(() => buildColors(isDark), [isDark]);

  const { summary, loading: summaryLoading, error: summaryError } = useDashboardSummary();
  const data = summary?.data || {};
  const sectionType = summary
    ? (data.pos && data.inventory ? "both" : data.pos ? "pos" : data.inventory ? "inventory" : null)
    : null;
  const { loading: chartsLoading, posData, inventoryData } = useDashboardData(sectionType || "both", !!sectionType);
  const showPos = !!sectionType && sectionType !== "inventory" && !!posData;
  const showInv = !!sectionType && sectionType !== "pos" && !!inventoryData;

  // ── شورتکات‌ها: Alt+Shift+N پرش به بخش · Ctrl+A/Ctrl+Z بخش بعدی/قبلی (F1 و Alt+N در هاب) ──
  const sections = useMemo(() => [
    { id: "dash-sec-home", label: t("ui_dash2.kpi_title") },
    showPos && { id: "dash-sec-pos", label: t("ui_g.dash.sec_pos") },
    showInv && { id: "dash-sec-inventory", label: t("ui_g.dash.sec_inventory") },
  ].filter(Boolean), [showPos, showInv, t]);

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
  useRegisteredShortcuts(shortcuts, { enabled: !summaryLoading });

  const dateText = useMemo(() => {
    const now = new Date();
    return t("ui_a.dashboard.date_format", {
      day: t(`ui_a.dashboard.days.d${now.getDay()}`),
      date: now.getDate(),
      month: t(`ui_a.dashboard.months.m${now.getMonth()}`),
    });
  }, [t]);

  if (summaryLoading) {
    return (
      <Box sx={{ display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", height: "60vh", gap: 2 }}>
        <CircularProgress sx={{ color: C.olive }} size={40} />
        <Typography sx={{ fontSize: 13, color: C.sub }}>{t("dash.loading")}</Typography>
      </Box>
    );
  }

  return (
    <Box dir={isRtl ? "rtl" : "ltr"} sx={{
      width: "100%",
      px: { xs: 1.5, sm: 2, md: 2.5, xl: 3 },
      pb: 8,
      fontFamily: "'Vazirmatn', 'Plus Jakarta Sans', sans-serif",
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
          <Typography component="h1" sx={{
            fontSize: { xs: 19, md: 24 }, fontWeight: 900, color: C.text, mb: 0.5,
            fontFamily: "'Plus Jakarta Sans', 'Vazirmatn', sans-serif",
          }}>
            {t("dash.greeting")} <span style={{ color: C.olive }}>👋</span>
          </Typography>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap", justifyContent: { xs: "center", sm: "flex-start" } }}>
            <Typography sx={{ fontSize: 13, color: C.sub }}>{t("dash.summary")}</Typography>
          </Box>
        </Box>
        <Box sx={{
          display: "flex", alignItems: "center", gap: 1.5,
          bgcolor: C.glass, border: `1px solid ${C.glassBorder}`,
          borderRadius: 2, px: 2, py: 1,
        }}>
          <span style={{ fontSize: 16 }}>📅</span>
          <Typography sx={{ fontSize: 13, fontWeight: 600, color: C.text }}>{dateText}</Typography>
        </Box>
      </Box>

      <Box id="dash-sec-home" sx={{ scrollMarginTop: 72 }}>
        <SectionErrorBoundary name="Home">
          {summaryError && !summary && <Alert severity="warning" sx={{ mb: 2 }}>{t("dash.loading")}</Alert>}
          <AlertsPanel alerts={summary?.alerts} C={C} fmt={fmt} />
          <Box sx={{ mb: 1.5 }}>
            <Typography component="h2" sx={{ fontSize: 15, fontWeight: 800, color: C.text }}>{t("ui_dash2.kpi_title")}</Typography>
            <Typography sx={{ fontSize: 12, color: C.sub }}>{t("ui_dash2.kpi_sub")}</Typography>
          </Box>
          {summary && <KpiWidgets summary={summary} C={C} fmt={fmt} />}
          <QuickActions summary={summary} C={C} />
        </SectionErrorBoundary>
      </Box>

      {sectionType && chartsLoading && (
        <Box sx={{ display: "grid", placeItems: "center", py: 4 }}><CircularProgress size={28} sx={{ color: C.olive }} /></Box>
      )}

      {/* بخش صندوق — فقط وقتی ماژول صندوق هست */}
      {showPos && !chartsLoading && (
        <Box id="dash-sec-pos" sx={{ scrollMarginTop: 72 }}>
          <SectionErrorBoundary name="PosSection">
            <PosSection data={posData} />
          </SectionErrorBoundary>
        </Box>
      )}

      {/* بخش انبار — فقط وقتی ماژول انبار هست */}
      {showInv && !chartsLoading && (
        <Box id="dash-sec-inventory" sx={{ scrollMarginTop: 72 }}>
          <SectionErrorBoundary name="InventorySection">
            <InventorySection data={inventoryData} />
          </SectionErrorBoundary>
        </Box>
      )}

    </Box>
  );
}
