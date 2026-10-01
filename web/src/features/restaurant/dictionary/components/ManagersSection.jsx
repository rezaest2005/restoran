import { useState, useEffect, useMemo } from "react";
import {
  Box,
  Typography,
  Button,
  TextField,
  Chip,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Switch,
  Select,
  MenuItem,
  FormControlLabel,
} from "@mui/material";
import {
  getUsers,
  createUser,
  updateUserRole,
  toggleUserActive,
  resetUserPassword,
  deleteUser,
  updateUserTabs,
} from "../../api/client";

// ═══════════════════════════════════════
//  دسترسی‌های قابل تنظیم (تب‌ها / سرویس‌ها)
// ═══════════════════════════════════════

const ALL_TABS = {
  // داشبورد
  dashboard: { label: "📊 داشبورد", group: "داشبورد" },

  // صندوق
  pos: { label: "💳 صندوق", group: "صندوق" },
  pos_report: { label: "📋 گزارش روز", group: "صندوق" },
  pos_settings: { label: "⚙️ تنظیمات صندوق", group: "صندوق" },

  // سفارشات
  orders: { label: "🧾 سفارشات", group: "سفارشات" },

  // آشپزخانه
  kitchen: { label: "🍳 آشپزخانه", group: "آشپزخانه" },
  kitchen_menu: { label: "📖 منوی آشپزخانه", group: "آشپزخانه" },
  kitchen_waste: { label: "🗑️ ضایعات آشپزخانه", group: "آشپزخانه" },

  // انبار
  inventory: { label: "📦 انبار", group: "انبار" },
  inventory_warehouse: { label: "🏪 مدیریت انبارها", group: "انبار" },
  inventory_receiving: { label: "🚚 تحویل بار", group: "انبار" },
  inventory_transfer: { label: "🔄 انتقال بین انبارها", group: "انبار" },
  inventory_waste: { label: "♻️ ضایعات انبار", group: "انبار" },
  inventory_adjustment: { label: "📝 اصلاح موجودی", group: "انبار" },
  inventory_purchase_list: { label: "🛒 لیست خرید", group: "انبار" },
  inventory_reports: { label: "📈 گزارشات انبار", group: "انبار" },

  // دیکشنری
  dictionary: { label: "📚 دیکشنری", group: "دیکشنری" },
  dictionary_menu: { label: "🍽️ منوی غذا", group: "دیکشنری" },
  dictionary_suppliers: { label: "🤝 تأمین‌کنندگان", group: "دیکشنری" },
  dictionary_warehouses: { label: "🏬 انبارها", group: "دیکشنری" },

  // مدیریت
  users: { label: "👥 مدیریت کاربران", group: "مدیریت" },
  reports: { label: "📊 گزارشات کلی", group: "مدیریت" },
  settings: { label: "🔧 تنظیمات", group: "مدیریت" },
};

// ═══════════════════════════════════════
//  نقش‌های پیش‌فرض — هر کدام دسترسی خودش را دارد
// ═══════════════════════════════════════

const ROLE_PRESETS = {
  owner: {
    label: "👑 مالک",
    description: "دسترسی کامل به همه بخش‌ها",
    tabs: Object.keys(ALL_TABS).reduce((acc, k) => ({ ...acc, [k]: true }), {}),
  },
  manager: {
    label: "👤 مدیر",
    description: "همه بخش‌ها به‌جز مدیریت کاربران و تنظیمات",
    tabs: {
      dashboard: true,
      pos: true, pos_report: true, pos_settings: true,
      orders: true,
      kitchen: true, kitchen_menu: true, kitchen_waste: true,
      inventory: true, inventory_warehouse: true, inventory_receiving: true,
      inventory_transfer: true, inventory_waste: true, inventory_adjustment: true,
      inventory_purchase_list: true, inventory_reports: true,
      dictionary: true, dictionary_menu: true, dictionary_suppliers: true,
      dictionary_warehouses: true,
      users: false, reports: true, settings: true,
    },
  },
  cashier: {
    label: "💳 صندوقدار",
    description: "صندوق، گزارش روز، سفارشات",
    tabs: {
      dashboard: true,
      pos: true, pos_report: true, pos_settings: false,
      orders: true,
      kitchen: false, kitchen_menu: false, kitchen_waste: false,
      inventory: false, inventory_warehouse: false, inventory_receiving: false,
      inventory_transfer: false, inventory_waste: false, inventory_adjustment: false,
      inventory_purchase_list: false, inventory_reports: false,
      dictionary: false, dictionary_menu: true, dictionary_suppliers: false,
      dictionary_warehouses: false,
      users: false, reports: false, settings: false,
    },
  },
  warehouse: {
    label: "📦 انباردار",
    description: "همه بخش‌های انبار + گزارشات",
    tabs: {
      dashboard: true,
      pos: false, pos_report: false, pos_settings: false,
      orders: false,
      kitchen: false, kitchen_menu: false, kitchen_waste: false,
      inventory: true, inventory_warehouse: true, inventory_receiving: true,
      inventory_transfer: true, inventory_waste: true, inventory_adjustment: true,
      inventory_purchase_list: true, inventory_reports: true,
      dictionary: true, dictionary_menu: false, dictionary_suppliers: true,
      dictionary_warehouses: true,
      users: false, reports: true, settings: false,
    },
  },
  kitchen: {
    label: "🍳 آشپزخانه",
    description: "آشپزخانه، منو، ضایعات، سفارشات",
    tabs: {
      dashboard: true,
      pos: false, pos_report: false, pos_settings: false,
      orders: true,
      kitchen: true, kitchen_menu: true, kitchen_waste: true,
      inventory: true, inventory_warehouse: false, inventory_receiving: false,
      inventory_transfer: false, inventory_waste: true, inventory_adjustment: false,
      inventory_purchase_list: false, inventory_reports: false,
      dictionary: false, dictionary_menu: true, dictionary_suppliers: false,
      dictionary_warehouses: false,
      users: false, reports: false, settings: false,
    },
  },
  customer: {
    label: "🧑 مشتری",
    description: "فقط مشاهده منو",
    tabs: {
      dashboard: true,
      pos: false, pos_report: false, pos_settings: false,
      orders: false,
      kitchen: false, kitchen_menu: false, kitchen_waste: false,
      inventory: false, inventory_warehouse: false, inventory_receiving: false,
      inventory_transfer: false, inventory_waste: false, inventory_adjustment: false,
      inventory_purchase_list: false, inventory_reports: false,
      dictionary: false, dictionary_menu: true, dictionary_suppliers: false,
      dictionary_warehouses: false,
      users: false, reports: false, settings: false,
    },
  },
  other: {
    label: "📝 سایر (سفارشی)",
    description: "نام شغل + دسترسی دلخواه",
    tabs: Object.keys(ALL_TABS).reduce((acc, k) => ({ ...acc, [k]: false }), {}),
  },
};

// ── helper: ساخت همه تب‌ها false ──
function allTabsFalse() {
  return Object.keys(ALL_TABS).reduce((acc, k) => ({ ...acc, [k]: false }), {});
}

// ═══════════════════════════════════════
//  کامپوننت اصلی
// ═══════════════════════════════════════

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
    customRole: "",          // ★ نام شغل سفارشی
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

  // ── انتخاب نقش → تنظیم خودکار تب‌ها ──
  const handleRoleChange = (role) => {
    const preset = ROLE_PRESETS[role];
    setForm((f) => ({
      ...f,
      role,
      customRole: role === "other" ? f.customRole : "",
      tabs: { ...preset.tabs },
    }));
  };

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
      customRole: "",
      tabs: { ...ROLE_PRESETS.cashier.tabs },
    });
    setFormOpen(true);
  };

  // ── ویرایش ──
  const openEdit = (u) => {
    setEditUser(u);
    const isCustom = !ROLE_PRESETS[u.role];
    setForm({
      username: u.username,
      password: "",
      phone_number: u.phone_number || "",
      first_name: u.first_name || "",
      last_name: u.last_name || "",
      role: isCustom ? "other" : (u.role || "cashier"),
      customRole: isCustom ? (u.role_display || u.role || "") : "",
      tabs: { ...allTabsFalse(), ...u.tabs },
    });
    setFormOpen(true);
  };

  // ── ذخیره ──
  const handleSave = async () => {
    if (saving) return;

    // اعتبارسنجی
    if (!form.username.trim()) {
      notify("نام کاربری الزامی است", "warning");
      return;
    }
    if (!editUser && !form.password) {
      notify("رمز عبور الزامی است", "warning");
      return;
    }
    if (form.role === "other" && !form.customRole.trim()) {
      notify("نام شغل سفارشی الزامی است", "warning");
      return;
    }

    setSaving(true);
    try {
      // نقش نهایی
      const finalRole = form.role === "other" ? form.customRole.trim().toLowerCase() : form.role;

      if (editUser) {
        if (finalRole !== editUser.role) {
          await updateUserRole({ user_id: editUser.id, role: finalRole });
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
          role: finalRole,
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
      const msg =
        err.response?.data?.error ||
        err.response?.data?.detail ||
        err.message ||
        "خطای ناشناخته";
      notify(msg, "error");
    } finally {
      setSaving(false);
    }
  };

  // ── فعال/غیرفعال ──
  const handleToggle = async (u) => {
    try {
      await toggleUserActive({ user_id: u.id });
      notify(`کاربر «${u.username}» ${!u.is_active ? "فعال" : "غیرفعال"} شد`, "success");
      load();
    } catch (err) {
      notify(err.response?.data?.error || err.message || "خطا", "error");
    }
  };

  // ── حذف ──
  const handleDelete = async (u) => {
    if (!window.confirm(`کاربر «${u.username}» حذف شود؟`)) return;
    try {
      await deleteUser({ user_id: u.id });
      notify(`کاربر «${u.username}» حذف شد`, "success");
      load();
    } catch (err) {
      notify(err.response?.data?.error || err.message || "خطا", "error");
    }
  };

  // ── ریست رمز ──
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
      notify(err.response?.data?.error || err.message || "خطا", "error");
    }
  };

  // ── تغییر تک تب ──
  const toggleTab = (key) => {
    setForm((f) => ({ ...f, tabs: { ...f.tabs, [key]: !f.tabs[key] } }));
  };

  // ── فعال/غیرفعال کل گروه ──
  const toggleGroup = (group) => {
    const groupKeys = Object.keys(ALL_TABS).filter((k) => ALL_TABS[k].group === group);
    const allOn = groupKeys.every((k) => form.tabs[k]);
    setForm((f) => ({
      ...f,
      tabs: { ...f.tabs, ...groupKeys.reduce((acc, k) => ({ ...acc, [k]: !allOn }), {}) },
    }));
  };

  const inputSx = {
    "& .MuiOutlinedInput-root": {
      borderRadius: "12px",
      bgcolor: C.inputBg,
      backdropFilter: "blur(8px)",
      fontSize: 13,
      fontFamily: "'Vazirmatn', 'Plus Jakarta Sans', sans-serif",
      color: C.text,
      transition: "all 0.25s ease",
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
    maxWidth: 560,
    width: "100%",
  };

  // ── شمارش تب‌های فعال ──
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
      {/* هدر */}
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2.5, flexWrap: "wrap", gap: 1.5 }}>
        <Box>
          <Typography sx={{ fontSize: { xs: 16, sm: 18 }, fontWeight: 800, color: C.text }}>
            👥 مدیریت کاربران
          </Typography>
          <Typography sx={{ fontSize: 12, color: C.sub, mt: 0.3 }}>
            افزودن، ویرایش و تعیین دسترسی‌های سرویس‌ها (صندوق، انبار، آشپزخانه، ...)
          </Typography>
        </Box>
        <Button
          onClick={openCreate}
          sx={{
            borderRadius: "12px", fontSize: 12, fontWeight: 700, textTransform: "none",
            px: 2.5, py: 1, color: "#fff", background: C.btnGrad,
            boxShadow: `0 4px 20px ${C.olive}30`,
            "&:hover": { transform: "translateY(-1px)", boxShadow: `0 6px 28px ${C.olive}40` },
          }}
        >
          ➕ کاربر جدید
        </Button>
      </Box>

      {/* جستجو */}
      <TextField
        size="small"
        placeholder="جستجو کاربر..."
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
          {filtered.map((u, i) => (
            <Box
              key={u.id}
              sx={{
                display: "flex", alignItems: "center", flexWrap: "wrap", gap: 1,
                px: { xs: 1.5, sm: 2 }, py: { xs: 1, sm: 1.5 },
                borderRadius: "12px", bgcolor: C.glass, backdropFilter: "blur(12px)",
                border: `1px solid ${u.is_active ? C.glassBorder : C.danger + "30"}`,
                opacity: 0,
                animation: `fadeUp 0.35s ease-out ${i * 0.04}s forwards`,
                "&:hover": { bgcolor: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.02)" },
              }}
            >
              <Box sx={{ flex: 1, minWidth: 140 }}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
                  <Typography sx={{ fontSize: 13, fontWeight: 700, color: C.text }}>
                    {u.username}
                  </Typography>
                  <Typography sx={{ fontSize: 11, color: C.sub }}>
                    {u.first_name} {u.last_name}
                  </Typography>
                  <Chip
                    size="small"
                    label={u.role_display || u.role}
                    sx={{ height: 18, fontSize: 9, fontWeight: 600, borderRadius: "5px", bgcolor: C.oliveSubtle, color: C.olive }}
                  />
                  {!u.is_active && (
                    <Chip size="small" label="غیرفعال"
                      sx={{ height: 18, fontSize: 9, fontWeight: 600, borderRadius: "5px", bgcolor: C.dangerBg, color: C.danger }}
                    />
                  )}
                </Box>
                <Box sx={{ display: "flex", gap: 0.5, mt: 0.5, flexWrap: "wrap" }}>
                  {Object.entries(u.tabs || {}).filter(([, v]) => v).map(([k]) => (
                    <Chip
                      key={k}
                      size="small"
                      label={ALL_TABS[k]?.label || k}
                      sx={{
                        height: 17, fontSize: 8, fontWeight: 600, borderRadius: "4px",
                        bgcolor: C.oliveSubtle, color: C.olive,
                        border: `1px solid ${C.olive}30`,
                      }}
                    />
                  ))}
                  {Object.values(u.tabs || {}).filter(Boolean).length === 0 && (
                    <Typography sx={{ fontSize: 10, color: C.muted }}>بدون دسترسی</Typography>
                  )}
                </Box>
              </Box>

              <Box sx={{ display: "flex", gap: 0.5, flexShrink: 0 }}>
                {[
                  { icon: "✏️", label: "ویرایش", color: C.olive, hoverBg: C.oliveSubtle, onClick: () => openEdit(u) },
                  { icon: "🔑", label: "ریست رمز", color: C.olive, hoverBg: C.oliveSubtle, onClick: () => { setResetOpen(u); setNewPassword(""); } },
                  { icon: u.is_active ? "🚫" : "✅", label: u.is_active ? "غیرفعال" : "فعال", color: u.is_active ? C.danger : C.olive, hoverBg: u.is_active ? C.dangerBg : C.oliveSubtle, onClick: () => handleToggle(u) },
                  { icon: "🗑️", label: "حذف", color: C.danger, hoverBg: C.dangerBg, onClick: () => handleDelete(u) },
                ].map((btn) => (
                  <Box
                    key={btn.label}
                    onClick={btn.onClick}
                    sx={{
                      display: "flex", flexDirection: "column", alignItems: "center",
                      gap: 0.3, px: 1, py: 0.5, borderRadius: "8px", cursor: "pointer",
                      color: btn.color, transition: "all 0.2s ease",
                      "&:hover": { bgcolor: btn.hoverBg },
                    }}
                  >
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
        open={formOpen}
        onClose={() => setFormOpen(false)}
        maxWidth="sm"
        fullWidth
        slotProps={{ paper: { sx: dialogPaperSx } }}
      >
        <DialogTitle sx={{ fontSize: 15, fontWeight: 800, color: C.text }}>
          {editUser ? `✏️ ویرایش ${editUser.username}` : "➕ کاربر جدید"}
        </DialogTitle>

        <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 1.5, pt: "12px !important" }}>

          {/* ── اطلاعات کاربر ── */}
          <TextField
            size="small" label="نام کاربری" value={form.username}
            disabled={!!editUser}
            onChange={(e) => setForm({ ...form, username: e.target.value })}
            sx={inputSx}
          />
          {!editUser && (
            <TextField
              size="small" label="رمز عبور" type="password" value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              sx={inputSx}
            />
          )}
          <Box sx={{ display: "flex", gap: 1 }}>
            <TextField size="small" label="نام" value={form.first_name}
              onChange={(e) => setForm({ ...form, first_name: e.target.value })}
              sx={{ ...inputSx, flex: 1 }}
            />
            <TextField size="small" label="نام خانوادگی" value={form.last_name}
              onChange={(e) => setForm({ ...form, last_name: e.target.value })}
              sx={{ ...inputSx, flex: 1 }}
            />
          </Box>
          <TextField size="small" label="شماره تلفن" value={form.phone_number}
            onChange={(e) => setForm({ ...form, phone_number: e.target.value })}
            sx={inputSx}
          />

          {/* ── انتخاب نقش ── */}
          <Box>
            <Typography sx={{ fontSize: 11, fontWeight: 700, color: C.sub, mb: 0.5 }}>
              شغل / نقش
            </Typography>
            <Select
              size="small" fullWidth value={form.role}
              onChange={(e) => handleRoleChange(e.target.value)}
              sx={{ ...inputSx, fontSize: 13 }}
            >
              {Object.entries(ROLE_PRESETS).map(([key, preset]) => (
                <MenuItem key={key} value={key}>
                  <Box>
                    <Typography sx={{ fontSize: 13, fontWeight: 600 }}>{preset.label}</Typography>
                    <Typography sx={{ fontSize: 10, color: C.muted }}>{preset.description}</Typography>
                  </Box>
                </MenuItem>
              ))}
            </Select>
          </Box>

          {/* ── نام شغل سفارشی (فقط وقتی "سایر" انتخاب شده) ── */}
          {form.role === "other" && (
            <TextField
              size="small"
              label="نام شغل سفارشی"
              placeholder="مثلاً: منشی، حسابدار، نظافتچی..."
              value={form.customRole}
              onChange={(e) => setForm({ ...form, customRole: e.target.value })}
              sx={inputSx}
            />
          )}

          {/* ── دسترسی‌ها — تب‌ها به تفکیک گروه ── */}
          <Box sx={{ border: `1px solid ${C.glassBorder}`, borderRadius: "12px", overflow: "hidden" }}>

            {/* شمارنده */}
            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", px: 2, py: 1, bgcolor: C.oliveSubtle, borderBottom: `1px solid ${C.glassBorder}` }}>
              <Typography sx={{ fontSize: 12, fontWeight: 700, color: C.text }}>
                🔐 دسترسی‌ها
              </Typography>
              <Chip
                size="small"
                label={`${activeCount} از ${totalTabs}`}
                sx={{ height: 20, fontSize: 10, fontWeight: 700, bgcolor: activeCount > 0 ? C.olive + "20" : C.muted + "20", color: activeCount > 0 ? C.olive : C.muted }}
              />
            </Box>

            {/* گروه‌ها */}
            {Object.entries(
              Object.entries(ALL_TABS).reduce((groups, [key, tab]) => {
                if (!groups[tab.group]) groups[tab.group] = [];
                groups[tab.group].push(key);
                return groups;
              }, {})
            ).map(([group, keys]) => {
              const groupActive = keys.filter((k) => form.tabs[k]).length;
              const groupAll = keys.every((k) => form.tabs[k]);

              return (
                <Box key={group} sx={{ borderBottom: `1px solid ${C.glassBorder}`, "&:last-child": { borderBottom: "none" } }}>
                  {/* هدر گروه — کلیک = همه روشن/خاموش */}
                  <Box
                    onClick={() => toggleGroup(group)}
                    sx={{
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                      px: 2, py: 0.8, cursor: "pointer",
                      bgcolor: groupAll ? C.oliveSubtle : "transparent",
                      "&:hover": { bgcolor: C.oliveSubtle },
                    }}
                  >
                    <Typography sx={{ fontSize: 11, fontWeight: 700, color: groupAll ? C.olive : C.sub }}>
                      {groupAll ? "☑" : "☐"} {group}
                    </Typography>
                    <Chip
                      size="small"
                      label={`${groupActive}/${keys.length}`}
                      sx={{ height: 16, fontSize: 8, fontWeight: 600, bgcolor: "transparent", color: C.muted }}
                    />
                  </Box>

                  {/* تب‌های گروه */}
                  <Box sx={{ px: 2, pb: 1 }}>
                    {keys.map((key) => (
                      <FormControlLabel
                        key={key}
                        control={
                          <Switch
                            size="small"
                            checked={!!form.tabs[key]}
                            onChange={() => toggleTab(key)}
                            sx={{
                              "& .MuiSwitch-switchBase.Mui-checked": { color: C.olive },
                              "& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track": { bgcolor: C.olive },
                            }}
                          />
                        }
                        label={
                          <Typography sx={{ fontSize: 11, color: form.tabs[key] ? C.text : C.muted }}>
                            {ALL_TABS[key].label}
                          </Typography>
                        }
                        sx={{
                          display: "flex",
                          justifyContent: "space-between",
                          m: 0, my: 0.2,
                          opacity: form.tabs[key] ? 1 : 0.6,
                          transition: "opacity 0.2s",
                        }}
                      />
                    ))}
                  </Box>
                </Box>
              );
            })}
          </Box>
        </DialogContent>

        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button
            onClick={() => setFormOpen(false)}
            sx={{ borderRadius: "10px", fontSize: 12, textTransform: "none", color: C.sub }}
          >
            انصراف
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving || (form.role === "other" && !form.customRole.trim())}
            sx={{
              borderRadius: "10px", fontSize: 12, fontWeight: 700, textTransform: "none",
              px: 2.5, color: "#fff", background: C.btnGrad,
              opacity: saving ? 0.6 : 1,
            }}
          >
            {saving ? "..." : editUser ? "بروزرسانی" : "ایجاد"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── دیالوگ ریست رمز ── */}
      <Dialog
        open={!!resetOpen}
        onClose={() => setResetOpen(null)}
        maxWidth="xs"
        slotProps={{ paper: { sx: { ...dialogPaperSx, maxWidth: 380 } } }}
      >
        <DialogTitle sx={{ fontSize: 15, fontWeight: 800, color: C.text }}>
          🔑 ریست رمز — {resetOpen?.username}
        </DialogTitle>
        <DialogContent sx={{ pt: "12px !important" }}>
          <TextField
            size="small" fullWidth type="password"
            label="رمز جدید (حداقل ۴ کاراکتر)"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            sx={inputSx}
            onKeyDown={(e) => { if (e.key === "Enter") handleResetPassword(); }}
          />
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