import { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  Box, Typography, Button, TextField, Chip, CircularProgress,
  Dialog, DialogTitle, DialogContent, DialogActions,
  Switch, Select, MenuItem, Divider,
} from "@mui/material";
import {
  getUsers, createUser, updateUserRole, toggleUserActive,
  resetUserPassword, deleteUser, updateUserTabs,
} from "../../api/client";

// ═══════ دسترسی‌ها — دقیقاً عین داشبورد ═══════
const ALL_TABS = {
  home: { icon: "📊", group: "dashboard" },

  inventory_invoice: { icon: "🧾", group: "inventory" },
  inventory_sales: { icon: "💰", group: "inventory" },
  inventory_warehouse: { icon: "📦", group: "inventory" },
  inventory_receiving: { icon: "🚚", group: "inventory" },
  inventory_purchase_list: { icon: "🛒", group: "inventory" },
  inventory_reports: { icon: "📊", group: "inventory" },

  dictionary_items: { icon: "🏷️", group: "definitions" },
  dictionary_menu: { icon: "🍽️", group: "definitions" },
  dictionary_recipe: { icon: "📖", group: "definitions" },
  dictionary_suppliers: { icon: "🤝", group: "definitions" },
  dictionary_warehouses: { icon: "🏭", group: "definitions" },
  dictionary_customers: { icon: "🧑", group: "definitions" },
  dictionary_users: { icon: "👥", group: "definitions" },

  pos: { icon: "💰", group: "pos" },
  pos_report: { icon: "📊", group: "pos" },
  pos_settings: { icon: "⚙️", group: "pos" },
  orders: { icon: "📋", group: "pos" },

  accounting: { icon: "🧮", group: "accounting" },
  accounting_invoices: { icon: "🧾", group: "accounting" },
  accounting_sales: { icon: "💰", group: "accounting" },
  accounting_expenses: { icon: "💸", group: "accounting" },
  accounting_profit: { icon: "📈", group: "accounting" },
  accounting_returns: { icon: "↩️", group: "accounting" },
};

const GROUPS = [
  { name: "dashboard", icon: "📊", color: "#3B82F6" },
  { name: "inventory", icon: "📦", color: "#10B981" },
  { name: "definitions", icon: "📖", color: "#8B5CF6" },
  { name: "pos", icon: "💰", color: "#F59E0B" },
  { name: "accounting", icon: "🧮", color: "#EF4444" },
];

// ═══════ نقش‌ها ═══════
function makeTabs(overrides = {}) {
  return Object.keys(ALL_TABS).reduce((a, k) => ({ ...a, [k]: false }), { ...overrides });
}

const ROLE_PRESETS = {
  owner: {
    emoji: "👑", color: "#D4B76A",
    tabs: makeTabs(Object.keys(ALL_TABS).reduce((a, k) => ({ ...a, [k]: true }), {})),
  },
  manager: {
    emoji: "👤", color: "#3B82F6",
    tabs: makeTabs(Object.keys(ALL_TABS).reduce((a, k) => ({ ...a, [k]: true }), {})),
  },
  warehouse: {
    emoji: "📦", color: "#10B981",
    tabs: makeTabs({
      home: true,
      inventory_invoice: true, inventory_sales: true, inventory_warehouse: true,
      inventory_receiving: true, inventory_purchase_list: true, inventory_reports: true,
      dictionary_items: true, dictionary_suppliers: true, dictionary_warehouses: true,
    }),
  },
  cashier: {
    emoji: "💰", color: "#F59E0B",
    tabs: makeTabs({
      home: true,
      dictionary_menu: true, dictionary_customers: true,
      pos: true, pos_report: true, pos_settings: true, orders: true,
    }),
  },
  waiter: {
    emoji: "🍽️", color: "#06B6D4",
    tabs: makeTabs({
      home: true,
      dictionary_menu: true,
      pos: true, orders: true,
    }),
  },
  kitchen: {
    emoji: "🏭", color: "#EC4899",
    tabs: makeTabs({
      home: true,
      inventory_warehouse: true, inventory_reports: true,
      dictionary_menu: true, dictionary_recipe: true,
      orders: true,
    }),
  },
  customer: {
    emoji: "🧑", color: "#6B7280",
    tabs: makeTabs({
      home: true,
      dictionary_menu: true,
    }),
  },
  custom: {
    emoji: "✏️", color: "#8B5CF6",
    tabs: makeTabs(),
  },
};

// ── تبدیل نقش UI به نقش معتبر سرور ──
const ROLE_TO_BACKEND = {
  owner: "owner",
  manager: "manager",
  warehouse: "manager",
  cashier: "cashier",
  waiter: "waiter",
  kitchen: "kitchen",
  customer: "customer",
  custom: "manager",
};

// ═══════════════════════════════════════
//  کامپوننت اصلی
// ═══════════════════════════════════════

export default function ManagersSection({ C, isRtl, isDark, showToast }) {
  const { t } = useTranslation();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editUser, setEditUser] = useState(null);
  const [resetOpen, setResetOpen] = useState(null);
  const [newPassword, setNewPassword] = useState("");
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    username: "", password: "", phone_number: "",
    first_name: "", last_name: "",
    role: "cashier", customRole: "",
    tabs: { ...ROLE_PRESETS.cashier.tabs },
  });

  const notify = (msg, type = "info") => {
    if (typeof showToast === "function") showToast(msg, type);
    else console.warn("showToast missing:", msg, type);
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
    return users.filter(
      (u) =>
        u.username?.toLowerCase().includes(q) ||
        u.first_name?.toLowerCase().includes(q) ||
        u.last_name?.toLowerCase().includes(q) ||
        u.phone_number?.includes(q)
    );
  }, [users, search]);

  const handleRoleChange = (role) => {
    const preset = ROLE_PRESETS[role];
    setForm((f) => ({
      ...f,
      role,
      customRole: role === "custom" ? f.customRole : "",
      tabs: { ...preset.tabs },
    }));
  };

  const openCreate = () => {
    setEditUser(null);
    setForm({
      username: "", password: "", phone_number: "",
      first_name: "", last_name: "",
      role: "cashier", customRole: "",
      tabs: { ...ROLE_PRESETS.cashier.tabs },
    });
    setFormOpen(true);
  };

  const openEdit = (u) => {
    setEditUser(u);
    const isCustom = !ROLE_PRESETS[u.role];
    setForm({
      username: u.username, password: "",
      phone_number: u.phone_number || "",
      first_name: u.first_name || "",
      last_name: u.last_name || "",
      role: isCustom ? "custom" : (u.role || "cashier"),
      customRole: isCustom ? (u.role_display || u.role || "") : "",
      tabs: { ...makeTabs(), ...u.tabs },
    });
    setFormOpen(true);
  };

  const handleSave = async () => {
    if (saving) return;
    if (!form.username.trim()) { notify(t("ui_b.managers.usernameRequired"), "warning"); return; }
    if (!editUser && !form.password) { notify(t("ui_b.managers.passwordRequired"), "warning"); return; }
    if (form.role === "custom" && !form.customRole.trim()) { notify(t("ui_b.managers.customRoleRequired"), "warning"); return; }

    setSaving(true);
    try {
      // ★ نقش معتبر سرور
      const finalRole = ROLE_TO_BACKEND[form.role] || "cashier";

      if (editUser) {
        if (finalRole !== editUser.role) {
          await updateUserRole({ user_id: editUser.id, role: finalRole });
        }
        await updateUserTabs({ user_id: editUser.id, tabs: form.tabs });
        notify(t("ui_b.managers.userUpdated", { name: editUser.username }), "success");
      } else {
        const res = await createUser({
          username: form.username.trim(),
          password: form.password,
          phone_number: form.phone_number.trim(),
          first_name: form.first_name.trim(),
          last_name: form.last_name.trim(),
          role: finalRole,
        });
        const newUserId = res.data?.user_id;
        if (newUserId) {
          await updateUserTabs({ user_id: newUserId, tabs: form.tabs });
        }
        notify(res.data?.msg || t("ui_b.managers.userCreated", { name: form.username }), "success");
      }
      setFormOpen(false);
      setEditUser(null);
      load();
    } catch (err) {
      const msg = err.response?.data?.error || err.response?.data?.detail || err.message || t("ui_b.common.error");
      notify(msg, "error");
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (u) => {
    try {
      await toggleUserActive({ user_id: u.id });
      notify(t(!u.is_active ? "ui_b.managers.userActivated" : "ui_b.managers.userDeactivated", { name: u.username }), "success");
      load();
    } catch (err) {
      notify(err.response?.data?.error || err.message || t("ui_b.common.error"), "error");
    }
  };

  const handleDelete = async (u) => {
    if (!window.confirm(t("ui_b.managers.confirmDelete", { name: u.username }))) return;
    try {
      await deleteUser({ user_id: u.id });
      notify(t("ui_b.managers.userDeleted", { name: u.username }), "success");
      load();
    } catch (err) {
      notify(err.response?.data?.error || err.message || t("ui_b.common.error"), "error");
    }
  };

  const handleResetPassword = async () => {
    if (!newPassword || newPassword.length < 4) {
      notify(t("ui_b.managers.passwordMin"), "warning");
      return;
    }
    try {
      await resetUserPassword({ user_id: resetOpen.id, new_password: newPassword });
      notify(t("ui_b.managers.passwordChanged", { name: resetOpen.username }), "success");
      setResetOpen(null);
      setNewPassword("");
    } catch (err) {
      notify(err.response?.data?.error || err.message || t("ui_b.common.error"), "error");
    }
  };

  const toggleTab = (key) => {
    setForm((f) => ({ ...f, tabs: { ...f.tabs, [key]: !f.tabs[key] } }));
  };

  const toggleGroup = (group) => {
    const groupKeys = Object.keys(ALL_TABS).filter((k) => ALL_TABS[k].group === group);
    const allOn = groupKeys.every((k) => form.tabs[k]);
    setForm((f) => ({
      ...f,
      tabs: { ...f.tabs, ...groupKeys.reduce((a, k) => ({ ...a, [k]: !allOn }), {}) },
    }));
  };

  const activeCount = Object.values(form.tabs).filter(Boolean).length;
  const totalTabs = Object.keys(ALL_TABS).length;

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
        <CircularProgress sx={{ color: C.olive }} size={36} />
      </Box>
    );
  }

  return (
    <Box>
      {/* ═══════ هدر ═══════ */}
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2.5, flexWrap: "wrap", gap: 1.5 }}>
        <Box>
          <Typography sx={{ fontSize: { xs: 16, sm: 18 }, fontWeight: 800, color: C.text }}>
            👥 {t("ui_b.managers.title")}
          </Typography>
          <Typography sx={{ fontSize: 12, color: C.sub, mt: 0.3 }}>
            {t("ui_b.managers.subtitle")}
          </Typography>
        </Box>
        <Button
          onClick={openCreate}
          sx={{
            borderRadius: "10px", fontSize: 12, fontWeight: 700, textTransform: "none",
            px: 2.5, py: 1, color: "#fff", background: C.btnGrad,
            boxShadow: `0 4px 20px ${C.olive}30`,
            "&:hover": { transform: "translateY(-1px)", boxShadow: `0 6px 28px ${C.olive}40` },
          }}
        >
          ➕ {t("ui_b.managers.newBtn")}
        </Button>
      </Box>

      {/* ═══════ جستجو ═══════ */}
      <TextField
        size="small" placeholder={t("ui_b.common.search")}
        value={search} onChange={(e) => setSearch(e.target.value)}
        sx={{
          width: "100%", maxWidth: 300, mb: 2,
          "& .MuiOutlinedInput-root": {
            borderRadius: "10px", bgcolor: C.inputBg, fontSize: 13,
            fontFamily: "'Vazirmatn', sans-serif", color: C.text,
            "& fieldset": { borderColor: C.glassBorder },
            "&.Mui-focused fieldset": { borderColor: C.olive },
          },
          "& .MuiInputBase-input": { color: C.text },
        }}
      />

      {/* ═══════ لیست ═══════ */}
      {filtered.length === 0 ? (
        <Box sx={{ textAlign: "center", py: 6 }}>
          <Typography sx={{ fontSize: 40, mb: 1 }}>👥</Typography>
          <Typography sx={{ fontSize: 14, fontWeight: 700, color: C.text }}>
            {t("ui_b.managers.empty")}
          </Typography>
        </Box>
      ) : (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 0.8 }}>
          {filtered.map((u, i) => (
            <Box key={u.id} sx={{
              display: "flex", alignItems: "center", flexWrap: "wrap", gap: 1,
              px: 2, py: 1.5,
              borderRadius: "10px", bgcolor: C.glass, backdropFilter: "blur(12px)",
              border: `1px solid ${u.is_active ? C.glassBorder : C.danger + "30"}`,
              opacity: 0,
              animation: `fadeUp 0.3s ease-out ${i * 0.04}s forwards`,
              "&:hover": { bgcolor: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.02)" },
            }}>
              <Box sx={{ flex: 1, minWidth: 140 }}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
                  <Typography sx={{ fontSize: 13, fontWeight: 700, color: C.text }}>{u.username}</Typography>
                  <Typography sx={{ fontSize: 11, color: C.sub }}>{u.first_name} {u.last_name}</Typography>
                  <Chip size="small" label={u.role_display || u.role}
                    sx={{ height: 18, fontSize: 9, fontWeight: 600, borderRadius: "5px", bgcolor: C.oliveSubtle, color: C.olive }} />
                  {!u.is_active && (
                    <Chip size="small" label={t("ui_b.common.inactive")}
                      sx={{ height: 18, fontSize: 9, fontWeight: 600, borderRadius: "5px", bgcolor: C.dangerBg, color: C.danger }} />
                  )}
                </Box>
                <Box sx={{ display: "flex", gap: 0.5, mt: 0.5, flexWrap: "wrap" }}>
                  {Object.entries(u.tabs || {}).filter(([, v]) => v).map(([k]) => (
                    <Chip key={k} size="small" label={ALL_TABS[k] ? t(`ui_b.managers.tabs.${k}`) : k}
                      sx={{ height: 17, fontSize: 8, fontWeight: 600, borderRadius: "4px", bgcolor: C.oliveSubtle, color: C.olive, border: `1px solid ${C.olive}30` }} />
                  ))}
                </Box>
              </Box>
              <Box sx={{ display: "flex", gap: 0.5, flexShrink: 0 }}>
                {[
                  { icon: "✏️", label: t("ui_b.common.edit"), color: C.olive, bg: C.oliveSubtle, onClick: () => openEdit(u) },
                  { icon: "🔑", label: t("ui_b.managers.resetPassword"), color: C.olive, bg: C.oliveSubtle, onClick: () => { setResetOpen(u); setNewPassword(""); } },
                  { icon: u.is_active ? "🚫" : "✅", label: u.is_active ? t("ui_b.common.inactive") : t("ui_b.common.active"), color: u.is_active ? C.danger : C.olive, bg: u.is_active ? C.dangerBg : C.oliveSubtle, onClick: () => handleToggle(u) },
                  { icon: "🗑️", label: t("ui_b.common.delete"), color: C.danger, bg: C.dangerBg, onClick: () => handleDelete(u) },
                ].map((btn) => (
                  <Box key={btn.label} onClick={btn.onClick} sx={{
                    display: "flex", flexDirection: "column", alignItems: "center",
                    gap: 0.3, px: 1, py: 0.5, borderRadius: "8px", cursor: "pointer",
                    color: btn.color, transition: "all 0.2s",
                    "&:hover": { bgcolor: btn.bg },
                  }}>
                    <Typography sx={{ fontSize: 14, lineHeight: 1 }}>{btn.icon}</Typography>
                    <Typography sx={{ fontSize: 8, fontWeight: 600 }}>{btn.label}</Typography>
                  </Box>
                ))}
              </Box>
            </Box>
          ))}
        </Box>
      )}

      {/* ═══════════════════════════════════════════
          دیالوگ ایجاد / ویرایش
          ═══════════════════════════════════════════ */}
      <Dialog
        open={formOpen} onClose={() => setFormOpen(false)}
        maxWidth="sm" fullWidth
        slotProps={{
          paper: {
            sx: {
              borderRadius: "20px",
              bgcolor: isDark ? "#1A1B2E" : "#FFFFFF",
              border: `1px solid ${isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)"}`,
              boxShadow: isDark ? "0 24px 80px rgba(0,0,0,0.6)" : "0 24px 80px rgba(0,0,0,0.12)",
              overflow: "hidden",
            },
          },
        }}
      >
        {/* ── هدر ── */}
        <Box sx={{
          px: 3, py: 2.5,
          background: `linear-gradient(135deg, ${C.olive}15 0%, ${C.olive}05 100%)`,
          borderBottom: `1px solid ${isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)"}`,
        }}>
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
              <Box sx={{
                width: 40, height: 40, borderRadius: "12px",
                bgcolor: C.oliveSubtle,
                display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20,
              }}>
                {editUser ? "✏️" : "➕"}
              </Box>
              <Box>
                <Typography sx={{ fontSize: 16, fontWeight: 800, color: C.text, fontFamily: "'Vazirmatn', sans-serif" }}>
                  {editUser ? t("ui_b.common.editName", { name: editUser.username }) : t("ui_b.managers.newUser")}
                </Typography>
                <Typography sx={{ fontSize: 11, color: C.sub, fontFamily: "'Vazirmatn', sans-serif" }}>
                  {t("ui_b.managers.activeAccess", { active: activeCount, total: totalTabs })}
                </Typography>
              </Box>
            </Box>
          </Box>
        </Box>

        {/* ── محتوا ── */}
        <DialogContent sx={{ px: 3, py: 2.5, maxHeight: "68vh", overflowY: "auto" }}>

          {/* ━━━ اطلاعات کاربر ━━━ */}
          <Typography sx={{ fontSize: 12, fontWeight: 700, color: C.olive, mb: 1.5, fontFamily: "'Vazirmatn', sans-serif" }}>
            📋 {t("ui_b.managers.userInfo")}
          </Typography>

          <Box sx={{ display: "flex", flexDirection: "column", gap: 1.2, mb: 3 }}>
            <TextField size="small" fullWidth label={t("ui_b.managers.username")}
              value={form.username} disabled={!!editUser}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              sx={{
                "& .MuiOutlinedInput-root": {
                  borderRadius: "10px", bgcolor: isDark ? "rgba(255,255,255,0.05)" : "#F5F5F5",
                  fontSize: 13, fontFamily: "'Vazirmatn', sans-serif", color: C.text,
                  "& fieldset": { borderColor: isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.12)" },
                  "&:hover fieldset": { borderColor: C.olive + "60" },
                  "&.Mui-focused fieldset": { borderColor: C.olive, borderWidth: 1.5 },
                },
                "& .MuiInputLabel-root": { fontSize: 12, color: C.sub, fontFamily: "'Vazirmatn', sans-serif" },
                "& .MuiInputBase-input": { color: C.text },
              }}
            />
            {!editUser && (
              <TextField size="small" fullWidth label={t("ui_b.managers.password")} type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                sx={{
                  "& .MuiOutlinedInput-root": {
                    borderRadius: "10px", bgcolor: isDark ? "rgba(255,255,255,0.05)" : "#F5F5F5",
                    fontSize: 13, fontFamily: "'Vazirmatn', sans-serif", color: C.text,
                    "& fieldset": { borderColor: isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.12)" },
                    "&:hover fieldset": { borderColor: C.olive + "60" },
                    "&.Mui-focused fieldset": { borderColor: C.olive, borderWidth: 1.5 },
                  },
                  "& .MuiInputLabel-root": { fontSize: 12, color: C.sub, fontFamily: "'Vazirmatn', sans-serif" },
                  "& .MuiInputBase-input": { color: C.text },
                }}
              />
            )}
            <Box sx={{ display: "flex", gap: 1.2 }}>
              {[t("ui_b.managers.firstName"), t("ui_b.managers.lastName")].map((lbl, idx) => (
                <TextField key={lbl} size="small" fullWidth label={lbl}
                  value={idx === 0 ? form.first_name : form.last_name}
                  onChange={(e) => setForm({ ...form, [idx === 0 ? "first_name" : "last_name"]: e.target.value })}
                  sx={{
                    "& .MuiOutlinedInput-root": {
                      borderRadius: "10px", bgcolor: isDark ? "rgba(255,255,255,0.05)" : "#F5F5F5",
                      fontSize: 13, fontFamily: "'Vazirmatn', sans-serif", color: C.text,
                      "& fieldset": { borderColor: isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.12)" },
                      "&.Mui-focused fieldset": { borderColor: C.olive },
                    },
                    "& .MuiInputLabel-root": { fontSize: 12, color: C.sub },
                    "& .MuiInputBase-input": { color: C.text },
                  }}
                />
              ))}
            </Box>
            <TextField size="small" fullWidth label={t("ui_b.managers.phoneNumber")}
              value={form.phone_number}
              onChange={(e) => setForm({ ...form, phone_number: e.target.value })}
              sx={{
                "& .MuiOutlinedInput-root": {
                  borderRadius: "10px", bgcolor: isDark ? "rgba(255,255,255,0.05)" : "#F5F5F5",
                  fontSize: 13, fontFamily: "'Vazirmatn', sans-serif", color: C.text,
                  "& fieldset": { borderColor: isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.12)" },
                  "&.Mui-focused fieldset": { borderColor: C.olive },
                },
                "& .MuiInputLabel-root": { fontSize: 12, color: C.sub },
                "& .MuiInputBase-input": { color: C.text },
              }}
            />
          </Box>

          <Divider sx={{ borderColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)", mb: 2.5 }} />

          {/* ━━━ نقش ━━━ */}
          <Typography sx={{ fontSize: 12, fontWeight: 700, color: C.olive, mb: 1.5, fontFamily: "'Vazirmatn', sans-serif" }}>
            🎭 {t("ui_b.managers.roleTitle")}
          </Typography>

          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.8, mb: 1.5 }}>
            {Object.entries(ROLE_PRESETS).map(([key, preset]) => (
              <Chip
                key={key}
                label={`${preset.emoji} ${t(`ui_b.managers.roles.${key}`)}`}
                onClick={() => handleRoleChange(key)}
                sx={{
                  height: 34, fontSize: 12, fontWeight: form.role === key ? 700 : 500,
                  borderRadius: "10px", cursor: "pointer",
                  bgcolor: form.role === key ? (preset.color + "20") : (isDark ? "rgba(255,255,255,0.05)" : "#F0F0F0"),
                  color: form.role === key ? preset.color : (isDark ? "#AAA" : "#555"),
                  border: `2px solid ${form.role === key ? preset.color : (isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.1)")}`,
                  transition: "all 0.2s",
                  "&:hover": {
                    bgcolor: form.role === key ? (preset.color + "30") : (isDark ? "rgba(255,255,255,0.1)" : "#E8E8E8"),
                    transform: "translateY(-1px)",
                  },
                }}
              />
            ))}
          </Box>

          {form.role === "custom" && (
            <TextField size="small" fullWidth
              label={t("ui_b.managers.customRoleName")}
              placeholder={t("ui_b.managers.customRolePlaceholder")}
              value={form.customRole}
              onChange={(e) => setForm({ ...form, customRole: e.target.value })}
              sx={{
                mb: 2,
                "& .MuiOutlinedInput-root": {
                  borderRadius: "10px", bgcolor: isDark ? "rgba(255,255,255,0.05)" : "#F5F5F5",
                  fontSize: 13, fontFamily: "'Vazirmatn', sans-serif", color: C.text,
                  "& fieldset": { borderColor: isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.12)" },
                  "&.Mui-focused fieldset": { borderColor: C.olive },
                },
                "& .MuiInputLabel-root": { fontSize: 12, color: C.sub },
                "& .MuiInputBase-input": { color: C.text },
              }}
            />
          )}

          <Divider sx={{ borderColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)", mb: 2.5, mt: 2 }} />

          {/* ━━━ دسترسی‌ها ━━━ */}
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 2 }}>
            <Typography sx={{ fontSize: 12, fontWeight: 700, color: C.olive, fontFamily: "'Vazirmatn', sans-serif" }}>
              🔐 {t("ui_b.managers.accessTitle")}
            </Typography>
            <Chip size="small" label={`${activeCount} / ${totalTabs}`}
              sx={{
                height: 22, fontSize: 11, fontWeight: 700, borderRadius: "8px",
                bgcolor: activeCount > 0 ? C.olive + "25" : (isDark ? "rgba(255,255,255,0.08)" : "#F0F0F0"),
                color: activeCount > 0 ? C.olive : (isDark ? "#888" : "#999"),
              }} />
          </Box>

          {/* ── ۵ بخش اصلی ── */}
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1.2 }}>
            {GROUPS.map(({ name: group, icon, color }) => {
              const keys = Object.keys(ALL_TABS).filter((k) => ALL_TABS[k].group === group);
              const groupActive = keys.filter((k) => form.tabs[k]).length;
              const groupAll = keys.every((k) => form.tabs[k]);
              const groupBg = color + "12";

              return (
                <Box key={group} sx={{
                  border: `1.5px solid ${groupAll ? color + "50" : (isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.08)")}`,
                  borderRadius: "14px",
                  overflow: "hidden",
                  bgcolor: groupAll ? groupBg : "transparent",
                  transition: "all 0.2s ease",
                }}>
                  {/* هدر بخش */}
                  <Box
                    onClick={() => toggleGroup(group)}
                    sx={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      px: 2, py: 1.2, cursor: "pointer",
                      bgcolor: groupAll ? groupBg : (isDark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.02)"),
                      "&:hover": { bgcolor: groupBg },
                      transition: "all 0.15s",
                    }}
                  >
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                      <Box sx={{
                        width: 28, height: 28, borderRadius: "8px",
                        bgcolor: color + "20",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 14,
                      }}>
                        {icon}
                      </Box>
                      <Box>
                        <Typography sx={{
                          fontSize: 13, fontWeight: 700,
                          color: groupAll ? color : C.text,
                          fontFamily: "'Vazirmatn', sans-serif",
                        }}>
                          {t(`ui_b.managers.groups.${group}`)}
                        </Typography>
                        <Typography sx={{ fontSize: 10, color: C.sub }}>
                          {t("ui_b.managers.groupActive", { active: groupActive, total: keys.length })}
                        </Typography>
                      </Box>
                    </Box>
                    <Switch
                      size="small"
                      checked={groupAll}
                      onChange={() => toggleGroup(group)}
                      sx={{
                        "& .MuiSwitch-switchBase.Mui-checked": { color },
                        "& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track": { bgcolor: color },
                      }}
                    />
                  </Box>

                  {/* زیرمجموعه‌ها */}
                  <Box sx={{ px: 1.5, py: 0.8, display: "flex", flexWrap: "wrap", gap: 0.6 }}>
                    {keys.map((key) => (
                      <Chip
                        key={key}
                        label={`${ALL_TABS[key].icon} ${t(`ui_b.managers.tabs.${key}`)}`}
                        onClick={() => toggleTab(key)}
                        sx={{
                          height: 30, fontSize: 11,
                          fontWeight: form.tabs[key] ? 700 : 500,
                          borderRadius: "8px", cursor: "pointer",
                          bgcolor: form.tabs[key] ? (color + "25") : (isDark ? "rgba(255,255,255,0.04)" : "#F5F5F5"),
                          color: form.tabs[key] ? color : (isDark ? "#999" : "#888"),
                          border: `1.5px solid ${form.tabs[key] ? color + "50" : (isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.08)")}`,
                          transition: "all 0.15s",
                          "&:hover": {
                            bgcolor: form.tabs[key] ? (color + "35") : (isDark ? "rgba(255,255,255,0.08)" : "#EEE"),
                            transform: "translateY(-1px)",
                          },
                        }}
                      />
                    ))}
                  </Box>
                </Box>
              );
            })}
          </Box>
        </DialogContent>

        {/* ── فوتر ── */}
        <Box sx={{
          px: 3, py: 2,
          borderTop: `1px solid ${isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)"}`,
          bgcolor: isDark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.02)",
          display: "flex", justifyContent: "flex-end", gap: 1.5,
        }}>
          <Button onClick={() => setFormOpen(false)}
            sx={{
              borderRadius: "10px", fontSize: 12, fontWeight: 600, textTransform: "none",
              px: 3, py: 1, color: isDark ? "#AAA" : "#666",
              border: `1px solid ${isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.12)"}`,
              "&:hover": { bgcolor: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)" },
            }}>
            {t("ui_b.common.cancel")}
          </Button>
          <Button onClick={handleSave}
            disabled={saving || (form.role === "custom" && !form.customRole.trim())}
            sx={{
              borderRadius: "10px", fontSize: 12, fontWeight: 700, textTransform: "none",
              px: 4, py: 1, color: "#fff", background: C.btnGrad,
              boxShadow: `0 4px 16px ${C.olive}30`,
              opacity: saving ? 0.6 : 1,
              "&:hover": { transform: "translateY(-1px)", boxShadow: `0 6px 24px ${C.olive}40` },
            }}>
            {saving ? "..." : editUser ? t("ui_b.common.update") : t("ui_b.managers.createUser")}
          </Button>
        </Box>
      </Dialog>

      {/* ═══════ دیالوگ ریست رمز ═══════ */}
      <Dialog open={!!resetOpen} onClose={() => setResetOpen(null)} maxWidth="xs"
        slotProps={{
          paper: {
            sx: {
              borderRadius: "16px",
              bgcolor: isDark ? "#1A1B2E" : "#FFFFFF",
              border: `1px solid ${isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)"}`,
            },
          },
        }}
      >
        <Box sx={{
          px: 3, py: 2,
          bgcolor: isDark ? "rgba(107,155,110,0.1)" : "rgba(46,77,48,0.06)",
          borderBottom: `1px solid ${isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)"}`,
        }}>
          <Typography sx={{ fontSize: 14, fontWeight: 800, color: C.text, fontFamily: "'Vazirmatn', sans-serif" }}>
            🔑 {t("ui_b.managers.resetPassword")} — {resetOpen?.username}
          </Typography>
        </Box>
        <DialogContent sx={{ px: 3, py: 2.5 }}>
          <TextField size="small" fullWidth type="password"
            label={t("ui_b.managers.newPasswordLabel")}
            value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleResetPassword(); }}
            sx={{
              "& .MuiOutlinedInput-root": {
                borderRadius: "10px", bgcolor: isDark ? "rgba(255,255,255,0.05)" : "#F5F5F5",
                fontSize: 13, fontFamily: "'Vazirmatn', sans-serif", color: C.text,
                "& fieldset": { borderColor: isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.12)" },
                "&.Mui-focused fieldset": { borderColor: C.olive },
              },
              "& .MuiInputLabel-root": { fontSize: 12, color: C.sub },
              "& .MuiInputBase-input": { color: C.text },
            }}
          />
        </DialogContent>
        <Box sx={{ px: 3, py: 2, display: "flex", justifyContent: "flex-end", gap: 1.5, borderTop: `1px solid ${isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)"}` }}>
          <Button onClick={() => setResetOpen(null)}
            sx={{ borderRadius: "10px", fontSize: 12, fontWeight: 600, textTransform: "none", color: isDark ? "#AAA" : "#666", px: 2.5, py: 1 }}>
            {t("ui_b.common.cancel")}
          </Button>
          <Button onClick={handleResetPassword}
            sx={{ borderRadius: "10px", fontSize: 12, fontWeight: 700, textTransform: "none", px: 3, py: 1, color: "#fff", background: C.btnGrad }}>
            {t("ui_b.managers.changePassword")}
          </Button>
        </Box>
      </Dialog>
    </Box>
  );
}