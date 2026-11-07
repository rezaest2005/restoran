import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Alert, Box, Button, Chip, CircularProgress, Snackbar, Table, TableBody, TableCell, TableHead, TableRow,
  Typography, useMediaQuery, useTheme,
} from "@mui/material";
import { useThemeMode } from "@shared/contexts/ThemeContext";
import { useLang } from "@shared/contexts/LangContext";
import { buildColors } from "@shared/palette";
import { useRegisteredShortcuts, onEnter } from "@shared/common/shortcutKit";
import KbdHint from "@business/pos/common/KbdHint";
import {
  useStyles, TableWrap, useRowCursor, cursorBindings, cursorProps, fmtInt,
} from "../accounting/common";
import { fetchTickets, businessThreadApi } from "./api";
import { errMsg, statusColor, fmtStamp } from "./common";
import useLoad from "./useLoad";
import NewTicketDialog from "./NewTicketDialog";
import ThreadDialog from "./ThreadDialog";

/**
 * Platform support inside the dashboard hub (owner / manager).
 * Keys: F2 new ticket, Ctrl+A / Ctrl+Z row cursor, Enter open, Ctrl+D send, Escape close, F1 help.
 */
export default function SupportPage() {
  const { t } = useTranslation();
  const { mode } = useThemeMode();
  const { isRtl, lang } = useLang();
  const C = useMemo(() => buildColors(mode === "dark"), [mode]);
  const S = useStyles(C);
  const fullScreen = useMediaQuery(useTheme().breakpoints.down("sm"));

  const { data, error: loadErr, loading, reload: load } = useLoad(fetchTickets, null);
  const rows = Array.isArray(data) ? data : [];
  const error = loadErr ? errMsg(loadErr, t("ui_sup.common.err_generic")) : "";
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState(null);
  const [toast, setToast] = useState({ open: false, msg: "" });

  const cursor = useRowCursor(rows.length);
  const ctx = { t, C, S, lang, isRtl, fullScreen };
  const dialogOpen = creating || openId != null;

  useRegisteredShortcuts([
    { combo: "F2", label: t("ui_sup.biz.new"), handler: () => setCreating(true) },
    ...cursorBindings(t, cursor),
    {
      combo: "Enter", label: t("ui_sup.common.open_row"),
      handler: onEnter(() => { const r = rows[cursor.index]; if (!r) return false; setOpenId(r.id); return true; }),
    },
  ], { enabled: !dialogOpen });

  return (
    <Box dir={isRtl ? "rtl" : "ltr"} sx={{ py: 1 }}>
      <Box sx={S.card}>
        <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap", alignItems: "center", mb: 1.5 }}>
          <Typography sx={{ color: C.sub, fontSize: 13, flex: 1, minWidth: 200 }}>{t("ui_sup.biz.hint")}</Typography>
          <Button sx={S.ghost} variant="outlined" onClick={load}>{t("ui_sup.common.refresh")}</Button>
          <Button sx={S.btn} onClick={() => setCreating(true)}>{t("ui_sup.biz.new")}<KbdHint>F2</KbdHint></Button>
        </Box>

        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        {loading ? (
          <Box sx={{ textAlign: "center", py: 4 }}><CircularProgress size={28} /></Box>
        ) : rows.length === 0 ? (
          <Typography sx={{ color: C.muted, textAlign: "center", py: 4 }}>{t("ui_sup.common.empty")}</Typography>
        ) : (
          <TableWrap C={C}>
            <Table size="small" sx={{ minWidth: 560 }}>
              <TableHead>
                <TableRow>
                  <TableCell sx={S.th}>{t("ui_sup.common.subject")}</TableCell>
                  <TableCell sx={S.th}>{t("ui_sup.common.category")}</TableCell>
                  <TableCell sx={S.th}>{t("ui_sup.common.status_l")}</TableCell>
                  <TableCell sx={S.thNum}>{t("ui_sup.common.messages_n")}</TableCell>
                  <TableCell sx={S.th}>{t("ui_sup.common.last_activity")}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((r, i) => {
                  const cp = cursorProps(C, i === cursor.index);
                  return (
                    <TableRow key={r.id} hover onClick={() => setOpenId(r.id)} {...cp} sx={{ cursor: "pointer", ...(cp.sx || {}) }}>
                      <TableCell sx={{ ...S.td, fontWeight: 600, maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {r.subject}
                      </TableCell>
                      <TableCell sx={S.td}>{t(`ui_sup.cat.${r.category}`)}</TableCell>
                      <TableCell sx={S.td}>
                        <Chip size="small" label={t(`ui_sup.status.${r.status}`)}
                          sx={{ color: statusColor(C, r.status), border: `1px solid ${statusColor(C, r.status)}`, bgcolor: "transparent", fontWeight: 700 }} />
                      </TableCell>
                      <TableCell sx={S.tdNum}>{fmtInt(r.message_count ?? 0, lang)}</TableCell>
                      <TableCell sx={S.td}>{fmtStamp(r.last_activity_at, lang)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableWrap>
        )}
      </Box>

      {creating && (
        <NewTicketDialog ctx={ctx} onClose={() => setCreating(false)}
          onCreated={(d) => { setCreating(false); setToast({ open: true, msg: t("ui_sup.biz.created_ok") }); load(); setOpenId(d?.id ?? null); }} />
      )}
      {openId != null && (
        <ThreadDialog ctx={ctx} id={openId} api={businessThreadApi} onClose={() => setOpenId(null)} onChanged={load} />
      )}

      <Snackbar open={toast.open} autoHideDuration={3500} onClose={() => setToast((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}>
        <Alert severity="success" variant="filled" onClose={() => setToast((s) => ({ ...s, open: false }))}>{toast.msg}</Alert>
      </Snackbar>
    </Box>
  );
}
