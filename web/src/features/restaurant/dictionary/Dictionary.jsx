import { useState, useMemo, useEffect, useRef } from "react";
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
import SupplierSection from "./components/SupplierSection";
import CustomerSection from "./components/CustomerSection";
import WarehouseSection from "./components/WarehouseSection";
import { buildColors } from "@shared/palette";

const ALL_TABS = [
  { id: "menu", icon: "🍽️", labelKey: "dict.menu_tab", adminOnly: false },
  { id: "invoice", icon: "🥜", labelKey: "ui_b.dictionary.tabItems", adminOnly: false },
  { id: "recipe", icon: "📖", labelKey: "dict.recipe_tab", adminOnly: false },
  { id: "suppliers", icon: "🏭", labelKey: "ui_b.dictionary.tabSuppliers", adminOnly: false },
  { id: "customers", icon: "👥", labelKey: "ui_b.dictionary.tabCustomers", adminOnly: false },
  { id: "warehouses", icon: "📦", labelKey: "ui_b.dictionary.tabWarehouses", adminOnly: false },
  { id: "managers", icon: "👥", labelKey: "ui_b.dictionary.tabUsers", adminOnly: false },
];

export default function Dictionary() {
  const { mode } = useThemeMode();
  const { isRtl } = useLang();
  const { t } = useTranslation();
  const isDark = mode === "dark";

  const [activeTab, setActiveTab] = useState("");
  const [toast, setToast] = useState({ open: false, message: "", type: "info" });

  // ── ترتیب تب‌ها (قابل جابجایی با Drag & Drop) ──
  const [tabOrder, setTabOrder] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("dict_tab_order") || "[]");
      return saved.length ? saved : ALL_TABS.map((tb) => tb.id);
    } catch {
      return ALL_TABS.map((tb) => tb.id);
    }
  });

  const dragItem = useRef(null);
  const dragOverItem = useRef(null);

  const currentUser = useMemo(() => {
    try { return JSON.parse(localStorage.getItem("user") || "{}"); }
    catch { return {}; }
  }, []);

  const userRole = currentUser.role || "customer";
  const isSuperuser = !!currentUser.is_superuser;
  const isOwnerOrManager = isSuperuser || userRole === "owner" || userRole === "manager";

  // ترتیب + فیلتر نقش
  const TABS = useMemo(() => {
    const filtered = ALL_TABS.filter((tab) => !tab.adminOnly || isOwnerOrManager);
    const sorted = tabOrder
      .map((id) => filtered.find((tb) => tb.id === id))
      .filter(Boolean);
    const missing = filtered.filter((tb) => !tabOrder.includes(tb.id));
    return [...sorted, ...missing];
  }, [tabOrder, isOwnerOrManager]);

   // ── تب پیش‌فرض: اولین تب (راست‌ترین در فارسی / چپ‌ترین در انگلیسی) ──
  useEffect(() => {
    if (TABS.length > 0 && (!activeTab || !TABS.find((t) => t.id === activeTab))) {
      setActiveTab(TABS[0].id);
    }
  }, [TABS, activeTab]);

  const showToast = (message, type = "info") => setToast({ open: true, message, type });

  // ── Drag & Drop ──
  const handleDragStart = (idx) => {
    dragItem.current = idx;
  };

  const handleDragEnter = (idx) => {
    dragOverItem.current = idx;
  };

  const handleDragEnd = () => {
    const from = dragItem.current;
    const to = dragOverItem.current;
    if (from === null || to === null || from === to) return;

    const newOrder = [...tabOrder];
    const moved = newOrder.splice(from, 1)[0];
    newOrder.splice(to, 0, moved);
    setTabOrder(newOrder);
    localStorage.setItem("dict_tab_order", JSON.stringify(newOrder));
    dragItem.current = null;
    dragOverItem.current = null;
  };

  const C = useMemo(() => buildColors(isDark), [isDark]);

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

      {/* تب‌ها — قابل Drag & Drop */}
      <Box sx={{
        display: "flex", gap: 0.5, mb: 3,
        bgcolor: C.glass, backdropFilter: "blur(16px)",
        border: `1px solid ${C.glassBorder}`,
        borderRadius: "14px", p: 0.5,
        width: "fit-content",
        flexWrap: "wrap",
      }}>
        {TABS.map((tab, idx) => (
          <Button
            key={tab.id}
            draggable
            onDragStart={() => handleDragStart(idx)}
            onDragEnter={() => handleDragEnter(idx)}
            onDragEnd={handleDragEnd}
            onDragOver={(e) => e.preventDefault()}
            onClick={() => setActiveTab(tab.id)}
            sx={{
              borderRadius: "10px", px: { xs: 1.5, md: 2.5 }, py: 1,
              fontSize: 12, fontWeight: activeTab === tab.id ? 700 : 500,
              textTransform: "none", transition: "all 0.2s ease",
              color: activeTab === tab.id ? C.olive : C.sub,
              bgcolor: activeTab === tab.id ? C.oliveSubtle : "transparent",
              border: activeTab === tab.id ? `1px solid ${C.olive}30` : "1px solid transparent",
              cursor: "grab",
              "&:active": { cursor: "grabbing" },
              "&:hover": { bgcolor: C.oliveSubtle },
              opacity: dragItem.current === idx ? 0.5 : 1,
            }}
            title={t("ui_b.dictionary.dragHint")}
          >
            {tab.icon} {tab.label || t(tab.labelKey)}
          </Button>
        ))}
      </Box>

      {/* راهنمای کوچیک */}
      <Typography sx={{ fontSize: 10, color: C.muted, mb: 2, mt: -2 }}>
        💡 {t("ui_b.dictionary.reorderHelp")}
      </Typography>

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
        {activeTab === "invoice" && <InvoiceSection C={C} isDark={isDark} showToast={showToast} />}
        {activeTab === "recipe" && <RecipeSection C={C} />}
        {activeTab === "suppliers" && <SupplierSection C={C} isDark={isDark} showToast={showToast} />}
        {activeTab === "customers" && <CustomerSection C={C} isDark={isDark} showToast={showToast} />}
        {activeTab === "warehouses" && <WarehouseSection C={C} isDark={isDark} showToast={showToast} />}
        {activeTab === "managers" && <ManagersSection C={C} isRtl={isRtl} isDark={isDark} showToast={showToast} />}
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