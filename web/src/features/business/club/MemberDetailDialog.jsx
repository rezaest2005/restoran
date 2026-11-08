import { useCallback, useEffect, useState } from "react";
import {
  Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Stack,
  Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography,
} from "@mui/material";
import { useRegisteredShortcuts, dialogBindings } from "@shared/common/shortcutKit";
import KbdHint from "@business/pos/common/KbdHint";
import { TableWrap, fmtInt, fmtDate } from "../accounting/common";
import { fetchMember, adjustMember, errMsg } from "./api";
import TierBadge from "./TierBadge";

/** Member detail: balance, transaction history and a manual +/- adjustment. */
export default function MemberDetailDialog({ ctx, id, onClose, onChanged }) {
  const { t, C, S, lang, fullScreen } = ctx;
  const [m, setM] = useState(null);
  const [points, setPoints] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");

  const load = useCallback(() => {
    fetchMember(id).then(setM).catch((e) => setLoadError(errMsg(e, t("ui_club.err.generic"))));
  }, [id, t]);
  useEffect(() => { load(); }, [load]);

  const adjust = async () => {
    if (busy) return;
    const delta = parseInt(String(points).replace(/[+\s]/g, ""), 10);
    if (!Number.isFinite(delta) || delta === 0) { setError(t("ui_club.err.points_invalid")); return; }
    setBusy(true);
    setError("");
    try {
      await adjustMember(id, delta, note.trim());
      setPoints("");
      setNote("");
      load();
      onChanged();
    } catch (e) {
      setError(errMsg(e, t("ui_club.err.generic")));
    } finally {
      setBusy(false);
    }
  };

  // Ctrl+D / Enter apply the adjustment (Enter is ignored inside buttons), Escape closes
  useRegisteredShortcuts(
    dialogBindings(t, { onConfirm: adjust, onClose: () => !busy && onClose(), confirmLabel: t("ui_club.adjust.apply") }),
    { enabled: true },
  );

  return (
    <Dialog open onClose={onClose} fullScreen={fullScreen} maxWidth="sm" fullWidth slotProps={{ paper: { sx: S.dialogPaper } }}>
      <DialogTitle sx={{ fontWeight: 700 }}>{t("ui_club.member.detail")}</DialogTitle>
      <DialogContent>
        {loadError && <Alert severity="error">{loadError}</Alert>}
        {!m && !loadError && <Box sx={{ textAlign: "center", py: 3 }}><CircularProgress size={26} /></Box>}
        {m && (
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap", alignItems: "center" }}>
              <Typography sx={{ fontWeight: 800, color: C.text }}>{m.name || "—"}</Typography>
              <Typography dir="ltr" sx={{ color: C.sub }}>{m.phone}</Typography>
              <TierBadge tier={m.tier} C={C} />
            </Box>
            <Box sx={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
              <Box>
                <Typography sx={{ color: C.muted, fontSize: 12 }}>{t("ui_club.member.points")}</Typography>
                <Typography sx={{ color: C.text, fontWeight: 800, fontSize: 22 }}>{fmtInt(m.points_balance, lang)}</Typography>
              </Box>
              <Box>
                <Typography sx={{ color: C.muted, fontSize: 12 }}>{t("ui_club.member.lifetime")}</Typography>
                <Typography sx={{ color: C.text, fontWeight: 700, fontSize: 22 }}>{fmtInt(m.lifetime_points, lang)}</Typography>
              </Box>
            </Box>

            <Box sx={{ ...S.card, p: 1.5 }}>
              <Typography sx={{ color: C.text, fontWeight: 700, mb: 1 }}>{t("ui_club.adjust.title")}</Typography>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
                <TextField size="small" label={t("ui_club.adjust.points")} value={points} sx={{ ...S.field, width: { sm: 160 } }}
                  helperText={t("ui_club.adjust.hint")} onChange={(e) => setPoints(e.target.value)}
                  slotProps={{ htmlInput: { dir: "ltr", inputMode: "numeric" } }} />
                <TextField size="small" label={t("ui_club.adjust.note")} value={note} sx={{ ...S.field, flex: 1 }}
                  onChange={(e) => setNote(e.target.value)} />
              </Stack>
              {error && <Alert severity="error" sx={{ mt: 1 }}>{error}</Alert>}
              <Button sx={{ ...S.btn, mt: 1.5 }} onClick={adjust} disabled={busy}>
                {t("ui_club.adjust.apply")}<KbdHint>Ctrl+D</KbdHint>
              </Button>
            </Box>

            <Typography sx={{ color: C.text, fontWeight: 700 }}>{t("ui_club.history.title")}</Typography>
            {m.transactions.length === 0 ? (
              <Typography sx={{ color: C.muted }}>{t("ui_club.history.empty")}</Typography>
            ) : (
              <TableWrap C={C}>
                <Table size="small" sx={{ minWidth: 420 }}>
                  <TableHead>
                    <TableRow>
                      <TableCell sx={S.th}>{t("ui_club.history.date")}</TableCell>
                      <TableCell sx={S.th}>{t("ui_club.history.kind")}</TableCell>
                      <TableCell sx={S.thNum}>{t("ui_club.history.points")}</TableCell>
                      <TableCell sx={S.th}>{t("ui_club.history.note")}</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {m.transactions.map((x) => (
                      <TableRow key={x.id}>
                        <TableCell sx={S.td}>{fmtDate(x.created_at, lang)}</TableCell>
                        <TableCell sx={S.td}>{x.kind_display || x.kind}</TableCell>
                        <TableCell sx={{ ...S.tdNum, color: x.points < 0 ? C.danger : C.success, fontWeight: 700 }} dir="ltr">
                          {x.points > 0 ? "+" : ""}{fmtInt(x.points, lang)}
                        </TableCell>
                        <TableCell sx={S.td}>{x.note || "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableWrap>
            )}
          </Stack>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button variant="outlined" sx={S.ghost} onClick={onClose}>{t("ui_club.close")}</Button>
      </DialogActions>
    </Dialog>
  );
}
