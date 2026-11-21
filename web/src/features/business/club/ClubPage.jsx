import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Box, Snackbar, Tab, Tabs, useMediaQuery, useTheme } from "@mui/material";
import { useThemeMode } from "@shared/contexts/ThemeContext";
import { useLang } from "@shared/contexts/LangContext";
import { buildColors } from "@shared/palette";
import { useRegisteredShortcuts } from "@shared/common/shortcutKit";
import { useStyles } from "../accounting/common";
import OverviewPanel from "./OverviewPanel";
import MembersPanel from "./MembersPanel";
import CheckoutPanel from "./CheckoutPanel";
import RewardsPanel from "./RewardsPanel";
import CampaignsPanel from "./CampaignsPanel";
import SettingsForm from "./SettingsForm";

/**
 * Customer club (works for any business, with or without the POS module):
 * overview & reports, members, record a purchase, rewards & coupons, campaigns, settings.
 * Keys: Alt+Shift+1..6 sections (each section adds its own keys).
 */
export default function ClubPage() {
  const { t } = useTranslation();
  const { mode } = useThemeMode();
  const { isRtl, lang } = useLang();
  const C = useMemo(() => buildColors(mode === "dark"), [mode]);
  const S = useStyles(C);
  const muiTheme = useTheme();
  const fullScreen = useMediaQuery(muiTheme.breakpoints.down("sm"));

  const [view, setView] = useState("overview");
  const [segment, setSegment] = useState("");
  const [toast, setToast] = useState({ open: false, msg: "", sev: "success" });
  const notify = useCallback((msg, sev = "success") => setToast({ open: true, msg, sev }), []);
  const ctx = { t, C, S, lang, isRtl, fullScreen, notify };

  const views = [
    { id: "overview", label: t("ui_club2.tab.overview") },
    { id: "members", label: t("ui_club.tab_members") },
    { id: "checkout", label: t("ui_club2.tab.checkout") },
    { id: "rewards", label: t("ui_club2.tab.rewards") },
    { id: "campaigns", label: t("ui_club2.tab.campaigns") },
    { id: "settings", label: t("ui_club.tab_settings") },
  ];

  useRegisteredShortcuts(views.map((v, i) => ({
    combo: `Alt+Shift+${i + 1}`, label: `${t("ui_club.section_n", { n: i + 1 })} — ${v.label}`,
    handler: () => setView(v.id),
  })));

  return (
    <Box dir={isRtl ? "rtl" : "ltr"} sx={{ py: 1, minWidth: 0 }}>
      <Tabs value={view} onChange={(_, v) => setView(v)} variant="scrollable" scrollButtons="auto" allowScrollButtonsMobile
        sx={{
          mb: 2, minHeight: 40,
          "& .MuiTab-root": { color: C.sub, textTransform: "none", fontWeight: 600, minHeight: 40 },
          "& .Mui-selected": { color: `${C.primary} !important` },
          "& .MuiTabs-indicator": { bgcolor: C.primary },
        }}>
        {views.map((v, i) => <Tab key={v.id} value={v.id} label={<>{v.label}<span className="ks-alt-hint ks-kbd" dir="ltr" style={{ marginInlineStart: 6 }}>Alt+Shift+{i + 1}</span></>} />)}
      </Tabs>

      {view === "overview" && <OverviewPanel ctx={ctx} onSegment={(s) => { setSegment(s); setView("members"); }} />}
      {view === "members" && <MembersPanel ctx={ctx} segment={segment} setSegment={setSegment} active />}
      {view === "checkout" && <CheckoutPanel ctx={ctx} />}
      {view === "rewards" && <RewardsPanel ctx={ctx} />}
      {view === "campaigns" && <CampaignsPanel ctx={ctx} />}
      {view === "settings" && <SettingsForm ctx={ctx} />}

      <Snackbar open={toast.open} autoHideDuration={4000}
        onClose={() => setToast((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}>
        <Alert severity={toast.sev} variant="filled" onClose={() => setToast((s) => ({ ...s, open: false }))}>
          {toast.msg}
        </Alert>
      </Snackbar>
    </Box>
  );
}
