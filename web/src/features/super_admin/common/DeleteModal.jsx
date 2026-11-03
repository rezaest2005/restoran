import { useTranslation } from "react-i18next";
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, Typography, IconButton } from "@mui/material";
import { useRegisteredShortcuts, dialogBindings } from "@shared/common/shortcutKit";

export default function DeleteModal({ open, onClose, onConfirm, type, name, C }) {
  const { t } = useTranslation();
  useRegisteredShortcuts(dialogBindings(t, { onConfirm: () => onConfirm?.(), onClose }), { enabled: open });
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth slotProps={{ paper: { sx: { bgcolor: C.glass, border: `1px solid ${C.glassBorder}`, borderRadius: 3 } } }}>
      <DialogTitle sx={{ color: C.danger, fontWeight: 800 }}>
        {type === "tenant" ? t("ui_c.super.delete.tenant_title") : t("ui_c.super.delete.user_title")}
        <IconButton onClick={onClose} sx={{ position: "absolute", left: 8, top: 8, color: C.sub }}>×</IconButton>
      </DialogTitle>
      <DialogContent>
        <Typography sx={{ color: C.text }}>{t("ui_c.super.delete.confirm", { name })}</Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} sx={{ color: C.sub }}>{t("ui_c.super.cancel")}</Button>
        <Button onClick={onConfirm} sx={{ bgcolor: C.danger, color: "#fff" }}>{t("ui_c.super.delete.confirm_btn")}</Button>
      </DialogActions>
    </Dialog>
  );
}