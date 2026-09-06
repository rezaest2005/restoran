import { useState, useEffect, useMemo, useCallback } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Box, Typography, Button, IconButton, TextField, Select, MenuItem,
  FormControl, InputLabel, Grid, Chip, CircularProgress, Divider,
  Dialog, DialogTitle, DialogContent, DialogActions, Snackbar, Alert,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper
} from "@mui/material";
import {
  Add, Delete, Edit, Factory, Inventory2, History, Science,
  Close, Check, Warning
} from "@mui/icons-material";
import { useThemeMode } from "../contexts/ThemeContext";
import { useLang } from "../contexts/LangContext";
import superClient from "../api/super_client"; // یا axios

const animations = `
  @keyframes orb1 { 0%, 100% { transform: translate(0, 0) scale(1); } 25% { transform: translate(60px, -80px) scale(1.1); } 50% { transform: translate(-20px, -40px) scale(0.95); } 75% { transform: translate(-50px, 50px) scale(1.05); } }
  @keyframes float { 0%, 100% { transform: translateY(0px); } 50% { transform: translateY(-6px); } }
  @keyframes shimmer { 0% { background-position: -200% center; } 100% { background-position: 200% center; } }
  @keyframes fadeUp { from { opacity: 0; transform: translateY(20px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
`;

const CATEGORIES = [
  { value: "food", label: "غذا" }, { value: "beverage", label: "نوشیدنی" },
  { value: "dessert", label: "دسر" }, { value: "other", label: "سایر" }
];

const UNITS = [
  { value: "unit", label: "عدد" }, { value: "kg", label: "کیلوگرم" },
  { value: "g", label: "گرم" }, { value: "l", label: "لیتر" }, { value: "ml", label: "میلی‌لیتر" }
];

export default function FinishedProducts() {
  const { mode } = useThemeMode();
  const { isRtl } = useLang();
  const { t } = useTranslation();
  const isDark = mode === "dark";

  const [mounted, setMounted] = useState(false);
  const [toast, setToast] = useState({ open: false, message: "", type: "info" });
  
  const [products, setProducts] = useState([]);
  const [semiFinished, setSemiFinished] = useState([]);
  const [rawMaterials, setRawMaterials] = useState([]);
  
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({ name: "", category: "food", unit: "unit", quantity_produced: 1, profit_percentage: 30, description: "" });
  const [semiRows, setSemiRows] = useState([]);
  const [rawRows, setRawRows] = useState([]);
  
  const [produceOpen, setProduceOpen] = useState(false);
  const [producingId, setProducingId] = useState(null);
  const [produceQty, setProduceQty] = useState(1);

  useEffect(() => {
    const tmr = setTimeout(() => setMounted(true), 80);
    return () => clearTimeout(tmr);
  }, []);

  // Fetch Data
  useEffect(() => {
    const fetchData = async () => {
      try {
        // شبیه‌سازی API
        // const { data: prods } = await superClient.get("/api/finished-products/");
        setProducts([
          { id: 1, name: "پیتزا مارگاریتا", category_display: "غذا", unit: "unit", total_cost: 120000, cost_per_unit: 120000, suggested_price: 180000, semi_finished_items: [{ id: 1, semi_finished_name: "خمیر پیتزا", quantity: 1, total_cost: 30000 }], raw_material_items: [{ id: 2, raw_material_name: "پنیر موزارلا", quantity: 0.2, unit: "kg", total_cost: 90000 }] },
          { id: 2, name: "پاستا آلفردو", category_display: "غذا", unit: "unit", total_cost: 85000, cost_per_unit: 85000, suggested_price: 130000, semi_finished_items: [], raw_material_items: [] },
        ]);

        // const { data: semis } = await superClient.get("/api/semi-finished/");
        setSemiFinished([
          { id: 1, name: "خمیر پیتزا", cost_per_unit: 30000, unit: "unit" },
        ]);

        // const { data: raws } = await superClient.get("/api/raw-materials/");
        setRawMaterials([
          { id: 2, name: "پنیر موزارلا", price: 450000, unit: "kg" },
        ]);
      } catch (err) {
        showToast("خطا در بارگذاری اطلاعات", "error");
      }
    };
    fetchData();
  }, []);

  const C = useMemo(() => ({
    bg: isDark ? "#0B0A0B" : "#E4E8F0",
    glass: isDark ? "rgba(16,18,16,0.6)" : "rgba(240,244,252,0.7)",
    glassBorder: isDark ? "rgba(107,155,110,0.1)" : "rgba(80,100,140,0.15)",
    glassShimmer: isDark ? "linear-gradient(90deg, transparent 0%, rgba(107,155,110,0.05) 20%, rgba(168,64,96,0.06) 40%, rgba(212,183,106,0.07) 60%, rgba(107,155,110,0.04) 80%, transparent 100%)" : "linear-gradient(90deg, transparent 0%, rgba(80,100,160,0.06) 20%, rgba(120,40,70,0.05) 40%, rgba(196,162,101,0.06) 60%, rgba(61,90,62,0.04) 80%, transparent 100%)",
    olive: isDark ? "#6B9B6E" : "#2E4D30",
    oliveSubtle: isDark ? "rgba(107,155,110,0.08)" : "rgba(46,77,48,0.08)",
    gold: isDark ? "#D4B76A" : "#A08040",
    text: isDark ? "#F0ECE8" : "#1A1A24",
    sub: isDark ? "#8A8588" : "#555568",
    muted: isDark ? "#4A4548" : "#8A8A9E",
    inputBg: isDark ? "rgba(11,10,11,0.5)" : "rgba(240,244,252,0.85)",
    btnGrad: isDark ? "linear-gradient(135deg, #3D6B40 0%, #5A8A5D 35%, #6B9B6E 70%, #4A7A4D 100%)" : "linear-gradient(135deg, #1E3A20 0%, #2E4D30 35%, #3D5A3E 70%, #2E4D30 100%)",
    danger: isDark ? "#E84057" : "#C83048",
    dangerBg: isDark ? "rgba(232,64,87,0.12)" : "rgba(200,48,72,0.1)",
    cardShadow: isDark ? "0 8px 60px rgba(0,0,0,0.5), 0 0 80px rgba(107,155,110,0.04)" : "0 8px 60px rgba(0,0,0,0.1), 0 0 60px rgba(74,106,148,0.08)",
  }), [isDark]);

  const glassCardSx = {
    bgcolor: C.glass, backdropFilter: "blur(28px)", WebkitBackdropFilter: "blur(28px)",
    border: `1px solid ${C.glassBorder}`, borderRadius: "20px",
    boxShadow: C.cardShadow, position: "relative", overflow: "hidden",
    "&::before": { content: '""', position: "absolute", top: 0, left: 0, right: 0, height: 1, background: C.glassShimmer, backgroundSize: "200% 100%", animation: "shimmer 10s linear infinite", pointerEvents: "none" }
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

  // Calculations
  const semiTotal = useMemo(() => {
    return semiRows.reduce((sum, row) => {
      if (!row.id || !row.qty) return sum;
      const item = semiFinished.find(s => s.id === row.id);
      return sum + (item ? item.cost_per_unit * row.qty : 0);
    }, 0);
  }, [semiRows, semiFinished]);

  const rawTotal = useMemo(() => {
    return rawRows.reduce((sum, row) => {
      if (!row.id || !row.qty) return sum;
      const item = rawMaterials.find(r => r.id === row.id);
      return sum + (item ? item.price * row.qty : 0);
    }, 0);
  }, [rawRows, rawMaterials]);

  const totalCost = semiTotal + rawTotal;
  const perUnitCost = formData.quantity_produced > 0 ? totalCost / formData.quantity_produced : 0;
  const suggestedPrice = Math.round(perUnitCost * (1 + (formData.profit_percentage || 0) / 100));

  const handleOpenCreate = () => {
    setEditingId(null);
    setFormData({ name: "", category: "food", unit: "unit", quantity_produced: 1, profit_percentage: 30, description: "" });
    setSemiRows([]);
    setRawRows([]);
    setFormOpen(true);
  };

  const handleOpenEdit = (product) => {
    setEditingId(product.id);
    setFormData({
      name: product.name,
      category: product.category || "food",
      unit: product.unit || "unit",
      quantity_produced: product.quantity_produced || 1,
      profit_percentage: product.profit_percentage || 30,
      description: product.description || ""
    });
    setSemiRows((product.semi_finished_items || []).map(si => ({ id: si.semi_finished_id, qty: si.quantity })));
    setRawRows((product.raw_material_items || []).map(ri => ({ id: ri.raw_material_id, qty: ri.quantity })));
    setFormOpen(true);
  };

  const handleSave = async () => {
    if (!formData.name) return showToast("نام محصول الزامی است", "error");
    
    const payload = {
      ...formData,
      semi_finished_items: semiRows.filter(r => r.id && r.qty > 0).map(r => ({ semi_finished: r.id, quantity: r.qty })),
      raw_material_items: rawRows.filter(r => r.id && r.qty > 0).map(r => ({ raw_material: r.id, quantity: r.qty })),
    };

    try {
      // if (editingId) await superClient.put(`/api/finished-products/${editingId}/`, payload);
      // else await superClient.post("/api/finished-products/", payload);
      
      // شبیه‌سازی موفقیت
      showToast(editingId ? "محصول ویرایش شد" : "محصول جدید ثبت شد");
      setFormOpen(false);
      // FetchData() should be called here
    } catch (err) {
      showToast("خطا در ذخیره‌سازی", "error");
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("آیا از حذف این محصول مطمئن هستید؟")) return;
    try {
      // await superClient.delete(`/api/finished-products/${id}/`);
      showToast("محصول حذف شد");
      setProducts(prev => prev.filter(p => p.id !== id));
    } catch {
      showToast("خطا در حذف", "error");
    }
  };

  const handleOpenProduce = (product) => {
    setProducingId(product.id);
    setProduceQty(1);
    setProduceOpen(true);
  };

  const handleDoProduce = async () => {
    if (produceQty <= 0) return showToast("تعداد معتبر وارد کنید", "error");
    try {
      // await superClient.post(`/api/finished-products/${producingId}/produce/`, { quantity: produceQty });
      showToast(`${produceQty} واحد تولید شد و از انبار کسر گردید`);
      setProduceOpen(false);
    } catch {
      showToast("خطا در تولید", "error");
    }
  };

  const producingProduct = products.find(p => p.id === producingId);

  return (
    <Box dir={isRtl ? "rtl" : "ltr"} sx={{ position: "relative", fontFamily: "'Vazirmatn', sans-serif", minHeight: "100vh", color: C.text, opacity: mounted ? 1 : 0, transition: "opacity 0.5s ease" }}>
      <style>{animations}</style>

      {/* Header */}
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 4, flexWrap: "wrap", gap: 2 }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 800, mb: 1, display: "flex", alignItems: "center", gap: 1.5 }}>
            <span style={{ fontSize: 28 }}>📦</span> {t("fp.title")}
          </Typography>
          <Typography sx={{ color: C.sub, fontSize: 14 }}>{t("fp.subtitle")}</Typography>
        </Box>
        <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap" }}>
          <Button component={Link} to="/dashboard/app/semi-finished" sx={{ bgcolor: C.oliveSubtle, color: C.olive, "&:hover": { bgcolor: C.oliveSubtle } }}>
            <Science sx={{ ml: 1, fontSize: 18 }} /> {t("fp.link_semi")}
          </Button>
          <Button component={Link} to="/dashboard/app/raw-materials" sx={{ bgcolor: C.oliveSubtle, color: C.olive, "&:hover": { bgcolor: C.oliveSubtle } }}>
            <Inventory2 sx={{ ml: 1, fontSize: 18 }} /> {t("fp.link_warehouse")}
          </Button>
          <Button component={Link} to="/dashboard/app/usage-log" sx={{ bgcolor: C.oliveSubtle, color: C.olive, "&:hover": { bgcolor: C.oliveSubtle } }}>
            <History sx={{ ml: 1, fontSize: 18 }} /> {t("fp.link_usage")}
          </Button>
          <Button onClick={handleOpenCreate} sx={{ bgcolor: C.btnGrad, color: "#fff", boxShadow: `0 4px 14px ${C.olive}55`, "&:hover": { transform: "translateY(-2px)" } }}>
            <Add /> {t("fp.btn_new")}
          </Button>
        </Box>
      </Box>

      {/* Stats */}
      <Grid container spacing={2.5} sx={{ mb: 3 }}>
        {[
          { label: t("fp.stat_count"), value: products.length, color: C.olive },
          { label: t("fp.stat_value"), value: `${products.reduce((s, p) => s + (p.total_cost || 0), 0).toLocaleString()} ت`, color: C.gold },
          { label: t("fp.stat_cats"), value: new Set(products.map(p => p.category_display)).size, color: C.sub },
          { label: t("fp.stat_semi"), value: semiFinished.length, color: C.olive },
        ].map((stat, i) => (
          <Grid item xs={12} sm={6} md={3} key={i}>
            <Box sx={{ ...glassCardSx, p: 2.5, display: "flex", alignItems: "center", gap: 2 }}>
              <Box sx={{ width: 48, height: 48, borderRadius: "12px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, background: `${stat.color}22`, border: `1px solid ${stat.color}33`, animation: "float 5s ease-in-out infinite", flexShrink: 0 }}>
                <Typography sx={{ fontWeight: 800, color: stat.color }}>{stat.value}</Typography>
              </Box>
              <Typography sx={{ fontSize: 12, fontWeight: 600, color: C.sub }}>{stat.label}</Typography>
            </Box>
          </Grid>
        ))}
      </Grid>

      {/* Products Grid */}
      <Grid container spacing={2.5}>
        {products.length === 0 ? (
          <Grid item xs={12}>
            <Box sx={{ ...glassCardSx, p: 8, textAlign: "center" }}>
              <Typography variant="h5" sx={{ fontWeight: 700, mb: 1, color: C.text }}>📦 {t("fp.empty_title")}</Typography>
              <Typography sx={{ color: C.muted, fontSize: 14 }}>{t("fp.empty_sub")}</Typography>
            </Box>
          </Grid>
        ) : (
          products.map((product, i) => (
            <Grid item xs={12} md={6} lg={4} key={product.id}>
              <Box sx={{ ...glassCardSx, p: 3, height: "100%", display: "flex", flexDirection: "column", animation: `fadeUp 0.5s ease-out ${i * 0.05}s backwards` }}>
                <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
                  <Typography variant="h6" sx={{ fontWeight: 700 }}>{product.name}</Typography>
                  <Chip label={product.category_display} size="small" sx={{ bgcolor: C.oliveSubtle, color: C.olive, fontWeight: 600 }} />
                </Box>
                
                <Box sx={{ display: "flex", gap: 2, mb: 2 }}>
                  <Box sx={{ flex: 1, textAlign: "center", p: 1.5, borderRadius: "12px", bgcolor: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)" }}>
                    <Typography sx={{ fontSize: 10, color: C.muted }}>{t("fp.cost_total")}</Typography>
                    <Typography sx={{ fontWeight: 700, fontSize: 13 }}>{product.total_cost?.toLocaleString()}</Typography>
                  </Box>
                  <Box sx={{ flex: 1, textAlign: "center", p: 1.5, borderRadius: "12px", bgcolor: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)" }}>
                    <Typography sx={{ fontSize: 10, color: C.muted }}>{t("fp.cost_unit")}</Typography>
                    <Typography sx={{ fontWeight: 700, fontSize: 13, color: C.olive }}>{product.cost_per_unit?.toLocaleString()}</Typography>
                  </Box>
                  <Box sx={{ flex: 1, textAlign: "center", p: 1.5, borderRadius: "12px", bgcolor: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)" }}>
                    <Typography sx={{ fontSize: 10, color: C.muted }}>{t("fp.cost_suggested")}</Typography>
                    <Typography sx={{ fontWeight: 700, fontSize: 13, color: C.gold }}>{product.suggested_price?.toLocaleString()}</Typography>
                  </Box>
                </Box>

                <Box sx={{ flex: 1, mb: 2 }}>
                  <Typography variant="body2" sx={{ fontWeight: 600, mb: 1, color: C.sub }}>{t("fp.ingredients")} ({product.semi_finished_items?.length + product.raw_material_items?.length} قلم)</Typography>
                  <TableContainer component={Box} sx={{ maxHeight: 150, overflowY: "auto", borderRadius: "8px", border: `1px solid ${C.glassBorder}` }}>
                    <Table size="small">
                      <TableHead>
                        <TableRow sx={{ bgcolor: isDark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.02)" }}>
                          <TableCell sx={{ py: 1, color: C.muted, fontWeight: 700, fontSize: 11 }}>{t("fp.item_type")}</TableCell>
                          <TableCell sx={{ py: 1, color: C.muted, fontWeight: 700, fontSize: 11 }}>{t("fp.item_name")}</TableCell>
                          <TableCell sx={{ py: 1, color: C.muted, fontWeight: 700, fontSize: 11 }} align="right">{t("fp.item_qty")}</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {product.semi_finished_items?.map(si => (
                          <TableRow key={`s-${si.id}`}>
                            <TableCell sx={{ py: 0.5, fontSize: 11 }}><Chip label="نیم‌آماده" size="small" sx={{ height: 18, fontSize: 9, bgcolor: C.gold + "22", color: C.gold }} /></TableCell>
                            <TableCell sx={{ py: 0.5, fontSize: 12 }}>{si.semi_finished_name}</TableCell>
                            <TableCell sx={{ py: 0.5, fontSize: 12, color: C.sub }} align="right">{si.quantity}</TableCell>
                          </TableRow>
                        ))}
                        {product.raw_material_items?.map(ri => (
                          <TableRow key={`r-${ri.id}`}>
                            <TableCell sx={{ py: 0.5, fontSize: 11 }}><Chip label="اولیه" size="small" sx={{ height: 18, fontSize: 9, bgcolor: C.olive + "22", color: C.olive }} /></TableCell>
                            <TableCell sx={{ py: 0.5, fontSize: 12 }}>{ri.raw_material_name}</TableCell>
                            <TableCell sx={{ py: 0.5, fontSize: 12, color: C.sub }} align="right">{ri.quantity} {ri.unit}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </Box>

                <Box sx={{ display: "flex", gap: 1, pt: 2, borderTop: `1px solid ${C.glassBorder}` }}>
                  <Button size="small" onClick={() => handleOpenEdit(product)} sx={{ bgcolor: C.oliveSubtle, color: C.olive, flex: 1 }}>
                    <Edit sx={{ fontSize: 16 }} /> {t("fp.btn_edit")}
                  </Button>
                  <Button size="small" onClick={() => handleOpenProduce(product)} sx={{ bgcolor: C.btnGrad, color: "#fff", flex: 1 }}>
                    <Factory sx={{ fontSize: 16 }} /> {t("fp.btn_produce")}
                  </Button>
                  <IconButton size="small" onClick={() => handleDelete(product.id)} sx={{ bgcolor: C.dangerBg, color: C.danger, "&:hover": { bgcolor: C.dangerBg } }}>
                    <Delete fontSize="small" />
                  </IconButton>
                </Box>
              </Box>
            </Grid>
          ))
        )}
      </Grid>

      {/* Create/Edit Modal */}
      <Dialog open={formOpen} onClose={() => setFormOpen(false)} maxWidth="md" fullWidth>
        <Box sx={{ bgcolor: C.glass, backdropFilter: "blur(28px)", p: 3, border: `1px solid ${C.glassBorder}`, borderRadius: "20px" }}>
          <Typography variant="h5" sx={{ fontWeight: 800, mb: 3, color: C.text }}>
            {editingId ? t("fp.modal_edit_title") : t("fp.modal_new_title")}
          </Typography>
          
          <Grid container spacing={2} sx={{ mb: 2 }}>
            <Grid item xs={12} md={6}>
              <TextField fullWidth label={t("fp.label_name")} value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} sx={inputSx} size="small" />
            </Grid>
            <Grid item xs={12} md={3}>
              <FormControl fullWidth size="small" sx={inputSx}>
                <InputLabel>{t("fp.label_category")}</InputLabel>
                <Select value={formData.category} onChange={(e) => setFormData({...formData, category: e.target.value})} label={t("fp.label_category")}>
                  {CATEGORIES.map(c => <MenuItem key={c.value} value={c.value}>{c.label}</MenuItem>)}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} md={3}>
              <FormControl fullWidth size="small" sx={inputSx}>
                <InputLabel>{t("fp.label_unit")}</InputLabel>
                <Select value={formData.unit} onChange={(e) => setFormData({...formData, unit: e.target.value})} label={t("fp.label_unit")}>
                  {UNITS.map(u => <MenuItem key={u.value} value={u.value}>{u.label}</MenuItem>)}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} md={3}>
              <TextField fullWidth type="number" label={t("fp.label_qty")} value={formData.quantity_produced} onChange={(e) => setFormData({...formData, quantity_produced: parseFloat(e.target.value)})} sx={inputSx} size="small" />
            </Grid>
            <Grid item xs={12} md={3}>
              <TextField fullWidth type="number" label={t("fp.label_profit")} value={formData.profit_percentage} onChange={(e) => setFormData({...formData, profit_percentage: parseInt(e.target.value)})} sx={inputSx} size="small" />
            </Grid>
            <Grid item xs={12}>
              <TextField fullWidth label={t("fp.label_desc")} value={formData.description} onChange={(e) => setFormData({...formData, description: e.target.value})} sx={inputSx} size="small" multiline rows={2} />
            </Grid>
          </Grid>

          {/* Ingredients Sections */}
          <Box sx={{ display: "flex", gap: 2, mb: 2, flexWrap: "wrap" }}>
            <Box sx={{ flex: 1, minWidth: 300 }}>
              <Typography variant="subtitle2" sx={{ mb: 1, color: C.sub, fontWeight: 700 }}>{t("fp.section_semi")}</Typography>
              {semiRows.map((row, idx) => (
                <Box key={idx} sx={{ display: "flex", gap: 1, mb: 1, alignItems: "center" }}>
                  <Select size="small" value={row.id || ""} onChange={(e) => setSemiRows(prev => prev.map((r, i) => i === idx ? {...r, id: e.target.value} : r))} sx={{ ...inputSx, flex: 1 }} displayEmpty>
                    <MenuItem value="">{t("fp.select_item")}</MenuItem>
                    {semiFinished.map(s => <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>)}
                  </Select>
                  <TextField type="number" size="small" value={row.qty || ""} onChange={(e) => setSemiRows(prev => prev.map((r, i) => i === idx ? {...r, qty: parseFloat(e.target.value)} : r))} sx={{ ...inputSx, width: 80 }} placeholder={t("fp.input_qty")} />
                  <IconButton size="small" onClick={() => setSemiRows(prev => prev.filter((_, i) => i !== idx))} sx={{ color: C.danger }}><Close fontSize="small" /></IconButton>
                </Box>
              ))}
              <Button size="small" onClick={() => setSemiRows(prev => [...prev, { id: "", qty: 0 }])} sx={{ mt: 1, color: C.olive, bgcolor: C.oliveSubtle }}>
                <Add fontSize="small" /> {t("fp.btn_add_semi")}
              </Button>
            </Box>

            <Box sx={{ flex: 1, minWidth: 300 }}>
              <Typography variant="subtitle2" sx={{ mb: 1, color: C.sub, fontWeight: 700 }}>{t("fp.section_raw")}</Typography>
              {rawRows.map((row, idx) => (
                <Box key={idx} sx={{ display: "flex", gap: 1, mb: 1, alignItems: "center" }}>
                  <Select size="small" value={row.id || ""} onChange={(e) => setRawRows(prev => prev.map((r, i) => i === idx ? {...r, id: e.target.value} : r))} sx={{ ...inputSx, flex: 1 }} displayEmpty>
                    <MenuItem value="">{t("fp.select_item")}</MenuItem>
                    {rawMaterials.map(r => <MenuItem key={r.id} value={r.id}>{r.name}</MenuItem>)}
                  </Select>
                  <TextField type="number" size="small" value={row.qty || ""} onChange={(e) => setRawRows(prev => prev.map((r, i) => i === idx ? {...r, qty: parseFloat(e.target.value)} : r))} sx={{ ...inputSx, width: 80 }} placeholder={t("fp.input_qty")} />
                  <IconButton size="small" onClick={() => setRawRows(prev => prev.filter((_, i) => i !== idx))} sx={{ color: C.danger }}><Close fontSize="small" /></IconButton>
                </Box>
              ))}
              <Button size="small" onClick={() => setRawRows(prev => [...prev, { id: "", qty: 0 }])} sx={{ mt: 1, color: C.olive, bgcolor: C.oliveSubtle }}>
                <Add fontSize="small" /> {t("fp.btn_add_raw")}
              </Button>
            </Box>
          </Box>

          {/* Cost Preview */}
          <Box sx={{ p: 2, borderRadius: "12px", bgcolor: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)", mb: 2 }}>
            <Grid container spacing={2}>
              <Grid item xs={6} md={3}>
                <Typography sx={{ fontSize: 11, color: C.muted }}>{t("fp.cp_semi")}</Typography>
                <Typography sx={{ fontWeight: 700 }}>{Math.round(semiTotal).toLocaleString()} ت</Typography>
              </Grid>
              <Grid item xs={6} md={3}>
                <Typography sx={{ fontSize: 11, color: C.muted }}>{t("fp.cp_raw")}</Typography>
                <Typography sx={{ fontWeight: 700 }}>{Math.round(rawTotal).toLocaleString()} ت</Typography>
              </Grid>
              <Grid item xs={6} md={3}>
                <Typography sx={{ fontSize: 11, color: C.muted }}>{t("fp.cp_total")}</Typography>
                <Typography sx={{ fontWeight: 700 }}>{Math.round(totalCost).toLocaleString()} ت</Typography>
              </Grid>
              <Grid item xs={6} md={3}>
                <Typography sx={{ fontSize: 11, color: C.muted }}>{t("fp.cp_suggested")}</Typography>
                <Typography sx={{ fontWeight: 800, color: C.gold }}>{suggestedPrice.toLocaleString()} ت</Typography>
              </Grid>
            </Grid>
          </Box>

          <Box sx={{ display: "flex", justifyContent: "flex-end", gap: 2 }}>
            <Button onClick={() => setFormOpen(false)} sx={{ color: C.sub }}>{t("fp.btn_cancel")}</Button>
            <Button onClick={handleSave} sx={{ bgcolor: C.btnGrad, color: "#fff" }}>{t("fp.btn_save")}</Button>
          </Box>
        </Box>
      </Dialog>

      {/* Produce Modal */}
      <Dialog open={produceOpen} onClose={() => setProduceOpen(false)} maxWidth="xs" fullWidth>
        <Box sx={{ bgcolor: C.glass, backdropFilter: "blur(28px)", p: 3, border: `1px solid ${C.glassBorder}`, borderRadius: "20px" }}>
          <Typography variant="h6" sx={{ fontWeight: 800, mb: 2, color: C.text }}>{t("fp.produce_title")}</Typography>
          {producingProduct && (
            <Box sx={{ mb: 2 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>{producingProduct.name}</Typography>
              <Typography sx={{ fontSize: 12, color: C.muted }}>
                هزینه هر واحد: {producingProduct.cost_per_unit?.toLocaleString()} تومان
              </Typography>
            </Box>
          )}
          <TextField fullWidth type="number" label={t("fp.produce_qty")} value={produceQty} onChange={(e) => setProduceQty(parseFloat(e.target.value))} sx={inputSx} size="small" />
          <Box sx={{ mt: 2, p: 2, borderRadius: "12px", bgcolor: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)", textAlign: "center" }}>
            <Typography sx={{ fontSize: 11, color: C.muted }}>{t("fp.produce_cost")}</Typography>
            <Typography variant="h6" sx={{ fontWeight: 800, color: C.gold }}>
              {producingProduct ? (producingProduct.cost_per_unit * produceQty).toLocaleString() : 0} تومان
            </Typography>
          </Box>
          <Box sx={{ display: "flex", justifyContent: "flex-end", gap: 2, mt: 3 }}>
            <Button onClick={() => setProduceOpen(false)} sx={{ color: C.sub }}>{t("fp.btn_cancel")}</Button>
            <Button onClick={handleDoProduce} sx={{ bgcolor: C.btnGrad, color: "#fff" }}>
              <Factory sx={{ ml: 1, fontSize: 18 }} /> {t("fp.btn_do_produce")}
            </Button>
          </Box>
        </Box>
      </Dialog>

      <Snackbar open={toast.open} autoHideDuration={3000} onClose={() => setToast({ ...toast, open: false })} anchorOrigin={{ vertical: "top", horizontal: "center" }}>
        <Alert severity={toast.type} sx={{ bgcolor: C.glass, backdropFilter: "blur(16px)", color: C.text, border: `1px solid ${C.olive}`, borderRadius: "12px", fontFamily: "'Vazirmatn', sans-serif" }}>{toast.message}</Alert>
      </Snackbar>
    </Box>
  );
} 