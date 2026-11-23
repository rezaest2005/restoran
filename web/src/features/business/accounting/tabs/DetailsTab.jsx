import { useState, useMemo } from "react";
import {
  Box, Typography, Button, Table, TableHead, TableBody, TableRow, TableCell, TextField, MenuItem, Chip,
  Dialog, DialogTitle, DialogContent, DialogActions, Alert, CircularProgress, Switch, FormControlLabel,
} from "@mui/material";
import { useRegisteredShortcuts, dialogBindings, onEnter } from "@shared/common/shortcutKit";
import KbdHint from "@shared/common/KbdHint";
import { TableWrap, Money, DETAIL_KINDS, useRowCursor, cursorBindings, cursorProps } from "../common";
import { createDetail, updateDetail, deleteDetail, errMsg } from "../api";


/** Detail accounts (تفصیلی): people, customers, suppliers, employees, projects … used on any voucher line. */
export default function DetailsTab(ctx) {
  const { t, C, S, details, reloadDetails, notify, goTab } = ctx;
  const [kind, setKind] = useState("");
  const [q, setQ] = useState("");
  const [edit, setEdit] = useState(null); // {} for new

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return details.filter((d) => (!kind || d.kind === kind)
      && (!s || d.name.toLowerCase().includes(s) || d.code.includes(s) || (d.phone || "").includes(s)));
  }, [details, kind, q]);
  const cursor = useRowCursor(rows.length);

  useRegisteredShortcuts([
    { combo: "F2", label: t("acc2.details.new"), handler: () => setEdit({}) },
    ...cursorBindings(t, cursor),
    { combo: "Enter", label: t("ui_i.keys.open_row"),
      handler: onEnter(() => { const r = rows[cursor.index]; if (!r) return false; setEdit(r); return true; }) },
  ], { enabled: !edit });

  return (
    <Box sx={S.card}>
      <Typography sx={{ color: C.sub, fontSize: 13, mb: 1.5 }}>{t("acc2.details.intro")}</Typography>
      <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap", alignItems: "center", mb: 2 }}>
        <TextField size="small" label={t("ui_i.common.search")} value={q} onChange={(e) => setQ(e.target.value)}
          sx={{ ...S.field, flex: 1, minWidth: { xs: "100%", sm: 220 } }} />
        <TextField select size="small" label={t("acc2.details.kind")} value={kind} onChange={(e) => setKind(e.target.value)}
          sx={{ ...S.field, width: { xs: "100%", sm: 180 } }}>
          <MenuItem value="">{t("ui_i.common.all")}</MenuItem>
          {DETAIL_KINDS.map((k) => <MenuItem key={k} value={k}>{t(`acc2.detail_kinds.${k}`)}</MenuItem>)}
        </TextField>
        <Button variant="outlined" sx={S.ghost} onClick={() => goTab("reports")}>{t("acc2.details.balances")}</Button>
        <Button sx={S.btn} onClick={() => setEdit({})}>{t("acc2.details.new")}<KbdHint>F2</KbdHint></Button>
      </Box>
      {rows.length === 0 ? (
        <Typography sx={{ color: C.muted, textAlign: "center", py: 4 }}>{t("acc2.details.empty")}</Typography>
      ) : (
        <TableWrap C={C}>
          <Table size="small" sx={{ minWidth: 640 }}>
            <TableHead>
              <TableRow>
                <TableCell sx={S.th}>{t("ui_i.common.code")}</TableCell>
                <TableCell sx={S.th}>{t("ui_i.common.name")}</TableCell>
                <TableCell sx={S.th}>{t("acc2.details.kind")}</TableCell>
                <TableCell sx={S.th}>{t("acc2.details.phone")}</TableCell>
                <TableCell sx={S.thNum}>{t("acc2.details.credit_limit")}</TableCell>
                <TableCell sx={S.th} />
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((d, i) => {
                const cp = cursorProps(C, i === cursor.index);
                return (
                  <TableRow key={d.id} hover {...cp} onClick={() => setEdit(d)} sx={{ cursor: "pointer", ...(cp.sx || {}), opacity: d.is_active ? 1 : 0.55 }}>
                    <TableCell sx={S.td}><Box component="span" dir="ltr">{d.code}</Box></TableCell>
                    <TableCell sx={{ ...S.td, fontWeight: 600 }}>{d.name}</TableCell>
                    <TableCell sx={S.td}><Chip size="small" label={t(`acc2.detail_kinds.${d.kind}`)} /></TableCell>
                    <TableCell sx={S.td}><Box component="span" dir="ltr">{d.phone || "—"}</Box></TableCell>
                    <TableCell sx={S.tdNum}><Money v={d.credit_limit} lang={ctx.lang} C={C} zeroDash /></TableCell>
                    <TableCell sx={S.td}>{!d.is_active && t("acc2.common.inactive")}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableWrap>
      )}
      {edit && (
        <DetailDialog ctx={ctx} item={edit} onClose={() => setEdit(null)}
          onSaved={(msg) => { setEdit(null); reloadDetails(); notify(msg); }} />
      )}
    </Box>
  );
}

function DetailDialog({ ctx, item, onClose, onSaved }) {
  const { t, C, S, fullScreen } = ctx;
  const isNew = !item.id;
  const [f, setF] = useState({
    name: item.name || "", code: item.code || "", kind: item.kind || "person", phone: item.phone || "",
    national_id: item.national_id || "", economic_code: item.economic_code || "", address: item.address || "",
    credit_limit: item.credit_limit ? String(item.credit_limit) : "", note: item.note || "",
    is_active: item.is_active !== false,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));

  const save = async () => {
    if (!f.name.trim() || busy) return;
    setBusy(true); setError("");
    try {
      if (isNew) await createDetail({ ...f, code: f.code.trim() || undefined });
      else await updateDetail(item.id, f);
      onSaved(t("ui_i.entry.saved"));
    } catch (e) { setError(errMsg(e, t("ui_i.common.save_failed"))); } finally { setBusy(false); }
  };
  const remove = async () => {
    setBusy(true); setError("");
    try { await deleteDetail(item.id); onSaved(t("acc2.entry.deleted_ok")); } catch (e) {
      setError(errMsg(e, t("ui_i.common.save_failed")));
    } finally { setBusy(false); }
  };
  useRegisteredShortcuts(dialogBindings(t, { confirmLabel: t("ui_i.common.save"), onConfirm: save, onClose, enter: false }));

  return (
    <Dialog open onClose={busy ? undefined : onClose} fullScreen={fullScreen} maxWidth="sm" fullWidth slotProps={{ paper: { sx: S.dialogPaper } }}>
      <DialogTitle sx={{ fontWeight: 700 }}>{isNew ? t("acc2.details.new") : item.name}</DialogTitle>
      <DialogContent dividers sx={{ borderColor: C.divider }}>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" } }}>
          <TextField size="small" label={t("ui_i.common.name")} value={f.name} onChange={set("name")} sx={S.field} autoFocus required />
          <TextField size="small" label={t("ui_i.common.code")} value={f.code} onChange={set("code")} sx={S.field}
            disabled={!isNew} helperText={isNew ? t("acc2.details.code_auto") : ""} slotProps={{ htmlInput: { dir: "ltr" } }} />
          <TextField select size="small" label={t("acc2.details.kind")} value={f.kind} onChange={set("kind")} sx={S.field} disabled={!isNew}>
            {DETAIL_KINDS.map((k) => <MenuItem key={k} value={k}>{t(`acc2.detail_kinds.${k}`)}</MenuItem>)}
          </TextField>
          <TextField size="small" label={t("acc2.details.phone")} value={f.phone} onChange={set("phone")} sx={S.field} slotProps={{ htmlInput: { dir: "ltr" } }} />
          <TextField size="small" label={t("acc2.details.national_id")} value={f.national_id} onChange={set("national_id")} sx={S.field} slotProps={{ htmlInput: { dir: "ltr" } }} />
          <TextField size="small" label={t("acc2.details.economic_code")} value={f.economic_code} onChange={set("economic_code")} sx={S.field} slotProps={{ htmlInput: { dir: "ltr" } }} />
          <TextField size="small" label={t("acc2.details.credit_limit")} value={f.credit_limit} onChange={set("credit_limit")} sx={S.field} slotProps={{ htmlInput: { dir: "ltr", inputMode: "decimal" } }} />
          <TextField size="small" label={t("acc2.details.address")} value={f.address} onChange={set("address")} sx={S.field} />
          <TextField size="small" label={t("ui_i.common.memo")} value={f.note} onChange={set("note")} sx={{ ...S.field, gridColumn: "1 / -1" }} />
          {!isNew && (
            <FormControlLabel control={<Switch checked={f.is_active} onChange={(e) => setF((s) => ({ ...s, is_active: e.target.checked }))} />}
              label={t("acc2.common.active")} />
          )}
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2, gap: 1, flexWrap: "wrap" }}>
        {!isNew && <Button sx={{ ...S.ghost, color: C.danger }} onClick={remove} disabled={busy}>{t("ui_i.common.remove")}</Button>}
        <Box sx={{ flex: 1 }} />
        <Button variant="outlined" sx={S.ghost} onClick={onClose} disabled={busy}>{t("ui_i.common.cancel")}</Button>
        <Button sx={S.btn} onClick={save} disabled={busy || !f.name.trim()}>
          {busy ? <CircularProgress size={18} color="inherit" /> : <>{t("ui_i.common.save")}<KbdHint>Ctrl+D</KbdHint></>}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
