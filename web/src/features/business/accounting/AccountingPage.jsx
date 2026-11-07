import { useState, useMemo, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  Box, Typography, Tabs, Tab, Alert, Snackbar, useMediaQuery, useTheme,
} from "@mui/material";
import { useThemeMode } from "@shared/contexts/ThemeContext";
import { useLang } from "@shared/contexts/LangContext";
import { buildColors } from "@shared/palette";
import {
  useRegisteredShortcuts, tabBindings, helpBinding, collectShortcuts,
} from "@shared/common/shortcutKit";
import ShortcutsHelpDialog from "@shared/common/ShortcutsHelpDialog";
import { useStyles } from "./common";
import { fetchAccounts, fetchCostCenters, errMsg } from "./api";
import OverviewTab from "./tabs/OverviewTab";
import AccountsTab from "./tabs/AccountsTab";
import JournalTab from "./tabs/JournalTab";
import LedgerTab from "./tabs/LedgerTab";
import ReportsTab from "./tabs/ReportsTab";
import EntryDialog from "./tabs/EntryDialog";
import EntryDetailDialog from "./tabs/EntryDetailDialog";

const TAB_KEYS = ["overview", "accounts", "journal", "ledger", "reports"];

/**
 * `embedded`: rendered inside the dashboard hub. The hub owns F1 and Alt+1..n,
 * so the inner tabs move to Alt+Shift+1..n and the page title is dropped.
 */
export default function AccountingPage({ embedded = false }) {
  const { t } = useTranslation();
  const { mode } = useThemeMode();
  const { isRtl, lang } = useLang();
  const C = useMemo(() => buildColors(mode === "dark"), [mode]);
  const S = useStyles(C);
  const muiTheme = useTheme();
  const fullScreen = useMediaQuery(muiTheme.breakpoints.down("sm"));

  const [tab, setTab] = useState("overview");
  const [accounts, setAccounts] = useState([]);
  const [costCenters, setCostCenters] = useState([]);
  const [loadError, setLoadError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [newEntry, setNewEntry] = useState(false);
  const [detailId, setDetailId] = useState(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [helpItems, setHelpItems] = useState([]);
  const [toast, setToast] = useState({ open: false, msg: "", sev: "success" });
  const notify = useCallback((msg, sev = "success") => setToast({ open: true, msg, sev }), []);
  const bump = useCallback(() => setRefreshKey((k) => k + 1), []);

  const reloadAccounts = useCallback(() => {
    fetchAccounts()
      .then((d) => { setAccounts(Array.isArray(d) ? d : []); setLoadError(""); })
      .catch((e) => setLoadError(errMsg(e, t("ui_i.common.load_failed"))));
  }, [t]);

  useEffect(() => { reloadAccounts(); }, [reloadAccounts]);
  useEffect(() => {
    fetchCostCenters()
      .then((d) => setCostCenters(Array.isArray(d) ? d.filter((c) => c.is_active !== false) : []))
      .catch(() => {});
  }, []);

  const accById = useMemo(() => {
    const m = {};
    accounts.forEach((a) => { m[a.id] = a; });
    return m;
  }, [accounts]);
  const accByCode = useMemo(() => {
    const m = {};
    accounts.forEach((a) => { m[a.code] = a; });
    return m;
  }, [accounts]);

  const ctx = {
    t, C, S, isRtl, lang, fullScreen, notify, accounts, accById, accByCode, costCenters,
    reloadAccounts, refreshKey, bump,
    openDetail: setDetailId, openNewEntry: () => setNewEntry(true),
  };

  const tabs = TAB_KEYS.map((k) => ({ id: k, label: t(`ui_i.tabs.${k}`) }));
  const innerTabKeys = embedded
    ? tabBindings(t, tabs, setTab).map((b) => ({ ...b, combo: b.combo.replace("Alt+", "Alt+Shift+") }))
    : tabBindings(t, tabs, setTab);
  useRegisteredShortcuts([
    ...(embedded ? [] : [helpBinding(t, () => {
      const dialogItems = [
        { combo: "Ctrl+D", label: t("shortcuts.save") },
        { combo: "F3", label: t("ui_i.keys.add_line") },
        { combo: "Enter", label: t("shortcuts.confirm") },
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
    })]),
    ...innerTabKeys,
    // the Chart of accounts tab registers its own F2 (new account)
    { combo: "F2", label: t("ui_i.keys.new_entry"), handler: () => setNewEntry(true), when: tab !== "accounts" },
  ]);

  return (
    <Box dir={isRtl ? "rtl" : "ltr"} sx={{ p: { xs: 1, sm: 2 }, maxWidth: 1200, mx: "auto" }}>
      {!embedded && (
        <>
          <Typography sx={{ color: C.text, fontWeight: 800, fontSize: { xs: 18, sm: 22 }, mb: 0.5 }}>
            {t("ui_i.page.title")}
          </Typography>
          <Typography sx={{ color: C.sub, fontSize: 13, mb: 2 }}>{t("ui_i.page.subtitle")}</Typography>
        </>
      )}

      <Tabs
        value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" scrollButtons="auto"
        sx={{
          mb: 2, minHeight: 40,
          "& .MuiTab-root": { color: C.sub, textTransform: "none", fontWeight: 600, minHeight: 40 },
          "& .Mui-selected": { color: `${C.primary} !important` },
          "& .MuiTabs-indicator": { bgcolor: C.primary },
        }}
      >
        {tabs.map((x, i) => <Tab key={x.id} value={x.id} label={embedded ? `${x.label}  (Alt+Shift+${i + 1})` : x.label} />)}
      </Tabs>

      {loadError && <Alert severity="error" sx={{ mb: 2 }}>{loadError}</Alert>}

      {tab === "overview" && <OverviewTab {...ctx} />}
      {tab === "accounts" && <AccountsTab {...ctx} />}
      {tab === "journal" && <JournalTab {...ctx} />}
      {tab === "ledger" && <LedgerTab {...ctx} />}
      {tab === "reports" && <ReportsTab {...ctx} />}

      {newEntry && (
        <EntryDialog
          ctx={ctx} onClose={() => setNewEntry(false)}
          onSaved={() => { setNewEntry(false); bump(); notify(t("ui_i.entry.saved")); }}
        />
      )}
      {detailId != null && (
        <EntryDetailDialog
          ctx={ctx} id={detailId} onClose={() => setDetailId(null)}
          onChanged={() => { bump(); }}
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
    </Box>
  );
}
