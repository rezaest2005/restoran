import { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  Box, Typography, Button, IconButton, TextField, Select, MenuItem,
  FormControl, InputLabel, Grid, Chip, CircularProgress, Divider,
  Dialog, DialogTitle, DialogContent, DialogActions, Snackbar, Alert,
  InputAdornment, LinearProgress, Tooltip
} from "@mui/material";
import {
  PersonAdd, Delete, Edit, Key, Shield, CheckCircle, Cancel, HourglassEmpty,
  DarkMode, LightMode, Language, People, AdminPanelSettings
} from "@mui/icons-material";
import { useThemeMode } from "../contexts/ThemeContext";
import { useLang } from "../contexts/LangContext";

const animations = `
  @keyframes orb1 { 0%, 100% { transform: translate(0, 0) scale(1); } 25% { transform: translate(60px, -80px) scale(1.1); } 50% { transform: translate(-20px, -40px) scale(0.95); } 75% { transform: translate(-50px, 50px) scale(1.05); } }
  @keyframes float { 0%, 100% { transform: translateY(0px); } 50% { transform: translateY(-6px); } }
  @keyframes shimmer { 0% { background-position: -200% center; } 100% { background-position: 200% center; } }
  @keyframes fadeUp { from { opacity: 0; transform: translateY(20px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
`;

const ROLES = [
  { value: "owner", label: "مالک", color: "#D4B76A" },
  { value: "manager", label: "مدیر", color: "#6B9B6E" },
  { value: "cashier", label: "صندوق‌دار", color: "#3b82f6" },
  { value: "kitchen", label: "آشپز", color: "#f59e0b" },
];

export default function Users() {
  const { mode, toggleTheme } = useThemeMode();
  const { isRtl, toggleLang, lang } = useLang();
  const { t } = useTranslation();
  const isDark = mode === "dark";

  const [mounted, setMounted] = useState(false);
  const [toast, setToast] = useState({ open: false, message: "", type: "info" });
  
  const [users, setUsers] = useState([]);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [roleModalOpen, setRoleModalOpen] = useState(false);
  const [passModalOpen, setPassModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  
  const [selectedUser, setSelectedUser] = useState(null);
  const [addForm, setAddForm] = useState({ username: "", phone: "", password: "", role: "manager" });
  const [passForm, setPassForm] = useState({ pass1: "", pass2: "" });
  const [newRole, setNewRole] = useState("");

  useEffect(() => {
    const tmr = setTimeout(() => setMounted(true), 80);
    // Mock Data
    setUsers([
      { id: 1, username: "ali_owner", phone: "09123456789", role: "owner", is_active: true, is_approved: true, date_joined: "۱۴۰۲/۰۵/۱۰" },
      { id: 2, username: "sara_cashier", phone: "09123456788", role: "cashier", is_active: true, is_approved: true, date_joined: "۱۴۰۲/۰۶/۱۵" },
      { id: 3, username: "reza_kitchen", phone: "09123456787", role: "kitchen", is_active: false, is_approved: true, date_joined: "۱۴۰۲/۰۷/۰۱" },
      { id: 4, username: "new_user", phone: "09123456786", role: "manager", is_active: true, is_approved: false, date_joined: "۱۴۰۲/۰۸/۰۱" },
    ]);
    return () => clearTimeout(tmr);
  }, []);

  const C = useMemo(() => ({
    bg: isDark ? "#0B0A0B" : "#E4E8F0",
    glass: isDark ? "rgba(16,18,16,0.6)" : "rgba(240,244,252,0.7)",
    glassBorder: isDark ? "rgba(107,155,110,0.1)" : "rgba(80,100,140,0.15)",
    glassShimmer: isDark ? "linear-gradient(90deg, transparent 0%, rgba(107,155,110,0.05) 20%, rgba(168,64,96,0.06) 40%, rgba(212,183,106,0.07) 60%, rgba(107,155,110,0.04) 80%, transparent 100%)" : "linear-gradient(90deg, transparent 0%, rgba(80,100,160,0.06) 20%, rgba(120,40,70,0.05) 40%, rgba(196,162,101,0.06) 60%, rgba(61,90,62,0.04) 80%, transparent 100%)",
    olive: isDark ? "#6B9B6E" : "#2E4D30",
    oliveSubtle: isDark ? "rgba(107,155,110,0.08)" : "rgba(46,77,48,0.08)",
    burgundy: isDark ? "#A84060" : "#7A2845",
    gold: isDark ? "#D4B76A" : "#A08040",
    text: isDark ? "#F0ECE8" : "#1A1A24",
    sub: isDark ? "#8A8588" : "#555568",
    muted: isDark ? "#4A4548" : "#8A8A9E",
    inputBg: isDark ? "rgba(11,10,11,0.5)" : "rgba(240,244,252,0.85)",
    btnGrad: isDark ? "linear-gradient(135deg, #3D6B40 0%, #5A8A5D 35%, #6B9B6E 70%, #4A7A4D 100%)" : "linear-gradient(135deg, #1E3A20 0%, #2E4D30 35%, #3D5A3E 70%, #2E4D30 100%)",
    danger: isDark ? "#E84057" : "#C83048",
    dangerBg: isDark ? "rgba(232,64,87,0.12)" : "rgba(200,48,72,0.1)",
    warning: isDark ? "#D4B76A" : "#A08040",
    warningBg: isDark ? "rgba(212,183,106,0.12)" : "rgba(160,128,64,0.1)",
    success: isDark ? "#6B9B6E" : "#2E4D30",
    successBg: isDark ? "rgba(107,155,110,0.12)" : "rgba(46,77,48,0.1)",
    cardShadow: isDark ? "0 8px 60px rgba(0,0,0,0.5), 0 0 80px rgba(107,155,110,0.04)" : "0 8px 60px rgba(0,0,0,0.1), 0 0 60px rgba(74,106,148,0.08)",
  }), [isDark]);

  const glassCardSx = {
    bgcolor: C.glass, backdropFilter: "blur(28px)", WebkitBackdropFilter: "blur(28px)",
    border: `1px solid ${C.glassBorder}`, borderRadius: "20px",
    boxShadow: C.cardShadow, position: "relative", overflow: "visible",
    "&::before": { content: '""', position: "absolute", top: 0, left: 0, right: 0, height: 1, background: C.glassShimmer, backgroundSize: "200% 100%", animation: "shimmer 10s linear infinite", pointerEvents: "none", borderRadius: "20px 20px 0 0" }
  };

  const inputSx = {
    "& .MuiOutlinedInput-root": {
      borderRadius: "12px", fontFamily: "'Vazirmatn', sans-serif", bgcolor: C.inputBg, fontSize: 13,
      "& fieldset": { borderColor: C.glassBorder, borderWidth: 1 },
      "&:hover fieldset": { borderColor: C.olive },
      "&.Mui-focused fieldset": { borderColor: C.olive, borderWidth: 1.5 },
    },
    "& .MuiInputLabel-root": { fontFamily: "'Vazirmatn', sans-serif", fontSize: 12, color: C.sub, "&.Mui-focused": { color: C.olive } },
  };

  const showToast = (message, type = "success") => setToast({ open: true, message, type });

  const stats = useMemo(() => ({
    total: users.length,
    active: users.filter(u => u.is_active).length,
    pending: users.filter(u => !u.is_approved).length,
  }), [users]);

  const handleApprove = (id) => {
    setUsers(prev => prev.map(u => u.id === id ? { ...u, is_approved: true } : u));
    showToast("کاربر با موفقیت تأیید شد");
  };

  const handleToggleActive = (id) => {
    setUsers(prev => prev.map(u => u.id === id ? { ...u, is_active: !u.is_active } : u));
    showToast("وضعیت کاربر تغییر کرد");
  };

  const handleDelete = () => {
    setUsers(prev => prev.filter(u => u.id !== selectedUser.id));
    setDeleteModalOpen(false);
    showToast("کاربر حذف شد", "error");
  };

  const handleSaveRole = () => {
    setUsers(prev => prev.map(u => u.id === selectedUser.id ? { ...u, role: newRole } : u));
    setRoleModalOpen(false);
    showToast("نقش کاربر تغییر کرد");
  };

  const handleSavePassword = () => {
    if (passForm.pass1 !== passForm.pass2) return showToast("رمزها مطابقت ندارند", "error");
    setPassModalOpen(false);
    showToast("رمز عبور تغییر کرد");
    setPassForm({ pass1: "", pass2: "" });
  };

  const handleSaveAdd = () => {
    if (!addForm.username || !addForm.password) return showToast("نام کاربری و رمز الزامی است", "error");
    const newUser = { ...addForm, id: Date.now(), is_active: true, is_approved: true, date_joined: "اکنون" };
    setUsers(prev => [newUser, ...prev]);
    setAddModalOpen(false);
    showToast("کاربر جدید اضافه شد");
    setAddForm({ username: "", phone: "", password: "", role: "manager" });
  };

  const getRoleColor = (roleVal) => {
    const role = ROLES.find(r => r.value === roleVal);
    return role ? role.color : C.sub;
  };

  const getRoleLabel = (roleVal) => {
    const role = ROLES.find(r => r.value === roleVal);
    return role ? role.label : roleVal;
  };

  const passwordStrength = useMemo(() => {
    const pass = passModalOpen ? passForm.pass1 : addForm.password;
    if (!pass) return { score: 0, label: "", color: C.muted };
    let score = 0;
    if (pass.length >= 6) score++;
    if (pass.length >= 10) score++;
    if (/[A-Z]/.test(pass)) score++;
    if (/[0-9]/.test(pass)) score++;
    if (/[^A-Za-z0-9]/.test(pass)) score++;
    if (score <= 2) return { score: 33, label: t("users.strength_weak"), color: C.danger };
    if (score <= 3) return { score: 66, label: t("users.strength_medium"), color: C.warning };
    return { score: 100, label: t("users.strength_strong"), color: C.success };
  }, [passForm.pass1, addForm.password, passModalOpen, t, C]);

  return (
    <Box dir={isRtl ? "rtl" : "ltr"} sx={{ position: "relative", fontFamily: "'Vazirmatn', sans-serif", minHeight: "100vh", color: C.text, opacity: mounted ? 1 : 0, transition: "opacity 0.5s ease", pb: 10 }}>
      <style>{animations}</style>

      {/* Header */}
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 4, flexWrap: "wrap", gap: 2 }}>
        <Typography variant="h4" sx={{ fontWeight: 800, display: "flex", alignItems: "center", gap: 1.5 }}>
          <span style={{ fontSize: 28 }}>👥</span> {t("users.title")}
        </Typography>
        <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap" }}>
          <IconButton onClick={toggleTheme} size="small" sx={{ border: `1px solid ${C.glassBorder}`, borderRadius: "10px", bgcolor: C.glass, color: C.text }}>
            {isDark ? <LightMode fontSize="small" /> : <DarkMode fontSize="small" />}
          </IconButton>
          <IconButton onClick={toggleLang} size="small" sx={{ border: `1px solid ${C.glassBorder}`, borderRadius: "10px", bgcolor: C.glass, color: C.text }}>
            <Language fontSize="small" />
          </IconButton>
          <Button onClick={() => setAddModalOpen(true)} sx={{ bgcolor: C.btnGrad, color: "#fff", boxShadow: `0 4px 14px ${C.olive}55`, "&:hover": { transform: "translateY(-2px)" } }}>
            <PersonAdd /> {t("users.btn_add")}
          </Button>
        </Box>
      </Box>

      {/* Stats */}
      <Grid container spacing={2.5} sx={{ mb: 3 }}>
        {[
          { label: t("users.stat_total"), value: stats.total, color: C.olive, icon: <People /> },
          { label: t("users.stat_active"), value: stats.active, color: C.success, icon: <CheckCircle /> },
          { label: t("users.stat_pending"), value: stats.pending, color: C.warning, icon: <HourglassEmpty /> },
        ].map((stat, i) => (
          <Grid item xs={12} sm={6} md={4} key={i}>
            <Box sx={{ ...glassCardSx, p: 2.5, display: "flex", alignItems: "center", gap: 2 }}>
              <Box sx={{ width: 48, height: 48, borderRadius: "12px", display: "flex", alignItems: "center", justifyContent: "center", background: `${stat.color}22`, border: `1px solid ${stat.color}33`, animation: "float 5s ease-in-out infinite", flexShrink: 0, color: stat.color }}>
                {stat.icon}
              </Box>
              <Box>
                <Typography sx={{ fontWeight: 800, fontSize: 20, color: C.text }}>{stats.total !== 0 ? String(stat.value).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[d]) : "۰"}</Typography>
                <Typography sx={{ fontSize: 12, fontWeight: 600, color: C.sub }}>{stat.label}</Typography>
              </Box>
            </Box>
          </Grid>
        ))}
      </Grid>

      {/* Users List */}
      <Box sx={{ ...glassCardSx, p: { xs: 2, md: 3 } }}>
        {users.length === 0 ? (
          <Box sx={{ textAlign: "center", py: 5, color: C.muted }}>
            <People sx={{ fontSize: 48, opacity: 0.3, mb: 1 }} />
            <Typography>{t("users.empty")}</Typography>
          </Box>
        ) : (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {users.map((user, i) => {
              const roleColor = getRoleColor(user.role);
              const isPending = !user.is_approved;
              return (
                <Box key={user.id} sx={{ display: "flex", alignItems: "center", gap: 2, p: 2, borderRadius: "16px", border: `1px solid ${isPending ? C.warning + "44" : C.glassBorder}`, bgcolor: isDark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.01)", animation: `fadeUp 0.4s ease-out ${i * 0.05}s backwards`, transition: "all 0.2s ease", "&:hover": { borderColor: isPending ? C.warning : C.olive } }}>
                  <Box sx={{ width: 48, height: 48, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 18, bgcolor: isPending ? C.warningBg : C.oliveSubtle, color: isPending ? C.warning : C.olive, border: `2px solid ${isPending ? C.warning + "44" : C.olive + "33"}`, flexShrink: 0 }}>
                    {user.username.charAt(0).toUpperCase()}
                  </Box>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.5 }}>
                      <Typography sx={{ fontWeight: 700, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{user.username}</Typography>
                      {isPending && <Chip label={t("users.pending_badge")} size="small" sx={{ height: 20, fontSize: 9, bgcolor: C.warningBg, color: C.warning, fontWeight: 600 }} />}
                    </Box>
                    <Box sx={{ display: "flex", gap: 2, fontSize: 11, color: C.muted, flexWrap: "wrap" }}>
                      <span>📱 {user.phone || "—"}</span>
                      <span>📅 {user.date_joined}</span>
                    </Box>
                  </Box>
                  <Chip label={getRoleLabel(user.role)} size="small" onClick={() => { setSelectedUser(user); setNewRole(user.role); setRoleModalOpen(true); }} sx={{ bgcolor: roleColor + "22", color: roleColor, fontWeight: 700, cursor: "pointer", "&:hover": { bgcolor: roleColor + "33" } }} />
                  <Box sx={{ display: "flex", gap: 1, flexShrink: 0 }}>
                    {isPending && (
                      <Tooltip title={t("users.btn_approve")}>
                        <IconButton size="small" onClick={() => handleApprove(user.id)} sx={{ bgcolor: C.successBg, color: C.success }}><CheckCircle fontSize="small" /></IconButton>
                      </Tooltip>
                    )}
                    <Tooltip title={t("users.btn_role")}>
                      <IconButton size="small" onClick={() => { setSelectedUser(user); setNewRole(user.role); setRoleModalOpen(true); }} sx={{ bgcolor: C.oliveSubtle, color: C.olive }}><Shield fontSize="small" /></IconButton>
                    </Tooltip>
                    <Tooltip title={t("users.btn_password")}>
                      <IconButton size="small" onClick={() => { setSelectedUser(user); setPassModalOpen(true); setPassForm({pass1: "", pass2: ""}); }} sx={{ bgcolor: C.warningBg, color: C.warning }}><Key fontSize="small" /></IconButton>
                    </Tooltip>
                    <Tooltip title={user.is_active ? t("users.btn_active") : t("users.btn_inactive")}>
                      <IconButton size="small" onClick={() => handleToggleActive(user.id)} sx={{ bgcolor: user.is_active ? C.successBg : C.dangerBg, color: user.is_active ? C.success : C.danger }}>
                        {user.is_active ? <CheckCircle fontSize="small" /> : <Cancel fontSize="small" />}
                      </IconButton>
                    </Tooltip>
                    <Tooltip title={t("users.btn_delete")}>
                      <IconButton size="small" onClick={() => { setSelectedUser(user); setDeleteModalOpen(true); }} sx={{ bgcolor: C.dangerBg, color: C.danger }}><Delete fontSize="small" /></IconButton>
                    </Tooltip>
                  </Box>
                </Box>
              );
            })}
          </Box>
        )}
      </Box>

      {/* Add Modal */}
      <Dialog open={addModalOpen} onClose={() => setAddModalOpen(false)} maxWidth="sm" fullWidth>
        <Box sx={{ bgcolor: C.glass, backdropFilter: "blur(28px)", p: 3, border: `1px solid ${C.glassBorder}`, borderRadius: "20px" }}>
          <Typography variant="h6" sx={{ fontWeight: 800, mb: 1, color: C.text, display: "flex", alignItems: "center", gap: 1 }}>
            <PersonAdd sx={{ color: C.olive }} /> {t("users.modal_add_title")}
          </Typography>
          <Typography sx={{ color: C.sub, fontSize: 13, mb: 3 }}>{t("users.modal_add_sub")}</Typography>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <TextField label={t("users.label_username")} value={addForm.username} onChange={(e) => setAddForm({...addForm, username: e.target.value})} sx={inputSx} size="small" />
            <TextField label={t("users.label_phone")} value={addForm.phone} onChange={(e) => setAddForm({...addForm, phone: e.target.value})} sx={inputSx} size="small" />
            <Box>
              <TextField label={t("users.label_password")} type="password" value={addForm.password} onChange={(e) => setAddForm({...addForm, password: e.target.value})} sx={inputSx} size="small" />
              {addForm.password && (
                <Box sx={{ mt: 1 }}>
                  <LinearProgress variant="determinate" value={passwordStrength.score} sx={{ height: 6, borderRadius: 3, bgcolor: C.inputBg, "& .MuiLinearProgress-bar": { bgcolor: passwordStrength.color } }} />
                  <Typography sx={{ fontSize: 11, color: passwordStrength.color, mt: 0.5 }}>{passwordStrength.label}</Typography>
                </Box>
              )}
            </Box>
            <FormControl size="small" sx={inputSx}>
              <InputLabel>{t("users.label_role")}</InputLabel>
              <Select value={addForm.role} onChange={(e) => setAddForm({...addForm, role: e.target.value})} label={t("users.label_role")}>
                {ROLES.map(r => <MenuItem key={r.value} value={r.value}>{r.label}</MenuItem>)}
              </Select>
            </FormControl>
          </Box>
          <Box sx={{ display: "flex", justifyContent: "flex-end", gap: 2, mt: 3 }}>
            <Button onClick={() => setAddModalOpen(false)} sx={{ color: C.sub }}>{t("users.btn_cancel")}</Button>
            <Button onClick={handleSaveAdd} sx={{ bgcolor: C.btnGrad, color: "#fff" }}>{t("users.btn_save")}</Button>
          </Box>
        </Box>
      </Dialog>

      {/* Role Modal */}
      <Dialog open={roleModalOpen} onClose={() => setRoleModalOpen(false)} maxWidth="xs" fullWidth>
        <Box sx={{ bgcolor: C.glass, backdropFilter: "blur(28px)", p: 3, border: `1px solid ${C.glassBorder}`, borderRadius: "20px" }}>
          <Typography variant="h6" sx={{ fontWeight: 800, mb: 1, color: C.text, display: "flex", alignItems: "center", gap: 1 }}>
            <Shield sx={{ color: C.olive }} /> {t("users.modal_role_title")}
          </Typography>
          <Typography sx={{ color: C.sub, fontSize: 13, mb: 3 }}>{t("users.modal_role_sub")} <b style={{ color: C.text }}>{selectedUser?.username}</b></Typography>
          <FormControl fullWidth size="small" sx={inputSx}>
            <InputLabel>{t("users.label_role")}</InputLabel>
            <Select value={newRole} onChange={(e) => setNewRole(e.target.value)} label={t("users.label_role")}>
              {ROLES.map(r => <MenuItem key={r.value} value={r.value}>{r.label}</MenuItem>)}
            </Select>
          </FormControl>
          <Box sx={{ display: "flex", justifyContent: "flex-end", gap: 2, mt: 3 }}>
            <Button onClick={() => setRoleModalOpen(false)} sx={{ color: C.sub }}>{t("users.btn_cancel")}</Button>
            <Button onClick={handleSaveRole} sx={{ bgcolor: C.btnGrad, color: "#fff" }}>{t("users.btn_save")}</Button>
          </Box>
        </Box>
      </Dialog>

      {/* Password Modal */}
      <Dialog open={passModalOpen} onClose={() => setPassModalOpen(false)} maxWidth="xs" fullWidth>
        <Box sx={{ bgcolor: C.glass, backdropFilter: "blur(28px)", p: 3, border: `1px solid ${C.glassBorder}`, borderRadius: "20px" }}>
          <Typography variant="h6" sx={{ fontWeight: 800, mb: 1, color: C.text, display: "flex", alignItems: "center", gap: 1 }}>
            <Key sx={{ color: C.warning }} /> {t("users.modal_pass_title")}
          </Typography>
          <Typography sx={{ color: C.sub, fontSize: 13, mb: 3 }}>{t("users.modal_pass_sub")} <b style={{ color: C.text }}>{selectedUser?.username}</b></Typography>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <Box>
              <TextField label={t("users.label_new_pass")} type="password" value={passForm.pass1} onChange={(e) => setPassForm({...passForm, pass1: e.target.value})} sx={inputSx} size="small" />
              {passForm.pass1 && (
                <Box sx={{ mt: 1 }}>
                  <LinearProgress variant="determinate" value={passwordStrength.score} sx={{ height: 6, borderRadius: 3, bgcolor: C.inputBg, "& .MuiLinearProgress-bar": { bgcolor: passwordStrength.color } }} />
                  <Typography sx={{ fontSize: 11, color: passwordStrength.color, mt: 0.5 }}>{passwordStrength.label}</Typography>
                </Box>
              )}
            </Box>
            <TextField label={t("users.label_repeat_pass")} type="password" value={passForm.pass2} onChange={(e) => setPassForm({...passForm, pass2: e.target.value})} sx={inputSx} size="small" />
          </Box>
          <Box sx={{ display: "flex", justifyContent: "flex-end", gap: 2, mt: 3 }}>
            <Button onClick={() => setPassModalOpen(false)} sx={{ color: C.sub }}>{t("users.btn_cancel")}</Button>
            <Button onClick={handleSavePassword} sx={{ bgcolor: C.btnGrad, color: "#fff" }}>{t("users.btn_save")}</Button>
          </Box>
        </Box>
      </Dialog>

      {/* Delete Modal */}
      <Dialog open={deleteModalOpen} onClose={() => setDeleteModalOpen(false)} maxWidth="xs" fullWidth>
        <Box sx={{ bgcolor: C.glass, backdropFilter: "blur(28px)", p: 3, border: `1px solid ${C.glassBorder}`, borderRadius: "20px", textAlign: "center" }}>
          <Box sx={{ width: 60, height: 60, mx: "auto", mb: 2, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "50%", bgcolor: C.dangerBg, color: C.danger }}>
            <Delete sx={{ fontSize: 30 }} />
          </Box>
          <Typography variant="h6" sx={{ fontWeight: 700, mb: 1, color: C.text }}>{t("users.modal_delete_title")}</Typography>
          <Typography sx={{ color: C.sub, fontSize: 13, mb: 3 }}>{t("users.modal_delete_sub")}</Typography>
          <Box sx={{ display: "flex", gap: 2 }}>
            <Button onClick={() => setDeleteModalOpen(false)} sx={{ flex: 1, bgcolor: isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)", color: C.text }}>{t("users.btn_cancel")}</Button>
            <Button onClick={handleDelete} sx={{ flex: 1, bgcolor: C.danger, color: "#fff" }}>{t("users.btn_confirm_delete")}</Button>
          </Box>
        </Box>
      </Dialog>

      <Snackbar open={toast.open} autoHideDuration={3000} onClose={() => setToast({ ...toast, open: false })} anchorOrigin={{ vertical: "top", horizontal: "center" }}>
        <Alert severity={toast.type} sx={{ bgcolor: C.glass, backdropFilter: "blur(16px)", color: C.text, border: `1px solid ${C.olive}`, borderRadius: "12px", fontFamily: "'Vazirmatn', sans-serif" }}>{toast.message}</Alert>
      </Snackbar>
    </Box>
  );
}