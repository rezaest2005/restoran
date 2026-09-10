import { Dialog, DialogTitle, DialogContent, DialogActions, Button, Typography, IconButton } from "@mui/material";

export default function DeleteModal({ open, onClose, onConfirm, type, name, C }) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth slotProps={{ paper: { sx: { bgcolor: C.glass, border: `1px solid ${C.glassBorder}`, borderRadius: 3 } } }}>
      <DialogTitle sx={{ color: C.danger, fontWeight: 800 }}>
        {type === "tenant" ? "حذف رستوران" : "حذف کاربر"}
        <IconButton onClick={onClose} sx={{ position: "absolute", left: 8, top: 8, color: C.sub }}>×</IconButton>
      </DialogTitle>
      <DialogContent>
        <Typography sx={{ color: C.text }}>آیا از حذف «{name}» مطمئن هستید؟ این عمل قابل بازگشت نیست.</Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} sx={{ color: C.sub }}>انصراف</Button>
        <Button onClick={onConfirm} sx={{ bgcolor: C.danger, color: "#fff" }}>حذف شود</Button>
      </DialogActions>
    </Dialog>
  );
}