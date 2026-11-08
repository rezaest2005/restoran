import { useState, useMemo, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Box, Typography, Tabs, Tab, Alert, Snackbar, Button, useMediaQuery, useTheme } from "@mui/material";
import { useThemeMode } from "@shared/contexts/ThemeContext";
import { useLang } from "@shared/contexts/LangContext";
import { buildColors } from "@shared/palette";
import {
  useRegisteredShortcuts, tabBindings, helpBinding, collectShortcuts,
} from "@shared/common/shortcutKit";
import ShortcutsHelpDialog from "@shared/common/ShortcutsHelpDialog";
import KbdHint from "@business/pos/common/KbdHint";
import { useStyles } from "@business/accounting/common";
import { vehiclesApi, carriersApi, driversApi, errMsg } from "./api";
import DispatchTab from "./DispatchTab";
import FleetTab from "./FleetTab";
import CashTab from "./CashTab";
import TripDialog from "./TripDialog";
import HintBar from "@shared/ui/HintBar";

const TAB_KEYS = ["dispatch", "fleet", "cash"];

export default function DispatchPage() {
  const { t } = useTranslation();
  const { mode } = useThemeMode();
  const { isRtl, lang } = useLang();
  const C = useMemo(() => buildColors(mode === "dark"), [mode]);
  const S = useStyles(C);
  const muiTheme = useTheme();
  const fullScreen = useMediaQuery(muiTheme.breakpoints.down("sm"));

  const [tab, setTab] = useState("dispatch");
  const [vehicles, setVehicles] = useState([]);
  const [carriers, setCarriers] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [loadError, setLoadError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedId, setSelectedId] = useState(null);
  const [newTrip, setNewTrip] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [helpItems, setHelpItems] = useState([]);
  const [toast, setToast] = useState({ open: false, msg: "", sev: "success" });
  const notify = useCallback((msg, sev = "success") => setToast({ open: true, msg, sev }), []);
  const bump = useCallback(() => setRefreshKey((k) => k + 1), []);

  const reloadFleet = useCallback(() => {
    Promise.all([vehiclesApi.list(), carriersApi.list(), driversApi.list()])
      .then(([v, c, d]) => {
        setVehicles(Array.isArray(v) ? v : []);
        setCarriers(Array.isArray(c) ? c : []);
        setDrivers(Array.isArray(d) ? d : []);
        setLoadError("");
      })
      .catch((e) => setLoadError(errMsg(e, t("ui_del.common.load_failed"))));
  }, [t]);

  useEffect(() => { reloadFleet(); }, [reloadFleet]);

  const ctx = { t, C, S, isRtl, lang, fullScreen, notify };
  const tabs = TAB_KEYS.map((k) => ({ id: k, label: t(`ui_del.tabs.${k}`) }));

  useRegisteredShortcuts([
    helpBinding(t, () => {
      const dialogItems = [
        { combo: "Ctrl+D", label: t("shortcuts.save") },
        { combo: "F3", label: t("ui_del.keys.add_stop") },
        { combo: "Escape", label: t("shortcuts.close_dialog") },
      ];
      const seen = new Set();
      setHelpItems([...collectShortcuts(), ...dialogItems].filter((i) => {
        const k = `${i.combo}|${i.label}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      }));
      setHelpOpen(true);
    }),
    ...tabBindings(t, tabs, setTab),
    // on the fleet tab F2 is registered by the tab itself (new driver)
    { combo: "F2", label: t("ui_del.keys.new_trip"), handler: () => { setTab("dispatch"); setNewTrip(true); }, when: tab !== "fleet" },
  ]);

  return (
    <Box dir={isRtl ? "rtl" : "ltr"} sx={{ p: { xs: 1, sm: 2 }, maxWidth: 1500, mx: "auto" }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 1, flexWrap: "wrap", mb: 2 }}>
        <Box>
          <Typography sx={{ color: C.text, fontWeight: 800, fontSize: { xs: 18, sm: 22 }, mb: 0.5 }}>
            {t("ui_del.page.title")}
          </Typography>
          <Typography sx={{ color: C.sub, fontSize: 13 }}>{t("ui_del.page.subtitle")}</Typography>
        </Box>
        <Button sx={S.btn} onClick={() => { setTab("dispatch"); setNewTrip(true); }}>
          + {t("ui_del.trip.new")}<KbdHint>F2</KbdHint>
        </Button>
      </Box>

      <Tabs
        value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" scrollButtons="auto"
        sx={{
          mb: 2, minHeight: 40,
          "& .MuiTab-root": { color: C.sub, textTransform: "none", fontWeight: 600, minHeight: 40 },
          "& .Mui-selected": { color: `${C.primary} !important` },
          "& .MuiTabs-indicator": { bgcolor: C.primary },
        }}
      >
        {tabs.map((x) => <Tab key={x.id} value={x.id} label={x.label} />)}
      </Tabs>

      {loadError && <Alert severity="error" sx={{ mb: 2 }}>{loadError}</Alert>}

      {tab === "dispatch" && (
        <DispatchTab ctx={ctx} drivers={drivers} vehicles={vehicles} refreshKey={refreshKey}
          selectedId={selectedId} onSelect={setSelectedId} />
      )}
      {tab === "fleet" && (
        <FleetTab ctx={ctx} vehicles={vehicles} carriers={carriers} drivers={drivers}
          reloadFleet={reloadFleet} />
      )}
      {tab === "cash" && <CashTab ctx={ctx} refreshKey={refreshKey} bump={bump} />}

      {newTrip && (
        <TripDialog
          ctx={ctx} drivers={drivers} vehicles={vehicles} carriers={carriers}
          onClose={() => setNewTrip(false)}
          onSaved={(trip) => { setNewTrip(false); setSelectedId(trip.id); bump(); notify(t("ui_del.trip.saved")); }}
        />
      )}

      <ShortcutsHelpDialog open={helpOpen} onClose={() => setHelpOpen(false)} items={helpItems} />

      <Snackbar
        open={toast.open} autoHideDuration={4500}
        onClose={() => setToast((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert severity={toast.sev} variant="filled" onClose={() => setToast((s) => ({ ...s, open: false }))}>
          {toast.msg}
        </Alert>
      </Snackbar>
      <HintBar items={[{ keys: "F2", label: t("ui_design.hint_new") }, { keys: "F3", label: t("ui_design.hint_add_line") }, { keys: "Ctrl+D", label: t("ui_design.hint_save") }, { keys: "Esc", label: t("ui_design.hint_close") }]} />
    </Box>
  );
}
