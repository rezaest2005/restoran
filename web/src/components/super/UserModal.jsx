import { useState, useEffect } from "react";
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField, Box, IconButton, FormControl, InputLabel, Select, MenuItem } from "@mui/material";
import superClient from "../../api/super_client";
import { ROLE_OPTIONS } from "../../theme/superConfig";

export default function UserModal({ open, editId, onClose, tenants, C }) {
  const [form, setForm] = useState({ username: "", password: "", first_name: "", last_name: "", phone_number: "", role: "", restaurant_id: "" });

  useEffect(() => {
    if (open && !editId) setForm({ username: "", password: "", first_name: "", last_name: "", phone_number: "", role: "", restaurant_id: "" });
  }, [open, editId]);

  const handleSave = async () => {
    try {
      if (editId) await superClient.put(`/api/super/users/${editId}/`, form);
      else await superClient.post("/api/super/users/create/", form);
      onClose();
    } catch {}
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm" slotProps={{ paper: { sx: { bgcolor: C.glass, border: `1px solid ${C.glassBorder}`, borderRadius: 3 } } }}>
      <DialogTitle sx={{ color: C.text, fontWeight: 800 }}>
        {editId ? "ویرایش کاربر" : "کاربر جدید"}
        <IconButton onClick={onClose} sx={{ position: "absolute", left: 8, top: 8, color: C.sub }}>×</IconButton>
      </DialogTitle>
      <DialogContent>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 1 }}>
          <TextField label="نام کاربری" value={form.username} onChange={e => setForm({...form, username: e.target.value})} sx={{ "& .MuiOutlinedInput-root": { bgcolor: C.inputBg } }} />
          <TextField label="رمز عبور" type="password" value={form.password} onChange={e => setForm({...form, password: e.target.value})} sx={{ "& .MuiOutlinedInput-root": { bgcolor: C.inputBg } }} />
          <Box sx={{ display: "flex", gap: 2 }}>
            <TextField label="نام" value={form.first_name} onChange={e => setForm({...form, first_name: e.target.value})} sx={{ flex: 1, "& .MuiOutlinedInput-root": { bgcolor: C.inputBg } }} />
            <TextField label="نام خانوادگی" value={form.last_name} onChange={e => setForm({...form, last_name: e.target.value})} sx={{ flex: 1, "& .MuiOutlinedInput-root": { bgcolor: C.inputBg } }} />
          </Box>
          <FormControl fullWidth sx={{ "& .MuiOutlinedInput-root": { bgcolor: C.inputBg } }}>
            <InputLabel>نقش</InputLabel>
            <Select value={form.role} onChange={e => setForm({...form, role: e.target.value})} label="نقش">
              {ROLE_OPTIONS.map(r => <MenuItem key={r.value} value={r.value}>{r.value}</MenuItem>)}
            </Select>
          </FormControl>
          <FormControl fullWidth sx={{ "& .MuiOutlinedInput-root": { bgcolor: C.inputBg } }}>
            <InputLabel>رستوران</InputLabel>
            <Select value={form.restaurant_id} onChange={e => setForm({...form, restaurant_id: e.target.value})} label="رستوران">
              {tenants?.map(t => <MenuItem key={t.id} value={t.id}>{t.name}</MenuItem>)}
            </Select>
          </FormControl>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} sx={{ color: C.sub }}>انصراف</Button>
        <Button onClick={handleSave} sx={{ bgcolor: C.btnGrad, color: "#fff" }}>ذخیره</Button>
      </DialogActions>
    </Dialog>
  );
}