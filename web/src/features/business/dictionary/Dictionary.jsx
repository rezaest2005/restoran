import { useState, useMemo, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import i18n from "i18next";
import { Box, Typography, Tabs, Tab, Chip, useMediaQuery, useTheme } from "@mui/material";
import { useThemeMode } from "@shared/contexts/ThemeContext";
import { useLang } from "@shared/contexts/LangContext";
import { buildColors } from "@shared/palette";
import ShortcutsHelpDialog from "@shared/common/ShortcutsHelpDialog";
import { moduleEnabled, hasTab } from "@business/dashboard/access";
import {
  useToast, ToastSnackbar, useRegisteredShortcuts, tabBindings, helpBinding, collectShortcuts, useStyles,
} from "./common";
import ItemsSection from "./components/ItemsSection";
import FormulasSection from "./components/formulas/FormulasSection";
import SupplierSection from "./components/SupplierSection";
import CustomerSection from "./components/CustomerSection";
import WarehouseSection from "./components/WarehouseSection";
import BarcodeSection from "./components/barcodes/BarcodeSection";
import ManagersSection from "./components/ManagersSection";
import HintBar from "@shared/ui/HintBar";
import StartChecklist from "./StartChecklist";
import { START_STEPS } from "./startSteps";

/**
 * A tab shows only when one of its modules is enabled for the business (mods: null = always)
 * AND the user holds one of its permission tabs.
 */
const ALL_TABS = [
  { id: "warehouses", icon: "📦", mods: ["inventory"], perms: ["dictionary_warehouses"] },
  { id: "items", icon: "🧱", mods: ["inventory", "production"], perms: ["dictionary_items"] },
  { id: "suppliers", icon: "🏭", mods: ["inventory"], perms: ["dictionary_suppliers"] },
  { id: "formulas", icon: "📖", mods: ["production"], perms: ["dictionary_recipe"] },
  { id: "products", icon: "🏷️", mods: ["inventory", "production"], perms: ["dictionary_items"] },
  { id: "barcodes", icon: "▮▯▮", mods: null, perms: ["dictionary_menu", "dictionary_items"], check: () => canBarcodeProducts() || canBarcodeItems() },
  { id: "customers", icon: "👥", mods: ["pos", "inventory", "accounting"], perms: ["dictionary_customers"] },
  { id: "users", icon: "🔐", mods: null, perms: ["dictionary_users"] },
];

/**
 * The hub is grouped by what a business thinks about, in the order it sets things up:
 * places -> what you buy & stock -> what you make & sell -> people.
 */
const GROUPS = [
  { id: "places", icon: "📍", tabs: ["warehouses"] },
  { id: "stock", icon: "🧱", tabs: ["items", "suppliers"] },
  { id: "sell", icon: "🏷️", tabs: ["formulas", "products", "barcodes"] },
  { id: "people", icon: "👥", tabs: ["customers", "users"] },
];

const canBarcodeProducts = () => moduleEnabled("pos") && hasTab("dictionary_menu");
const canBarcodeItems = () => (moduleEnabled("inventory") || moduleEnabled("production")) && hasTab("dictionary_items");

const tabLabel = (id) => i18n.t(`ui_dh.tabs_hub.${id}`, { defaultValue: i18n.t(`ui_def.tabs.${id}`) });

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

  const tabs = useMemo(() => {
    const ok = ALL_TABS.filter(allowed);
    // flat list in group order, so Alt+1.. follows what you see
    return GROUPS.flatMap((g) => g.tabs.map((id) => ok.find((x) => x.id === id)).filter(Boolean));
  }, []);
  const groups = useMemo(() => GROUPS.map((g) => ({ ...g, tabs: tabs.filter((x) => g.tabs.includes(x.id)) })).filter((g) => g.tabs.length), [tabs]);
  const steps = useMemo(() => START_STEPS.filter((id) => tabs.some((x) => x.id === id)), [tabs]);
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

  const activeGroup = groups.find((g) => g.tabs.some((x) => x.id === activeTab)) || groups[0];
  const [refreshKey, setRefreshKey] = useState(0);
  const notify = useCallback((msg, type = "info") => {
    showToast(msg, type);
    if (type === "success") setRefreshKey((n) => n + 1);    // something was saved: re-count the checklist
  }, [showToast]);
  const ctx = useMemo(() => ({ t, C, S, isRtl, lang, fullScreen, notify }), [t, C, S, isRtl, lang, fullScreen, notify]);

  useRegisteredShortcuts([
    ...tabBindings(t, tabs.map((tb) => ({ id: tb.id, label: tabLabel(tb.id) })), selectTab),
    helpBinding(t, () => setHelp(collectShortcuts())),
  ]);

  return (
    <Box dir={isRtl ? "rtl" : "ltr"} sx={{ fontFamily: "'Vazirmatn', 'Plus Jakarta Sans', sans-serif", width: "100%" }}>
      <Box sx={{ mb: 2 }}>
        <Typography sx={{ fontSize: { xs: 20, md: 24 }, fontWeight: 900, color: C.text, mb: 0.5 }}>
          📚 {t("ui_dh.title")}
        </Typography>
        <Typography sx={{ fontSize: 13, color: C.sub }}>{t("ui_dh.subtitle")}</Typography>
      </Box>

      {tabs.length === 0 ? (
        <Typography sx={{ color: C.muted, textAlign: "center", py: 6 }}>{t("ui_def.no_access")}</Typography>
      ) : (
        <>
          <StartChecklist ctx={ctx} steps={steps} refreshKey={refreshKey} onGo={selectTab} />

          {/* level 1: the group (what kind of thing) */}
          <Tabs value={activeGroup.id} onChange={(_, v) => selectTab(groups.find((g) => g.id === v).tabs[0].id)}
            variant="scrollable" scrollButtons="auto" allowScrollButtonsMobile aria-label={t("ui_dh.title")}
            sx={{
              mb: 1, minHeight: 48, bgcolor: C.glass, border: `1px solid ${C.glassBorder}`, borderRadius: 3,
              "& .MuiTab-root": { color: C.sub, textTransform: "none", fontWeight: 700, minHeight: 48, fontSize: 13.5 },
              "& .Mui-selected": { color: `${C.primary} !important` },
              "& .MuiTabs-indicator": { bgcolor: C.primary, height: 3 },
              "& .MuiTabScrollButton-root": { color: C.sub },
            }}>
            {groups.map((g) => (
              <Tab key={g.id} value={g.id} iconPosition="start" icon={<span aria-hidden="true">{g.icon}</span>} label={t(`ui_dh.groups_hub.${g.id}`)} />
            ))}
          </Tabs>

          {/* level 2: the sections inside that group */}
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, flexWrap: "wrap", mb: 2, px: 0.5 }} role="tablist" aria-label={t(`ui_dh.groups_hub.${activeGroup.id}`)}>
            <Typography sx={{ fontSize: 12, color: C.sub, marginInlineEnd: 0.5, width: { xs: "100%", sm: "auto" } }}>{t(`ui_dh.groups_hint.${activeGroup.id}`)}</Typography>
            {activeGroup.tabs.length > 1 && activeGroup.tabs.map((tb) => {
              const on = tb.id === activeTab;
              const i = tabs.findIndex((x) => x.id === tb.id);
              return (
                <Chip key={tb.id} role="tab" aria-selected={on} clickable onClick={() => selectTab(tb.id)}
                  icon={<span aria-hidden="true" style={{ fontSize: 13 }}>{tb.icon}</span>}
                  label={<>{tabLabel(tb.id)}{i < 9 && <span className="ks-alt-hint ks-kbd" dir="ltr" style={{ marginInlineStart: 6 }}>Alt+{i + 1}</span>}</>}
                  sx={{
                    fontWeight: on ? 800 : 600, px: 0.5, color: on ? C.primary : C.text,
                    bgcolor: on ? C.primarySubtle : "transparent", border: `1px solid ${on ? C.primary : C.glassBorder}`,
                  }} />
              );
            })}
          </Box>

          <Box sx={{ ...S.card, p: { xs: 1.5, md: 3 } }}>
            <Box sx={{ display: "flex", gap: 1, alignItems: "flex-start", mb: 2, p: 1.25, borderRadius: 2, bgcolor: C.inputBg, border: `1px solid ${C.divider}` }}>
              <span aria-hidden="true">💡</span>
              <Typography sx={{ fontSize: 12.5, color: C.sub }}>{t(`ui_dh.help.${activeTab}`)}</Typography>
            </Box>
            {activeTab === "items" && <ItemsSection key="items" ctx={ctx} />}
            {activeTab === "products" && <ItemsSection key="products" ctx={ctx} productsOnly />}
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
