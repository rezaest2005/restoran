import { useState } from "react";
import {
  Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Stack, TextField, Typography,
} from "@mui/material";
import { useRegisteredShortcuts, dialogBindings } from "@shared/common/shortcutKit";
import KbdHint from "@business/pos/common/KbdHint";
import { fmtDate } from "../accounting/common";
import { updateFeedback, errMsg } from "./api";

const STATUSES = ["open", "in_progress", "resolved"];

/** Feedback detail: change status and keep an internal note. Ctrl+D saves, Escape closes. */
export default function FeedbackDialog({ ctx, item, onClose, onSaved }) {
  const { t, C, S, lang, fullScreen } = ctx;
  const [status, setStatus] = useState(item.status);
  const [note, setNote] = useState(item.admin_note || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const saved = await updateFeedback(item.id, { status, admin_note: note });
      onSaved(saved);
    } catch (e) {
      setError(errMsg(e, t("ui_fb.mgr.err_generic")));
    } finally {
      setBusy(false);
    }
  };

  useRegisteredShortcuts(
    dialogBindings(t, { onConfirm: save, onClose: () => !busy && onClose(), confirmLabel: t("ui_fb.mgr.save"), enter: false }),
    { enabled: true },
  );

  const label = { color: C.muted, fontSize: 12 };
  return (
    <Dialog open onClose={busy ? undefined : onClose} fullScreen={fullScreen} maxWidth="sm" fullWidth
      slotProps={{ paper: { sx: S.dialogPaper } }}>
      <DialogTitle sx={{ fontWeight: 700 }}>{t("ui_fb.mgr.detail")}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr", sm: "repeat(4, 1fr)" }, gap: 1.5 }}>
            <Box><Typography sx={label}>{t("ui_fb.mgr.date")}</Typography>
              <Typography sx={{ color: C.text }}>{fmtDate(item.created_at, lang)}</Typography></Box>
            <Box><Typography sx={label}>{t("ui_fb.mgr.filter_category")}</Typography>
              <Typography sx={{ color: C.text }}>{t(`ui_fb.cat.${item.category}`)}</Typography></Box>
            <Box><Typography sx={label}>{t("ui_fb.mgr.from")}</Typography>
              <Typography sx={{ color: C.text }}>{item.name || t("ui_fb.mgr.anonymous")}</Typography></Box>
            <Box><Typography sx={label}>{t("ui_fb.mgr.phone")}</Typography>
              <Typography dir="ltr" sx={{ color: C.text, textAlign: "start" }}>{item.phone || "—"}</Typography></Box>
          </Box>
          <Box sx={{ ...S.card, p: 1.5 }}>
            <Typography sx={label}>{t("ui_fb.mgr.message")}</Typography>
            <Typography sx={{ color: C.text, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{item.message}</Typography>
          </Box>
          <TextField select size="small" label={t("ui_fb.mgr.filter_status")} value={status} sx={S.field}
            onChange={(e) => setStatus(e.target.value)}>
            {STATUSES.map((s) => <MenuItem key={s} value={s}>{t(`ui_fb.status.${s}`)}</MenuItem>)}
          </TextField>
          <TextField multiline minRows={3} maxRows={8} label={t("ui_fb.mgr.note")} value={note} sx={S.field}
            onChange={(e) => setNote(e.target.value)} slotProps={{ htmlInput: { maxLength: 2000 } }} />
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button variant="outlined" sx={S.ghost} onClick={onClose}>{t("ui_fb.mgr.close")} <KbdHint>Esc</KbdHint></Button>
        <Button sx={S.btn} onClick={save} disabled={busy}>{t("ui_fb.mgr.save")}<KbdHint>Ctrl+D</KbdHint></Button>
      </DialogActions>
    </Dialog>
  );
}
