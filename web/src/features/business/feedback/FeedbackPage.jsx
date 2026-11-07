import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Alert, Box, Button, Chip, CircularProgress, MenuItem, Table, TableBody, TableCell, TableHead, TableRow,
  TextField, Typography, useMediaQuery, useTheme,
} from "@mui/material";
import { useThemeMode } from "@shared/contexts/ThemeContext";
import { useLang } from "@shared/contexts/LangContext";
import { buildColors } from "@shared/palette";
import { useRegisteredShortcuts, onEnter } from "@shared/common/shortcutKit";
import {
  useStyles, TableWrap, useRowCursor, cursorBindings, cursorProps, fmtDate,
} from "../accounting/common";
import { fetchFeedback, errMsg } from "./api";
import FeedbackDialog from "./FeedbackDialog";
import useLoad from "../support/useLoad";

const STATUSES = ["open", "in_progress", "resolved"];
const CATS = ["bug", "suggestion", "complaint", "other"];

/**
 * Customer feedback inside the dashboard hub (staff with the `feedback` tab).
 * Keys: Ctrl+A / Ctrl+Z row cursor, Enter open row, Ctrl+D save in the dialog, Escape close.
 */
export default function FeedbackPage({ onOpenCount }) {
  const { t } = useTranslation();
  const { mode } = useThemeMode();
  const { isRtl, lang } = useLang();
  const C = useMemo(() => buildColors(mode === "dark"), [mode]);
  const S = useStyles(C);
  const fullScreen = useMediaQuery(useTheme().breakpoints.down("sm"));

  const [status, setStatus] = useState("");
  const [category, setCategory] = useState("");
  const params = useMemo(() => {
    const p = {};
    if (status) p.status = status;
    if (category) p.category = category;
    return p;
  }, [status, category]);
  const { data, error: loadErr, loading, reload: load } = useLoad(fetchFeedback, params);
  const rows = useMemo(() => (Array.isArray(data) ? data : []), [data]);
  const error = loadErr ? errMsg(loadErr, t("ui_fb.mgr.err_generic")) : "";
  const [selected, setSelected] = useState(null);

  // keep the hub tab badge in sync (only when the list is unfiltered)
  useEffect(() => {
    if (data && !status && !category && onOpenCount) onOpenCount(rows.filter((x) => x.status === "open").length);
  }, [data, rows, status, category, onOpenCount]);

  const cursor = useRowCursor(rows.length);
  const ctx = { t, C, S, lang, isRtl, fullScreen };
  const statusColor = (s) => (s === "open" ? C.danger : s === "in_progress" ? C.warning : C.success);

  useRegisteredShortcuts([
    ...cursorBindings(t, cursor),
    {
      combo: "Enter", label: t("ui_fb.mgr.open_row"),
      handler: onEnter(() => { const r = rows[cursor.index]; if (!r) return false; setSelected(r); return true; }),
    },
  ], { enabled: !selected });

  return (
    <Box dir={isRtl ? "rtl" : "ltr"} sx={{ py: 1 }}>
      <Box sx={S.card}>
        <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap", alignItems: "center", mb: 1.5 }}>
          <TextField select size="small" label={t("ui_fb.mgr.filter_status")} value={status}
            onChange={(e) => { setStatus(e.target.value); cursor.reset(); }} sx={{ ...S.field, minWidth: 160, flex: { xs: 1, sm: "none" } }}>
            <MenuItem value="">{t("ui_fb.mgr.all")}</MenuItem>
            {STATUSES.map((s) => <MenuItem key={s} value={s}>{t(`ui_fb.status.${s}`)}</MenuItem>)}
          </TextField>
          <TextField select size="small" label={t("ui_fb.mgr.filter_category")} value={category}
            onChange={(e) => { setCategory(e.target.value); cursor.reset(); }} sx={{ ...S.field, minWidth: 160, flex: { xs: 1, sm: "none" } }}>
            <MenuItem value="">{t("ui_fb.mgr.all")}</MenuItem>
            {CATS.map((c) => <MenuItem key={c} value={c}>{t(`ui_fb.cat.${c}`)}</MenuItem>)}
          </TextField>
          <Button sx={S.ghost} variant="outlined" onClick={load}>{t("ui_fb.mgr.refresh")}</Button>
        </Box>

        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        {loading ? (
          <Box sx={{ textAlign: "center", py: 4 }}><CircularProgress size={28} /></Box>
        ) : rows.length === 0 ? (
          <Typography sx={{ color: C.muted, textAlign: "center", py: 4 }}>{t("ui_fb.mgr.empty")}</Typography>
        ) : (
          <TableWrap C={C}>
            <Table size="small" sx={{ minWidth: 560 }}>
              <TableHead>
                <TableRow>
                  <TableCell sx={S.th}>{t("ui_fb.mgr.date")}</TableCell>
                  <TableCell sx={S.th}>{t("ui_fb.mgr.filter_category")}</TableCell>
                  <TableCell sx={S.th}>{t("ui_fb.mgr.from")}</TableCell>
                  <TableCell sx={S.th}>{t("ui_fb.mgr.message")}</TableCell>
                  <TableCell sx={S.th}>{t("ui_fb.mgr.filter_status")}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((f, i) => {
                  const cp = cursorProps(C, i === cursor.index);
                  return (
                    <TableRow key={f.id} hover onClick={() => setSelected(f)} {...cp} sx={{ cursor: "pointer", ...(cp.sx || {}) }}>
                      <TableCell sx={S.td}>{fmtDate(f.created_at, lang)}</TableCell>
                      <TableCell sx={S.td}>{t(`ui_fb.cat.${f.category}`)}</TableCell>
                      <TableCell sx={S.td}>{f.name || t("ui_fb.mgr.anonymous")}</TableCell>
                      <TableCell sx={{ ...S.td, maxWidth: 320, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.message}</TableCell>
                      <TableCell sx={S.td}>
                        <Chip size="small" label={t(`ui_fb.status.${f.status}`)}
                          sx={{ color: statusColor(f.status), border: `1px solid ${statusColor(f.status)}`, bgcolor: "transparent", fontWeight: 700 }} />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableWrap>
        )}
      </Box>

      {selected && (
        <FeedbackDialog ctx={ctx} item={selected} onClose={() => setSelected(null)}
          onSaved={() => { setSelected(null); load(); }} />
      )}
    </Box>
  );
}
