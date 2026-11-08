import {
  Dialog, DialogTitle, DialogContent, DialogActions, Typography, Button, Alert, CircularProgress,
} from "@mui/material";
import useShortcuts from "@shared/common/useShortcuts";
import KbdHint from "@business/pos/common/KbdHint";
import { blurFocused } from "@business/pos/common/focus";

/** Confirm dialog: Enter / Ctrl+D confirm, Escape cancels (MUI). */
export default function ConfirmDialog({ ctx, open, title, text, confirmLabel, danger, busy, error, onClose, onConfirm }) {
  const { t, C, S, fullScreen } = ctx;

  useShortcuts([
    { combo: "Enter", label: t("shortcuts.confirm"), scope: "dialog",
      handler: (e) => (e?.target?.tagName === "BUTTON" || busy ? false : onConfirm()) },
    { combo: "Ctrl+D", label: t("shortcuts.confirm"), scope: "dialog", handler: () => { if (!busy) onConfirm(); } },
  ], { enabled: open });

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} fullScreen={fullScreen} maxWidth="xs" fullWidth slotProps={{ paper: { sx: S.dialogPaper }, transition: { onExit: blurFocused } }}>
      <DialogTitle sx={{ fontWeight: 700 }}>{title}</DialogTitle>
      <DialogContent>
        <Typography sx={{ color: C.sub, fontSize: 14 }}>{text}</Typography>
        {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button variant="outlined" sx={S.ghost} autoFocus={!!danger} onClick={onClose} disabled={busy}>{t("ui_e.common.cancel")}</Button>
        <Button
          variant="contained" disabled={busy} onClick={onConfirm}
          sx={danger ? { bgcolor: C.text, color: C.bg, textTransform: "none", fontWeight: 700, minHeight: 40, "&:hover": { bgcolor: C.text, opacity: 0.85 } } : S.btn}
        >
          {busy ? <CircularProgress size={18} color="inherit" /> : <>{confirmLabel}{!danger && <KbdHint>Ctrl+D</KbdHint>}</>}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
