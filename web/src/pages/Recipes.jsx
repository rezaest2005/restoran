import { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  Box, Typography, Button, IconButton, TextField, Select, MenuItem,
  FormControl, InputLabel, Grid, Chip, CircularProgress, Divider,
  Dialog, DialogTitle, DialogContent, DialogActions, Snackbar, Alert,
  Tabs, Tab, InputAdornment, Paper, List, ListItem, ListItemText, ListItemIcon
} from "@mui/material";
import {
  Add, Delete, Edit, Search, Fastfood, Science, Inventory2,
  DarkMode, LightMode, Language, Calculate, LocalDining, SoupKitchen
} from "@mui/icons-material";
import { useThemeMode } from "../contexts/ThemeContext";
import { useLang } from "../contexts/LangContext";

const animations = `
  @keyframes orb1 { 0%, 100% { transform: translate(0, 0) scale(1); } 25% { transform: translate(60px, -80px) scale(1.1); } 50% { transform: translate(-20px, -40px) scale(0.95); } 75% { transform: translate(-50px, 50px) scale(1.05); } }
  @keyframes float { 0%, 100% { transform: translateY(0px); } 50% { transform: translateY(-6px); } }
  @keyframes shimmer { 0% { background-position: -200% center; } 100% { background-position: 200% center; } }
  @keyframes fadeUp { from { opacity: 0; transform: translateY(20px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
`;

export default function Recipes() {
  const { mode, toggleTheme } = useThemeMode();
  const { isRtl, toggleLang, lang } = useLang();
  const { t } = useTranslation();
  const isDark = mode === "dark";

  const [mounted, setMounted] = useState(false);
  const [tabValue, setTabValue] = useState(0);
  const [toast, setToast] = useState({ open: false, message: "", type: "info" });
  
  const [editorOpen, setEditorOpen] = useState(false);
  const [produceOpen, setProduceOpen] = useState(false);
  const [produceItem, setProduceItem] = useState(null);
  const [produceQty, setProduceQty] = useState(1);

  useEffect(() => {
    const tmr = setTimeout(() => setMounted(true), 80);
    return () => clearTimeout(tmr);
  }, []);

  // Mock Data
  const [recipes, setRecipes] = useState([
    { id: 1, food_name: "پیتزا مارگاریتا", cost: 120000, ingredients: ["خمیر", "پنیر", "سس"] },
    { id: 2, food_name: "برگر خاص", cost: 95000, ingredients: ["نان", "گوشت", "پنیر"] },
  ]);
  const [semiFinished, setSemiFinished] = useState([
    { id: 1, name: "خمیر پیتزا", cost: 30000, unit: "عدد" },
    { id: 2, name: "سس مارینارا", cost: 15000, unit: "لیتر" },
  ]);

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
  };

  const showToast = (message, type = "success") => setToast({ open: true, message, type });

  const handleOpenEditor = () => setEditorOpen(true);
  const handleOpenProduce = (item) => { setProduceItem(item); setProduceQty(1); setProduceOpen(true); };

  return (
    <Box dir={isRtl ? "rtl" : "ltr"} sx={{ position: "relative", fontFamily: "'Vazirmatn', sans-serif", minHeight: "100vh", color: C.text, opacity: mounted ? 1 : 0, transition: "opacity 0.5s ease", pb: 10 }}>
      <style>{animations}</style>

      {/* Header */}
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 4, flexWrap: "wrap", gap: 2 }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 800, mb: 1, display: "flex", alignItems: "center", gap: 1.5 }}>
            <span style={{ fontSize: 28 }}>🍲</span> {t("recipe.title")}
          </Typography>
          <Typography sx={{ color: C.sub, fontSize: 14 }}>{t("recipe.subtitle")}</Typography>
        </Box>
        <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap" }}>
          <Button sx={{ bgcolor: C.oliveSubtle, color: C.olive, "&:hover": { bgcolor: C.oliveSubtle } }}>
            <Calculate sx={{ ml: 1 }} /> {t("recipe.btn_recalc")}
          </Button>
          <IconButton onClick={toggleTheme} size="small" sx={{ border: `1px solid ${C.glassBorder}`, borderRadius: "10px", bgcolor: C.glass, color: C.text }}>
            {isDark ? <LightMode fontSize="small" /> : <DarkMode fontSize="small" />}
          </IconButton>
          <IconButton onClick={toggleLang} size="small" sx={{ border: `1px solid ${C.glassBorder}`, borderRadius: "10px", bgcolor: C.glass, color: C.text }}>
            <Language fontSize="small" />
          </IconButton>
        </Box>
      </Box>

      {/* Tabs */}
      <Box sx={{ ...glassCardSx, p: 1, mb: 3 }}>
        <Tabs value={tabValue} onChange={(e, v) => setTabValue(v)} variant="scrollable" scrollButtons="auto" sx={{ "& .MuiTab-root": { color: C.sub, fontWeight: 600, fontFamily: "'Vazirmatn', sans-serif", "&.Mui-selected": { color: C.olive } }, "& .MuiTabs-indicator": { bgcolor: C.olive } }}>
          <Tab icon={<Fastfood />} iconPosition="start" label={t("recipe.tab_kitchen")} />
          <Tab icon={<Science />} iconPosition="start" label={t("recipe.tab_semi")} />
          <Tab icon={<Inventory2 />} iconPosition="start" label={t("recipe.tab_packaging")} />
        </Tabs>
      </Box>

      {/* Kitchen Tab */}
      {tabValue === 0 && (
        <Box>
          <Grid container spacing={2.5} sx={{ mb: 3 }}>
            {[
              { label: t("recipe.stat_total"), value: recipes.length, color: C.olive, icon: <Fastfood /> },
              { label: t("recipe.stat_foods"), value: recipes.length, color: C.gold, icon: <LocalDining /> },
              { label: t("recipe.stat_avg"), value: "۱۰۷K", color: C.burgundy, icon: <Calculate /> },
              { label: t("recipe.stat_raw"), value: 45, color: C.sub, icon: <Inventory2 /> },
            ].map((stat, i) => (
              <Grid item xs={12} sm={6} md={3} key={i}>
                <Box sx={{ ...glassCardSx, p: 2.5, display: "flex", alignItems: "center", gap: 2 }}>
                  <Box sx={{ width: 48, height: 48, borderRadius: "12px", display: "flex", alignItems: "center", justifyContent: "center", background: `${stat.color}22`, border: `1px solid ${stat.color}33`, animation: "float 5s ease-in-out infinite", flexShrink: 0, color: stat.color }}>
                    {stat.icon}
                  </Box>
                  <Box>
                    <Typography sx={{ fontWeight: 800, fontSize: 18, color: C.text }}>{stat.value}</Typography>
                    <Typography sx={{ fontSize: 12, fontWeight: 600, color: C.sub }}>{stat.label}</Typography>
                  </Box>
                </Box>
              </Grid>
            ))}
          </Grid>

          <Box sx={{ ...glassCardSx, p: { xs: 2, md: 3 } }}>
            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 3 }}>
              <Typography variant="h6" sx={{ fontWeight: 700, display: "flex", alignItems: "center", gap: 1 }}>
                <Fastfood sx={{ color: C.olive }} /> لیست رسپی‌ها
              </Typography>
              <Box sx={{ display: "flex", gap: 2, alignItems: "center" }}>
                <TextField size="small" placeholder={t("recipe.search_recipe")} sx={{ ...inputSx, maxWidth: 250 }} InputProps={{ startAdornment: <InputAdornment position="start"><Search sx={{ fontSize: 18, color: C.muted }} /></InputAdornment> }} />
                <Button onClick={handleOpenEditor} sx={{ bgcolor: C.btnGrad, color: "#fff" }}>
                  <Add /> {t("recipe.btn_new_recipe")}
                </Button>
              </Box>
            </Box>

            <Grid container spacing={2.5}>
              {recipes.map((r, i) => (
                <Grid item xs={12} sm={6} md={4} key={r.id}>
                  <Box sx={{ p: 2.5, borderRadius: "16px", border: `1px solid ${C.glassBorder}`, bgcolor: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.01)', animation: `fadeUp 0.4s ease-out ${i * 0.05}s backwards`, transition: "all 0.2s ease", "&:hover": { transform: "translateY(-2px)", borderColor: C.olive } }}>
                    <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1.5 }}>
                      <Typography sx={{ fontWeight: 700, fontSize: 15 }}>{r.food_name}</Typography>
                      <Chip label={`${r.cost.toLocaleString()} ت`} size="small" sx={{ bgcolor: C.oliveSubtle, color: C.olive, fontWeight: 700 }} />
                    </Box>
                    <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap", mb: 2 }}>
                      {r.ingredients.map((ing, idx) => <Chip key={idx} label={ing} size="small" sx={{ height: 20, fontSize: 10, bgcolor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)', color: C.sub }} />)}
                    </Box>
                    <Box sx={{ display: "flex", gap: 1 }}>
                      <Button size="small" sx={{ flex: 1, bgcolor: C.oliveSubtle, color: C.olive }}><Edit sx={{ fontSize: 16 }} /> {t("recipe.btn_edit")}</Button>
                      <Button size="small" sx={{ flex: 1, bgcolor: C.btnGrad, color: "#fff" }}><Calculate sx={{ fontSize: 16 }} /> محاسبه</Button>
                    </Box>
                  </Box>
                </Grid>
              ))}
            </Grid>
          </Box>
        </Box>
      )}

      {/* Semi-Finished Tab */}
      {tabValue === 1 && (
        <Box sx={{ ...glassCardSx, p: { xs: 2, md: 3 } }}>
          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 3 }}>
            <Typography variant="h6" sx={{ fontWeight: 700, display: "flex", alignItems: "center", gap: 1 }}>
              <Science sx={{ color: C.olive }} /> مواد نیمه‌آماده
            </Typography>
            <Button sx={{ bgcolor: C.btnGrad, color: "#fff" }}>
              <Add /> {t("recipe.btn_new_semi")}
            </Button>
          </Box>
          <Grid container spacing={2.5}>
            {semiFinished.map((s, i) => (
              <Grid item xs={12} sm={6} md={4} key={s.id}>
                <Box sx={{ p: 2.5, borderRadius: "16px", border: `1px solid ${C.glassBorder}`, animation: `fadeUp 0.4s ease-out ${i * 0.05}s backwards` }}>
                  <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1.5 }}>
                    <Typography sx={{ fontWeight: 700, fontSize: 15 }}>{s.name}</Typography>
                    <Chip label={`${s.cost.toLocaleString()} ت / ${s.unit}`} size="small" sx={{ bgcolor: C.oliveSubtle, color: C.olive, fontWeight: 700 }} />
                  </Box>
                  <Box sx={{ display: "flex", gap: 1, mt: 2 }}>
                    <Button size="small" sx={{ flex: 1, bgcolor: C.oliveSubtle, color: C.olive }}><Edit sx={{ fontSize: 16 }} /> {t("recipe.btn_edit")}</Button>
                    <Button size="small" onClick={() => handleOpenProduce(s)} sx={{ flex: 1, bgcolor: C.btnGrad, color: "#fff" }}><SoupKitchen sx={{ fontSize: 16 }} /> تولید</Button>
                  </Box>
                </Box>
              </Grid>
            ))}
          </Grid>
        </Box>
      )}

      {/* Packaging Tab */}
      {tabValue === 2 && (
        <Box sx={{ ...glassCardSx, p: { xs: 2, md: 3 }, textAlign: "center", py: 8 }}>
          <Inventory2 sx={{ fontSize: 60, color: C.muted, mb: 2 }} />
          <Typography variant="h6">{t("recipe.tab_packaging")}</Typography>
          <Typography sx={{ color: C.muted, mt: 1 }}>این بخش در نسخه دمو پیاده‌سازی نشده است.</Typography>
        </Box>
      )}

      {/* Editor Modal */}
      <Dialog open={editorOpen} onClose={() => setEditorOpen(false)} maxWidth="md" fullWidth>
        <Box sx={{ bgcolor: C.glass, backdropFilter: "blur(28px)", p: 3, border: `1px solid ${C.glassBorder}`, borderRadius: "20px" }}>
          <Typography variant="h6" sx={{ fontWeight: 800, mb: 3, color: C.text, display: "flex", alignItems: "center", gap: 1 }}>
            <Add sx={{ color: C.olive }} /> {t("recipe.btn_new_recipe")}
          </Typography>
          <Grid container spacing={2}>
            <Grid item xs={12} md={6}>
              <FormControl fullWidth size="small" sx={inputSx}>
                <InputLabel>انتخاب غذا</InputLabel>
                <Select label="انتخاب غذا" defaultValue="">
                  <MenuItem value="">انتخاب کنید...</MenuItem>
                  <MenuItem value="1">پیتزا مارگاریتا</MenuItem>
                  <MenuItem value="2">برگر خاص</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField fullWidth label="زمان آماده‌سازی (دقیقه)" type="number" defaultValue={15} size="small" sx={inputSx} />
            </Grid>
            <Grid item xs={12}>
              <Box sx={{ p: 2, borderRadius: "12px", border: `1px dashed ${C.glassBorder}`, minHeight: 100, display: "flex", alignItems: "center", justifyContent: "center", color: C.muted, cursor: "pointer", "&:hover": { borderColor: C.olive } }}>
                <Typography>برای افزودن مواد اولیه کلیک کنید</Typography>
              </Box>
            </Grid>
            <Grid item xs={12}>
              <Box sx={{ p: 2, borderRadius: "12px", bgcolor: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)" }}>
                <Typography sx={{ fontSize: 12, color: C.muted }}>{t("recipe.cost_per_unit")}</Typography>
                <Typography variant="h5" sx={{ fontWeight: 800, color: C.olive }}>۰ تومان</Typography>
              </Box>
            </Grid>
          </Grid>
          <Box sx={{ display: "flex", justifyContent: "flex-end", gap: 2, mt: 3 }}>
            <Button onClick={() => setEditorOpen(false)} sx={{ color: C.sub }}>{t("recipe.btn_cancel")}</Button>
            <Button onClick={() => { showToast("رسپی ذخیره شد"); setEditorOpen(false); }} sx={{ bgcolor: C.btnGrad, color: "#fff" }}>{t("recipe.btn_save")}</Button>
          </Box>
        </Box>
      </Dialog>

      {/* Produce Modal */}
      <Dialog open={produceOpen} onClose={() => setProduceOpen(false)} maxWidth="xs" fullWidth>
        <Box sx={{ bgcolor: C.glass, backdropFilter: "blur(28px)", p: 3, border: `1px solid ${C.glassBorder}`, borderRadius: "20px" }}>
          <Typography variant="h6" sx={{ fontWeight: 800, mb: 3, color: C.text, display: "flex", alignItems: "center", gap: 1 }}>
            <SoupKitchen sx={{ color: C.olive }} /> {t("recipe.produce_title")}
          </Typography>
          {produceItem && (
            <Box sx={{ mb: 3 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>{produceItem.name}</Typography>
              <Typography sx={{ fontSize: 12, color: C.muted }}>هزینه واحد: {produceItem.cost.toLocaleString()} تومان</Typography>
            </Box>
          )}
          <TextField fullWidth type="number" label={t("recipe.produce_qty")} value={produceQty} onChange={(e) => setProduceQty(e.target.value)} sx={inputSx} size="small" />
          <Box sx={{ mt: 2, p: 2, borderRadius: "12px", bgcolor: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)" }}>
            <Typography sx={{ fontSize: 11, color: C.muted }}>هزینه کل این تولید</Typography>
            <Typography variant="h6" sx={{ fontWeight: 800, color: C.gold }}>
              {produceItem ? (produceItem.cost * produceQty).toLocaleString() : 0} تومان
            </Typography>
          </Box>
          <Box sx={{ display: "flex", justifyContent: "flex-end", gap: 2, mt: 3 }}>
            <Button onClick={() => setProduceOpen(false)} sx={{ color: C.sub }}>{t("recipe.btn_cancel")}</Button>
            <Button onClick={() => { showToast("تولید با موفقیت ثبت شد"); setProduceOpen(false); }} sx={{ bgcolor: C.btnGrad, color: "#fff" }}>
              <SoupKitchen sx={{ ml: 1, fontSize: 18 }} /> {t("recipe.produce_btn")}
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