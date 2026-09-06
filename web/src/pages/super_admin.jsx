import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Box, Typography, Button, IconButton, TextField, Select, MenuItem,
  FormControl, InputLabel, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Chip, Switch, Dialog,
  DialogTitle, DialogContent, DialogActions, Snackbar, Alert,
  InputAdornment, Drawer, useMediaQuery, useTheme, Checkbox,
  CircularProgress, Divider,
} from "@mui/material";
import { useThemeMode } from "../contexts/ThemeContext";
import { useLang } from "../contexts/LangContext";
import superClient from "../api/super_client";

/* ═══════════════════════════════════════
   Constants
═══════════════════════════════════════ */

const NAV_SECTIONS = [
  { titleKey: "super.nav.management", items: [{ icon: "📊", labelKey: "super.nav.dashboard", path: "/super" }] },
  { titleKey: "super.nav.restaurant", items: [
    { icon: "🏠", labelKey: "super.nav.main_dashboard", path: "/dashboard" },
    { icon: "📖", labelKey: "super.nav.dictionary", path: "/dashboard/dictionary" },
    { icon: "🍽️", labelKey: "super.nav.food_menu", path: "/dashboard/foods" },
    { icon: "💰", labelKey: "super.nav.pos", path: "/dashboard/pos" },
    { icon: "📋", labelKey: "super.nav.orders", path: "/dashboard/orders" },
  ]},
  { titleKey: "super.nav.warehouse", items: [
    { icon: "🧾", labelKey: "super.nav.purchase_invoice", path: "/dashboard/invoices/create" },
    { icon: "🥕", labelKey: "super.nav.raw_materials", path: "/dashboard/raw-materials" },
    { icon: "🥘", labelKey: "super.nav.semi_finished", path: "/dashboard/semi-finished" },
    { icon: "📦", labelKey: "super.nav.ready_materials", path: "/dashboard/ready-materials" },
    { icon: "📝", labelKey: "super.nav.usage_log", path: "/dashboard/usage-log" },
    { icon: "📋", labelKey: "super.nav.recipes", path: "/dashboard/recipes" },
    { icon: "👨‍🍳", labelKey: "super.nav.kitchen", path: "/dashboard/kitchen" },
  ]},
  { titleKey: "super.nav.customers", items: [
    { icon: "🏆", labelKey: "super.nav.loyalty", path: "/dashboard/loyalty" },
    { icon: "👥", labelKey: "super.nav.customer_list", path: "/dashboard/loyalty/customers" },
    { icon: "🎟️", labelKey: "super.nav.coupons", path: "/dashboard/loyalty/coupons" },
    { icon: "🎁", labelKey: "super.nav.rewards", path: "/dashboard/loyalty/rewards" },
  ]},
  { titleKey: "super.nav.settings", items: [
    { icon: "📝", labelKey: "super.nav.recipe_manager", path: "/dashboard/recipes/manager" },
    { icon: "📑", labelKey: "super.nav.invoices", path: "/dashboard/invoices" },
    { icon: "⚙️", labelKey: "super.nav.django_admin", path: "/admin/" },
  ]},
];

const PERM_ITEMS = [
  { code: "home", labelKey: "super.perm.home" }, { code: "dictionary", labelKey: "super.perm.dictionary" },
  { code: "foods", labelKey: "super.perm.foods" }, { code: "pos", labelKey: "super.perm.pos" },
  { code: "orders", labelKey: "super.perm.orders" }, { code: "invoices", labelKey: "super.perm.invoices" },
  { code: "raw_materials", labelKey: "super.perm.raw_materials" }, { code: "semi_finished", labelKey: "super.perm.semi_finished" },
  { code: "ready_materials", labelKey: "super.perm.ready_materials" }, { code: "usage_log", labelKey: "super.perm.usage_log" },
  { code: "recipes", labelKey: "super.perm.recipes" }, { code: "kitchen", labelKey: "super.perm.kitchen" },
  { code: "loyalty", labelKey: "super.perm.loyalty" }, { code: "loyalty_customers", labelKey: "super.perm.loyalty_customers" },
  { code: "loyalty_coupons", labelKey: "super.perm.loyalty_coupons" }, { code: "loyalty_rewards", labelKey: "super.perm.loyalty_rewards" },
  { code: "loyalty_notifications", labelKey: "super.perm.loyalty_notifications" }, { code: "loyalty_register", labelKey: "super.perm.loyalty_register" },
  { code: "users", labelKey: "super.perm.users" }, { code: "warehouse", labelKey: "super.perm.warehouse" },
  { code: "ready", labelKey: "super.perm.ready" }, { code: "reports", labelKey: "super.perm.reports" },
];

const ROLE_OPTIONS = [
  { value: "owner", labelKey: "super.role.owner" }, { value: "manager", labelKey: "super.role.manager" },
  { value: "cashier", labelKey: "super.role.cashier" }, { value: "kitchen", labelKey: "super.role.kitchen" },
  { value: "warehouse", labelKey: "super.role.warehouse" }, { value: "customer", labelKey: "super.role.customer" },
];

export default function SuperAdmin() {
  const { mode, toggleTheme } = useThemeMode();
  const { isRtl, toggleLang, lang } = useLang();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const muiTheme = useTheme();
  const isMobile = useMediaQuery(muiTheme.breakpoints.down("md"));
  const isSmall = useMediaQuery(muiTheme.breakpoints.down("sm"));
  const isDark = mode === "dark";
  

  const [mounted, setMounted] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeTab, setActiveTab] = useState(0);
  const [stats, setStats] = useState(null);
  const [tenants, setTenants] = useState([]);
  const [selectedTenantId, setSelectedTenantId] = useState(null);
  const [services, setServices] = useState([]);
  const [servicesLoading, setServicesLoading] = useState(false);
  const [users, setUsers] = useState([]);
  const [usersPage, setUsersPage] = useState(1);
  const [usersPages, setUsersPages] = useState(1);
  const [usersLoading, setUsersLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const [userFilterRest, setUserFilterRest] = useState("");
  const [userFilterRole, setUserFilterRole] = useState("");
  const [focusedField, setFocusedField] = useState(null);

  const [tenantModal, setTenantModal] = useState({ open: false, editId: null });
  const [deleteModal, setDeleteModal] = useState({ open: false, type: "", id: null, name: "" });
  const [userModal, setUserModal] = useState({ open: false, editId: null });
  const [permsModal, setPermsModal] = useState({ open: false, userId: null, username: "" });
  const [toast, setToast] = useState({ open: false, message: "", type: "info" });

  const [tenantForm, setTenantForm] = useState({ name: "", slug: "", owner_username: "", owner_password: "", owner_name: "", phone: "", address: "" });
  const [userForm, setUserForm] = useState({ username: "", password: "", first_name: "", last_name: "", phone_number: "", role: "", restaurant_id: "", is_active: true, is_approved: true });
  const [userPerms, setUserPerms] = useState([]);

  const currentUser = useMemo(() => {
    try { return JSON.parse(localStorage.getItem("super_user") || "{}"); } catch { return {}; }
  }, []);

  const C = useMemo(() => ({
    bg: isDark ? "#0B0A0B" : "#E4E8F0",
    bgWarm: isDark
      ? "radial-gradient(ellipse at 25% 15%, rgba(61,90,62,0.07) 0%, transparent 50%), radial-gradient(ellipse at 75% 85%, rgba(120,30,58,0.06) 0%, transparent 50%)"
      : "radial-gradient(ellipse at 15% 10%, rgba(80,100,160,0.1) 0%, transparent 45%), radial-gradient(ellipse at 85% 85%, rgba(120,40,70,0.08) 0%, transparent 40%)",
    glass: isDark ? "#101210" : "#F0F4FC",
    glassBorder: isDark ? "#1F2A1F" : "#D1DAE8",
    olive: isDark ? "#6B9B6E" : "#2E4D30",
    oliveLight: isDark ? "#8BB88E" : "#3D5A3E",
    oliveSubtle: isDark ? "rgba(107,155,110,0.08)" : "rgba(46,77,48,0.08)",
    text: isDark ? "#F0ECE8" : "#1A1A24",
    sub: isDark ? "#8A8588" : "#555568",
    muted: isDark ? "#4A4548" : "#8A8A9E",
    inputBg: isDark ? "#0F0E0F" : "#F6F8FC",
    inputFocusGlow: isDark ? "0 0 0 3px rgba(107,155,110,0.12)" : "0 0 0 3px rgba(46,77,48,0.1)",
    btnGrad: isDark ? "#3D6B40" : "#2E4D30",
    btnHover: isDark ? "#4A7A4D" : "#3D5A3E",
    btnShadow: isDark ? "0 4px 14px rgba(0,0,0,0.3)" : "0 4px 14px rgba(46,77,48,0.2)",
    danger: isDark ? "#E84057" : "#C83048",
    dangerBg: isDark ? "rgba(232,64,87,0.12)" : "rgba(200,48,72,0.1)",
    success: isDark ? "#6B9B6E" : "#2E4D30",
    successBg: isDark ? "rgba(107,155,110,0.12)" : "rgba(46,77,48,0.1)",
    warning: isDark ? "#D4B76A" : "#A08040",
    warningBg: isDark ? "rgba(212,183,106,0.12)" : "rgba(160,128,64,0.1)",
    info: isDark ? "#5B8FD4" : "#4070B8",
    infoBg: isDark ? "rgba(91,143,212,0.12)" : "rgba(64,112,184,0.1)",
    sidebarBg: isDark ? "#080708" : "#E8ECF4",
    sidebarBorder: isDark ? "#161A16" : "#D1DAE8",
    headerBg: isDark ? "#0A090A" : "#E8ECF4",
    headerBorder: isDark ? "#161A16" : "#D1DAE8",
    tableHeaderBg: isDark ? "#0F110F" : "#EDF1F8",
    tableRowHover: isDark ? "rgba(107,155,110,0.04)" : "rgba(46,77,48,0.04)",
    tableRowSelected: isDark ? "rgba(107,155,110,0.08)" : "rgba(46,77,48,0.08)",
  }), [isDark]);

  const inputSx = useCallback((field) => ({
    "& .MuiOutlinedInput-root": {
      borderRadius: "12px", fontFamily: "'Vazirmatn', sans-serif", bgcolor: C.inputBg,
      fontSize: "13px", transition: "all 0.2s ease",
      "& fieldset": { borderColor: focusedField === field ? C.olive : C.glassBorder },
      "&:hover fieldset": { borderColor: C.oliveLight },
      "&.Mui-focused fieldset": { borderColor: C.olive, borderWidth: 1.5 },
      "&.Mui-focused": { boxShadow: C.inputFocusGlow },
    },
    "& .MuiInputLabel-root": { fontFamily: "'Vazirmatn', sans-serif", fontSize: "12px", fontWeight: 600, color: C.sub, "&.Mui-focused": { color: C.olive } },
    "& .MuiInputBase-input": { fontFamily: "'Vazirmatn', sans-serif", fontSize: "13px" },
  }), [C, focusedField]);

  const selectSx = { borderRadius: "12px", fontSize: "12px", bgcolor: C.inputBg, color: C.text, fontFamily: "'Vazirmatn', sans-serif", height: 38, "& .MuiOutlinedInput-notchedOutline": { borderColor: C.glassBorder }, "&:hover .MuiOutlinedInput-notchedOutline": { borderColor: C.oliveLight }, "&.Mui-focused .MuiOutlinedInput-notchedOutline": { borderColor: C.olive } };
  const menuPaperSx = { bgcolor: C.glass, border: `1px solid ${C.glassBorder}`, borderRadius: "12px", boxShadow: C.btnShadow };

  const showToast = useCallback((message, type = "info") => { setToast({ open: true, message, type }); }, []);

  /* ── API Functions ── */
  const loadStats = useCallback(async () => {
    try { const { data } = await superClient.get("/api/super/stats/"); setStats(data); } 
    catch (err) { if (err.response?.status === 401 || err.response?.status === 403) navigate("/super/login"); }
  }, [navigate]);

  const loadTenants = useCallback(async () => {
    try { const { data } = await superClient.get("/api/super/tenants/"); setTenants(data.tenants || []); } 
    catch (err) { if (err.response?.status === 401 || err.response?.status === 403) navigate("/super/login"); }
  }, [navigate]);

  const loadServices = useCallback(async (tenantId) => {
    setServicesLoading(true);
    try { const { data } = await superClient.get(`/api/super/tenants/${tenantId}/services/`); setServices(data.services || []); } 
    catch { showToast(t("super.error.load_services"), "error"); } 
    finally { setServicesLoading(false); }
  }, [showToast, t]);

  const loadUsers = useCallback(async (page = 1) => {
    setUsersLoading(true); setUsersPage(page);
    try {
      let params = `?page=${page}`;
      if (userSearch) params += `&search=${encodeURIComponent(userSearch)}`;
      if (userFilterRest) params += `&restaurant_id=${userFilterRest}`;
      if (userFilterRole) params += `&role=${userFilterRole}`;
      const { data } = await superClient.get(`/api/super/users/${params}`);
      setUsers(data.users || []); setUsersPages(data.pages || 1);
    } catch (err) { if (err.response?.status === 401 || err.response?.status === 403) navigate("/super/login"); } 
    finally { setUsersLoading(false); }
  }, [userSearch, userFilterRest, userFilterRole, navigate]);

  /* ── Handlers ── */
  const handleSelectTenant = useCallback((id) => { setSelectedTenantId(id); loadServices(id); }, [loadServices]);
  const updateService = useCallback((sid, field, value) => { setServices(prev => prev.map(s => s.service_id === sid ? { ...s, [field]: value } : s)); }, []);
  
  const handleSaveServices = useCallback(async () => {
    if (!selectedTenantId) return;
    try {
      const payload = services.map(s => ({ service_id: s.service_id, is_enabled: s.is_enabled, price: parseInt(s.price) || 0, start_date: s.start_date || null, end_date: s.end_date || null }));
      const { data } = await superClient.post(`/api/super/tenants/${selectedTenantId}/services/`, { services: payload });
      if (data.ok) { showToast(data.msg || t("super.success.saved"), "success"); loadTenants(); }
      else showToast(data.error || t("super.error.generic"), "error");
    } catch { showToast(t("super.error.save"), "error"); }
  }, [selectedTenantId, services, showToast, t, loadTenants]);

  const handleOpenAddTenant = useCallback(() => { setTenantForm({ name: "", slug: "", owner_username: "", owner_password: "", owner_name: "", phone: "", address: "" }); setTenantModal({ open: true, editId: null }); }, []);
  const handleEditTenant = useCallback((id) => { const tn = tenants.find(x => x.id === id); if (!tn) return; setTenantForm({ name: tn.name, slug: tn.slug, owner_username: "", owner_password: "", owner_name: tn.owner_name, phone: tn.phone, address: tn.address || "" }); setTenantModal({ open: true, editId: id }); }, [tenants]);

  const handleSaveTenant = useCallback(async () => {
    const { editId } = tenantModal; 
    const payload = { ...tenantForm };
    
    if (!editId) { 
      if (!payload.owner_username) { showToast(t("super.error.owner_username_required"), "error"); return; } 
    } else { 
      delete payload.owner_username; 
      if (!payload.owner_password) delete payload.owner_password; 
    }
    
    if (!payload.name) { showToast(t("super.error.name_required"), "error"); return; }
    if (!payload.slug) { showToast(t("super.error.slug_required"), "error"); return; }
    
    try {
      const res = editId 
        ? await superClient.put(`/api/super/tenants/${editId}/`, payload) 
        : await superClient.post("/api/super/tenants/", payload);
      const d = res.data;
      
      if (d.ok || d.tenant_id) { 
        showToast(d.msg || t("super.success.saved"), "success"); 
        setTenantModal({ open: false, editId: null }); 
        loadTenants(); 
        
        // ★ هدایت به صفحه لاگین رستوران با slug و یوزرنیم مالک
        if (!editId && payload.owner_username && payload.slug) {
          setTimeout(() => {
            navigate(`/${payload.slug}/dashboard/login?username=${encodeURIComponent(payload.owner_username)}`);
          }, 1000);
        }
      } else {
        showToast(d.error || t("super.error.generic"), "error");
      }
    } catch { 
      showToast(t("super.error.save"), "error"); 
    }
  }, [tenantModal, tenantForm, showToast, t, loadTenants, navigate]);
  const handleDeleteTenant = useCallback(async () => {
    if (!deleteModal.id) return;
    try {
      const { data } = await superClient.delete(`/api/super/tenants/${deleteModal.id}/`);
      if (data.ok) { showToast(data.msg || t("super.success.deleted"), "success"); setDeleteModal({ open: false, type: "", id: null, name: "" }); if (selectedTenantId === deleteModal.id) { setSelectedTenantId(null); setServices([]); } loadTenants(); }
      else showToast(data.error || t("super.error.generic"), "error");
    } catch { showToast(t("super.error.delete"), "error"); }
  }, [deleteModal, selectedTenantId, showToast, t, loadTenants]);

  const handleOpenAddUser = useCallback(() => { setUserForm({ username: "", password: "", first_name: "", last_name: "", phone_number: "", role: "", restaurant_id: "", is_active: true, is_approved: true }); setUserModal({ open: true, editId: null }); }, []);
  const handleEditUser = useCallback(async (id) => {
    try { const { data } = await superClient.get(`/api/super/users/${id}/`); setUserForm({ username: data.username, password: "", first_name: data.first_name || "", last_name: data.last_name || "", phone_number: data.phone_number || "", role: data.role || "", restaurant_id: data.restaurant_id || "", is_active: data.is_active, is_approved: data.is_approved }); setUserModal({ open: true, editId: id }); } 
    catch { showToast(t("super.error.load_user"), "error"); }
  }, [showToast, t]);

  const handleSaveUser = useCallback(async () => {
    const { editId } = userModal; const payload = { ...userForm };
    if (!editId) { if (!payload.username) { showToast(t("super.error.username_required"), "error"); return; } if (!payload.password) { showToast(t("super.error.password_required"), "error"); return; } } 
    else { if (!payload.password) delete payload.password; }
    if (!payload.role) { showToast(t("super.error.role_required"), "error"); return; }
    if (!payload.restaurant_id) { showToast(t("super.error.restaurant_required"), "error"); return; }
    payload.restaurant_id = parseInt(payload.restaurant_id) || null;
    try {
      const res = editId ? await superClient.put(`/api/super/users/${editId}/`, payload) : await superClient.post("/api/super/users/create/", payload);
      if (res.data.ok) { 
        showToast(res.data.msg || t("super.success.saved"), "success"); 
        setUserModal({ open: false, editId: null }); 
        loadUsers(usersPage); 
        
        // ★ هدایت به صفحه لاگین رستوران با پاس دادن یوزرنیم
        if (!editId) {
          setTimeout(() => {
            navigate(`/dashboard/login?username=${encodeURIComponent(payload.username)}`);
          }, 1000);
        }
      }
      else showToast(res.data.error || t("super.error.generic"), "error");
    } catch { showToast(t("super.error.save"), "error"); }
  }, [userModal, userForm, usersPage, showToast, t, loadUsers, navigate]);
  const handleDeleteUser = useCallback(async () => {
    if (!deleteModal.id) return;
    try { const { data } = await superClient.delete(`/api/super/users/${deleteModal.id}/`); if (data.ok) { showToast(data.msg || t("super.success.deleted"), "success"); setDeleteModal({ open: false, type: "", id: null, name: "" }); loadUsers(usersPage); } else showToast(data.error || t("super.error.generic"), "error"); } 
    catch { showToast(t("super.error.delete"), "error"); }
  }, [deleteModal, usersPage, showToast, t, loadUsers]);

  const handleOpenPerms = useCallback(async (id) => {
    try { const { data } = await superClient.get(`/api/super/users/${id}/`); setUserPerms(data.effective_permissions || data.dashboard_permissions || []); setPermsModal({ open: true, userId: id, username: data.username }); } 
    catch { showToast(t("super.error.generic"), "error"); }
  }, [showToast, t]);

  const handleSavePerms = useCallback(async () => {
    if (!permsModal.userId) return;
    try { const { data } = await superClient.put(`/api/super/users/${permsModal.userId}/permissions/`, { dashboard_permissions: userPerms }); if (data.ok) { showToast(data.msg || t("super.success.saved"), "success"); setPermsModal({ open: false, userId: null, username: "" }); loadUsers(usersPage); } else showToast(data.error || t("super.error.generic"), "error"); } 
    catch { showToast(t("super.error.save"), "error"); }
  }, [permsModal, userPerms, usersPage, showToast, t, loadUsers]);

  const togglePerm = useCallback((code) => { setUserPerms(prev => prev.includes(code) ? prev.filter(p => p !== code) : [...prev, code]); }, []);
  const handleLogout = useCallback(async () => { try { await superClient.post("/api/super/logout/"); } catch {} localStorage.removeItem("super_token"); localStorage.removeItem("super_user"); navigate("/super/login"); }, [navigate]);
  const copySlug = useCallback((slug) => { navigator.clipboard.writeText(slug).then(() => showToast(t("super.success.slug_copied", { slug }), "success")); }, [showToast, t]);
  
  const loadAll = useCallback(() => { 
    loadStats(); 
    loadTenants(); 
    loadUsers(usersPage); 
  }, [loadStats, loadTenants, loadUsers, usersPage]);

  /* ═══════════════════════════════════════
     ۶. افکت‌ها (useEffects)
  ════════════════════════════════════════ */
  useEffect(() => {
    document.documentElement.dir = isRtl ? "rtl" : "ltr";
    document.documentElement.lang = lang;
  }, [isRtl, lang]);

  useEffect(() => { 
    const tmr = setTimeout(() => setMounted(true), 10); 
    return () => clearTimeout(tmr); 
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadData = async () => {
      try {
        const [statsRes, tenantsRes] = await Promise.all([ 
          superClient.get("/api/super/stats/"), 
          superClient.get("/api/super/tenants/") 
        ]);
        if (!cancelled) { 
          setStats(statsRes.data); 
          setTenants(tenantsRes.data.tenants || []); 
        }
      } catch (err) { 
        if (err.response?.status === 401 || err.response?.status === 403) navigate("/super/login"); 
      }
    };
    loadData();
    return () => { cancelled = true; };
  }, [navigate]);

  useEffect(() => {
    if (activeTab !== 1) return;
    loadUsers(1);
  }, [activeTab, userSearch, userFilterRest, userFilterRole, loadUsers]);

  /* ── Shared SX ── */
  const glassCard = { bgcolor: C.glass, border: `1px solid ${C.glassBorder}`, borderRadius: { xs: "16px", md: "20px" }, boxShadow: "0 4px 20px rgba(0,0,0,0.05)", position: "relative", overflow: "hidden" };
  const btnPrimarySx = { background: C.btnGrad, color: "#fff", fontSize: { xs: 11, md: 12 }, fontWeight: 700, textTransform: "none", borderRadius: "10px", px: { xs: 1.5, md: 2.5 }, py: { xs: 0.8, md: 1 }, boxShadow: C.btnShadow, whiteSpace: "nowrap", fontFamily: "'Vazirmatn', sans-serif", "&:hover": { background: C.btnHover, boxShadow: C.btnShadow }, transition: "all 0.2s ease" };
  const btnGhostSx = { color: C.sub, fontSize: { xs: 11, md: 12 }, fontWeight: 600, textTransform: "none", borderRadius: "10px", px: { xs: 1.5, md: 2 }, py: 0.8, border: `1px solid ${C.glassBorder}`, fontFamily: "'Vazirmatn', sans-serif", "&:hover": { bgcolor: C.oliveSubtle, borderColor: C.olive }, transition: "all 0.2s ease" };
  const cellSx = { fontSize: { xs: 11, md: 12.5 }, color: C.text, borderBottom: `1px solid ${C.glassBorder}`, fontFamily: "'Vazirmatn', sans-serif", py: { xs: 1, md: 1.5 }, px: { xs: 1, md: 1.5 }, verticalAlign: "middle" };
  const headSx = { fontSize: { xs: 10, md: 11 }, fontWeight: 700, color: C.sub, letterSpacing: "0.02em", bgcolor: C.tableHeaderBg, borderBottom: `1px solid ${C.glassBorder}`, fontFamily: "'Vazirmatn', sans-serif", whiteSpace: "nowrap", py: { xs: 1, md: 1.5 }, px: { xs: 1, md: 1.5 } };
  const dialogPaperSx = { bgcolor: C.glass, border: `1px solid ${C.glassBorder}`, borderRadius: { xs: 0, sm: "20px" }, boxShadow: "0 8px 32px rgba(0,0,0,0.1)", backgroundImage: "none", m: { xs: 0, sm: 2 } };

  const filteredTenants = useMemo(() => {
    if (!searchQuery) return tenants;
    const q = searchQuery.toLowerCase();
    return tenants.filter(x => x.name.toLowerCase().includes(q) || x.slug.toLowerCase().includes(q) || x.owner_name.toLowerCase().includes(q));
  }, [tenants, searchQuery]);

  const sidebarContent = (
    <Box dir={isRtl ? "rtl" : "ltr"} sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <Box sx={{ p: 2, pb: 2, display: "flex", alignItems: "center", gap: 1.5 }}>
        <Box sx={{ width: 40, height: 40, borderRadius: "12px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, bgcolor: C.oliveSubtle, border: `1px solid ${C.glassBorder}`, flexShrink: 0 }}>🏪</Box>
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontWeight: 800, fontSize: 15, color: C.text, fontFamily: "'Vazirmatn', sans-serif", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t("super.panel_title")}</Typography>
          <Typography sx={{ fontSize: 9, color: C.muted, fontWeight: 600, fontFamily: "'Plus Jakarta Sans', sans-serif", letterSpacing: "0.1em" }}>SaaS Admin</Typography>
        </Box>
      </Box>
      <Divider sx={{ borderColor: C.sidebarBorder, mx: 2 }} />
      <Box sx={{ flex: 1, overflowY: "auto", py: 1, px: 1.5 }}>
        {NAV_SECTIONS.map((section, si) => (
          <Box key={si} sx={{ mb: 1.5 }}>
            <Typography sx={{ fontSize: 9, fontWeight: 700, color: C.muted, letterSpacing: "0.1em", px: 1.5, mb: 0.5, fontFamily: "'Vazirmatn', sans-serif" }}>{t(section.titleKey)}</Typography>
            {section.items.map((item, ii) => {
              const isActive = item.path === "/super/app";
              return (
                <Box key={ii} component={Link} to={item.path} onClick={() => isMobile && setSidebarOpen(false)} sx={{ display: "flex", alignItems: "center", gap: 1.5, px: 1.5, py: 1, borderRadius: "10px", textDecoration: "none", bgcolor: isActive ? C.oliveSubtle : "transparent", border: isActive ? `1px solid ${C.glassBorder}` : "1px solid transparent", color: isActive ? C.olive : C.sub, transition: "all 0.2s ease", "&:hover": { bgcolor: C.oliveSubtle, color: C.olive } }}>
                  <Typography sx={{ fontSize: 16, lineHeight: 1, flexShrink: 0 }}>{item.icon}</Typography>
                  <Typography sx={{ fontSize: 12.5, fontWeight: isActive ? 700 : 500, fontFamily: "'Vazirmatn', sans-serif", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t(item.labelKey)}</Typography>
                </Box>
              );
            })}
          </Box>
        ))}
      </Box>
      <Divider sx={{ borderColor: C.sidebarBorder, mx: 2 }} />
      <Box sx={{ p: 2 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 1.5 }}>
          <Box sx={{ width: 36, height: 36, borderRadius: "10px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, bgcolor: C.oliveSubtle, border: `1px solid ${C.glassBorder}`, flexShrink: 0 }}>👤</Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ fontSize: 13, fontWeight: 700, color: C.text, fontFamily: "'Vazirmatn', sans-serif", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{currentUser.username || "—"}</Typography>
            <Typography sx={{ fontSize: 10, color: C.muted, fontFamily: "'Vazirmatn', sans-serif" }}>{t("super.admin_role")}</Typography>
          </Box>
        </Box>
        <Button onClick={handleLogout} fullWidth sx={{ justifyContent: "flex-start", color: C.danger, fontSize: 12, fontWeight: 600, textTransform: "none", borderRadius: "10px", py: 1, px: 1.5, fontFamily: "'Vazirmatn', sans-serif", "&:hover": { bgcolor: C.dangerBg }, transition: "all 0.2s ease" }}>🚪 {t("super.logout")}</Button>
      </Box>
    </Box>
  );

  return (
    <Box dir={isRtl ? "rtl" : "ltr"} sx={{ minHeight: "100vh", bgcolor: C.bg, position: "relative", fontFamily: "'Vazirmatn', sans-serif" }}>
      <Box sx={{ position: "fixed", inset: 0, zIndex: 0, background: C.bgWarm, pointerEvents: "none" }} />

      {/* --- سایدبار دسکتاپ --- */}
      {!isMobile && (
        <Box sx={{ 
          position: "fixed", top: 0, bottom: 0, 
          insetInlineStart: 0, // ★ این ویژگی خودکار در فارسی میره راست، در انگلیسی میره چپ
          width: 250, 
          bgcolor: C.sidebarBg, 
          borderInlineEnd: `1px solid ${C.sidebarBorder}`, // ★ کادر خودکار می‌چرخه
          zIndex: 100, overflow: "hidden" 
        }}>
          {sidebarContent}
        </Box>
      )}

            {/* --- سایدبار موبایل (Drawer) --- */}
      {isMobile && (
        <Drawer 
          anchor="left" // ★ همیشه left می‌ذاریم تا تم MUI خودکار برامون راست‌چینش کنه
          open={sidebarOpen} 
          onClose={() => setSidebarOpen(false)} 
          slotProps={{ paper: { sx: { width: 280, bgcolor: C.sidebarBg, borderInlineEnd: `1px solid ${C.sidebarBorder}` } } }}
        >
          {sidebarContent}
        </Drawer>
      )}

      {/* --- بدنه اصلی --- */}
      <Box sx={{ 
        position: "relative", zIndex: 2, 
        marginInlineStart: isMobile ? 0 : "250px", 
        minHeight: "100vh", display: "flex", flexDirection: "column" 
      }}>
        
              {/* --- نوار بالا (TopBar) --- */}
        <Box sx={{ 
          position: "sticky", top: 0, zIndex: 50, 
          bgcolor: C.headerBg, 
          borderBottom: `1px solid ${C.headerBorder}`, 
          px: { xs: 1.5, md: 2 }, py: 1, 
          display: "flex", 
          alignItems: "center", justifyContent: "space-between", 
          gap: 1.5
          // flexWrap: "wrap" حذف شد تا زیر هم نرن
        }}>
          
          {/* باکس سمت راست/چپ (مسیر و همبرگری) - اجازه میدیم فشرده بشه تا دکمه‌ها جا بشن */}
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, minWidth: 0, overflow: "hidden" }}>
            {isMobile && (
              <IconButton onClick={() => setSidebarOpen(true)} size="small" sx={{ color: C.text, border: `1px solid ${C.glassBorder}`, borderRadius: "8px", bgcolor: C.glass, flexShrink: 0 }}>
                <Typography sx={{ fontSize: 16, lineHeight: 1 }}>☰</Typography>
              </IconButton>
            )}
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, minWidth: 0, overflow: "hidden" }}>
              <Typography component={Link} to="/super/app" sx={{ fontSize: 12, color: C.olive, textDecoration: "none", fontWeight: 700, fontFamily: "'Vazirmatn', sans-serif", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", "&:hover": { textDecoration: "underline" } }}>
                {t("super.breadcrumb.management")}
              </Typography>
              <Typography sx={{ fontSize: 12, color: C.muted, flexShrink: 0 }}>/</Typography>
              <Typography sx={{ fontSize: 12, color: C.sub, fontWeight: 700, fontFamily: "'Vazirmatn', sans-serif", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {t("super.breadcrumb.dashboard")}
              </Typography>
            </Box>
          </Box>
          
          {/* باکس دکمه‌ها - این باکس هرگز فشرده نمیشه و کنار هم میمونن */}
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexShrink: 0 }}>
            <IconButton onClick={toggleTheme} size="small" sx={{ 
              color: C.text, border: `1px solid ${C.glassBorder}`, borderRadius: "8px", bgcolor: C.glass, py: 0.5, px: 1,
              "&:hover": { bgcolor: C.oliveSubtle, borderColor: C.olive } 
            }}>
              <Typography sx={{ fontSize: 14 }}>{isDark ? "☀️" : "🌙"}</Typography>
            </IconButton>

            <Box sx={{ display: "flex", border: `1px solid ${C.glassBorder}`, borderRadius: "8px", overflow: "hidden", bgcolor: C.glass }}>
              {["fa", "en"].map((lng) => (
                <Button key={lng} onClick={() => { if (lang !== lng) toggleLang(); }} sx={{ 
                  minWidth: "auto", py: 0.5, px: 1, borderRadius: 0, fontSize: 10, 
                  fontWeight: lang === lng ? 700 : 500, color: lang === lng ? C.olive : C.sub, 
                  bgcolor: lang === lng ? C.oliveSubtle : "transparent",
                  boxShadow: "none", textTransform: "none", fontFamily: "'Vazirmatn', sans-serif",
                  "&:hover": { bgcolor: C.oliveSubtle }
                }}>
                  {lng === "fa" ? "فا" : "EN"}
                </Button>
              ))}
            </Box>
            
            <Button onClick={loadAll} size="small" sx={{ ...btnGhostSx, py: 0.5, px: 1.5, fontSize: 11, flexShrink: 0 }}>↻ {t("super.refresh")}</Button>
            
            {!isSmall && (
              <Button component={Link} to="/dashboard" size="small" sx={{ ...btnPrimarySx, py: 0.5, px: 1.5, fontSize: 11, flexShrink: 0 }}>🏠 {t("super.restaurant_panel")}</Button>
            )}
          </Box>
        </Box>

        {/* --- محتوای صفحه --- */}
        <Box sx={{ flex: 1, p: { xs: 1.5, sm: 2, md: 3 }, opacity: mounted ? 1 : 0, transition: "opacity 0.3s ease" }}>
          {stats && (
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "repeat(2, 1fr)", sm: "repeat(4, 1fr)" }, gap: { xs: 1.5, md: 2 }, mb: 3 }}>
              {[
                { icon: "🏢", color: C.info, value: stats.total_tenants, label: t("super.stats.restaurants") },
                { icon: "✅", color: C.olive, value: stats.active_tenants, label: t("super.stats.active") },
                { icon: "👥", color: C.gold, value: stats.total_users, label: t("super.stats.users") },
                { icon: "⏰", color: C.danger, value: stats.expiring_soon, label: t("super.stats.expiring") },
              ].map((stat, i) => (
                <Box key={i} sx={{ bgcolor: C.glass, border: `1px solid ${C.glassBorder}`, borderRadius: "16px", p: 2, display: "flex", alignItems: "center", gap: 2 }}>
                  <Box sx={{ width: 44, height: 44, borderRadius: "12px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, background: `${stat.color}22`, border: `1px solid ${stat.color}33`, flexShrink: 0 }}>{stat.icon}</Box>
                  <Box>
                    <Typography sx={{ fontSize: 22, fontWeight: 800, color: C.text, lineHeight: 1.2, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>{stat.value}</Typography>
                    <Typography sx={{ fontSize: 11, fontWeight: 600, color: C.sub, fontFamily: "'Vazirmatn', sans-serif" }}>{stat.label}</Typography>
                  </Box>
                </Box>
              ))}
            </Box>
          )}

          <Box sx={{ display: "flex", gap: 1, mb: 2.5, bgcolor: C.glass, border: `1px solid ${C.glassBorder}`, borderRadius: "12px", p: 0.5, width: "fit-content", flexWrap: "wrap" }}>
            {[{ label: t("super.tab.tenants"), icon: "🏢" }, { label: t("super.tab.users"), icon: "👥" }].map((tab, i) => (
              <Button key={i} onClick={() => setActiveTab(i)} sx={{ px: 2.5, py: 1, borderRadius: "10px", fontSize: 13, fontWeight: activeTab === i ? 700 : 500, textTransform: "none", color: activeTab === i ? C.olive : C.sub, bgcolor: activeTab === i ? C.oliveSubtle : "transparent", border: activeTab === i ? `1px solid ${C.glassBorder}` : "1px solid transparent", fontFamily: "'Vazirmatn', sans-serif", "&:hover": { bgcolor: C.oliveSubtle } }}>{tab.icon} {tab.label}</Button>
            ))}
          </Box>

          {activeTab === 0 && (
            <Box>
              <Box sx={{ ...glassCard, mb: selectedTenantId ? 2 : 0 }}>
                <Box sx={{ p: 2, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 1.5 }}>
                  <Typography sx={{ fontSize: 16, fontWeight: 800, color: C.text }}>🏢 {t("super.tenants.title")}</Typography>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap" }}>
                    <TextField size="small" placeholder={t("super.tenants.search")} value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} sx={{ ...inputSx("tSearch"), width: 220 }} />
                    <Button onClick={handleOpenAddTenant} sx={btnPrimarySx}>+ {t("super.tenants.new")}</Button>
                  </Box>
                </Box>
                <TableContainer sx={{ overflowX: "auto" }}>
                  <Table size="small" sx={{ minWidth: 800 }}>
                    <TableHead>
                      <TableRow>
                        <TableCell sx={headSx}>#</TableCell>
                        <TableCell sx={headSx}>{t("super.tenants.col.name")}</TableCell>
                        <TableCell sx={headSx}>{t("super.tenants.col.slug")}</TableCell>
                        <TableCell sx={headSx}>{t("super.tenants.col.owner")}</TableCell>
                        <TableCell sx={headSx}>{t("super.tenants.col.phone")}</TableCell>
                        <TableCell sx={headSx}>{t("super.tenants.col.services")}</TableCell>
                        <TableCell sx={headSx}>{t("super.tenants.col.subscription")}</TableCell>
                        <TableCell sx={headSx}>{t("super.tenants.col.status")}</TableCell>
                        <TableCell sx={headSx} align="center">{t("super.tenants.col.actions")}</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {filteredTenants.map((tn, i) => (
                        <TableRow key={tn.id} onClick={() => handleSelectTenant(tn.id)} sx={{ cursor: "pointer", bgcolor: selectedTenantId === tn.id ? C.tableRowSelected : "transparent", "&:hover": { bgcolor: C.tableRowHover } }}>
                          <TableCell sx={{ ...cellSx, color: C.sub }}>{i + 1}</TableCell>
                          <TableCell sx={cellSx}>
                            <Typography sx={{ fontSize: 13, fontWeight: 700, color: C.text }}>{tn.name}</Typography>
                            <Typography sx={{ fontSize: 10, color: C.muted }}>{tn.created_at}</Typography>
                          </TableCell>
                          <TableCell sx={cellSx}>
                            <Chip label={tn.slug} size="small" onClick={(e) => { e.stopPropagation(); copySlug(tn.slug); }} sx={{ fontSize: 11, fontWeight: 600, bgcolor: C.oliveSubtle, color: C.olive, borderRadius: "8px", cursor: "pointer", maxWidth: 120 }} />
                          </TableCell>
                          <TableCell sx={cellSx}>{tn.owner_name}</TableCell>
                          <TableCell sx={{ ...cellSx, direction: "ltr", textAlign: "right" }}>{tn.phone}</TableCell>
                          <TableCell sx={{ ...cellSx, color: C.sub }}>{tn.active_services}</TableCell>
                          <TableCell sx={cellSx}><Chip label={tn.is_expired ? t("super.badge.expired") : t("super.badge.valid")} size="small" sx={{ fontSize: 10, fontWeight: 600, bgcolor: tn.is_expired ? C.dangerBg : C.successBg, color: tn.is_expired ? C.danger : C.success, borderRadius: "8px" }} /></TableCell>
                          <TableCell sx={cellSx}><Chip label={tn.is_active ? t("super.badge.active") : t("super.badge.inactive")} size="small" sx={{ fontSize: 10, fontWeight: 600, bgcolor: tn.is_active ? C.successBg : C.dangerBg, color: tn.is_active ? C.success : C.danger, borderRadius: "8px" }} /></TableCell>
                          <TableCell sx={cellSx}>
                            <Box sx={{ display: "flex", gap: 0.5, alignItems: "center", justifyContent: "center" }}>
                              {/* دکمه ویرایش */}
                              <Button size="small" onClick={(e) => { e.stopPropagation(); handleEditTenant(tn.id); }} sx={{ display: "flex", flexDirection: "column", color: C.olive, bgcolor: C.oliveSubtle, border: `1px solid ${C.glassBorder}`, borderRadius: "8px", p: 0.5, minWidth: 50, textTransform: "none", fontFamily: "'Vazirmatn', sans-serif", "&:hover": { bgcolor: C.oliveSubtle } }}>
                                <Typography sx={{ fontSize: 14, lineHeight: 1 }}>✏️</Typography>
                                <Typography sx={{ fontSize: 9, mt: 0.2 }}>{t("super.action.edit")}</Typography>
                              </Button>
                              {/* دکمه حذف */}
                              <Button size="small" onClick={(e) => { e.stopPropagation(); setDeleteModal({ open: true, type: "tenant", id: tn.id, name: tn.name }); }} sx={{ display: "flex", flexDirection: "column", color: C.danger, bgcolor: C.dangerBg, border: `1px solid ${C.glassBorder}`, borderRadius: "8px", p: 0.5, minWidth: 50, textTransform: "none", fontFamily: "'Vazirmatn', sans-serif", "&:hover": { bgcolor: C.dangerBg } }}>
                                <Typography sx={{ fontSize: 14, lineHeight: 1 }}>🗑️</Typography>
                                <Typography sx={{ fontSize: 9, mt: 0.2 }}>{t("super.action.delete")}</Typography>
                              </Button>
                              {/* دکمه داشبورد (لینک به صفحه لاگین رستوران) */}
                              {tn.slug && (
                                <Button size="small" component={Link} to={`/${tn.slug}/dashboard/login`} onClick={(e) => e.stopPropagation()} sx={{ display: "flex", flexDirection: "column", color: C.info, bgcolor: C.infoBg, border: `1px solid ${C.glassBorder}`, borderRadius: "8px", p: 0.5, minWidth: 50, textTransform: "none", fontFamily: "'Vazirmatn', sans-serif", "&:hover": { bgcolor: C.infoBg } }}>
                                  <Typography sx={{ fontSize: 14, lineHeight: 1 }}>🏠</Typography>
                                  <Typography sx={{ fontSize: 9, mt: 0.2 }}>{t("super.action.dashboard")}</Typography>
                                </Button>
                              )}
                            </Box>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
                {filteredTenants.length === 0 && (
                  <Box sx={{ py: 6, textAlign: "center" }}>
                    <Typography sx={{ fontSize: 40, mb: 1 }}>🏢</Typography>
                    <Typography sx={{ fontSize: 13, color: C.sub }}>{t("super.tenants.empty")}</Typography>
                  </Box>
                )}
              </Box>

              {selectedTenantId && (
                <Box sx={{ ...glassCard, mt: 2 }}>
                  <Box sx={{ p: 2, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 1.5 }}>
                    <Typography sx={{ fontSize: 16, fontWeight: 800, color: C.text }}>⚙️ {t("super.services.title")} — {tenants.find(x => x.id === selectedTenantId)?.name}</Typography>
                    <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
                      {tenants.find(x => x.id === selectedTenantId)?.dashboard_url && <Button onClick={() => window.open(tenants.find(x => x.id === selectedTenantId)?.dashboard_url, "_blank")} sx={btnGhostSx}>🏠 {t("super.services.open_dashboard")}</Button>}
                      <Button onClick={handleSaveServices} sx={btnPrimarySx}>💾 {t("super.services.save")}</Button>
                    </Box>
                  </Box>
                  <Box sx={{ p: 2, pt: 0 }}>
                    {servicesLoading ? <Box sx={{ py: 4, textAlign: "center" }}><CircularProgress size={28} sx={{ color: C.olive }} /></Box> : (
                      <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
                        {services.map((svc, i) => {
                          const today = new Date().toISOString().split("T")[0];
                          const isExpired = svc.end_date && svc.end_date < today;
                          return (
                            <Box key={svc.service_id} sx={{ bgcolor: svc.is_enabled ? C.oliveSubtle : C.tableRowHover, border: `1px solid ${C.glassBorder}`, borderRadius: "12px", p: 2 }}>
                              <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 2, flexWrap: "wrap" }}>
                                <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, minWidth: 0 }}>
                                  <Typography sx={{ fontSize: 22 }}>{svc.icon}</Typography>
                                  <Box>
                                    <Typography sx={{ fontSize: 13, fontWeight: 700, color: C.text }}>{svc.label}</Typography>
                                    <Typography sx={{ fontSize: 11, color: C.muted }}>{svc.description || svc.code}</Typography>
                                  </Box>
                                </Box>
                                <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
                                  <TextField type="number" size="small" value={svc.price} onChange={(e) => updateService(svc.service_id, "price", e.target.value)} sx={{ ...inputSx(`sp${svc.service_id}`), width: 120 }} />
                                  <Switch checked={svc.is_enabled} onChange={(e) => updateService(svc.service_id, "is_enabled", e.target.checked)} size="small" />
                                </Box>
                              </Box>
                              {svc.is_enabled && (
                                <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mt: 1.5, flexWrap: "wrap" }}>
                                  <Typography sx={{ fontSize: 11, color: C.sub, fontWeight: 600 }}>{t("super.services.start")}</Typography>
                                  <TextField type="date" size="small" value={svc.start_date || ""} onChange={(e) => updateService(svc.service_id, "start_date", e.target.value)} sx={{ ...inputSx(`ss${svc.service_id}`), width: 150 }} />
                                  <Typography sx={{ fontSize: 14, color: C.muted }}>→</Typography>
                                  <Typography sx={{ fontSize: 11, color: C.sub, fontWeight: 600 }}>{t("super.services.end")}</Typography>
                                  <TextField type="date" size="small" value={svc.end_date || ""} onChange={(e) => updateService(svc.service_id, "end_date", e.target.value)} sx={{ ...inputSx(`se${svc.service_id}`), width: 150 }} />
                                  <Chip label={!svc.end_date ? t("super.services.no_expiry") : isExpired ? t("super.badge.expired") : t("super.badge.valid")} size="small" sx={{ fontSize: 10, bgcolor: !svc.end_date ? C.infoBg : isExpired ? C.dangerBg : C.successBg, color: !svc.end_date ? C.info : isExpired ? C.danger : C.success }} />
                                </Box>
                              )}
                            </Box>
                          );
                        })}
                      </Box>
                    )}
                  </Box>
                </Box>
              )}
            </Box>
          )}

          {activeTab === 1 && (
            <Box>
              <Box sx={glassCard}>
                <Box sx={{ p: 2, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 1.5 }}>
                  <Typography sx={{ fontSize: 16, fontWeight: 800, color: C.text }}>👥 {t("super.users.title")}</Typography>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap" }}>
                    <TextField size="small" placeholder={t("super.users.search")} value={userSearch} onChange={(e) => setUserSearch(e.target.value)} sx={{ ...inputSx("uSearch"), width: 200 }} />
                    <FormControl size="small" sx={{ minWidth: 160 }}>
                      <Select value={userFilterRest} onChange={(e) => setUserFilterRest(e.target.value)} displayEmpty sx={selectSx} MenuProps={{ PaperProps: { sx: menuPaperSx } }}>
                        <MenuItem value="" sx={{ fontSize: 12 }}>{t("super.users.all_restaurants")}</MenuItem>
                        {tenants.map(tn => <MenuItem key={tn.id} value={tn.id} sx={{ fontSize: 12 }}>{tn.name}</MenuItem>)}
                      </Select>
                    </FormControl>
                    <FormControl size="small" sx={{ minWidth: 130 }}>
                      <Select value={userFilterRole} onChange={(e) => setUserFilterRole(e.target.value)} displayEmpty sx={selectSx} MenuProps={{ PaperProps: { sx: menuPaperSx } }}>
                        <MenuItem value="" sx={{ fontSize: 12 }}>{t("super.users.all_roles")}</MenuItem>
                        {ROLE_OPTIONS.map(r => <MenuItem key={r.value} value={r.value} sx={{ fontSize: 12 }}>{t(r.labelKey)}</MenuItem>)}
                      </Select>
                    </FormControl>
                    <Button onClick={handleOpenAddUser} sx={btnPrimarySx}>+ {t("super.users.new")}</Button>
                  </Box>
                </Box>

                {usersLoading ? <Box sx={{ py: 4, textAlign: "center" }}><CircularProgress size={28} sx={{ color: C.olive }} /></Box> : (
                  <>
                    <TableContainer sx={{ overflowX: "auto" }}>
                      <Table size="small" sx={{ minWidth: 850 }}>
                        <TableHead>
                          <TableRow>
                            <TableCell sx={headSx}>#</TableCell>
                            <TableCell sx={headSx}>{t("super.users.col.username")}</TableCell>
                            <TableCell sx={headSx}>{t("super.users.col.name")}</TableCell>
                            <TableCell sx={headSx}>{t("super.users.col.mobile")}</TableCell>
                            <TableCell sx={headSx}>{t("super.users.col.role")}</TableCell>
                            <TableCell sx={headSx}>{t("super.users.col.restaurant")}</TableCell>
                            <TableCell sx={headSx}>{t("super.users.col.status")}</TableCell>
                            <TableCell sx={headSx}>{t("super.users.col.permissions")}</TableCell>
                            <TableCell sx={headSx} align="center">{t("super.users.col.actions")}</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {users.map((u, i) => (
                            <TableRow key={u.id} sx={{ "&:hover": { bgcolor: C.tableRowHover } }}>
                              <TableCell sx={{ ...cellSx, color: C.sub }}>{(usersPage - 1) * 20 + i + 1}</TableCell>
                              <TableCell sx={{ ...cellSx, fontWeight: 700 }}>{u.username}</TableCell>
                              <TableCell sx={cellSx}>{u.first_name || "-"} {u.last_name || ""}</TableCell>
                              <TableCell sx={{ ...cellSx, direction: "ltr", textAlign: "right" }}>{u.phone_number || "-"}</TableCell>
                              <TableCell sx={cellSx}><Chip label={u.is_superuser ? t("super.badge.admin") : u.role_display} size="small" sx={{ fontSize: 10, bgcolor: u.is_superuser ? C.warningBg : C.oliveSubtle, color: u.is_superuser ? C.warning : C.olive }} /></TableCell>
                              <TableCell sx={{ ...cellSx, color: C.sub }}>{u.restaurant_name || "-"}</TableCell>
                              <TableCell sx={cellSx}><Chip label={u.is_active ? t("super.badge.active") : t("super.badge.inactive")} size="small" sx={{ fontSize: 10, bgcolor: u.is_active ? C.successBg : C.dangerBg, color: u.is_active ? C.success : C.danger }} /></TableCell>
                              <TableCell sx={cellSx}>
                                <Button size="small" onClick={() => handleOpenPerms(u.id)} sx={{ fontSize: 10, color: C.olive, bgcolor: C.oliveSubtle, border: `1px solid ${C.glassBorder}`, borderRadius: "8px" }}>🔑 {t("super.users.permissions")}</Button>
                              </TableCell>
                              <TableCell sx={cellSx}>
                                <Box sx={{ display: "flex", gap: 0.5, alignItems: "center", justifyContent: "center" }}>
                                  <IconButton size="small" onClick={() => handleEditUser(u.id)} sx={{ color: C.olive, bgcolor: C.oliveSubtle, border: `1px solid ${C.glassBorder}`, borderRadius: "8px", p: 0.5, "&:hover": { bgcolor: C.oliveSubtle } }}>
                                    <Typography sx={{ fontSize: 12 }}>✏️</Typography>
                                  </IconButton>
                                  {!u.is_superuser && (
                                    <IconButton size="small" onClick={() => setDeleteModal({ open: true, type: "user", id: u.id, name: `#${u.id}` })} sx={{ color: C.danger, bgcolor: C.dangerBg, border: `1px solid ${C.glassBorder}`, borderRadius: "8px", p: 0.5, "&:hover": { bgcolor: C.dangerBg } }}>
                                      <Typography sx={{ fontSize: 12 }}>🗑️</Typography>
                                    </IconButton>
                                  )}
                                </Box>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>

                    {users.length === 0 && (
                      <Box sx={{ py: 6, textAlign: "center" }}>
                        <Typography sx={{ fontSize: 40, mb: 1 }}>👥</Typography>
                        <Typography sx={{ fontSize: 13, color: C.sub }}>{t("super.users.empty")}</Typography>
                      </Box>
                    )}

                    {usersPages > 1 && (
                      <Box sx={{ display: "flex", justifyContent: "center", gap: 0.5, p: 2, flexWrap: "wrap" }}>
                        <Button disabled={usersPage <= 1} onClick={() => loadUsers(usersPage - 1)} sx={{ minWidth: 32, height: 32, borderRadius: "8px", color: C.sub, fontSize: 14, border: `1px solid ${C.glassBorder}` }}>‹</Button>
                        {Array.from({ length: usersPages }, (_, i) => i + 1)
                          .filter(p => Math.abs(p - usersPage) <= 2 || p === 1 || p === usersPages)
                          .reduce((acc, p, i, arr) => { if (i > 0 && p - arr[i - 1] > 1) acc.push("..."); acc.push(p); return acc; }, [])
                          .map((p, i) => p === "..." ? (
                            <Typography key={`d${i}`} sx={{ px: 1, fontSize: 12, color: C.muted, display: "flex", alignItems: "center" }}>...</Typography>
                          ) : (
                            <Button key={p} onClick={() => loadUsers(p)} sx={{ minWidth: 32, height: 32, borderRadius: "8px", fontSize: 12, fontWeight: p === usersPage ? 700 : 500, color: p === usersPage ? C.olive : C.sub, bgcolor: p === usersPage ? C.oliveSubtle : "transparent", border: p === usersPage ? `1px solid ${C.olive}33` : `1px solid ${C.glassBorder}` }}>{p}</Button>
                          ))}
                        <Button disabled={usersPage >= usersPages} onClick={() => loadUsers(usersPage + 1)} sx={{ minWidth: 32, height: 32, borderRadius: "8px", color: C.sub, fontSize: 14, border: `1px solid ${C.glassBorder}` }}>›</Button>
                      </Box>
                    )}
                  </>
                )}
              </Box>
            </Box>
          )}
        </Box>
      </Box>

      {/* MODALS */}
      <Dialog open={tenantModal.open} onClose={() => setTenantModal({ open: false, editId: null })} fullScreen={isMobile} maxWidth="sm" fullWidth slotProps={{ paper: { sx: dialogPaperSx } }}>
        <DialogTitle sx={{ fontSize: 16, fontWeight: 800, display: "flex", justifyContent: "space-between", pb: 1 }}>
          {tenantModal.editId ? `✏️ ${t("super.tenants.edit")}: ${tenantForm.name}` : `🏢 ${t("super.tenants.new")}`}
          <IconButton onClick={() => setTenantModal({ open: false, editId: null })}><Typography sx={{ fontSize: 20 }}>×</Typography></IconButton>
        </DialogTitle>
        <DialogContent sx={{ pt: "8px !important" }}>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 1 }}>
            <TextField label={t("super.tenants.field.name")} value={tenantForm.name} onChange={(e) => setTenantForm(f => ({ ...f, name: e.target.value }))} fullWidth sx={inputSx("tName")} />
            <Box>
              <TextField label={t("super.tenants.field.slug")} value={tenantForm.slug} onChange={(e) => setTenantForm(f => ({ ...f, slug: e.target.value }))} fullWidth sx={inputSx("tSlug")} />
              {tenantForm.slug && <Typography sx={{ fontSize: 11, color: C.olive, mt: 0.5, direction: "ltr" }}>/{tenantForm.slug}/dashboard/app/</Typography>}
            </Box>
            <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
              <TextField label={t("super.tenants.field.owner_username")} value={tenantForm.owner_username} onChange={(e) => setTenantForm(f => ({ ...f, owner_username: e.target.value }))} disabled={!!tenantModal.editId} sx={{ ...inputSx("tOUser"), flex: "1 1 200px" }} />
              <TextField label={t("super.tenants.field.password")} type="password" value={tenantForm.owner_password} onChange={(e) => setTenantForm(f => ({ ...f, owner_password: e.target.value }))} sx={{ ...inputSx("tOPass"), flex: "1 1 200px" }} />
            </Box>
            <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
              <TextField label={t("super.tenants.field.owner_name")} value={tenantForm.owner_name} onChange={(e) => setTenantForm(f => ({ ...f, owner_name: e.target.value }))} sx={{ ...inputSx("tOName"), flex: "1 1 200px" }} />
              <TextField label={t("super.tenants.field.phone")} value={tenantForm.phone} onChange={(e) => setTenantForm(f => ({ ...f, phone: e.target.value }))} sx={{ ...inputSx("tPhone"), flex: "1 1 200px" }} />
            </Box>
            <TextField label={t("super.tenants.field.address")} value={tenantForm.address} onChange={(e) => setTenantForm(f => ({ ...f, address: e.target.value }))} multiline rows={2} fullWidth sx={inputSx("tAddr")} />
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
          <Button onClick={handleSaveTenant} sx={{ ...btnPrimarySx, borderRadius: "12px", px: 3, py: 1, fontSize: 13 }}>💾 {t("super.action.save")}</Button>
          <Button onClick={() => setTenantModal({ open: false, editId: null })} sx={{ ...btnGhostSx, borderRadius: "12px", px: 3, py: 1, fontSize: 13 }}>{t("super.action.cancel")}</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={deleteModal.open} onClose={() => setDeleteModal({ open: false, type: "", id: null, name: "" })} fullScreen={isSmall} maxWidth="xs" slotProps={{ paper: { sx: dialogPaperSx } }}>
        <DialogTitle sx={{ fontSize: 16, fontWeight: 800, display: "flex", justifyContent: "space-between" }}>
          {deleteModal.type === "tenant" ? t("super.delete.title_tenant") : t("super.delete.title_user")}
          <IconButton onClick={() => setDeleteModal({ open: false, type: "", id: null, name: "" })}><Typography sx={{ fontSize: 20 }}>×</Typography></IconButton>
        </DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: 13, color: C.text }}>{deleteModal.type === "tenant" ? t("super.delete.msg_tenant", { name: deleteModal.name }) : t("super.delete.msg_user", { name: deleteModal.name })}</Typography>
          <Typography sx={{ fontSize: 11, color: C.muted, mt: 0.5 }}>{t("super.delete.irreversible")}</Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
          <Button onClick={deleteModal.type === "tenant" ? handleDeleteTenant : handleDeleteUser} sx={{ bgcolor: C.danger, color: "#fff", fontSize: 13, fontWeight: 700, textTransform: "none", borderRadius: "12px", px: 3, py: 1, "&:hover": { bgcolor: C.danger } }}>🗑️ {t("super.action.delete")}</Button>
          <Button onClick={() => setDeleteModal({ open: false, type: "", id: null, name: "" })} sx={{ ...btnGhostSx, borderRadius: "12px", px: 3, py: 1, fontSize: 13 }}>{t("super.action.cancel")}</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={userModal.open} onClose={() => setUserModal({ open: false, editId: null })} fullScreen={isMobile} maxWidth="sm" fullWidth slotProps={{ paper: { sx: dialogPaperSx } }}>
        <DialogTitle sx={{ fontSize: 16, fontWeight: 800, display: "flex", justifyContent: "space-between", pb: 1 }}>
          {userModal.editId ? `✏️ ${t("super.users.edit")}: ${userForm.username}` : `👤 ${t("super.users.new")}`}
          <IconButton onClick={() => setUserModal({ open: false, editId: null })}><Typography sx={{ fontSize: 20 }}>×</Typography></IconButton>
        </DialogTitle>
        <DialogContent sx={{ pt: "8px !important" }}>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 1 }}>
            <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
              <TextField label={t("super.users.field.username")} value={userForm.username} onChange={(e) => setUserForm(f => ({ ...f, username: e.target.value }))} disabled={!!userModal.editId} sx={{ ...inputSx("uUser"), flex: "1 1 200px" }} />
              <TextField label={t("super.users.field.password")} type="password" value={userForm.password} onChange={(e) => setUserForm(f => ({ ...f, password: e.target.value }))} sx={{ ...inputSx("uPass"), flex: "1 1 200px" }} />
            </Box>
            <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
              <TextField label={t("super.users.field.first_name")} value={userForm.first_name} onChange={(e) => setUserForm(f => ({ ...f, first_name: e.target.value }))} sx={{ ...inputSx("uFN"), flex: "1 1 150px" }} />
              <TextField label={t("super.users.field.last_name")} value={userForm.last_name} onChange={(e) => setUserForm(f => ({ ...f, last_name: e.target.value }))} sx={{ ...inputSx("uLN"), flex: "1 1 150px" }} />
              <TextField label={t("super.users.field.phone")} value={userForm.phone_number} onChange={(e) => setUserForm(f => ({ ...f, phone_number: e.target.value }))} sx={{ ...inputSx("uPh"), flex: "1 1 150px" }} />
            </Box>
            <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
              <FormControl sx={{ flex: "1 1 200px" }}>
                <InputLabel sx={{ fontSize: 12, color: C.sub }}>{t("super.users.field.role")}</InputLabel>
                <Select value={userForm.role} onChange={(e) => setUserForm(f => ({ ...f, role: e.target.value }))} label={t("super.users.field.role")} sx={{ ...selectSx, height: "auto" }} MenuProps={{ PaperProps: { sx: menuPaperSx } }}>
                  <MenuItem value="" sx={{ fontSize: 12 }}>{t("super.users.select_role")}</MenuItem>
                  {ROLE_OPTIONS.map(r => <MenuItem key={r.value} value={r.value} sx={{ fontSize: 12 }}>{t(r.labelKey)}</MenuItem>)}
                </Select>
              </FormControl>
              <FormControl sx={{ flex: "1 1 200px" }}>
                <InputLabel sx={{ fontSize: 12, color: C.sub }}>{t("super.users.field.restaurant")}</InputLabel>
                <Select value={userForm.restaurant_id} onChange={(e) => setUserForm(f => ({ ...f, restaurant_id: e.target.value }))} label={t("super.users.field.restaurant")} sx={{ ...selectSx, height: "auto" }} MenuProps={{ PaperProps: { sx: menuPaperSx } }}>
                  {tenants.map(tn => <MenuItem key={tn.id} value={tn.id} sx={{ fontSize: 12 }}>{tn.name}</MenuItem>)}
                </Select>
              </FormControl>
            </Box>
            <Box sx={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <Switch checked={userForm.is_active} onChange={(e) => setUserForm(f => ({ ...f, is_active: e.target.checked }))} size="small" />
                <Typography sx={{ fontSize: 12, fontWeight: 700, color: C.text }}>{t("super.users.field.is_active")}</Typography>
              </Box>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <Switch checked={userForm.is_approved} onChange={(e) => setUserForm(f => ({ ...f, is_approved: e.target.checked }))} size="small" />
                <Typography sx={{ fontSize: 12, fontWeight: 700, color: C.text }}>{t("super.users.field.is_approved")}</Typography>
              </Box>
            </Box>
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
          <Button onClick={handleSaveUser} sx={{ ...btnPrimarySx, borderRadius: "12px", px: 3, py: 1, fontSize: 13 }}>💾 {t("super.action.save")}</Button>
          <Button onClick={() => setUserModal({ open: false, editId: null })} sx={{ ...btnGhostSx, borderRadius: "12px", px: 3, py: 1, fontSize: 13 }}>{t("super.action.cancel")}</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={permsModal.open} onClose={() => setPermsModal({ open: false, userId: null, username: "" })} fullScreen={isMobile} maxWidth="sm" fullWidth slotProps={{ paper: { sx: dialogPaperSx } }}>
        <DialogTitle sx={{ fontSize: 16, fontWeight: 800, display: "flex", justifyContent: "space-between" }}>
          🔑 {t("super.perms.title")} — {permsModal.username}
          <IconButton onClick={() => setPermsModal({ open: false, userId: null, username: "" })}><Typography sx={{ fontSize: 20 }}>×</Typography></IconButton>
        </DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: 11, color: C.muted, mb: 2 }}>{t("super.perms.description")}</Typography>
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "repeat(2, 1fr)", sm: "repeat(auto-fill, minmax(140px, 1fr))" }, gap: 1 }}>
            {PERM_ITEMS.map((perm) => {
              const checked = userPerms.includes(perm.code);
              return (
                <Box key={perm.code} onClick={() => togglePerm(perm.code)} sx={{ display: "flex", alignItems: "center", gap: 1, px: 1.5, py: 1, borderRadius: "10px", cursor: "pointer", bgcolor: checked ? C.oliveSubtle : "transparent", border: `1px solid ${checked ? C.olive + "33" : C.glassBorder}` }}>
                  <Checkbox checked={checked} size="small" sx={{ color: C.muted, "&.Mui-checked": { color: C.olive }, p: 0 }} />
                  <Typography sx={{ fontSize: 12, fontWeight: checked ? 600 : 400, color: checked ? C.olive : C.sub }}>{t(perm.labelKey)}</Typography>
                </Box>
              );
            })}
          </Box>
          <Box sx={{ display: "flex", gap: 1, mt: 2, flexWrap: "wrap" }}>
            <Button size="small" onClick={() => setUserPerms(PERM_ITEMS.map(p => p.code))} sx={{ fontSize: 11, color: C.sub, borderRadius: "8px", border: `1px solid ${C.glassBorder}` }}>{t("super.perms.select_all")}</Button>
            <Button size="small" onClick={() => setUserPerms([])} sx={{ fontSize: 11, color: C.sub, borderRadius: "8px", border: `1px solid ${C.glassBorder}` }}>{t("super.perms.clear_all")}</Button>
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
          <Button onClick={handleSavePerms} sx={{ ...btnPrimarySx, borderRadius: "12px", px: 3, py: 1, fontSize: 13 }}>💾 {t("super.perms.save")}</Button>
          <Button onClick={() => setPermsModal({ open: false, userId: null, username: "" })} sx={{ ...btnGhostSx, borderRadius: "12px", px: 3, py: 1, fontSize: 13 }}>{t("super.action.cancel")}</Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={toast.open} autoHideDuration={3000} onClose={() => setToast(s => ({ ...s, open: false }))} anchorOrigin={{ vertical: "top", horizontal: "center" }}>
        <Alert onClose={() => setToast(s => ({ ...s, open: false }))} severity={toast.type} sx={{ bgcolor: toast.type === "success" ? C.successBg : toast.type === "error" ? C.dangerBg : C.infoBg, color: toast.type === "success" ? C.oliveLight : toast.type === "error" ? "#ff8a9e" : "#8ab4e8", border: `1px solid ${toast.type === "success" ? C.olive : C.danger}`, borderRadius: "12px", fontSize: 13, fontWeight: 600 }}>{toast.message}</Alert>
      </Snackbar>
    </Box>
  );
}