import { useState, useEffect, useMemo } from "react";
import {
  Box, Typography, Button, TextField, Chip, IconButton,
  CircularProgress, Tooltip, Dialog, DialogTitle, DialogContent,
  DialogActions, Switch, Select, MenuItem, FormControlLabel,
} from "@mui/material";
import {
  getUsers, createUser, updateUserRole, toggleUserActive,
  resetUserPassword, deleteUser, updateUserTabs,
} from "../../api/client";
import { POS_TABS } from "../../config/posTabs";

const ROLE_OPTIONS = [
  { value: "owner", label: "مالک" },
  { value: "manager", label: "مدیر" },
  { value: "cashier", label: "صندوق‌دار" },
  { value: "kitchen", label: "آشپزخانه" },
  { value: "warehouse", label: "انباردار" },
  { value: "customer", label: "مشتری" },
];

export default function ManagersSection({ C, isRtl, isDark, showToast }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editUser, setEditUser] = useState(null);
  const [resetOpen, setResetOpen] = useState(null);
  const [newPassword, setNewPassword] = useState("");
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    username: "",
    password: "",
    phone_number: "",
    first_name: "",
    last_name: "",
    role: "cashier",
    tabs: Object.fromEntries(Object.keys(POS_TABS).map(k => [k, true])),
  });

  const notify = (msg, type = "info") => {
    if (typeof showToast === "function") showToast(msg, type);
    else console.warn("showToast missing:", msg, type);
  };

  // ★ تبدیل dashboard_permissions → tabs object
  const permsToTabs = (perms) => {
    const p = perms || [];
    return Object.fromEntries(Object.keys(POS_TABS).map(k => [k, p.includes(k)]));
  };

  const load = async () => {
    setLoading(true);
    try {
      const res = await getUsers();
      setUsers(res.data.users || []);
    } catch (err) {
      console.error("Fetch users error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return users;
    const q = search.toLowerCase();
    return users.filter(u =>
      u.username?.toLowerCase().includes(q) ||
      u.first_name?.toLowerCase().includes(q) ||
      u.last_name?.toLowerCase().includes(q) ||
      u.phone_number?.includes(q)
    );
  }, [users, search]);

  // ── ایجاد ──
  const openCreate = () => {
    setEditUser(null);
    setForm({
      username: "",
      password: "",
      phone_number: "",
      first_name: "",
      last_name: "",
      role: "cashier",
      tabs: Object.fromEntries(Object.keys(POS_TABS).map(k => [k, true])),
    });
    setFormOpen(true);
  };

  // ── ویرایش ──
  const openEdit = (u) => {
    setEditUser(u);
    setForm({
      username: u.username,
      password: "",
      phone_number: u.phone_number || "",
      first_name: u.first_name || "",
      last_name: u.last_name || "",
      role: u.role || "cashier",
      tabs: permsToTabs(u.dashboard_permissions),
    });
    setFormOpen(true);
  };

  // ── ذخیره ──
  const handleSave = async () => {
    if (saving) return;
    setSaving(true);

    try {
      if (editUser) {
        if (form.role !== editUser.role) {
          await updateUserRole({ user_id: editUser.id, role: form.role });
        }
        await updateUserTabs({ user_id: editUser.id, tabs: form.tabs });
        notify(`کاربر «${editUser.username}» بروزرسانی شد`, "success");
      } else {
        const payload = {
          username: form.username.trim(),
          password: form.password,
          phone_number: form.phone_number.trim(),
          first_name: form.first_name.trim(),
          last_name: form.last_name.trim(),
          role: form.role,
        };

        const res = await createUser(payload);

        const newUserId = res.data?.user_id;
        if (newUserId) {
          await updateUserTabs({ user_id: newUserId, tabs: form.tabs });
        }

        notify(res.data?.msg || `کاربر «${form.username}» ایجاد شد`, "success");
      }
      setFormOpen(false);
      setEditUser(null);
      load();
    } catch (err) {
      // ★ لاگ کامل خطا
      console.error("Save error full:", err.response?.data || err);
      const msg = err.response?.data?.error
        || err.response?.data?.detail
        || err.message
        || "خطای ناشناخته";
      notify(msg, "error");
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (u) => {
    try {
      await toggleUserActive({ user_id: u.id });
      notify(`کاربر «${u.username}» ${!u.is_active ? "فعال" : "غیرفعال"} شد`, "success");
      load();
    } catch (err) {
      console.error("Toggle error:", err.response?.data || err);
      notify(err.response?.data?.error || err.message || "خطا", "error");
    }
  };

  const handleDelete = async (u) => {
    if (!window.confirm(`کاربر «${u.username}» حذف شود؟`)) return;
    try {
      await deleteUser({ user_id: u.id });
      notify(`کاربر «${u.username}» حذف شد`, "success");
      load();
    } catch (err) {
      console.error("Delete error:", err.response?.data || err);
      notify(err.response?.data?.error || err.message || "خطا", "error");
    }
  };

  const handleResetPassword = async () => {
    if (!newPassword || newPassword.length < 4) {
      notify("رمز باید حداقل ۴ کاراکتر باشد", "warning");
      return;
    }
    try {
      await resetUserPassword({ user_id: resetOpen.id, new_password: newPassword });
      notify(`رمز «${resetOpen.username}» تغییر کرد`, "success");
      setResetOpen(null);
      setNewPassword("");
    } catch (err) {
      console.error("Reset error:", err.response?.data || err);
      notify(err.response?.data?.error || err.message || "خطا", "error");
    }
  };

  const setTab = (key) => {
    setForm(f => ({ ...f, tabs: { ...f.tabs, [key]: !f.tabs[key] } }));
  };

  const inputSx = {
    "& .MuiOutlinedInput-root": {
      borderRadius: "12px", bgcolor: C.inputBg, backdropFilter: "blur(8px)",
      fontSize: 13, fontFamily: "'Vazirmatn', 'Plus Jakarta Sans', sans-serif",
      color: C.text, transition: "all 0.25s ease",
      "& fieldset": { borderColor: C.glassBorder },
      "&:hover fieldset": { borderColor: C.olive + "60" },
      "&.Mui-focused fieldset": { borderColor: C.olive, borderWidth: 1.5 },
      "&.Mui-focused": { boxShadow: `0 0 0 3px ${C.olive}18` },
    },
    "& .MuiInputLabel-root": { fontSize: 12, color: C.sub },
    "& .MuiInputBase-input": { color: C.text },
    "& .MuiInputBase-input::placeholder": { color: C.muted, opacity: 1 },
  };

  const dialogPaperSx = {
    borderRadius: "16px",
    bgcolor: isDark ? "#1A1A2E" : "#fff",
    border: `1px solid ${C.glassBorder}`,
  };

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
        <CircularProgress sx={{ color: C.olive }} size={36} />
      </Box>
    );
  }

  return (
    <Box>
      {/* هدر */}
      <Box sx={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        mb: 2.5, flexWrap: "wrap", gap: 1.5,
      }}>
        <Box>
          <Typography sx={{ fontSize: { xs: 16, sm: 18 }, fontWeight: 800, color: C.text }}>
            👥 مدیریت کاربران
          </Typography>
          <Typography sx={{ fontSize: 12, color: C.sub, mt: 0.3 }}>
            افزودن، ویرایش و تعیین دسترسی تب‌های صندوق
          </Typography>
        </Box>
        <Button
          onClick={openCreate}
          sx={{
            borderRadius: "12px", fontSize: 12, fontWeight: 700,
            textTransform: "none", px: 2.5, py: 1, color: "#fff",
            background: C.btnGrad,
            boxShadow: `0 4px 20px ${C.olive}30`,
            "&:hover": { transform: "translateY(-1px)", boxShadow: `0 6px 28px ${C.olive}40` },
          }}
        >
          ➕ کاربر جدید
        </Button>
      </Box>

      {/* جستجو */}
      <TextField
        size="small" placeholder="جستجو کاربر..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        sx={{ ...inputSx, width: "100%", maxWidth: 300, mb: 2 }}
      />

      {/* لیست کاربران */}
      {filtered.length === 0 ? (
        <Box sx={{ textAlign: "center", py: 6 }}>
          <Typography sx={{ fontSize: 36, mb: 1 }}>👥</Typography>
          <Typography sx={{ fontSize: 14, fontWeight: 700, color: C.text }}>
            هنوز کاربری ثبت نشده
          </Typography>
        </Box>
      ) : (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 0.8 }}>
          {filtered.map((u, i) => {
            const perms = u.dashboard_permissions || [];
            return (
              <Box key={u.id} sx={{
                display: "flex", alignItems: "center", flexWrap: "wrap", gap: 1,
                px: { xs: 1.5, sm: 2 }, py: { xs: 1, sm: 1.5 },
                borderRadius: "12px",
                bgcolor: C.glass, backdropFilter: "blur(12px)",
                border: `1px solid ${u.is_active ? C.glassBorder : C.danger + "30"}`,
                transition: "all 0.2s ease",
                opacity: 0, animation: `fadeUp 0.35s ease-out ${i * 0.04}s forwards`,
                "&:hover": { bgcolor: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.02)" },
              }}>
                <Box sx={{ flex: 1, minWidth: 140 }}>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
                    <Typography sx={{ fontSize: 13, fontWeight: 700, color: C.text }}>
                      {u.username}
                    </Typography>
                    <Typography sx={{ fontSize: 11, color: C.sub }}>
                      {u.first_name} {u.last_name}
                    </Typography>
                    <Chip size="small" label={u.role_display || u.role}
                      sx={{ height: 18, fontSize: 9, fontWeight: 600, borderRadius: "5px", bgcolor: C.oliveSubtle, color: C.olive }} />
                    {!u.is_active && (
                      <Chip size="small" label="غیرفعال"
                        sx={{ height: 18, fontSize: 9, fontWeight: 600, borderRadius: "5px", bgcolor: C.dangerBg, color: C.danger }} />
                    )}
                  </Box>
                  {/* ★ تب‌ها — داینامیک */}
                  <Box sx={{ display: "flex", gap: 0.5, mt: 0.5, flexWrap: "wrap" }}>
                    {Object.entries(POS_TABS).map(([key, label]) => {
                      const has = perms.includes(key);
                      return (
                        <Chip
                          key={key}
                          size="small"
                          label={label}
                          sx={{
                            height: 17, fontSize: 8, fontWeight: 600, borderRadius: "4px",
                            bgcolor: has ? C.oliveSubtle : "transparent",
                            color: has ? C.olive : C.muted,
                            border: `1px solid ${has ? C.olive + "30" : C.glassBorder}`,
                          }}
                        />
                      );
                    })}
                  </Box>
                </Box>

                <Box sx={{ display: "flex", gap: 0.5, flexShrink: 0 }}>
                  <Tooltip title="ویرایش">
                    <IconButton size="small" onClick={() => openEdit(u)} sx={{ color: C.olive, "&:hover": { bgcolor: C.oliveSubtle } }}>
                      <Typography sx={{ fontSize: 14 }}>✏️</Typography>
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="ریست رمز">
                    <IconButton size="small" onClick={() => { setResetOpen(u); setNewPassword(""); }} sx={{ color: C.olive, "&:hover": { bgcolor: C.oliveSubtle } }}>
                      <Typography sx={{ fontSize: 14 }}>🔑</Typography>
                    </IconButton>
                  </Tooltip>
                  <Tooltip title={u.is_active ? "غیرفعال" : "فعال"}>
                    <IconButton size="small" onClick={() => handleToggle(u)}
                      sx={{ color: u.is_active ? C.danger : C.olive, "&:hover": { bgcolor: u.is_active ? C.dangerBg : C.oliveSubtle } }}>
                      <Typography sx={{ fontSize: 14 }}>{u.is_active ? "🚫" : "✅"}</Typography>
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="حذف">
                    <IconButton size="small" onClick={() => handleDelete(u)} sx={{ color: C.danger, "&:hover": { bgcolor: C.dangerBg } }}>
                      <Typography sx={{ fontSize: 14 }}>🗑️</Typography>
                    </IconButton>
                  </Tooltip>
                </Box>
              </Box>
            );
          })}
        </Box>
      )}

      {/* ── دیالوگ ایجاد/ویرایش ── */}
      <Dialog open={formOpen} onClose={() => setFormOpen(false)} maxWidth="xs" fullWidth
        slotProps={{ paper: { sx: dialogPaperSx } }}>
        <DialogTitle sx={{ fontSize: 15, fontWeight: 800, color: C.text }}>
          {editUser ? `✏️ ویرایش ${editUser.username}` : "➕ کاربر جدید"}
        </DialogTitle>
        <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 1.5, pt: "12px !important" }}>
          <TextField size="small" label="نام کاربری" value={form.username}
            disabled={!!editUser}
            onChange={(e) => setForm({ ...form, username: e.target.value })} sx={inputSx} />
          {!editUser && (
            <TextField size="small" label="رمز عبور" type="password" value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })} sx={inputSx} />
          )}
          <Box sx={{ display: "flex", gap: 1 }}>
            <TextField size="small" label="نام" value={form.first_name}
              onChange={(e) => setForm({ ...form, first_name: e.target.value })}
              sx={{ ...inputSx, flex: 1 }} />
            <TextField size="small" label="نام خانوادگی" value={form.last_name}
              onChange={(e) => setForm({ ...form, last_name: e.target.value })}
              sx={{ ...inputSx, flex: 1 }} />
          </Box>
          <TextField size="small" label="شماره تلفن" value={form.phone_number}
            onChange={(e) => setForm({ ...form, phone_number: e.target.value })} sx={inputSx} />

          <Box>
            <Typography sx={{ fontSize: 11, color: C.sub, mb: 0.5 }}>نقش</Typography>
            <Select size="small" fullWidth value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
              sx={{ ...inputSx, fontSize: 13 }}>
              {ROLE_OPTIONS.map(r => (
                <MenuItem key={r.value} value={r.value}>{r.label}</MenuItem>
              ))}
            </Select>
          </Box>

          {/* ★ تب‌های صندوق — داینامیک از POS_TABS */}
          <Box sx={{
            border: `1px solid ${C.glassBorder}`, borderRadius: "12px", p: 1.5,
            bgcolor: C.oliveSubtle,
          }}>
            <Typography sx={{ fontSize: 12, fontWeight: 700, color: C.text, mb: 0.5 }}>
              دسترسی تب‌های صندوق:
            </Typography>
            {Object.entries(POS_TABS).map(([key, label]) => (
              <FormControlLabel
                key={key}
                control={
                  <Switch size="small" checked={!!form.tabs[key]}
                    onChange={() => setTab(key)}
                    sx={{
                      "& .MuiSwitch-switchBase.Mui-checked": { color: C.olive },
                      "& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track": { bgcolor: C.olive },
                    }}
                  />
                }
                label={<Typography sx={{ fontSize: 12, color: C.text }}>{label}</Typography>}
                sx={{ display: "flex", justifyContent: "space-between", m: 0, my: 0.3 }}
              />
            ))}
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setFormOpen(false)}
            sx={{ borderRadius: "10px", fontSize: 12, textTransform: "none", color: C.sub }}>
            انصراف
          </Button>
          <Button onClick={handleSave} disabled={saving}
            sx={{
              borderRadius: "10px", fontSize: 12, fontWeight: 700,
              textTransform: "none", px: 2.5, color: "#fff",
              background: C.btnGrad, opacity: saving ? 0.6 : 1,
            }}>
            {saving ? "..." : editUser ? "بروزرسانی" : "ایجاد"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── دیالوگ ریست رمز ── */}
      <Dialog open={!!resetOpen} onClose={() => setResetOpen(null)} maxWidth="xs"
        slotProps={{ paper: { sx: dialogPaperSx } }}>
        <DialogTitle sx={{ fontSize: 15, fontWeight: 800, color: C.text }}>
          🔑 ریست رمز — {resetOpen?.username}
        </DialogTitle>
        <DialogContent sx={{ pt: "12px !important" }}>
          <TextField size="small" fullWidth type="password"
            label="رمز جدید (حداقل ۴ کاراکتر)"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            sx={inputSx}
            onKeyDown={(e) => { if (e.key === "Enter") handleResetPassword(); }} />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setResetOpen(null)}
            sx={{ borderRadius: "10px", fontSize: 12, textTransform: "none", color: C.sub }}>
            انصراف
          </Button>
          <Button onClick={handleResetPassword}
            sx={{ borderRadius: "10px", fontSize: 12, fontWeight: 700, textTransform: "none", px: 2.5, color: "#fff", background: C.btnGrad }}>
            تغییر رمز
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}