import { useState, useMemo, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Box, Typography, Tabs, Tab, useMediaQuery, useTheme } from "@mui/material";
import { useThemeMode } from "@shared/contexts/ThemeContext";
import { useLang } from "@shared/contexts/LangContext";
import { buildColors } from "@shared/palette";
import ShortcutsHelpDialog from "@shared/common/ShortcutsHelpDialog";
import { moduleEnabled, hasTab } from "@business/dashboard/access";
import {
  useToast, ToastSnackbar, useRegisteredShortcuts, tabBindings, helpBinding, collectShortcuts, useStyles,
} from "./common";
import ProductsSection from "./components/ProductsSection";
import ItemsSection from "./components/ItemsSection";
import FormulasSection from "./components/formulas/FormulasSection";
import SupplierSection from "./components/SupplierSection";
import CustomerSection from "./components/CustomerSection";
import WarehouseSection from "./components/WarehouseSection";
import BarcodeSection from "./components/barcodes/BarcodeSection";
import ManagersSection from "./components/ManagersSection";
import HintBar from "@shared/ui/HintBar";

/**
 * A tab shows only when one of its modules is enabled for the business (mods: null = always)
 * AND the user holds one of its permission tabs.
 */
const ALL_TABS = [
  { id: "products", icon: "🛍️", mods: ["pos"], perms: ["dictionary_menu"] },
  { id: "items", icon: "🧱", mods: ["inventory", "production"], perms: ["dictionary_items"] },
  { id: "formulas", icon: "📖", mods: ["production"], perms: ["dictionary_recipe"] },
  { id: "suppliers", icon: "🏭", mods: ["inventory"], perms: ["dictionary_suppliers"] },
  { id: "customers", icon: "👥", mods: ["pos", "inventory", "accounting"], perms: ["dictionary_customers"] },
  { id: "warehouses", icon: "📦", mods: ["inventory"], perms: ["dictionary_warehouses"] },
  { id: "barcodes", icon: "▮▯▮", mods: null, perms: ["dictionary_menu", "dictionary_items"], check: () => canBarcodeProducts() || canBarcodeItems() },
  { id: "users", icon: "🔐", mods: null, perms: ["dictionary_users"] },
];

const canBarcodeProducts = () => moduleEnabled("pos") && hasTab("dictionary_menu");
const canBarcodeItems = () => (moduleEnabled("inventory") || moduleEnabled("production")) && hasTab("dictionary_items");

const allowed = (tab) =>
  (!tab.check || tab.check()) && (!tab.mods || tab.mods.some((m) => moduleEnabled(m))) && tab.perms.some((p) => hasTab(p));

export default function Dictionary() {
  const { mode } = useThemeMode();
  const { isRtl, lang } = useLang();
  const { t } = useTranslation();
  const isDark = mode === "dark";
  const C = useMemo(() => buildColors(isDark), [isDark]);
  const S = useStyles(C);
  const muiTheme = useTheme();
  const fullScreen = useMediaQuery(muiTheme.breakpoints.down("sm"));
  const { toast, showToast, closeToast } = useToast();
  const [help, setHelp] = useState(null);
  const [params, setParams] = useSearchParams();

  const tabs = useMemo(() => ALL_TABS.filter(allowed), []);
  const wanted = params.get("tab");
  const activeTab = tabs.some((x) => x.id === wanted) ? wanted : tabs[0]?.id || "";
  const formulaJump = useMemo(() => {
    const n = parseInt(params.get("formula") || "", 10);
    return Number.isFinite(n) ? n : null;
  }, [params]);

  // keep the URL in sync so a tab (and a formula link from Production) survives reloads
  const selectTab = useCallback((id) => setParams({ tab: id }, { replace: true }), [setParams]);
  useEffect(() => {
    if (activeTab && wanted !== activeTab) setParams({ tab: activeTab }, { replace: true });
  }, [activeTab, wanted, setParams]);

  const notify = useCallback((msg, type = "info") => showToast(msg, type), [showToast]);
  const ctx = useMemo(() => ({ t, C, S, isRtl, lang, fullScreen, notify }), [t, C, S, isRtl, lang, fullScreen, notify]);

  useRegisteredShortcuts([
    ...tabBindings(t, tabs.map((tb) => ({ id: tb.id, label: t(`ui_def.tabs.${tb.id}`) })), selectTab),
    helpBinding(t, () => setHelp(collectShortcuts())),
  ]);

  return (
    <Box dir={isRtl ? "rtl" : "ltr"} sx={{ fontFamily: "'Vazirmatn', 'Plus Jakarta Sans', sans-serif", width: "100%" }}>
      <Box sx={{ mb: 2 }}>
        <Typography sx={{ fontSize: { xs: 20, md: 24 }, fontWeight: 900, color: C.text, mb: 0.5 }}>
          📚 {t("ui_def.title")}
        </Typography>
        <Typography sx={{ fontSize: 13, color: C.sub }}>{t("ui_def.subtitle")}</Typography>
      </Box>

      {tabs.length === 0 ? (
        <Typography sx={{ color: C.muted, textAlign: "center", py: 6 }}>{t("ui_def.no_access")}</Typography>
      ) : (
        <>
          <Tabs value={activeTab} onChange={(_, v) => selectTab(v)} variant="scrollable" scrollButtons="auto" allowScrollButtonsMobile
            sx={{
              mb: 2, minHeight: 44, bgcolor: C.glass, border: `1px solid ${C.glassBorder}`, borderRadius: 3,
              "& .MuiTab-root": { color: C.sub, textTransform: "none", fontWeight: 600, minHeight: 44, fontSize: 13 },
              "& .Mui-selected": { color: `${C.primary} !important` },
              "& .MuiTabs-indicator": { bgcolor: C.primary },
              "& .MuiTabScrollButton-root": { color: C.sub },
            }}>
            {tabs.map((tb, i) => (
              <Tab key={tb.id} value={tb.id} iconPosition="start" icon={<span aria-hidden="true">{tb.icon}</span>}
                label={<>{t(`ui_def.tabs.${tb.id}`)}{i < 9 && (<span className="ks-alt-hint ks-kbd" dir="ltr" style={{ marginInlineStart: 6 }}>Alt+{i + 1}</span>)}</>} />
            ))}
          </Tabs>

          <Box sx={{ ...S.card, p: { xs: 1.5, md: 3 } }}>
            {activeTab === "products" && <ProductsSection ctx={ctx} canLink={moduleEnabled("inventory")} />}
            {activeTab === "items" && <ItemsSection ctx={ctx} />}
            {activeTab === "formulas" && <FormulasSection ctx={ctx} jump={formulaJump} />}
            {activeTab === "suppliers" && <SupplierSection ctx={ctx} />}
            {activeTab === "customers" && <CustomerSection ctx={ctx} />}
            {activeTab === "warehouses" && <WarehouseSection ctx={ctx} />}
            {activeTab === "barcodes" && (
              <BarcodeSection ctx={ctx}
                canProducts={canBarcodeProducts()}
                canItems={canBarcodeItems()} />
            )}
            {activeTab === "users" && <ManagersSection ctx={ctx} />}
          </Box>
        </>
      )}

      <ToastSnackbar toast={toast} onClose={closeToast} C={C} />
      <ShortcutsHelpDialog open={!!help} onClose={() => setHelp(null)} items={help || []} />
      <HintBar items={[{ keys: "F2", label: t("ui_design.hint_new") }, { keys: "Ctrl+D", label: t("ui_design.hint_save") }, { keys: "Esc", label: t("ui_design.hint_close") }, { keys: "F1", label: t("ui_design.hint_help") }]} />
    </Box>
  );
}
