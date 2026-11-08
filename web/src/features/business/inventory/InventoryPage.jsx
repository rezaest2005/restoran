import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Box, Typography } from "@mui/material";
import { useThemeMode } from "@shared/contexts/ThemeContext";
import { useLang } from "@shared/contexts/LangContext";

import WarehouseTab from "./tabs/WarehouseTab";
import ReceivingTab from "./tabs/ReceivingTab";
import PurchaseListTab from "./tabs/PurchaseListTab";
import ReportsTab from "./tabs/ReportsTab";
import PurchaseInvoiceTab from "./tabs/PurchaseInvoiceTab";
import SalesInvoiceTab from "./tabs/SalesInvoiceTab";
import { buildColors } from "@shared/palette";
import ShortcutsHelpDialog from "@shared/common/ShortcutsHelpDialog";
import { useToast, ToastSnackbar, TabBar, useRegisteredShortcuts, tabBindings, helpBinding, collectShortcuts } from "./common";
import HintBar from "@shared/ui/HintBar";

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
  const { toast, showToast, closeToast } = useToast();
  const { t } = useTranslation();
  const [help, setHelp] = useState(null);

  useRegisteredShortcuts([
    ...tabBindings(t, TABS, setActiveTab),
    helpBinding(t, () => setHelp(collectShortcuts())),
  ]);

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
      <TabBar tabs={TABS} active={activeTab} onSelect={setActiveTab} C={C} />

      {/* محتوای تب */}
      <Box
        sx={{
          bgcolor: C.glass,
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
      <ToastSnackbar toast={toast} onClose={closeToast} C={C} />

      <ShortcutsHelpDialog open={!!help} onClose={() => setHelp(null)} items={help || []} />
      <HintBar items={[{ keys: "F2", label: t("ui_design.hint_new") }, { keys: "Ctrl+D", label: t("ui_design.hint_save") }, { keys: "Esc", label: t("ui_design.hint_close") }, { keys: "F1", label: t("ui_design.hint_help") }]} />
    </Box>
  );
}
