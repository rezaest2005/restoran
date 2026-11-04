import { useState, useEffect } from "react";
import {
  Box, Typography, Button, Dialog, DialogTitle, DialogContent, DialogActions, TextField,
  Alert, CircularProgress, Table, TableHead, TableBody, TableRow, TableCell, Chip,
} from "@mui/material";
import { useRegisteredShortcuts } from "@shared/common/shortcutKit";
import {
  TableWrap, Money, ConfirmDialog, fmtDate, fmtInt, accName, sourceLabel, parseSource,
} from "../common";
import { fetchEntry, reverseEntry, errMsg } from "../api";

export function SourceBadge({ entry, ctx }) {
  const { t, C, lang } = ctx;
  const { base, version } = parseSource(entry.source_type);
  const fi = (x) => fmtInt(x, lang);
  const [fg, bg] = base === "manual" ? [C.info, C.infoBg]
    : base === "reversal" ? [C.warning, C.warningBg]
    : version ? [C.muted, C.divider] : [C.accent, C.accentSubtle];
  return <Chip size="small" label={sourceLabel(t, entry, fi)} sx={{ color: fg, bgcolor: bg, fontWeight: 700 }} />;
}

/** Entry details with lines and a "Reverse" action. */
export default function EntryDetailDialog({ ctx, id, onClose, onChanged }) {
  const { t, C, S, lang, fullScreen, accById, notify, openDetail } = ctx;
  const [entry, setEntry] = useState(null);
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [confErr, setConfErr] = useState("");
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    let alive = true;
    setEntry(null); setError("");
    fetchEntry(id)
      .then((e) => alive && setEntry(e))
      .catch((e) => alive && setError(errMsg(e, t("ui_i.common.load_failed"))));
    return () => { alive = false; };
  }, [id, reloadTick, t]);

  const lines = entry?.lines || [];
  const totalD = lines.reduce((s, l) => s + Number(l.debit || 0), 0);
  const totalC = lines.reduce((s, l) => s + Number(l.credit || 0), 0);
  const src = entry ? parseSource(entry.source_type) : null;
  const canReverse = entry && src.base !== "reversal" && !src.version && !entry.reversed_by && !entry.reversed_by_id;
  const fi = (x) => fmtInt(x, lang);

  const doReverse = async () => {
    setBusy(true); setConfErr("");
    try {
      const res = await reverseEntry(id, reason.trim());
      notify(t("ui_i.entry.reversed_ok"));
      setConfirm(false); setReason("");
      onChanged();
      if (res?.id && res.id !== id) openDetail(res.id);
      else setReloadTick((n) => n + 1);
    } catch (e) {
      setConfErr(errMsg(e, t("ui_i.common.save_failed")));
    } finally { setBusy(false); }
  };

  useRegisteredShortcuts([
    { combo: "Escape", label: t("shortcuts.close_dialog"), handler: onClose, scope: "dialog" },
    { combo: "Ctrl+D", label: t("ui_i.entry.reverse"), scope: "dialog",
      handler: () => { if (canReverse) setConfirm(true); else return false; return true; } },
  ], { enabled: !confirm });

  return (
    <Dialog open onClose={onClose} fullScreen={fullScreen} maxWidth="md" fullWidth slotProps={{ paper: { sx: S.dialogPaper } }}>
      <DialogTitle sx={{ fontWeight: 700, display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
        {t("ui_i.entry.detail_title")} {entry ? fi(entry.number) : ""}
        {entry && <SourceBadge entry={entry} ctx={ctx} />}
      </DialogTitle>
      <DialogContent dividers sx={{ borderColor: C.divider }}>
        {error && <Alert severity="error">{error}</Alert>}
        {!entry && !error && <Box sx={{ textAlign: "center", py: 4 }}><CircularProgress size={28} /></Box>}
        {entry && (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: { xs: "1fr 1fr", sm: "repeat(3, 1fr)" } }}>
              <Box>
                <Typography sx={{ color: C.muted, fontSize: 11 }}>{t("ui_i.common.date")}</Typography>
                <Typography sx={{ color: C.text, fontWeight: 600, fontSize: 14 }}>{fmtDate(entry.date, lang)}</Typography>
              </Box>
              <Box>
                <Typography sx={{ color: C.muted, fontSize: 11 }}>{t("ui_i.common.number")}</Typography>
                <Typography sx={{ color: C.text, fontWeight: 600, fontSize: 14 }}>{fi(entry.number)}</Typography>
              </Box>
              <Box sx={{ gridColumn: { xs: "1 / -1", sm: "auto" } }}>
                <Typography sx={{ color: C.muted, fontSize: 11 }}>{t("ui_i.common.description")}</Typography>
                <Typography sx={{ color: C.text, fontWeight: 600, fontSize: 14 }}>{entry.description || "—"}</Typography>
              </Box>
            </Box>

            {entry.reversal_of && (
              <Alert severity="warning" action={
                <Button color="inherit" size="small" sx={{ minHeight: 40 }} onClick={() => openDetail(entry.reversal_of)}>
                  {t("ui_i.entry.open")}
                </Button>
              }>
                {t("ui_i.entry.reversal_of", { id: fi(entry.reversal_of) })}
              </Alert>
            )}
            {(entry.reversed_by || entry.reversed_by_id) && (
              <Alert severity="info" action={
                <Button color="inherit" size="small" sx={{ minHeight: 40 }}
                  onClick={() => openDetail(entry.reversed_by_id || entry.reversed_by)}>
                  {t("ui_i.entry.open")}
                </Button>
              }>
                {t("ui_i.entry.reversed_by", { id: fi(entry.reversed_by_id || entry.reversed_by) })}
              </Alert>
            )}
            {src.version && <Alert severity="info">{t("ui_i.entry.superseded")}</Alert>}

            <TableWrap C={C}>
              <Table size="small" sx={{ minWidth: 640 }}>
                <TableHead>
                  <TableRow>
                    <TableCell sx={S.th}>{t("ui_i.common.code")}</TableCell>
                    <TableCell sx={S.th}>{t("ui_i.common.account")}</TableCell>
                    <TableCell sx={S.th}>{t("ui_i.common.memo")}</TableCell>
                    <TableCell sx={S.th}>{t("ui_i.common.cost_center")}</TableCell>
                    <TableCell sx={S.thNum}>{t("ui_i.common.debit")}</TableCell>
                    <TableCell sx={S.thNum}>{t("ui_i.common.credit")}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {lines.map((l, i) => (
                    <TableRow key={i}>
                      <TableCell sx={S.td}><Box component="span" dir="ltr">{l.code}</Box></TableCell>
                      <TableCell sx={S.td}>{accName(accById[l.account_id], lang) || l.account}</TableCell>
                      <TableCell sx={S.td}>{l.memo || "—"}</TableCell>
                      <TableCell sx={S.td}>{l.cost_center || "—"}</TableCell>
                      <TableCell sx={S.tdNum}><Money v={l.debit} lang={lang} C={C} zeroDash /></TableCell>
                      <TableCell sx={S.tdNum}><Money v={l.credit} lang={lang} C={C} zeroDash /></TableCell>
                    </TableRow>
                  ))}
                  <TableRow>
                    <TableCell sx={{ ...S.td, fontWeight: 800 }} colSpan={4}>{t("ui_i.common.total")}</TableCell>
                    <TableCell sx={{ ...S.tdNum, fontWeight: 800 }}><Money v={totalD} lang={lang} C={C} /></TableCell>
                    <TableCell sx={{ ...S.tdNum, fontWeight: 800 }}><Money v={totalC} lang={lang} C={C} /></TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </TableWrap>
          </Box>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2, flexWrap: "wrap", gap: 1 }}>
        <Button variant="outlined" sx={S.ghost} onClick={onClose}>{t("ui_i.common.close")}</Button>
        {canReverse && (
          <Button variant="outlined" sx={{ ...S.ghost, color: C.danger, borderColor: C.danger }}
            onClick={() => { setConfErr(""); setConfirm(true); }}>
            {t("ui_i.entry.reverse")}
          </Button>
        )}
      </DialogActions>

      <ConfirmDialog
        ctx={ctx} open={confirm} danger busy={busy} error={confErr}
        title={t("ui_i.entry.reverse_title")} text={t("ui_i.entry.reverse_text")}
        confirmLabel={t("ui_i.entry.reverse")}
        onClose={() => setConfirm(false)} onConfirm={doReverse}
      >
        <TextField
          fullWidth size="small" label={t("ui_i.entry.reason")} value={reason} sx={S.field}
          onChange={(e) => setReason(e.target.value)} autoFocus
        />
      </ConfirmDialog>
    </Dialog>
  );
}
