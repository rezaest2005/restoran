import { useState, useMemo, useCallback } from "react";
import { Box, Typography, Button, Snackbar, Alert } from "@mui/material";
import { useThemeMode } from "@shared/contexts/ThemeContext";
import { useLang } from "@shared/contexts/LangContext";

import WarehouseTab from "./tabs/WarehouseTab";
import ReceivingTab from "./tabs/ReceivingTab";
import PurchaseListTab from "./tabs/PurchaseListTab";
import ReportsTab from "./tabs/ReportsTab";
import PurchaseInvoiceTab from "./tabs/PurchaseInvoiceTab";
import SalesInvoiceTab from "./tabs/SalesInvoiceTab";
import { buildColors } from "@shared/palette";

const TABS = [
  { id: "invoice", icon: "🧾", label: "ثبت فاکتور خرید" },
  { id: "sales", icon: "💰", label: "ثبت فاکتور فروش" },
  { id: "warehouse", icon: "📦", label: "انبار" },
  { id: "receiving", icon: "🚚", label: "تحویل بار" },
  { id: "purchase_list", icon: "🛒", label: "لیست خرید" },
  { id: "reports", icon: "📊", label: "گزارشات" },
];

export default function InventoryPage() {
  const { mode } = useThemeMode();
  const { isRtl } = useLang();
  const isDark = mode === "dark";

  const [activeTab, setActiveTab] = useState(TABS[0].id);
  const [toast, setToast] = useState({
    open: false,
    message: "",
    type: "info",
  });

  const showToast = useCallback(
    (message, type = "info") => setToast({ open: true, message, type }),
    [],
  );

  const C = useMemo(() => buildColors(isDark), [isDark]);

  return (
    <Box
      dir={isRtl ? "rtl" : "ltr"}
      sx={{
        fontFamily: "'Vazirmatn', 'Plus Jakarta Sans', sans-serif",
        width: "100%",
      }}
    >
      {/* هدر */}
      <Box sx={{ mb: 3 }}>
        <Typography
          sx={{
            fontSize: { xs: 20, md: 24 },
            fontWeight: 900,
            color: C.text,
            mb: 0.5,
          }}
        >
          📦 انبارداری
        </Typography>
        <Typography sx={{ fontSize: 13, color: C.sub }}>
          مدیریت موجودی، ورود و خروج کالا، انتقال و گزارشات
        </Typography>
      </Box>

      {/* تب‌ها */}
      <Box
        sx={{
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
        }}
      >
        {TABS.map((tab) => (
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
              border:
                activeTab === tab.id
                  ? `1px solid ${C.olive}30`
                  : "1px solid transparent",
              "&:hover": { bgcolor: C.oliveSubtle },
            }}
          >
            {tab.icon} {tab.label}
          </Button>
        ))}
      </Box>

      {/* محتوای تب */}
      <Box
        sx={{
          bgcolor: C.glass,
          backdropFilter: "blur(28px)",
          WebkitBackdropFilter: "blur(28px)",
          border: `1px solid ${C.glassBorder}`,
          borderRadius: "20px",
          boxShadow: C.cardShadow,
          p: { xs: 2, md: 3 },
        }}
      >
        {activeTab === "invoice" && (
          <PurchaseInvoiceTab C={C} isDark={isDark} showToast={showToast} />
        )}
        {activeTab === "sales" && (
          <SalesInvoiceTab C={C} isDark={isDark} showToast={showToast} />
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
        onClose={() => setToast((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: "top", horizontal: "center" }}
      >
        <Alert
          onClose={() => setToast((s) => ({ ...s, open: false }))}
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
