import {
  Dialog, DialogTitle, DialogContent, DialogActions, Typography, Button, Alert, CircularProgress,
} from "@mui/material";
import { useRegisteredShortcuts, dialogBindings } from "@shared/common/shortcutKit";
import KbdHint from "@business/pos/common/KbdHint";

/** Confirm dialog: Enter / Ctrl+D confirm, Escape cancels. `children` = extra content (e.g. a reason field). */
export default function ConfirmDialog({
  ctx, open, title, text, confirmLabel, danger, busy, error, onClose, onConfirm, children,
}) {
  const { t, C, S, fullScreen } = ctx;

  useRegisteredShortcuts(
    dialogBindings(t, {
      confirmLabel: t("shortcuts.confirm"),
      onConfirm: () => { if (!busy) onConfirm(); },
      onClose: () => { if (!busy) onClose(); },
    }),
    { enabled: open },
  );

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} fullScreen={fullScreen} maxWidth="xs" fullWidth slotProps={{ paper: { sx: S.dialogPaper } }}>
      <DialogTitle sx={{ fontWeight: 700 }}>{title}</DialogTitle>
      <DialogContent>
        <Typography sx={{ color: C.sub, fontSize: 14, mb: children ? 2 : 0 }}>{text}</Typography>
        {children}
        {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button variant="outlined" sx={S.ghost} autoFocus={!!danger} onClick={onClose} disabled={busy}>{t("ui_i.common.cancel")}</Button>
        <Button
          variant="contained" disabled={busy} onClick={onConfirm}
          sx={danger
            ? { bgcolor: C.text, color: C.bg, textTransform: "none", fontWeight: 700, minHeight: 40, "&:hover": { bgcolor: C.text, opacity: 0.85 } }
            : S.btn}
        >
          {busy ? <CircularProgress size={18} color="inherit" /> : <>{confirmLabel}{!danger && <KbdHint>Ctrl+D</KbdHint>}</>}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
