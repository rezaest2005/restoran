import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Alert, Box, Button, CircularProgress, Snackbar, Table, TableBody, TableCell, TableHead, TableRow,
  Tab, Tabs, TextField, Typography, useMediaQuery, useTheme,
} from "@mui/material";
import { useThemeMode } from "@shared/contexts/ThemeContext";
import { useLang } from "@shared/contexts/LangContext";
import { buildColors } from "@shared/palette";
import { useRegisteredShortcuts, onEnter } from "@shared/common/shortcutKit";
import KbdHint from "@business/pos/common/KbdHint";
import {
  useStyles, TableWrap, fmtInt, useRowCursor, cursorBindings, cursorProps,
} from "../accounting/common";
import { fetchMembers, errMsg } from "./api";
import TierBadge from "./TierBadge";
import MemberDialog from "./MemberDialog";
import MemberDetailDialog from "./MemberDetailDialog";
import SettingsForm from "./SettingsForm";

/**
 * Customer club inside the dashboard hub: members table + settings.
 * Keys: F2 new member, F3 search, Ctrl+A / Ctrl+Z row cursor, Enter open row, Alt+Shift+1/2 sections.
 */
export default function ClubPage() {
  const { t } = useTranslation();
  const { mode } = useThemeMode();
  const { isRtl, lang } = useLang();
  const C = useMemo(() => buildColors(mode === "dark"), [mode]);
  const S = useStyles(C);
  const muiTheme = useTheme();
  const fullScreen = useMediaQuery(muiTheme.breakpoints.down("sm"));

  const [view, setView] = useState("members");
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);
  const [detailId, setDetailId] = useState(null);
  const [toast, setToast] = useState({ open: false, msg: "", sev: "success" });
  const notify = useCallback((msg, sev = "success") => setToast({ open: true, msg, sev }), []);
  const firstRun = useRef(true);
  const searchRef = useRef(null);

  useEffect(() => {
    if (firstRun.current) { firstRun.current = false; return undefined; }
    const id = setTimeout(() => setQ(qInput.trim()), 350);
    return () => clearTimeout(id);
  }, [qInput]);

  const load = useCallback(() => {
    setLoading(true);
    fetchMembers(q)
      .then((d) => { setRows(Array.isArray(d) ? d : []); setError(""); })
      .catch((e) => setError(errMsg(e, t("ui_club.err.generic"))))
      .finally(() => setLoading(false));
  }, [q, t]);
  useEffect(() => { load(); }, [load]);

  const cursor = useRowCursor(rows.length);
  const ctx = { t, C, S, lang, isRtl, fullScreen, notify };

  const views = [
    { id: "members", label: t("ui_club.tab_members") },
    { id: "settings", label: t("ui_club.tab_settings") },
  ];

  useRegisteredShortcuts([
    ...views.map((v, i) => ({
      combo: `Alt+Shift+${i + 1}`, label: `${t("ui_club.section_n", { n: i + 1 })} — ${v.label}`,
      handler: () => setView(v.id),
    })),
    { combo: "F2", label: t("ui_club.member.new"), handler: () => setAdding(true), when: view === "members" },
    { combo: "F3", label: t("ui_club.search"), handler: () => searchRef.current?.focus(), when: view === "members" },
    ...(view === "members" ? cursorBindings(t, cursor) : []),
    {
      combo: "Enter", label: t("ui_club.open_row"), when: view === "members",
      handler: onEnter(() => { const r = rows[cursor.index]; if (!r) return false; setDetailId(r.id); return true; }),
    },
  ]);

  return (
    <Box dir={isRtl ? "rtl" : "ltr"} sx={{ py: 1 }}>
      <Tabs value={view} onChange={(_, v) => setView(v)} variant="scrollable" scrollButtons="auto"
        sx={{
          mb: 2, minHeight: 40,
          "& .MuiTab-root": { color: C.sub, textTransform: "none", fontWeight: 600, minHeight: 40 },
          "& .Mui-selected": { color: `${C.primary} !important` },
          "& .MuiTabs-indicator": { bgcolor: C.primary },
        }}>
        {views.map((v, i) => <Tab key={v.id} value={v.id} label={<>{v.label}<span className="ks-alt-hint ks-kbd" dir="ltr" style={{ marginInlineStart: 6 }}>Alt+Shift+{i + 1}</span></>} />)}
      </Tabs>

      {view === "settings" && <SettingsForm ctx={ctx} onSaved={load} />}

      {view === "members" && (
        <Box sx={S.card}>
          <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap", alignItems: "center", mb: 1.5 }}>
            <TextField inputRef={searchRef} size="small" label={t("ui_club.search")} value={qInput}
              sx={{ ...S.field, flex: 1, minWidth: { xs: "100%", sm: 240 } }}
              onChange={(e) => { setQInput(e.target.value); cursor.reset(); }} />
            <Button sx={S.btn} onClick={() => setAdding(true)}>{t("ui_club.member.new")}<KbdHint>F2</KbdHint></Button>
          </Box>

          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          {loading ? (
            <Box sx={{ textAlign: "center", py: 4 }}><CircularProgress size={28} /></Box>
          ) : rows.length === 0 ? (
            <Typography sx={{ color: C.muted, textAlign: "center", py: 4 }}>{t("ui_club.empty")}</Typography>
          ) : (
            <TableWrap C={C}>
              <Table size="small" sx={{ minWidth: 520 }}>
                <TableHead>
                  <TableRow>
                    <TableCell sx={S.th}>{t("ui_club.member.name")}</TableCell>
                    <TableCell sx={S.th}>{t("ui_club.member.phone")}</TableCell>
                    <TableCell sx={S.th}>{t("ui_club.member.tier")}</TableCell>
                    <TableCell sx={S.thNum}>{t("ui_club.member.points")}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {rows.map((m, i) => {
                    const cp = cursorProps(C, i === cursor.index);
                    return (
                      <TableRow key={m.id} hover onClick={() => setDetailId(m.id)} {...cp}
                        sx={{ cursor: "pointer", ...(cp.sx || {}) }}>
                        <TableCell sx={{ ...S.td, fontWeight: 600 }}>{m.name || "—"}</TableCell>
                        <TableCell sx={S.td}><span dir="ltr">{m.phone}</span></TableCell>
                        <TableCell sx={S.td}><TierBadge tier={m.tier} C={C} /></TableCell>
                        <TableCell sx={S.tdNum}>{fmtInt(m.points_balance, lang)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableWrap>
          )}
        </Box>
      )}

      {adding && (
        <MemberDialog ctx={ctx} onClose={() => setAdding(false)}
          onSaved={() => { setAdding(false); notify(t("ui_club.member.saved")); load(); }} />
      )}
      {detailId != null && (
        <MemberDetailDialog ctx={ctx} id={detailId} onClose={() => setDetailId(null)} onChanged={load} />
      )}

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
