import { useState, useMemo, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Box, Typography } from "@mui/material";
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
import ShortcutsHelpDialog from "@shared/common/ShortcutsHelpDialog";
import { useToast, ToastSnackbar, TabBar, useRegisteredShortcuts, tabBindings, helpBinding, collectShortcuts } from "./common";

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
  const { toast, showToast, closeToast } = useToast();
  const [help, setHelp] = useState(null);

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

  // ── میان‌برها: Alt+1…9 تب‌ها · F1 راهنما ──
  useRegisteredShortcuts([
    ...tabBindings(t, TABS.map((tb) => ({ id: tb.id, label: tb.label || t(tb.labelKey) })), setActiveTab),
    helpBinding(t, () => setHelp(collectShortcuts())),
  ]);

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
      <TabBar
        tabs={TABS.map((tb) => ({ ...tb, label: tb.label || t(tb.labelKey) }))}
        active={activeTab}
        onSelect={setActiveTab}
        C={C}
        getButtonProps={(tab, idx) => ({
          draggable: true,
          onDragStart: () => handleDragStart(idx),
          onDragEnter: () => handleDragEnter(idx),
          onDragEnd: handleDragEnd,
          onDragOver: (e) => e.preventDefault(),
          title: t("ui_b.dictionary.dragHint"),
          sx: {
            cursor: "grab",
            "&:active": { cursor: "grabbing" },
            opacity: dragItem.current === idx ? 0.5 : 1,
          },
        })}
      />

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
      <ToastSnackbar toast={toast} onClose={closeToast} C={C} />

      <ShortcutsHelpDialog open={!!help} onClose={() => setHelp(null)} items={help || []} />
    </Box>
  );
}