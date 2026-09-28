import { useState, useMemo, useCallback } from "react";
import {
  Box, Typography, Button, Snackbar, Alert,
} from "@mui/material";
import { useThemeMode } from "@shared/contexts/ThemeContext";
import { useLang } from "@shared/contexts/LangContext";

import WarehouseTab from "./tabs/WarehouseTab";
import PurchaseInvoiceTab from "./tabs/PurchaseInvoiceTab";
import ReceivingTab from "./tabs/ReceivingTab";
import PurchaseListTab from "./tabs/PurchaseListTab";
import ReportsTab from "./tabs/ReportsTab";

const TABS = [
  { id: "invoice", icon: "🧾", label: "ثبت فاکتور" },
  { id: "warehouse", icon: "📦", label: "انبار" },
  { id: "receiving", icon: "🚚", label: "تحویل بار" },
  { id: "purchase_list", icon: "🛒", label: "لیست خرید" },
  { id: "reports", icon: "📊", label: "گزارشات" },
];

export default function InventoryPage() {
  const { mode } = useThemeMode();
  const { isRtl } = useLang();
  const isDark = mode === "dark";

  const [activeTab, setActiveTab] = useState("warehouse");
  const [toast, setToast] = useState({ open: false, message: "", type: "info" });

  const showToast = useCallback(
    (message, type = "info") => setToast({ open: true, message, type }),
    []
  );

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
    warning: isDark ? "#F59E0B" : "#D97706",
    warningBg: isDark ? "rgba(245,158,11,0.12)" : "rgba(217,119,6,0.1)",
    info: isDark ? "#3B82F6" : "#2563EB",
    infoBg: isDark ? "rgba(59,130,246,0.12)" : "rgba(37,99,235,0.1)",
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
        <Typography sx={{
          fontSize: { xs: 20, md: 24 },
          fontWeight: 900,
          color: C.text,
          mb: 0.5,
        }}>
          📦 انبارداری
        </Typography>
        <Typography sx={{ fontSize: 13, color: C.sub }}>
          مدیریت موجودی، ورود و خروج کالا، انتقال و گزارشات
        </Typography>
      </Box>

      {/* تب‌ها */}
      <Box sx={{
        display: "flex",
        gap: 0.5,
        mb: 3,
        bgcolor: C.glass,
        backdropFilter: "blur(16px)",
        border: `1px solid ${C.glassBorder}`,
        borderRadius: "14px",
        p: 0.5,
        width: "fit-content",
        flexWrap: "wrap",
      }}>
        {TABS.map(tab => (
          <Button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            sx={{
              borderRadius: "10px",
              px: { xs: 1.5, md: 2.5 },
              py: 1,
              fontSize: 12,
              fontWeight: activeTab === tab.id ? 700 : 500,
              textTransform: "none",
              transition: "all 0.2s ease",
              color: activeTab === tab.id ? C.olive : C.sub,
              bgcolor: activeTab === tab.id ? C.oliveSubtle : "transparent",
              border: activeTab === tab.id ? `1px solid ${C.olive}30` : "1px solid transparent",
              "&:hover": { bgcolor: C.oliveSubtle },
            }}
          >
            {tab.icon} {tab.label}
          </Button>
        ))}
      </Box>

      {/* محتوای تب */}
      <Box sx={{
        bgcolor: C.glass,
        backdropFilter: "blur(28px)",
        WebkitBackdropFilter: "blur(28px)",
        border: `1px solid ${C.glassBorder}`,
        borderRadius: "20px",
        boxShadow: C.cardShadow,
        p: { xs: 2, md: 3 },
      }}>
        {activeTab === "invoice" && (
          <PurchaseInvoiceTab C={C} isDark={isDark} showToast={showToast} />
        )}
        {activeTab === "warehouse" && (
          <WarehouseTab C={C} isDark={isDark} showToast={showToast} />
        )}
        {activeTab === "receiving" && (
          <ReceivingTab C={C} isDark={isDark} showToast={showToast} />
        )}
        {activeTab === "purchase_list" && (
          <PurchaseListTab C={C} isDark={isDark} showToast={showToast} />
        )}
        {activeTab === "reports" && (
          <ReportsTab C={C} isDark={isDark} showToast={showToast} />
        )}
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
            bgcolor: C.glass,
            backdropFilter: "blur(16px)",
            color: C.text,
            border: `1px solid ${C.olive}`,
            borderRadius: "12px",
            fontSize: 13,
            fontWeight: 600,
            boxShadow: C.cardShadow,
          }}
        >
          {toast.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}