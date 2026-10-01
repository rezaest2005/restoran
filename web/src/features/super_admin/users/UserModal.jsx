import { useState, useEffect } from "react";
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, TextField, Box, IconButton,
  FormControl, InputLabel, Select, MenuItem, Typography, Chip,
} from "@mui/material";
import superClient from "@super/api/super_client";
import { ROLE_OPTIONS, ROLE_PERM_PRESETS } from "@super/shared/superConfig";

export default function UserModal({ open, editId, onClose, tenants, C }) {
  const [form, setForm] = useState({
    username: "",
    password: "",
    first_name: "",
    last_name: "",
    phone_number: "",
    role: "",
    customRole: "",
    restaurant_id: "",
    dashboard_permissions: [],
  });

  useEffect(() => {
    if (open && !editId) {
      setForm({
        username: "",
        password: "",
        first_name: "",
        last_name: "",
        phone_number: "",
        role: "",
        customRole: "",
        restaurant_id: "",
        dashboard_permissions: [],
      });
    }
    if (open && editId) {
      superClient.get(`/api/super/users/${editId}/`).then((res) => {
        const d = res.data;
        const isPreset = Object.keys(ROLE_PERM_PRESETS).includes(d.role);
        setForm({
          username: d.username || "",
          password: "",
          first_name: d.first_name || "",
          last_name: d.last_name || "",
          phone_number: d.phone_number || "",
          role: isPreset ? d.role : "other",
          customRole: isPreset ? "" : (d.role_display || d.role || ""),
          restaurant_id: d.restaurant_id || "",
          dashboard_permissions: d.effective_permissions || d.dashboard_permissions || [],
        });
      });
    }
  }, [open, editId]);

  const handleRoleChange = (role) => {
    const preset = ROLE_PERM_PRESETS[role];
    setForm((f) => ({
      ...f,
      role,
      customRole: role === "other" ? f.customRole : "",
      dashboard_permissions: preset ? [...preset.perms] : [],
    }));
  };

  const handleSave = async () => {
    try {
      const finalRole =
        form.role === "other"
          ? (form.customRole.trim().toLowerCase() || "other")
          : form.role;

      const payload = {
        username: form.username,
        password: form.password,
        first_name: form.first_name,
        last_name: form.last_name,
        phone_number: form.phone_number,
        role: finalRole,
        restaurant_id: form.restaurant_id,
        dashboard_permissions: form.dashboard_permissions,
      };

      if (editId) await superClient.put(`/api/super/users/${editId}/`, payload);
      else await superClient.post("/api/super/users/create/", payload);

      onClose();
    } catch (err) {
      console.error("Save user error:", err);
    }
  };

  const activePermsCount = form.dashboard_permissions.length;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="sm"
      slotProps={{
        paper: {
          sx: {
            bgcolor: C.glass,
            border: `1px solid ${C.glassBorder}`,
            borderRadius: "16px",
          },
        },
      }}
    >
      <DialogTitle
        sx={{
          color: C.text,
          fontWeight: 800,
          fontSize: 15,
          borderBottom: `1px solid ${C.glassBorder}`,
        }}
      >
        {editId ? "✏️ ویرایش کاربر" : "➕ کاربر جدید"}
        <IconButton
          onClick={onClose}
          sx={{ position: "absolute", left: 8, top: 8, color: C.sub }}
        >
          ×
        </IconButton>
      </DialogTitle>

      <DialogContent>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 1.5 }}>

          {/* ── اطلاعات پایه ── */}
          <TextField
            size="small"
            label="نام کاربری"
            value={form.username}
            onChange={(e) => setForm({ ...form, username: e.target.value })}
            sx={{ "& .MuiOutlinedInput-root": { bgcolor: C.inputBg, borderRadius: "10px" } }}
          />
          <TextField
            size="small"
            label="رمز عبور"
            type="password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            sx={{ "& .MuiOutlinedInput-root": { bgcolor: C.inputBg, borderRadius: "10px" } }}
          />
          <Box sx={{ display: "flex", gap: 2 }}>
            <TextField
              size="small"
              label="نام"
              value={form.first_name}
              onChange={(e) => setForm({ ...form, first_name: e.target.value })}
              sx={{
                flex: 1,
                "& .MuiOutlinedInput-root": { bgcolor: C.inputBg, borderRadius: "10px" },
              }}
            />
            <TextField
              size="small"
              label="نام خانوادگی"
              value={form.last_name}
              onChange={(e) => setForm({ ...form, last_name: e.target.value })}
              sx={{
                flex: 1,
                "& .MuiOutlinedInput-root": { bgcolor: C.inputBg, borderRadius: "10px" },
              }}
            />
          </Box>
          <TextField
            size="small"
            label="شماره تلفن"
            value={form.phone_number}
            onChange={(e) => setForm({ ...form, phone_number: e.target.value })}
            sx={{ "& .MuiOutlinedInput-root": { bgcolor: C.inputBg, borderRadius: "10px" } }}
          />

          {/* ── نقش ── */}
          <Box>
            <Typography sx={{ fontSize: 11, fontWeight: 700, color: C.sub, mb: 0.5 }}>
              🎭 نقش / شغل
            </Typography>
            <Select
              size="small"
              fullWidth
              value={form.role}
              onChange={(e) => handleRoleChange(e.target.value)}
              sx={{ bgcolor: C.inputBg, borderRadius: "10px", fontSize: 13 }}
            >
              {ROLE_OPTIONS.map((r) => (
                <MenuItem key={r.value} value={r.value}>
                  <Box>
                    <Typography sx={{ fontSize: 13, fontWeight: 600 }}>
                      {ROLE_PERM_PRESETS[r.value]?.label || r.labelKey || r.value}
                    </Typography>
                    <Typography sx={{ fontSize: 10, color: C.muted }}>
                      {ROLE_PERM_PRESETS[r.value]?.description || ""}
                    </Typography>
                  </Box>
                </MenuItem>
              ))}
            </Select>
          </Box>

          {/* ── نام شغل سفارشی ── */}
          {form.role === "other" && (
            <TextField
              size="small"
              label="نام شغل سفارشی"
              placeholder="مثلاً: منشی، حسابدار، نظافتچی..."
              value={form.customRole}
              onChange={(e) => setForm({ ...form, customRole: e.target.value })}
              sx={{ "& .MuiOutlinedInput-root": { bgcolor: C.inputBg, borderRadius: "10px" } }}
            />
          )}

          {/* ── دسترسی‌های خودکار ── */}
          {form.role && form.role !== "other" && ROLE_PERM_PRESETS[form.role] && (
            <Box
              sx={{
                p: 1.5,
                borderRadius: "10px",
                border: `1px solid ${C.glassBorder}`,
                bgcolor: C.oliveSubtle,
              }}
            >
              <Typography sx={{ fontSize: 11, fontWeight: 700, color: C.text, mb: 0.8 }}>
                🔐 دسترسی‌های خودکار ({activePermsCount} مورد)
              </Typography>
              <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
                {form.dashboard_permissions.slice(0, 12).map((code) => (
                  <Chip
                    key={code}
                    size="small"
                    label={code}
                    sx={{
                      height: 18, fontSize: 9, fontWeight: 600,
                      bgcolor: C.olive + "15", color: C.olive, borderRadius: "5px",
                    }}
                  />
                ))}
                {activePermsCount > 12 && (
                  <Chip
                    size="small"
                    label={`+${activePermsCount - 12}`}
                    sx={{
                      height: 18, fontSize: 9, fontWeight: 700,
                      bgcolor: C.olive + "25", color: C.olive, borderRadius: "5px",
                    }}
                  />
                )}
              </Box>
              <Typography sx={{ fontSize: 10, color: C.muted, mt: 0.5 }}>
                💡 برای تغییر تک‌تک دسترسی‌ها، بعد از ایجاد از دکمه "دسترسی‌ها" استفاده کنید
              </Typography>
            </Box>
          )}

          {/* ── رستوران ── */}
          <FormControl fullWidth size="small">
            <InputLabel sx={{ fontSize: 12 }}>رستوران</InputLabel>
            <Select
              value={form.restaurant_id}
              onChange={(e) => setForm({ ...form, restaurant_id: e.target.value })}
              label="رستوران"
              sx={{ bgcolor: C.inputBg, borderRadius: "10px", fontSize: 13 }}
            >
              {tenants?.map((t) => (
                <MenuItem key={t.id} value={t.id}>
                  {t.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

        </Box>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2, pt: 1 }}>
        <Button
          onClick={onClose}
          sx={{
            color: C.sub,
            textTransform: "none",
            borderRadius: "10px",
            fontSize: 12,
          }}
        >
          انصراف
        </Button>
        <Button
          onClick={handleSave}
          disabled={form.role === "other" && !form.customRole.trim()}
          sx={{
            bgcolor: C.btnGrad,
            color: "#fff",
            textTransform: "none",
            fontWeight: 700,
            borderRadius: "10px",
            px: 3,
            fontSize: 12,
          }}
        >
          ذخیره
        </Button>
      </DialogActions>
    </Dialog>
  );
}