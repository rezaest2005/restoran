import { useState, useEffect } from "react";
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, Typography, Box, Checkbox, IconButton } from "@mui/material";
import superClient from "@super/api/super_client";
import { ALL_PERM_CODES, PERM_LABELS } from "@super/shared/superConfig";

export default function PermsModal({ open, onClose, userId, C }) {
  const [username, setUsername] = useState("");
  const [perms, setPerms] = useState([]);

  useEffect(() => {
    if (open && userId) {
      superClient.get(`/api/super/users/${userId}/`).then(res => {
        setUsername(res.data.username);
        setPerms(res.data.effective_permissions || res.data.dashboard_permissions || []);
      });
    }
  }, [open, userId]);

  const togglePerm = (code) => setPerms(prev => prev.includes(code) ? prev.filter(p => p !== code) : [...prev, code]);
  const savePerms = async () => {
    await superClient.put(`/api/super/users/${userId}/permissions/`, { dashboard_permissions: perms });
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth slotProps={{ paper: { sx: { bgcolor: C.glass, border: `1px solid ${C.glassBorder}`, borderRadius: 3 } } }}>
      <DialogTitle sx={{ color: C.text, fontWeight: 800 }}>
        دسترسی‌ها — {username}
        <IconButton onClick={onClose} sx={{ position: "absolute", left: 8, top: 8, color: C.sub }}>×</IconButton>
      </DialogTitle>
      <DialogContent>
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr", sm: "repeat(3, 1fr)" }, gap: 1, mt: 1 }}>
          {ALL_PERM_CODES.map(code => (
            <Box key={code} onClick={() => togglePerm(code)} sx={{ display: "flex", alignItems: "center", gap: 1, p: 1, borderRadius: 1, cursor: "pointer", bgcolor: perms.includes(code) ? C.oliveSubtle : "transparent", border: `1px solid ${perms.includes(code) ? C.olive : C.glassBorder}` }}>
              <Checkbox checked={perms.includes(code)} sx={{ color: C.muted, "&.Mui-checked": { color: C.olive }, p: 0 }} />
              <Typography sx={{ fontSize: 12, color: perms.includes(code) ? C.olive : C.sub }}>{PERM_LABELS[code]}</Typography>
            </Box>
          ))}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} sx={{ color: C.sub }}>انصراف</Button>
        <Button onClick={savePerms} sx={{ bgcolor: C.btnGrad, color: "#fff" }}>ذخیره دسترسی‌ها</Button>
      </DialogActions>
    </Dialog>
  );
}