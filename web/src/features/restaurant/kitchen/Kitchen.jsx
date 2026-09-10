import { useState, useEffect, useMemo, useCallback } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Box, Typography, Button, IconButton, TextField, Select, MenuItem,
  FormControl, InputLabel, Grid, Chip, CircularProgress, Divider,
  Dialog, DialogTitle, DialogContent, DialogActions, Snackbar, Alert,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper,
  Tabs, Tab, InputAdornment
} from "@mui/material";
import {
  FireHazard, Inventory2, History, ClipboardData, Receipt, Book, Trash3,
  CheckCircle, PlusLg, XCircle, BellFill, ArrowClockwise, Calculator, GearWideConnected, TagFill
} from "@mui/icons-material"; // آیکون‌های فرضی (می‌توانید آیکون‌های واقعی MUI را جایگزین کنید)
import { useThemeMode } from "../contexts/ThemeContext";
import { useLang } from "../contexts/LangContext";

// آیکون‌های MUI واقعی
import FireExtinguisherIcon from '@mui/icons-material/FireExtinguisher'; // جایگزین FireHazard
import InventoryIcon from '@mui/icons-material/Inventory'; // جایگزین Inventory2
import HistoryIcon from '@mui/icons-material/History'; // جایگزین History
import ClipboardDataIcon from '@mui/icons-material/DataObject'; // جایگزین ClipboardData
import ReceiptIcon from '@mui/icons-material/Receipt'; // جایگزین Receipt
import BookIcon from '@mui/icons-material/Book'; // جایگزین Book
import DeleteIcon from '@mui/icons-material/Delete'; // جایگزین Trash3
import CheckCircleIcon from '@mui/icons-material/CheckCircle'; // جایگزین CheckCircle
import AddIcon from '@mui/icons-material/Add'; // جایگزین PlusLg
import CancelIcon from '@mui/icons-material/Cancel'; // جایگزین XCircle
import NotificationsIcon from '@mui/icons-material/Notifications'; // جایگزین BellFill
import RefreshIcon from '@mui/icons-material/Refresh'; // جایگزین ArrowClockwise
import CalculateIcon from '@mui/icons-material/Calculate'; // جایگزین Calculator
import PrecisionManufacturingIcon from '@mui/icons-material/PrecisionManufacturing'; // جایگزین GearWideConnected
import LocalOfferIcon from '@mui/icons-material/LocalOffer'; // جایگزین TagFill

const animations = `
  @keyframes orb1 { 0%, 100% { transform: translate(0, 0) scale(1); } 25% { transform: translate(60px, -80px) scale(1.1); } 50% { transform: translate(-20px, -40px) scale(0.95); } 75% { transform: translate(-50px, 50px) scale(1.05); } }
  @keyframes float { 0%, 100% { transform: translateY(0px); } 50% { transform: translateY(-6px); } }
  @keyframes shimmer { 0% { background-position: -200% center; } 100% { background-position: 200% center; } }
  @keyframes fadeUp { from { opacity: 0; transform: translateY(20px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
`;

export default function Kitchen() {
  const { mode } = useThemeMode();
  const { isRtl } = useLang();
  const { t } = useTranslation();
  const isDark = mode === "dark";

  const [mounted, setMounted] = useState(false);
  const [tabValue, setTabValue] = useState(0);
  const [toast, setToast] = useState({ open: false, message: "", type: "info" });
  
  // States for Data
  const [orders, setOrders] = useState([]);
  const [menuFoods, setMenuFoods] = useState([]);
  const [wastes, setWastes] = useState([]);
  const [stats, setStats] = useState({ total_products: 0, total_stock: 0, inventory_value: 0, waste_today_qty: 0 });

  // Modals
  const [produceModalOpen, setProduceModalOpen] = useState(false);
  const [costModalOpen, setCostModalOpen] = useState(false);
  const [wasteModalOpen, setWasteModalOpen] = useState(false);

  useEffect(() => {
    const tmr = setTimeout(() => setMounted(true), 80);
    return () => clearTimeout(tmr);
  }, []);

  // Fetch Data (Mock)
  useEffect(() => {
    // شبیه‌سازی دریافت داده از سرور
    setOrders([
      { id: 1024, customer_name: "میز ۴", created_at: "۲ دقیقه پیش", items: [{ food_name: "پیتزا پپرونی", quantity: 1 }], total_price: 180000 },
      { id: 1025, customer_name: "بیرون‌بر", created_at: "۵ دقیقه پیش", items: [{ food_name: "برگر خاص", quantity: 2 }], total_price: 240000 },
    ]);
    setMenuFoods([
      { id: 1, name: "پیتزا مارگاریتا", category_name: "غذا اصلی", final_price: 150000, image: "" },
      { id: 2, name: "برگر مخصوص", category_name: "فست‌فود", final_price: 120000, image: "" },
    ]);
    setWastes([
      { id: 1, product_name: "پیتزا مارگاریتا", quantity: 1, reason: "overcooked", cost: 30000, created_at: "امروز", notes: "بیش از حد پخت" }
    ]);
    setStats({ total_products: 15, total_stock: 120, inventory_value: 4500000, waste_today_qty: 2 });
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

  const handleTabChange = (event, newValue) => setTabValue(newValue);

  const markOrderReady = (id) => {
    setOrders(prev => prev.filter(o => o.id !== id));
    showToast(`سفارش #${id} آماده شد`);
  };

  return (
    <Box dir={isRtl ? "rtl" : "ltr"} sx={{ position: "relative", fontFamily: "'Vazirmatn', sans-serif", minHeight: "100vh", color: C.text, opacity: mounted ? 1 : 0, transition: "opacity 0.5s ease" }}>
      <style>{animations}</style>

      {/* Header */}
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 4, flexWrap: "wrap", gap: 2 }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 800, mb: 1, display: "flex", alignItems: "center", gap: 1.5 }}>
            <span style={{ fontSize: 28 }}>🔥</span> {t("kitchen.title")}
          </Typography>
          <Typography sx={{ color: C.sub, fontSize: 14 }}>{t("kitchen.subtitle")}</Typography>
        </Box>
        <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap" }}>
          <Button sx={{ bgcolor: C.oliveSubtle, color: C.olive, "&:hover": { bgcolor: C.oliveSubtle } }}>
            <ClipboardDataIcon sx={{ ml: 1, fontSize: 18 }} /> {t("kitchen.link_material_plan")}
          </Button>
          <Button component={Link} to="/dashboard/app/raw-materials" sx={{ bgcolor: C.oliveSubtle, color: C.olive, "&:hover": { bgcolor: C.oliveSubtle } }}>
            <InventoryIcon sx={{ ml: 1, fontSize: 18 }} /> {t("kitchen.link_warehouse")}
          </Button>
          <Button component={Link} to="/dashboard/app/usage-log" sx={{ bgcolor: C.oliveSubtle, color: C.olive, "&:hover": { bgcolor: C.oliveSubtle } }}>
            <HistoryIcon sx={{ ml: 1, fontSize: 18 }} /> {t("kitchen.link_usage_log")}
          </Button>
        </Box>
      </Box>

      {/* Stats */}
      <Grid container spacing={2.5} sx={{ mb: 3 }}>
        {[
          { label: t("kitchen.stat_products"), value: stats.total_products, color: C.olive, icon: <BookIcon /> },
          { label: t("kitchen.stat_stock"), value: stats.total_stock, color: C.sub, icon: <InventoryIcon /> },
          { label: t("kitchen.stat_value"), value: stats.inventory_value.toLocaleString() + " ت", color: C.gold, icon: <LocalOfferIcon /> },
          { label: t("kitchen.stat_waste"), value: stats.waste_today_qty, color: C.danger, icon: <DeleteIcon /> },
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

      {/* Main Card with Tabs */}
      <Box sx={{ ...glassCardSx, p: { xs: 2, md: 3 } }}>
        <Tabs value={tabValue} onChange={handleTabChange} sx={{ mb: 3, borderBottom: `1px solid ${C.glassBorder}`, "& .MuiTab-root": { color: C.sub, fontWeight: 600, fontFamily: "'Vazirmatn', sans-serif", "&.Mui-selected": { color: C.olive } }, "& .MuiTabs-indicator": { bgcolor: C.olive } }}>
          <Tab icon={<ReceiptIcon />} iconPosition="start" label={t("kitchen.tab_orders")} />
          <Tab icon={<BookIcon />} iconPosition="start" label={t("kitchen.tab_menu")} />
          <Tab icon={<DeleteIcon />} iconPosition="start" label={t("kitchen.tab_waste")} />
        </Tabs>

        {/* Tab Panels */}
        {tabValue === 0 && (
          <Box>
            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
              <Typography variant="h6" sx={{ fontWeight: 700, display: "flex", alignItems: "center", gap: 1 }}>
                <ReceiptIcon sx={{ color: C.olive }} /> {t("kitchen.orders_title")}
              </Typography>
              <Button size="small" sx={{ color: C.sub }}>
                <RefreshIcon sx={{ fontSize: 16 }} /> {t("kitchen.btn_refresh")}
              </Button>
            </Box>
            
            <Grid container spacing={2}>
              {orders.length === 0 ? (
                <Grid item xs={12}>
                  <Box sx={{ textAlign: "center", py: 5, color: C.muted }}>
                    <CheckCircleIcon sx={{ fontSize: 48, opacity: 0.3, mb: 1 }} />
                    <Typography variant="h6">{t("kitchen.empty_orders")}</Typography>
                    <Typography variant="body2">{t("kitchen.empty_orders_sub")}</Typography>
                  </Box>
                </Grid>
              ) : (
                orders.map(order => (
                  <Grid item xs={12} md={6} key={order.id}>
                    <Box sx={{ p: 2, borderRadius: "16px", border: `1px solid ${C.glassBorder}`, bgcolor: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.01)' }}>
                      <Box sx={{ display: "flex", justifyContent: "space-between", mb: 1.5 }}>
                        <Typography sx={{ fontWeight: 700, color: C.text }}>سفارش #{order.id}</Typography>
                        <Typography sx={{ fontSize: 12, color: C.muted }}>{order.created_at}</Typography>
                      </Box>
                      <Box sx={{ mb: 1.5 }}>
                        {order.items.map((item, idx) => (
                          <Box key={idx} sx={{ display: "flex", justifyContent: "space-between", py: 0.5, fontSize: 13, color: C.sub }}>
                            <span>{item.food_name}</span>
                            <span style={{ fontWeight: 700, color: C.text }}>{item.quantity} عدد</span>
                          </Box>
                        ))}
                      </Box>
                      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", pt: 1.5, borderTop: `1px solid ${C.glassBorder}` }}>
                        <Typography sx={{ fontWeight: 700, color: C.gold }}>{order.total_price.toLocaleString()} ت</Typography>
                        <Button onClick={() => markOrderReady(order.id)} sx={{ bgcolor: C.btnGrad, color: "#fff" }} size="small">
                          <CheckCircleIcon sx={{ fontSize: 16 }} /> {t("kitchen.btn_ready")}
                        </Button>
                      </Box>
                    </Box>
                  </Grid>
                ))
              )}
            </Grid>
          </Box>
        )}

        {tabValue === 1 && (
          <Box>
            <Box sx={{ display: "flex", gap: 2, mb: 2, flexWrap: "wrap" }}>
              <TextField 
                size="small" 
                placeholder={t("kitchen.menu_search")} 
                sx={{ ...inputSx, flexGrow: 1, maxWidth: 300 }} 
              />
              <Box sx={{ display: "flex", gap: 1 }}>
                <Chip label={t("kitchen.cat_all")} color="primary" variant="filled" sx={{ bgcolor: C.olive, color: "#fff" }} />
                <Chip label="غذای اصلی" variant="outlined" sx={{ color: C.sub, borderColor: C.glassBorder }} />
              </Box>
            </Box>
            <Grid container spacing={2}>
              {menuFoods.map(food => (
                <Grid item xs={12} sm={6} md={4} lg={3} key={food.id}>
                  <Box sx={{ p: 2, borderRadius: "16px", border: `1px solid ${C.glassBorder}`, display: "flex", flexDirection: "column", gap: 1, transition: "all 0.2s ease", "&:hover": { transform: "translateY(-2px)", boxShadow: `0 4px 12px ${C.olive}22` } }}>
                    <Box sx={{ height: 100, borderRadius: "12px", bgcolor: C.oliveSubtle, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <InventoryIcon sx={{ fontSize: 32, color: C.olive, opacity: 0.5 }} />
                    </Box>
                    <Typography sx={{ fontWeight: 700, color: C.text }}>{food.name}</Typography>
                    <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <Chip label={food.category_name} size="small" sx={{ height: 20, fontSize: 10, bgcolor: C.gold + "22", color: C.gold }} />
                      <Typography sx={{ fontWeight: 700, color: C.olive, fontSize: 13 }}>{food.final_price.toLocaleString()} ت</Typography>
                    </Box>
                    <Button onClick={() => setProduceModalOpen(true)} sx={{ mt: 1, bgcolor: C.btnGrad, color: "#fff" }} size="small">
                      <PrecisionManufacturingIcon sx={{ fontSize: 16 }} /> {t("kitchen.btn_produce_food")}
                    </Button>
                  </Box>
                </Grid>
              ))}
            </Grid>
          </Box>
        )}

        {tabValue === 2 && (
          <Box>
            <Box sx={{ display: "flex", justifyContent: "flex-end", mb: 2 }}>
              <Button onClick={() => setWasteModalOpen(true)} sx={{ bgcolor: C.danger, color: "#fff" }}>
                <AddIcon /> {t("kitchen.waste_title")}
              </Button>
            </Box>
            <TableContainer component={Box} sx={{ borderRadius: "12px", border: `1px solid ${C.glassBorder}`, overflow: "hidden" }}>
              <Table size="small">
                <TableHead sx={{ bgcolor: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)" }}>
                  <TableRow>
                    <TableCell sx={{ color: C.muted, fontWeight: 700 }}>#</TableCell>
                    <TableCell sx={{ color: C.muted, fontWeight: 700 }}>محصول</TableCell>
                    <TableCell sx={{ color: C.muted, fontWeight: 700 }}>تعداد</TableCell>
                    <TableCell sx={{ color: C.muted, fontWeight: 700 }}>دلیل</TableCell>
                    <TableCell sx={{ color: C.muted, fontWeight: 700 }}>هزینه</TableCell>
                    <TableCell align="right" sx={{ color: C.muted, fontWeight: 700 }}>عملیات</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {wastes.map((waste, idx) => (
                    <TableRow key={waste.id} sx={{ borderBottom: `1px solid ${C.glassBorder}` }}>
                      <TableCell sx={{ color: C.muted }}>{idx + 1}</TableCell>
                      <TableCell sx={{ fontWeight: 600, color: C.text }}>{waste.product_name}</TableCell>
                      <TableCell sx={{ color: C.danger, fontWeight: 700 }}>{waste.quantity}</TableCell>
                      <TableCell>
                        <Chip label={t(`kitchen.reason_${waste.reason}`)} size="small" sx={{ height: 20, fontSize: 10, bgcolor: C.danger + "22", color: C.danger }} />
                      </TableCell>
                      <TableCell sx={{ color: C.gold, fontWeight: 600 }}>{waste.cost.toLocaleString()} ت</TableCell>
                      <TableCell align="right">
                        <IconButton size="small" sx={{ color: C.danger }}><DeleteIcon fontSize="small" /></IconButton>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        )}
      </Box>

      {/* Produce Modal */}
      <Dialog open={produceModalOpen} onClose={() => setProduceModalOpen(false)} maxWidth="sm" fullWidth>
        <Box sx={{ bgcolor: C.glass, backdropFilter: "blur(28px)", p: 3, border: `1px solid ${C.glassBorder}`, borderRadius: "20px" }}>
          <Typography variant="h6" sx={{ fontWeight: 800, mb: 3, color: C.text, display: "flex", alignItems: "center", gap: 1 }}>
            <PrecisionManufacturingIcon sx={{ color: C.olive }} /> {t("kitchen.produce_title")}
          </Typography>
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 2, mb: 2 }}>
            <FormControl fullWidth size="small" sx={inputSx}>
              <InputLabel>{t("kitchen.produce_recipe")}</InputLabel>
              <Select label={t("kitchen.produce_recipe")}>
                <MenuItem value="">انتخاب کنید...</MenuItem>
                <MenuItem value={1}>دستور پخت استاندارد</MenuItem>
              </Select>
            </FormControl>
            <TextField label={t("kitchen.produce_cost_unit")} value="۳۰،۰۰۰ تومان" disabled size="small" sx={inputSx} />
            <TextField label={t("kitchen.produce_markup")} defaultValue={30} size="small" sx={inputSx} type="number" InputProps={{ endAdornment: <InputAdornment position="end">%</InputAdornment> }} />
            <TextField label={t("kitchen.produce_price")} defaultValue={39000} size="small" sx={inputSx} type="number" />
            <TextField label={t("kitchen.produce_qty")} defaultValue={1} size="small" sx={inputSx} type="number" />
          </Box>
          <Box sx={{ display: "flex", justifyContent: "flex-end", gap: 2, mt: 3 }}>
            <Button onClick={() => setProduceModalOpen(false)} sx={{ color: C.sub }}>{t("common.cancel")}</Button>
            <Button sx={{ bgcolor: C.btnGrad, color: "#fff" }}>
              <PrecisionManufacturingIcon sx={{ ml: 1, fontSize: 18 }} /> {t("kitchen.produce_btn")}
            </Button>
          </Box>
        </Box>
      </Dialog>

      {/* Waste Modal */}
      <Dialog open={wasteModalOpen} onClose={() => setWasteModalOpen(false)} maxWidth="xs" fullWidth>
        <Box sx={{ bgcolor: C.glass, backdropFilter: "blur(28px)", p: 3, border: `1px solid ${C.glassBorder}`, borderRadius: "20px" }}>
          <Typography variant="h6" sx={{ fontWeight: 800, mb: 3, color: C.text, display: "flex", alignItems: "center", gap: 1 }}>
            <DeleteIcon sx={{ color: C.danger }} /> {t("kitchen.waste_title")}
          </Typography>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <FormControl fullWidth size="small" sx={inputSx}>
              <InputLabel>{t("kitchen.waste_product")}</InputLabel>
              <Select label={t("kitchen.waste_product")}>
                <MenuItem value="">انتخاب محصول...</MenuItem>
                <MenuItem value={1}>پیتزا مارگاریتا</MenuItem>
              </Select>
            </FormControl>
            <TextField label={t("kitchen.waste_qty")} type="number" defaultValue={1} size="small" sx={inputSx} />
            <FormControl fullWidth size="small" sx={inputSx}>
              <InputLabel>{t("kitchen.waste_reason")}</InputLabel>
              <Select label={t("kitchen.waste_reason")}>
                <MenuItem value="expired">{t("kitchen.reason_expired")}</MenuItem>
                <MenuItem value="overcooked">{t("kitchen.reason_overcooked")}</MenuItem>
              </Select>
            </FormControl>
            <TextField label={t("kitchen.waste_notes")} multiline rows={2} size="small" sx={inputSx} />
          </Box>
          <Box sx={{ display: "flex", justifyContent: "flex-end", gap: 2, mt: 3 }}>
            <Button onClick={() => setWasteModalOpen(false)} sx={{ color: C.sub }}>{t("common.cancel")}</Button>
            <Button sx={{ bgcolor: C.danger, color: "#fff" }}>
              <CheckCircleIcon sx={{ ml: 1, fontSize: 18 }} /> {t("kitchen.waste_btn_submit")}
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