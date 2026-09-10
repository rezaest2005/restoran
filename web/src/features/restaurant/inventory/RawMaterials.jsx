import { useState, useEffect, useMemo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  Box, Typography, Button, IconButton, TextField, Select, MenuItem,
  FormControl, InputLabel, Grid, Chip, CircularProgress, Divider,
  Dialog, DialogTitle, DialogContent, DialogActions, Snackbar, Alert,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper,
  InputAdornment
} from "@mui/material";
import {
  Add, Delete, Edit, Search, Inventory2, Warning, CheckCircle, Cancel,
  DarkMode, LightMode, Language
} from "@mui/icons-material";
import { useThemeMode } from "../contexts/ThemeContext";
import { useLang } from "../contexts/LangContext";

const animations = `
  @keyframes orb1 { 0%, 100% { transform: translate(0, 0) scale(1); } 25% { transform: translate(60px, -80px) scale(1.1); } 50% { transform: translate(-20px, -40px) scale(0.95); } 75% { transform: translate(-50px, 50px) scale(1.05); } }
  @keyframes float { 0%, 100% { transform: translateY(0px); } 50% { transform: translateY(-6px); } }
  @keyframes shimmer { 0% { background-position: -200% center; } 100% { background-position: 200% center; } }
  @keyframes fadeUp { from { opacity: 0; transform: translateY(20px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
`;

const UNITS = [
  { value: 'kg', label: 'کیلوگرم' }, { value: 'g', label: 'گرم' },
  { value: 'l', label: 'لیتر' }, { value: 'ml', label: 'میلی‌لیتر' },
  { value: 'unit', label: 'عدد' }, { value: 'bunch', label: 'دسته' },
  { value: 'pack', label: 'بسته' }
];

export default function RawMaterials() {
  const { mode, toggleTheme } = useThemeMode();
  const { isRtl, toggleLang, lang } = useLang();
  const { t } = useTranslation();
  const isDark = mode === "dark";

  const [mounted, setMounted] = useState(false);
  const [toast, setToast] = useState({ open: false, message: "", type: "info" });
  
  const [materials, setMaterials] = useState([]);
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({ name: "", label: "", price: "", qty: "", unit: "kg", type: "raw" });

  useEffect(() => {
    const tmr = setTimeout(() => setMounted(true), 80);
    // شبیه‌سازی دریافت داده از سرور
    setMaterials([
      { id: 1, name: "برنج طارم", label: "غلات", price: 120000, qty: 50, unit: "kg", type: "raw" },
      { id: 2, name: "گوشت چرخ‌کرده", label: "پروتئینی", price: 180000, qty: 3, unit: "kg", type: "raw" },
      { id: 3, name: "پنیر موزارلا", label: "لبنیات", price: 90000, qty: 0, unit: "kg", type: "raw" },
      { id: 4, name: "جعبه پیتزا", label: "بسته‌بندی", price: 5000, qty: 200, unit: "unit", type: "packaging" },
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

  const toPersian = (n) => {
    if (lang !== "fa") return n;
    return String(n).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[d]);
  };

  const formatPrice = (n) => {
    return toPersian(Number(n || 0).toLocaleString("en-US"));
  };

  const stats = useMemo(() => {
    let totalValue = 0, ok = 0, low = 0, out = 0;
    materials.forEach(m => {
      totalValue += (m.price * m.qty);
      if (m.qty <= 0) out++;
      else if (m.qty < 5) low++;
      else ok++;
    });
    return { total: materials.length, totalValue, ok, low, out };
  }, [materials]);

  const filteredMaterials = useMemo(() => {
    return materials.filter(m => 
      !search || m.name.toLowerCase().includes(search.toLowerCase()) || (m.label || "").toLowerCase().includes(search.toLowerCase())
    );
  }, [materials, search]);

  const handleOpenAdd = () => {
    setEditingId(null);
    setFormData({ name: "", label: "", price: "", qty: "", unit: "kg", type: "raw" });
    setModalOpen(true);
  };

  const handleOpenEdit = (mat) => {
    setEditingId(mat.id);
    setFormData({ name: mat.name, label: mat.label, price: mat.price, qty: mat.qty, unit: mat.unit, type: mat.type });
    setModalOpen(true);
  };

  const handleSave = () => {
    if (!formData.name) return showToast("نام کالا الزامی است", "error");
    
    if (editingId) {
      setMaterials(prev => prev.map(m => m.id === editingId ? { ...m, ...formData, price: Number(formData.price), qty: Number(formData.qty) } : m));
      showToast("ماده اولیه ویرایش شد");
    } else {
      const newMat = { ...formData, id: Date.now(), price: Number(formData.price), qty: Number(formData.qty) };
      setMaterials(prev => [newMat, ...prev]);
      showToast("ماده اولیه افزود شد");
    }
    setModalOpen(false);
  };

  const handleDelete = (id) => {
    if (!window.confirm("آیا از حذف این ماده اولیه مطمئن هستید؟")) return;
    setMaterials(prev => prev.filter(m => m.id !== id));
    showToast("ماده اولیه حذف شد", "error");
  };

  const getStatusChip = (qty) => {
    if (qty <= 0) return <Chip label={t("raw.status_out")} size="small" sx={{ bgcolor: C.dangerBg, color: C.danger, fontWeight: 600 }} />;
    if (qty < 5) return <Chip label={t("raw.status_low")} size="small" sx={{ bgcolor: C.warningBg, color: C.warning, fontWeight: 600 }} />;
    return <Chip label={t("raw.status_ok")} size="small" sx={{ bgcolor: C.successBg, color: C.success, fontWeight: 600 }} />;
  };

  const getUnitLabel = (val) => {
    const u = UNITS.find(u => u.value === val);
    return u ? u.label : val;
  };

  return (
    <Box dir={isRtl ? "rtl" : "ltr"} sx={{ position: "relative", fontFamily: "'Vazirmatn', sans-serif", minHeight: "100vh", color: C.text, opacity: mounted ? 1 : 0, transition: "opacity 0.5s ease", pb: 10 }}>
      <style>{animations}</style>

      {/* Header */}
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 4, flexWrap: "wrap", gap: 2 }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 800, mb: 1, display: "flex", alignItems: "center", gap: 1.5 }}>
            <span style={{ fontSize: 28 }}>📦</span> {t("raw.title")}
          </Typography>
          <Typography sx={{ color: C.sub, fontSize: 14 }}>{t("raw.subtitle")}</Typography>
        </Box>
        <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap" }}>
          <IconButton onClick={toggleTheme} size="small" sx={{ border: `1px solid ${C.glassBorder}`, borderRadius: "10px", bgcolor: C.glass, color: C.text }}>
            {isDark ? <LightMode fontSize="small" /> : <DarkMode fontSize="small" />}
          </IconButton>
          <IconButton onClick={toggleLang} size="small" sx={{ border: `1px solid ${C.glassBorder}`, borderRadius: "10px", bgcolor: C.glass, color: C.text }}>
            <Language fontSize="small" />
          </IconButton>
          <Button onClick={handleOpenAdd} sx={{ bgcolor: C.btnGrad, color: "#fff", boxShadow: `0 4px 14px ${C.olive}55`, "&:hover": { transform: "translateY(-2px)" } }}>
            <Add /> {t("raw.btn_add")}
          </Button>
        </Box>
      </Box>

      {/* Stats */}
      <Grid container spacing={2.5} sx={{ mb: 3 }}>
        {[
          { label: t("raw.stat_total"), value: stats.total, color: C.olive, icon: <Inventory2 /> },
          { label: t("raw.stat_value"), value: formatPrice(stats.totalValue) + " ت", color: C.gold, icon: <Inventory2 /> },
          { label: t("raw.stat_ok"), value: stats.ok, color: C.success, icon: <CheckCircle /> },
          { label: t("raw.stat_low"), value: stats.low, color: C.warning, icon: <Warning /> },
          { label: t("raw.stat_out"), value: stats.out, color: C.danger, icon: <Cancel /> },
        ].map((stat, i) => (
          <Grid item xs={12} sm={6} md={2.4} key={i} sx={{ display: "flex" }}>
            <Box sx={{ ...glassCardSx, p: 2.5, display: "flex", alignItems: "center", gap: 2, width: "100%" }}>
              <Box sx={{ width: 44, height: 44, borderRadius: "12px", display: "flex", alignItems: "center", justifyContent: "center", background: `${stat.color}22`, border: `1px solid ${stat.color}33`, animation: "float 5s ease-in-out infinite", flexShrink: 0, color: stat.color }}>
                {stat.icon}
              </Box>
              <Box>
                <Typography sx={{ fontWeight: 800, fontSize: 18, color: C.text }}>{stat.value}</Typography>
                <Typography sx={{ fontSize: 11, fontWeight: 600, color: C.sub }}>{stat.label}</Typography>
              </Box>
            </Box>
          </Grid>
        ))}
      </Grid>

      {/* Toolbar & Table */}
      <Box sx={{ ...glassCardSx, p: { xs: 2, md: 3 } }}>
        <TextField 
          size="small" 
          placeholder={t("raw.search")} 
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          sx={{ ...inputSx, mb: 3, maxWidth: 400 }}
          InputProps={{ startAdornment: <InputAdornment position="start"><Search sx={{ fontSize: 18, color: C.muted }} /></InputAdornment> }}
        />

        <TableContainer component={Box} sx={{ overflowX: "auto" }}>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ borderBottom: `1px solid ${C.glassBorder}` }}>
                <TableCell sx={{ color: C.sub, fontWeight: 700, width: 40 }}>{t("raw.col_num")}</TableCell>
                <TableCell sx={{ color: C.sub, fontWeight: 700 }}>{t("raw.col_name")}</TableCell>
                <TableCell sx={{ color: C.sub, fontWeight: 700 }}>{t("raw.col_label")}</TableCell>
                <TableCell sx={{ color: C.sub, fontWeight: 700 }}>{t("raw.col_price")}</TableCell>
                <TableCell sx={{ color: C.sub, fontWeight: 700 }}>{t("raw.col_qty")}</TableCell>
                <TableCell sx={{ color: C.sub, fontWeight: 700 }}>{t("raw.col_unit")}</TableCell>
                <TableCell sx={{ color: C.sub, fontWeight: 700 }}>{t("raw.col_total")}</TableCell>
                <TableCell sx={{ color: C.sub, fontWeight: 700 }}>{t("raw.col_status")}</TableCell>
                <TableCell align="right" sx={{ color: C.sub, fontWeight: 700 }}>{t("raw.col_actions")}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredMaterials.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} sx={{ borderBottom: "none" }}>
                    <Box sx={{ textAlign: "center", py: 5, color: C.muted }}>
                      <Inventory2 sx={{ fontSize: 40, opacity: 0.3, mb: 1 }} />
                      <Typography variant="h6">{t("raw.empty_title")}</Typography>
                      <Typography variant="body2">{t("raw.empty_sub")}</Typography>
                    </Box>
                  </TableCell>
                </TableRow>
              ) : (
                filteredMaterials.map((mat, idx) => (
                  <TableRow key={mat.id} sx={{ borderBottom: `1px solid ${C.glassBorder}`, animation: `fadeUp 0.4s ease-out ${idx * 0.03}s backwards` }}>
                    <TableCell sx={{ color: C.muted }}>{toPersian(idx + 1)}</TableCell>
                    <TableCell sx={{ fontWeight: 600, color: C.text }}>{mat.name}</TableCell>
                    <TableCell sx={{ color: C.sub }}>{mat.label || "—"}</TableCell>
                    <TableCell sx={{ color: C.text }}>{formatPrice(mat.price)}</TableCell>
                    <TableCell sx={{ fontWeight: 600, color: C.text }}>{formatPrice(mat.qty)}</TableCell>
                    <TableCell sx={{ color: C.sub }}>{getUnitLabel(mat.unit)}</TableCell>
                    <TableCell sx={{ fontWeight: 700, color: C.olive }}>{formatPrice(mat.price * mat.qty)}</TableCell>
                    <TableCell>{getStatusChip(mat.qty)}</TableCell>
                    <TableCell align="right">
                      <IconButton size="small" onClick={() => handleOpenEdit(mat)} sx={{ color: C.olive, bgcolor: C.oliveSubtle, mr: 1 }}><Edit fontSize="small" /></IconButton>
                      <IconButton size="small" onClick={() => handleDelete(mat.id)} sx={{ color: C.danger, bgcolor: C.dangerBg }}><Delete fontSize="small" /></IconButton>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Box>

      {/* Modal */}
      <Dialog open={modalOpen} onClose={() => setModalOpen(false)} maxWidth="sm" fullWidth>
        <Box sx={{ bgcolor: C.glass, backdropFilter: "blur(28px)", p: 3, border: `1px solid ${C.glassBorder}`, borderRadius: "20px" }}>
          <Typography variant="h6" sx={{ fontWeight: 800, mb: 3, color: C.text, display: "flex", alignItems: "center", gap: 1 }}>
            <Add sx={{ color: C.olive }} /> {editingId ? t("raw.modal_edit_title") : t("raw.modal_add_title")}
          </Typography>
          
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 2, mb: 2 }}>
            <TextField label={t("raw.label_name")} value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} sx={inputSx} size="small" />
            <TextField label={t("raw.label_label")} value={formData.label} onChange={(e) => setFormData({...formData, label: e.target.value})} sx={inputSx} size="small" />
            <TextField label={t("raw.label_price")} type="number" value={formData.price} onChange={(e) => setFormData({...formData, price: e.target.value})} sx={inputSx} size="small" />
            <TextField label={t("raw.label_qty")} type="number" value={formData.qty} onChange={(e) => setFormData({...formData, qty: e.target.value})} sx={inputSx} size="small" />
            <FormControl size="small" sx={inputSx}>
              <InputLabel>{t("raw.label_unit")}</InputLabel>
              <Select value={formData.unit} onChange={(e) => setFormData({...formData, unit: e.target.value})} label={t("raw.label_unit")}>
                {UNITS.map(u => <MenuItem key={u.value} value={u.value}>{u.label}</MenuItem>)}
              </Select>
            </FormControl>
            <FormControl size="small" sx={inputSx}>
              <InputLabel>{t("raw.label_type")}</InputLabel>
              <Select value={formData.type} onChange={(e) => setFormData({...formData, type: e.target.value})} label={t("raw.label_type")}>
                <MenuItem value="raw">{t("raw.type_raw")}</MenuItem>
                <MenuItem value="packaging">{t("raw.type_packaging")}</MenuItem>
              </Select>
            </FormControl>
          </Box>

          <Box sx={{ display: "flex", justifyContent: "flex-end", gap: 2, mt: 3 }}>
            <Button onClick={() => setModalOpen(false)} sx={{ color: C.sub }}>{t("raw.btn_cancel")}</Button>
            <Button onClick={handleSave} sx={{ bgcolor: C.btnGrad, color: "#fff" }}>{t("raw.btn_save")}</Button>
          </Box>
        </Box>
      </Dialog>

      <Snackbar open={toast.open} autoHideDuration={3000} onClose={() => setToast({ ...toast, open: false })} anchorOrigin={{ vertical: "top", horizontal: "center" }}>
        <Alert severity={toast.type} sx={{ bgcolor: C.glass, backdropFilter: "blur(16px)", color: C.text, border: `1px solid ${C.olive}`, borderRadius: "12px", fontFamily: "'Vazirmatn', sans-serif" }}>{toast.message}</Alert>
      </Snackbar>
    </Box>
  );
}