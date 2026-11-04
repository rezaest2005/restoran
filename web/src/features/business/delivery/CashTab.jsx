import { useState, useEffect, useCallback } from "react";
import {
  Box, Typography, Button, Table, TableHead, TableBody, TableRow, TableCell, Dialog, DialogTitle,
  DialogContent, DialogActions, TextField, MenuItem, Alert, CircularProgress,
} from "@mui/material";
import { useRegisteredShortcuts, dialogBindings } from "@shared/common/shortcutKit";
import KbdHint from "@business/pos/common/KbdHint";
import {
  TableWrap, fmtMoney, num, useRowCursor, cursorBindings, cursorProps,
} from "@business/accounting/common";
import { fetchCash, fetchSettlements, createSettlement, errMsg } from "./api";
import { fmtDateTime } from "./common";

function SettleDialog({ ctx, row, onClose, onDone }) {
  const { t, C, S, lang, fullScreen } = ctx;
  const [received, setReceived] = useState(String(row.uncollected || ""));
  const [account, setAccount] = useState("1110");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const rec = num(received);
  const diff = Number.isFinite(rec) ? rec - row.uncollected : NaN;
  const diffColor = !Number.isFinite(diff) ? C.muted : diff === 0 ? C.success : C.danger;

  const submit = async () => {
    if (saving) return;
    if (!(rec >= 0)) { setError(t("ui_del.cash.amount_invalid")); return; }
    setSaving(true);
    setError("");
    try {
      await createSettlement({ driver_id: row.driver_id, received_amount: rec, deposit_account: account, note: note.trim() });
      onDone();
    } catch (e) {
      setError(errMsg(e, t("ui_del.common.save_failed")));
    } finally {
      setSaving(false);
    }
  };

  useRegisteredShortcuts(dialogBindings(t, {
    confirmLabel: t("ui_del.cash.settle"), onConfirm: submit, onClose: () => { if (!saving) onClose(); },
  }));

  return (
    <Dialog open onClose={saving ? undefined : onClose} fullScreen={fullScreen} maxWidth="xs" fullWidth PaperProps={{ sx: S.dialogPaper }}>
      <DialogTitle sx={{ fontWeight: 700 }}>{t("ui_del.cash.settle_title", { name: row.driver_name })}</DialogTitle>
      <DialogContent dividers>
        <Box sx={{ display: "grid", gap: 1.5, mt: 0.5 }}>
          <Box sx={{ bgcolor: C.infoBg, borderRadius: 2, p: 1.5 }}>
            <Typography sx={{ color: C.sub, fontSize: 12 }}>{t("ui_del.cash.expected")}</Typography>
            <Typography sx={{ color: C.text, fontWeight: 800, fontSize: 20 }}>{fmtMoney(row.uncollected, lang)}</Typography>
          </Box>
          <TextField
            size="small" autoFocus label={t("ui_del.cash.received")} value={received}
            onChange={(e) => setReceived(e.target.value)} sx={S.field} inputProps={{ inputMode: "decimal", dir: "ltr" }}
          />
          <Typography sx={{ color: diffColor, fontWeight: 700, fontSize: 14 }}>
            {t("ui_del.cash.difference")}: {Number.isFinite(diff) ? fmtMoney(diff, lang) : "—"}
            {Number.isFinite(diff) && diff !== 0 ? ` (${diff < 0 ? t("ui_del.cash.short") : t("ui_del.cash.over")})` : ""}
          </Typography>
          <TextField select size="small" label={t("ui_del.cash.deposit")} value={account} onChange={(e) => setAccount(e.target.value)} sx={S.field}>
            <MenuItem value="1110">{t("ui_del.cash.account_cash")}</MenuItem>
            <MenuItem value="1120">{t("ui_del.cash.account_bank")}</MenuItem>
          </TextField>
          <TextField size="small" label={t("ui_del.cash.note")} value={note} onChange={(e) => setNote(e.target.value)} sx={S.field} />
        </Box>
        {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button variant="outlined" sx={S.ghost} onClick={onClose} disabled={saving}>{t("ui_del.common.cancel")}</Button>
        <Button variant="contained" sx={S.btn} onClick={submit} disabled={saving}>
          {saving ? <CircularProgress size={18} color="inherit" /> : <>{t("ui_del.cash.settle")}<KbdHint>Ctrl+D</KbdHint></>}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default function CashTab({ ctx, refreshKey, bump }) {
  const { t, C, S, lang, notify } = ctx;
  const [rows, setRows] = useState([]);
  const [history, setHistory] = useState([]);
  const [error, setError] = useState("");
  const [settle, setSettle] = useState(null);

  const load = useCallback(() => {
    fetchCash().then((d) => { setRows(Array.isArray(d) ? d : []); setError(""); })
      .catch((e) => setError(errMsg(e, t("ui_del.common.load_failed"))));
    fetchSettlements().then((d) => setHistory(Array.isArray(d) ? d : [])).catch(() => {});
  }, [t]);

  useEffect(() => { load(); }, [load, refreshKey]);

  const cursor = useRowCursor(rows.length);
  useRegisteredShortcuts([
    ...cursorBindings(t, cursor),
    { combo: "Ctrl+D", label: t("ui_del.cash.settle"), handler: () => { const r = rows[cursor.index]; if (r && r.uncollected > 0) setSettle(r); } },
  ], { enabled: !settle });

  return (
    <Box sx={{ display: "grid", gap: 2 }}>
      {error && <Alert severity="error">{error}</Alert>}
      <Box sx={S.card}>
        <Typography sx={{ fontWeight: 800, color: C.text, mb: 1.5 }}>{t("ui_del.cash.title")}</Typography>
        <TableWrap C={C}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={S.th}>{t("ui_del.cash.driver")}</TableCell>
                <TableCell sx={S.thNum}>{t("ui_del.cash.uncollected")}</TableCell>
                <TableCell sx={S.th} />
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.length === 0 && <TableRow><TableCell sx={{ ...S.td, color: C.muted }} colSpan={3}>{t("ui_del.common.empty")}</TableCell></TableRow>}
              {rows.map((r, i) => (
                <TableRow key={r.driver_id} {...cursorProps(C, cursor.index === i)}>
                  <TableCell sx={S.td}>{r.driver_name}</TableCell>
                  <TableCell sx={S.tdNum}>{fmtMoney(r.uncollected, lang)}</TableCell>
                  <TableCell sx={S.td} align="end">
                    <Button size="small" sx={S.link} disabled={!(r.uncollected > 0)} onClick={() => setSettle(r)}>{t("ui_del.cash.settle")}</Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableWrap>
      </Box>

      <Box sx={S.card}>
        <Typography sx={{ fontWeight: 800, color: C.text, mb: 1.5 }}>{t("ui_del.cash.history")}</Typography>
        <TableWrap C={C}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={S.th}>{t("ui_del.cash.driver")}</TableCell>
                <TableCell sx={S.thNum}>{t("ui_del.cash.expected")}</TableCell>
                <TableCell sx={S.thNum}>{t("ui_del.cash.received")}</TableCell>
                <TableCell sx={S.thNum}>{t("ui_del.cash.difference")}</TableCell>
                <TableCell sx={S.th}>{t("ui_del.cash.date")}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {history.length === 0 && <TableRow><TableCell sx={{ ...S.td, color: C.muted }} colSpan={5}>{t("ui_del.common.empty")}</TableCell></TableRow>}
              {history.map((h) => (
                <TableRow key={h.id}>
                  <TableCell sx={S.td}>{h.driver_name}</TableCell>
                  <TableCell sx={S.tdNum}>{fmtMoney(h.expected_amount, lang)}</TableCell>
                  <TableCell sx={S.tdNum}>{fmtMoney(h.received_amount, lang)}</TableCell>
                  <TableCell sx={{ ...S.tdNum, color: h.difference === 0 ? C.success : C.danger }}>{fmtMoney(h.difference, lang)}</TableCell>
                  <TableCell sx={S.td}>{fmtDateTime(h.settled_at, lang)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableWrap>
      </Box>

      {settle && (
        <SettleDialog
          ctx={ctx} row={settle} onClose={() => setSettle(null)}
          onDone={() => { setSettle(null); notify(t("ui_del.cash.settled")); load(); bump(); }}
        />
      )}
    </Box>
  );
}
