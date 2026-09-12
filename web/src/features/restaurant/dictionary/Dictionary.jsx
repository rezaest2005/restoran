import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  Box, Typography, Button, Snackbar, Alert,
} from "@mui/material";
import { useThemeMode } from "@shared/contexts/ThemeContext";
import { useLang } from "@shared/contexts/LangContext";
import MenuSection from "./components/MenuSection";
import InvoiceSection from "./components/InvoiceSection";
import RecipeSection from "./components/RecipeSection";
import ManagersSection from "./components/ManagersSection";

const TABS = [
  { id: "menu", icon: "🍽️", labelKey: "dict.menu_tab" },
  { id: "invoice", icon: "🧾", labelKey: "dict.invoice_tab" },
  { id: "recipe", icon: "📖", labelKey: "dict.recipe_tab" },
  { id: "managers", icon: "👥", labelKey: "dict.managers_tab" },
];

export default function Dictionary() {
  const { mode } = useThemeMode();
  const { isRtl } = useLang();
  const { t } = useTranslation();
  const isDark = mode === "dark";
  const [activeTab, setActiveTab] = useState("menu");
  const [toast, setToast] = useState({ open: false, message: "", type: "info" });

  const showToast = (message, type = "info") => setToast({ open: true, message, type });

  const C = useMemo(() => ({
    glass: isDark ? "rgba(16,18,16,0.6)" : "rgba(240,244,252,0.7)",
    glassBorder: isDark ? "rgba(107,155,110,0.1)" : "rgba(80,100,140,0.15)",
    olive: isDark ? "#6B9B6E" : "#2E4D30",
    oliveSubtle: isDark ? "rgba(107,155,110,0.08)" : "rgba(46,77,48,0.08)",
    text: isDark ? "#F0ECE8" : "#1A1A24",
    sub: isDark ? "#8A8588" : "#555568",
    muted: isDark ? "#4A4548" : "#8A8A9E",
    inputBg: isDark ? "rgba(11,10,11,0.5)" : "rgba(240,244,252,0.85)",
    btnGrad: isDark
      ? "linear-gradient(135deg, #3D6B40, #5A8A5D, #6B9B6E, #4A7A4D)"
      : "linear-gradient(135deg, #1E3A20, #2E4D30, #3D5A3E, #2E4D30)",
    danger: isDark ? "#E84057" : "#C83048",
    dangerBg: isDark ? "rgba(232,64,87,0.12)" : "rgba(200,48,72,0.1)",
    cardShadow: isDark
      ? "0 8px 60px rgba(0,0,0,0.5), 0 0 80px rgba(107,155,110,0.04)"
      : "0 8px 60px rgba(0,0,0,0.1), 0 0 60px rgba(74,106,148,0.08)",
  }), [isDark]);

  return (
    <Box dir={isRtl ? "rtl" : "ltr"} sx={{
      fontFamily: "'Vazirmatn', 'Plus Jakarta Sans', sans-serif",
      width: "100%",
    }}>
      {/* هدر */}
      <Box sx={{ mb: 3 }}>
        <Typography sx={{ fontSize: { xs: 20, md: 24 }, fontWeight: 900, color: C.text, mb: 0.5 }}>
          📚 {t("dict.title")}
        </Typography>
        <Typography sx={{ fontSize: 13, color: C.sub }}>
          {t("dict.subtitle")}
        </Typography>
      </Box>

      {/* تب‌ها */}
      <Box sx={{
        display: "flex", gap: 0.5, mb: 3,
        bgcolor: C.glass, backdropFilter: "blur(16px)",
        border: `1px solid ${C.glassBorder}`,
        borderRadius: "14px", p: 0.5,
        width: "fit-content",
      }}>
        {TABS.map(tab => (
          <Button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            sx={{
              borderRadius: "10px", px: { xs: 1.5, md: 2.5 }, py: 1,
              fontSize: 12, fontWeight: activeTab === tab.id ? 700 : 500,
              textTransform: "none", transition: "all 0.2s ease",
              color: activeTab === tab.id ? C.olive : C.sub,
              bgcolor: activeTab === tab.id ? C.oliveSubtle : "transparent",
              border: activeTab === tab.id ? `1px solid ${C.olive}30` : "1px solid transparent",
              "&:hover": { bgcolor: C.oliveSubtle },
            }}
          >
            {tab.icon} {t(tab.labelKey)}
          </Button>
        ))}
      </Box>

      {/* محتوای تب */}
      <Box sx={{
        bgcolor: C.glass, backdropFilter: "blur(28px)",
        WebkitBackdropFilter: "blur(28px)",
        border: `1px solid ${C.glassBorder}`,
        borderRadius: "20px",
        boxShadow: C.cardShadow,
        p: { xs: 2, md: 3 },
      }}>
        {activeTab === "menu" && <MenuSection C={C} isRtl={isRtl} isDark={isDark} showToast={showToast} />}
        {activeTab === "invoice" && <InvoiceSection C={C} />}
        {activeTab === "recipe" && <RecipeSection C={C} />}
        {activeTab === "managers" && <ManagersSection C={C} />}
      </Box>

      {/* Toast */}
      <Snackbar
        open={toast.open}
        autoHideDuration={3000}
        onClose={() => setToast(s => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: "top", horizontal: "center" }}
      >
        <Alert
          onClose={() => setToast(s => ({ ...s, open: false }))}
          severity={toast.type}
          sx={{
            bgcolor: C.glass, backdropFilter: "blur(16px)",
            color: C.text, border: `1px solid ${C.olive}`,
            borderRadius: "12px", fontSize: 13, fontWeight: 600,
            boxShadow: C.cardShadow,
          }}
        >
          {toast.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}