import { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  Box, Typography, IconButton, TextField, Grid, Chip,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  InputAdornment
} from "@mui/material";
import {
  Search, Inventory2, CheckCircle, Cancel, DarkMode, LightMode, Language
} from "@mui/icons-material";
import { useThemeMode } from "../contexts/ThemeContext";
import { useLang } from "../contexts/LangContext";

const animations = `
  @keyframes orb1 { 0%, 100% { transform: translate(0, 0) scale(1); } 25% { transform: translate(60px, -80px) scale(1.1); } 50% { transform: translate(-20px, -40px) scale(0.95); } 75% { transform: translate(-50px, 50px) scale(1.05); } }
  @keyframes float { 0%, 100% { transform: translateY(0px); } 50% { transform: translateY(-6px); } }
  @keyframes shimmer { 0% { background-position: -200% center; } 100% { background-position: 200% center; } }
  @keyframes fadeUp { from { opacity: 0; transform: translateY(20px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
`;

export default function ReadyMaterials() {
  const { mode, toggleTheme } = useThemeMode();
  const { isRtl, toggleLang, lang } = useLang();
  const { t } = useTranslation();
  const isDark = mode === "dark";

  const [mounted, setMounted] = useState(false);
  const [search, setSearch] = useState("");
  
  // Mock Data
  const [items, setItems] = useState([
    { id: 1, name: "سس مارینارا", unit_display: "لیتر", quantity: 15, price: 45000, in_stock: true },
    { id: 2, name: "خمیر پیتزا", unit_display: "عدد", quantity: 0, price: 30000, in_stock: false },
    { id: 3, name: "برگر آماده", unit_display: "عدد", quantity: 50, price: 65000, in_stock: true },
    { id: 4, name: "سس سفید", unit_display: "کیلوگرم", quantity: null, price: null, in_stock: false },
  ]);

  useEffect(() => {
    const tmr = setTimeout(() => setMounted(true), 80);
    return () => clearTimeout(tmr);
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
    danger: isDark ? "#E84057" : "#C83048",
    dangerBg: isDark ? "rgba(232,64,87,0.12)" : "rgba(200,48,72,0.1)",
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
  };

  const toPersian = (n) => {
    if (lang !== "fa") return n;
    return String(n).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[d]);
  };

  const formatPrice = (n) => {
    if (n === null || isNaN(n)) return "—";
    return toPersian(Number(n).toLocaleString("en-US"));
  };

  const stats = useMemo(() => {
    let inStock = 0, outStock = 0;
    items.forEach(item => {
      if (item.in_stock) inStock++;
      else outStock++;
    });
    return { total: items.length, inStock, outStock };
  }, [items]);

  const filteredItems = useMemo(() => {
    return items.filter(item => 
      !search || item.name.toLowerCase().includes(search.toLowerCase())
    );
  }, [items, search]);

  const getStatusChip = (item) => {
    if (item.quantity !== null && item.quantity > 0) 
      return <Chip label={t("ready.status_ok")} size="small" sx={{ bgcolor: C.successBg, color: C.success, fontWeight: 600 }} />;
    if (item.quantity !== null && item.quantity <= 0) 
      return <Chip label={t("ready.status_out")} size="small" sx={{ bgcolor: C.dangerBg, color: C.danger, fontWeight: 600 }} />;
    return <Chip label={t("ready.status_no_stock")} size="small" sx={{ bgcolor: C.dangerBg, color: C.danger, fontWeight: 600 }} />;
  };

  return (
    <Box dir={isRtl ? "rtl" : "ltr"} sx={{ position: "relative", fontFamily: "'Vazirmatn', sans-serif", minHeight: "100vh", color: C.text, opacity: mounted ? 1 : 0, transition: "opacity 0.5s ease", pb: 10 }}>
      <style>{animations}</style>

      {/* Header */}
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 4, flexWrap: "wrap", gap: 2 }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 800, mb: 1, display: "flex", alignItems: "center", gap: 1.5 }}>
            <span style={{ fontSize: 28 }}>📦</span> {t("ready.title")}
          </Typography>
          <Typography sx={{ color: C.sub, fontSize: 14 }}>{t("ready.subtitle")}</Typography>
        </Box>
        <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap" }}>
          <IconButton onClick={toggleTheme} size="small" sx={{ border: `1px solid ${C.glassBorder}`, borderRadius: "10px", bgcolor: C.glass, color: C.text }}>
            {isDark ? <LightMode fontSize="small" /> : <DarkMode fontSize="small" />}
          </IconButton>
          <IconButton onClick={toggleLang} size="small" sx={{ border: `1px solid ${C.glassBorder}`, borderRadius: "10px", bgcolor: C.glass, color: C.text }}>
            <Language fontSize="small" />
          </IconButton>
        </Box>
      </Box>

      {/* Stats */}
      <Grid container spacing={2.5} sx={{ mb: 3 }}>
        {[
          { label: t("ready.stat_total"), value: stats.total, color: C.olive, icon: <Inventory2 /> },
          { label: t("ready.stat_instock"), value: stats.inStock, color: C.success, icon: <CheckCircle /> },
          { label: t("ready.stat_outstock"), value: stats.outStock, color: C.danger, icon: <Cancel /> },
        ].map((stat, i) => (
          <Grid item xs={12} sm={6} md={4} key={i}>
            <Box sx={{ ...glassCardSx, p: 2.5, display: "flex", alignItems: "center", gap: 2 }}>
              <Box sx={{ width: 48, height: 48, borderRadius: "12px", display: "flex", alignItems: "center", justifyContent: "center", background: `${stat.color}22`, border: `1px solid ${stat.color}33`, animation: "float 5s ease-in-out infinite", flexShrink: 0, color: stat.color }}>
                {stat.icon}
              </Box>
              <Box>
                <Typography sx={{ fontWeight: 800, fontSize: 20, color: C.text }}>{toPersian(stat.value)}</Typography>
                <Typography sx={{ fontSize: 12, fontWeight: 600, color: C.sub }}>{stat.label}</Typography>
              </Box>
            </Box>
          </Grid>
        ))}
      </Grid>

      {/* Toolbar & Table */}
      <Box sx={{ ...glassCardSx, p: { xs: 2, md: 3 } }}>
        <TextField 
          size="small" 
          placeholder={t("ready.search")} 
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          sx={{ ...inputSx, mb: 3, maxWidth: 400 }}
          InputProps={{ startAdornment: <InputAdornment position="start"><Search sx={{ fontSize: 18, color: C.muted }} /></InputAdornment> }}
        />

        <TableContainer component={Box} sx={{ overflowX: "auto" }}>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ borderBottom: `1px solid ${C.glassBorder}` }}>
                <TableCell sx={{ color: C.sub, fontWeight: 700, width: 40 }}>{t("ready.col_num")}</TableCell>
                <TableCell sx={{ color: C.sub, fontWeight: 700 }}>{t("ready.col_name")}</TableCell>
                <TableCell sx={{ color: C.sub, fontWeight: 700 }}>{t("ready.col_unit")}</TableCell>
                <TableCell sx={{ color: C.sub, fontWeight: 700 }}>{t("ready.col_stock")}</TableCell>
                <TableCell sx={{ color: C.sub, fontWeight: 700 }}>{t("ready.col_price")}</TableCell>
                <TableCell sx={{ color: C.sub, fontWeight: 700 }}>{t("ready.col_total")}</TableCell>
                <TableCell sx={{ color: C.sub, fontWeight: 700 }}>{t("ready.col_status")}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredItems.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} sx={{ borderBottom: "none" }}>
                    <Box sx={{ textAlign: "center", py: 5, color: C.muted }}>
                      <Inventory2 sx={{ fontSize: 40, opacity: 0.3, mb: 1 }} />
                      <Typography variant="h6">{t("ready.empty_title")}</Typography>
                    </Box>
                  </TableCell>
                </TableRow>
              ) : (
                filteredItems.map((item, idx) => (
                  <TableRow key={item.id} sx={{ borderBottom: `1px solid ${C.glassBorder}`, animation: `fadeUp 0.4s ease-out ${idx * 0.03}s backwards`, opacity: item.in_stock ? 1 : 0.6 }}>
                    <TableCell sx={{ color: C.muted }}>{toPersian(idx + 1)}</TableCell>
                    <TableCell sx={{ fontWeight: 700, color: C.text }}>{item.name}</TableCell>
                    <TableCell sx={{ color: C.sub }}>{item.unit_display}</TableCell>
                    <TableCell sx={{ fontWeight: 600, color: item.in_stock ? C.text : C.danger }}>
                      {item.quantity !== null ? toPersian(item.quantity) : "—"}
                    </TableCell>
                    <TableCell sx={{ color: C.text }}>{formatPrice(item.price)}</TableCell>
                    <TableCell sx={{ fontWeight: 700, color: C.olive }}>
                      {item.quantity !== null && item.price > 0 ? formatPrice(item.quantity * item.price) : "—"}
                    </TableCell>
                    <TableCell>{getStatusChip(item)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Box>

    </Box>
  );
}