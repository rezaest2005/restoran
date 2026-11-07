import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Box, Tab, Tabs } from "@mui/material";
import { useThemeMode } from "@shared/contexts/ThemeContext";
import { useLang } from "@shared/contexts/LangContext";
import { buildColors } from "@shared/palette";
import {
  useRegisteredShortcuts, tabBindings, helpBinding, collectShortcuts,
} from "@shared/common/shortcutKit";
import ShortcutsHelpDialog from "@shared/common/ShortcutsHelpDialog";
import AccountingPage from "@business/accounting/AccountingPage";
import ClubPage from "@business/club/ClubPage";
import OverviewTab from "./OverviewTab";
import { canUse } from "./access";

/**
 * Dashboard hub: Overview + Accounting + Customer club in one page.
 * Accounting / Club tabs show only when the module is enabled for the business
 * AND the user holds the matching permission tab. Alt+1..n switch tabs, F1 help.
 * The tab lives in the URL (?tab=accounting) so old links keep working.
 */
export default function Dashboard() {
  const { t } = useTranslation();
  const { mode } = useThemeMode();
  const { isRtl } = useLang();
  const C = useMemo(() => buildColors(mode === "dark"), [mode]);
  const [params, setParams] = useSearchParams();
  const [helpItems, setHelpItems] = useState(null);

  const tabs = useMemo(() => [
    { id: "overview", label: t("ui_hub.tab_overview") },
    canUse("accounting") && { id: "accounting", label: t("ui_hub.tab_accounting") },
    canUse("club") && { id: "club", label: t("ui_hub.tab_club") },
  ].filter(Boolean), [t]);

  const wanted = params.get("tab");
  const tab = tabs.some((x) => x.id === wanted) ? wanted : "overview";
  const select = (id) => setParams(id === "overview" ? {} : { tab: id }, { replace: true });

  useRegisteredShortcuts([
    helpBinding(t, () => setHelpItems(collectShortcuts())),
    ...(tabs.length > 1 ? tabBindings(t, tabs, select) : []),
  ]);

  return (
    <Box dir={isRtl ? "rtl" : "ltr"}>
      {tabs.length > 1 && (
        <Tabs
          value={tab} onChange={(_, v) => select(v)} variant="scrollable" scrollButtons="auto"
          sx={{
            mx: { xs: 1.5, sm: 2, md: 2.5, xl: 3 }, mb: 1, minHeight: 40,
            "& .MuiTab-root": { color: C.sub, textTransform: "none", fontWeight: 600, minHeight: 40 },
            "& .Mui-selected": { color: `${C.primary} !important` },
            "& .MuiTabs-indicator": { bgcolor: C.primary },
          }}
        >
          {tabs.map((x, i) => <Tab key={x.id} value={x.id} label={`${x.label}  (Alt+${i + 1})`} />)}
        </Tabs>
      )}

      {tab === "overview" && <OverviewTab />}
      {tab === "accounting" && (
        <Box sx={{ px: { xs: 0.5, sm: 1 }, pb: 6 }}><AccountingPage embedded /></Box>
      )}
      {tab === "club" && (
        <Box sx={{ px: { xs: 1.5, sm: 2, md: 2.5 }, pb: 6 }}><ClubPage /></Box>
      )}

      <ShortcutsHelpDialog open={helpItems !== null} onClose={() => setHelpItems(null)} items={helpItems || []} />
    </Box>
  );
}
