import { useState, useEffect, useMemo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  Box, Typography, Button, IconButton, TextField, Select, MenuItem,
  FormControl, InputLabel, Grid, Chip, CircularProgress, Divider,
  Dialog, DialogTitle, DialogContent, DialogActions, Snackbar, Alert,
  Tabs, Tab, InputAdornment, Fab, Tooltip, Paper
} from "@mui/material";
import {
  Add, Delete, Search, ShoppingBag, Storefront, DeliveryDining,
  DarkMode, LightMode, Language, CreditCard, Receipt, Payments,
  AccountBalance, PersonAdd, Close, CheckCircle, Print, ShoppingBagOutlined
} from "@mui/icons-material";
import { useThemeMode } from "../contexts/ThemeContext";
import { useLang } from "../contexts/LangContext";

const animations = `
  @keyframes orb1 { 0%, 100% { transform: translate(0, 0) scale(1); } 25% { transform: translate(60px, -80px) scale(1.1); } 50% { transform: translate(-20px, -40px) scale(0.95); } 75% { transform: translate(-50px, 50px) scale(1.05); } }
  @keyframes float { 0%, 100% { transform: translateY(0px); } 50% { transform: translateY(-6px); } }
  @keyframes shimmer { 0% { background-position: -200% center; } 100% { background-position: 200% center; } }
  @keyframes fadeUp { from { opacity: 0; transform: translateY(20px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
`;

export default function Pos() {
  const { mode, toggleTheme } = useThemeMode();
  const { isRtl, toggleLang, lang } = useLang();
  const { t } = useTranslation();
  const isDark = mode === "dark";

  const [mounted, setMounted] = useState(false);
  const [tabValue, setTabValue] = useState(0);
  const [toast, setToast] = useState({ open: false, message: "", type: "info" });
  
  // POS State
  const [foods, setFoods] = useState([]);
  const [cart, setCart] = useState([]);
  const [search, setSearch] = useState("");
  const [activeCat, setActiveCat] = useState("all");
  const [orderType, setOrderType] = useState("hall");
  const [tableNumber, setTableNumber] = useState("");
  const [custName, setCustName] = useState("");
  const [custPhone, setCustPhone] = useState("");

  // Modals
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [lastOrder, setLastOrder] = useState(null);

  useEffect(() => {
    const tmr = setTimeout(() => setMounted(true), 80);
    // Mock Data
    setFoods([
      { id: 1, name: "چلو کباب کوبیده", category: "کباب", price: 185000, image: "" },
      { id: 2, name: "چلو جوجه کباب", category: "کباب", price: 165000, image: "" },
      { id: 3, name: "پیتزا مارگاریتا", category: "پیتزا", price: 150000, image: "" },
      { id: 4, name: "برگر خاص", category: "فست‌فود", price: 120000, image: "" },
      { id: 5, name: "نوشابه", category: "نوشیدنی", price: 25000, image: "" },
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
    cardShadow: isDark ? "0 8px 60px rgba(0,0,0,0.5), 0 0 80px rgba(107,155,110,0.04)" : "0 8px 60px rgba(0,0,0,0.1), 0 0 60px rgba(74,106,148,0.08)",
    orb1: isDark ? "rgba(107,155,110,0.09)" : "rgba(74,106,148,0.12)",
    orb2: isDark ? "rgba(168,64,96,0.07)" : "rgba(122,40,69,0.1)",
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

  const categories = useMemo(() => ["all", ...new Set(foods.map(f => f.category))], [foods]);

  const filteredFoods = useMemo(() => {
    return foods.filter(f => 
      (activeCat === "all" || f.category === activeCat) &&
      (!search || f.name.toLowerCase().includes(search.toLowerCase()))
    );
  }, [foods, activeCat, search]);

  const cartTotal = useMemo(() => cart.reduce((s, item) => s + item.price * item.qty, 0), [cart]);
  const cartCount = useMemo(() => cart.reduce((s, item) => s + item.qty, 0), [cart]);

  const addToCart = (food) => {
    setCart(prev => {
      const existing = prev.find(item => item.id === food.id);
      if (existing) return prev.map(item => item.id === food.id ? { ...item, qty: item.qty + 1 } : item);
      return [...prev, { ...food, qty: 1 }];
    });
  };

  const removeFromCart = (id) => {
    setCart(prev => {
      const existing = prev.find(item => item.id === id);
      if (existing && existing.qty > 1) return prev.map(item => item.id === id ? { ...item, qty: item.qty - 1 } : item);
      return prev.filter(item => item.id !== id);
    });
  };

  const handleCheckout = (method) => {
    const order = {
      id: `ORD-${Date.now()}`,
      items: cart,
      total: cartTotal,
      customerName: custName || "مشتری",
      type: orderType,
      method,
      date: new Date().toLocaleDateString("fa-IR"),
      time: new Date().toLocaleTimeString("fa-IR", { hour: "2-digit", minute: "2-digit" }),
    };
    setLastOrder(order);
    setCart([]);
    setCustName("");
    setCustPhone("");
    setCheckoutOpen(false);
    setReceiptOpen(true);
    showToast("پرداخت با موفقیت انجام شد");
  };

  return (
    <Box dir={isRtl ? "rtl" : "ltr"} sx={{ position: "relative", fontFamily: "'Vazirmatn', sans-serif", minHeight: "100vh", color: C.text, opacity: mounted ? 1 : 0, transition: "opacity 0.5s ease", pb: 10 }}>
      <style>{animations}</style>

      {/* Header */}
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 3, flexWrap: "wrap", gap: 2 }}>
        <Typography variant="h4" sx={{ fontWeight: 800, display: "flex", alignItems: "center", gap: 1.5 }}>
          <span style={{ fontSize: 28 }}>🛒</span> {t("pos.title")}
        </Typography>
        <Box sx={{ display: "flex", gap: 1 }}>
          <IconButton onClick={toggleTheme} size="small" sx={{ border: `1px solid ${C.glassBorder}`, borderRadius: "10px", bgcolor: C.glass, color: C.text }}>
            {isDark ? <LightMode fontSize="small" /> : <DarkMode fontSize="small" />}
          </IconButton>
          <IconButton onClick={toggleLang} size="small" sx={{ border: `1px solid ${C.glassBorder}`, borderRadius: "10px", bgcolor: C.glass, color: C.text }}>
            <Language fontSize="small" />
          </IconButton>
        </Box>
      </Box>

      {/* Tabs */}
      <Box sx={{ ...glassCardSx, p: 1, mb: 3, display: "inline-block", width: "100%" }}>
        <Tabs value={tabValue} onChange={(e, v) => setTabValue(v)} variant="scrollable" scrollButtons="auto" sx={{ "& .MuiTab-root": { color: C.sub, fontWeight: 600, fontFamily: "'Vazirmatn', sans-serif", "&.Mui-selected": { color: C.olive } }, "& .MuiTabs-indicator": { bgcolor: C.olive } }}>
          <Tab icon={<ShoppingBag />} iconPosition="start" label={t("pos.tab_pos")} />
          <Tab icon={<Storefront />} iconPosition="start" label={t("pos.tab_online")} />
          <Tab icon={<Receipt />} iconPosition="start" label={t("pos.tab_discount")} />
          <Tab icon={<Receipt />} iconPosition="start" label={t("pos.tab_report")} />
          <Tab icon={<Receipt />} iconPosition="start" label={t("pos.tab_close")} />
          <Tab icon={<Receipt />} iconPosition="start" label={t("pos.tab_history")} />
        </Tabs>
      </Box>

      {/* POS Panel */}
      {tabValue === 0 && (
        <Grid container spacing={2.5}>
          {/* Menu */}
          <Grid item xs={12} md={8}>
            <Box sx={{ ...glassCardSx, p: 2, height: "100%" }}>
              <TextField fullWidth placeholder={t("pos.search_food")} value={search} onChange={(e) => setSearch(e.target.value)} sx={{ ...inputSx, mb: 2 }} InputProps={{ startAdornment: <InputAdornment position="start"><Search sx={{ color: C.muted }} /></InputAdornment> }} />
              <Box sx={{ display: "flex", gap: 1, mb: 2, flexWrap: "wrap" }}>
                {categories.map(cat => (
                  <Chip key={cat} label={cat === "all" ? t("pos.cat_all") : cat} onClick={() => setActiveCat(cat)} variant={activeCat === cat ? "filled" : "outlined"} sx={{ bgcolor: activeCat === cat ? C.olive : "transparent", color: activeCat === cat ? "#fff" : C.sub, borderColor: C.glassBorder, fontWeight: 600 }} />
                ))}
              </Box>
              <Grid container spacing={2}>
                {filteredFoods.map((food, i) => (
                  <Grid item xs={6} sm={4} md={3} key={food.id}>
                    <Box onClick={() => addToCart(food)} sx={{ p: 2, borderRadius: "16px", border: `1px solid ${C.glassBorder}`, cursor: "pointer", transition: "all 0.2s ease", animation: `fadeUp 0.4s ease-out ${i * 0.05}s backwards`, "&:hover": { transform: "translateY(-2px)", borderColor: C.olive, boxShadow: `0 4px 12px ${C.olive}22` } }}>
                      <Box sx={{ height: 80, borderRadius: "12px", bgcolor: C.oliveSubtle, display: "flex", alignItems: "center", justifyContent: "center", mb: 1.5, fontSize: 32 }}>🍽️</Box>
                      <Typography sx={{ fontWeight: 700, fontSize: 13, mb: 0.5, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{food.name}</Typography>
                      <Typography sx={{ fontWeight: 800, color: C.olive, fontSize: 13 }}>{food.price.toLocaleString()} {t("pos.toman")}</Typography>
                    </Box>
                  </Grid>
                ))}
              </Grid>
            </Box>
          </Grid>

          {/* Cart */}
          <Grid item xs={12} md={4}>
            <Box sx={{ ...glassCardSx, p: 2, height: "100%", display: "flex", flexDirection: "column", maxHeight: "calc(100vh - 200px)" }}>
              <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2, pb: 2, borderBottom: `1px solid ${C.glassBorder}` }}>
                <Typography variant="h6" sx={{ fontWeight: 700, display: "flex", alignItems: "center", gap: 1 }}>
                  <ShoppingBag sx={{ color: C.olive }} /> {t("pos.cart_title")}
                </Typography>
                <Chip label={cartCount} sx={{ bgcolor: C.oliveSubtle, color: C.olive, fontWeight: 700 }} />
              </Box>

              <Box sx={{ flex: 1, overflowY: "auto", mb: 2 }}>
                {cart.length === 0 ? (
                  <Box sx={{ textAlign: "center", py: 5, color: C.muted }}>
                    <ShoppingBagOutlined sx={{ fontSize: 48, opacity: 0.3, mb: 1 }} />
                    <Typography>{t("pos.cart_empty")}</Typography>
                  </Box>
                ) : (
                  cart.map(item => (
                    <Box key={item.id} sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", p: 1.5, mb: 1, borderRadius: "12px", bgcolor: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)" }}>
                      <Box>
                        <Typography sx={{ fontWeight: 600, fontSize: 13 }}>{item.name}</Typography>
                        <Typography sx={{ fontSize: 12, color: C.sub }}>{(item.price * item.qty).toLocaleString()} {t("pos.toman")}</Typography>
                      </Box>
                      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                        <IconButton size="small" onClick={() => removeFromCart(item.id)} sx={{ bgcolor: C.dangerBg, color: C.danger }}><Delete fontSize="small" /></IconButton>
                        <Typography sx={{ fontWeight: 700, minWidth: 20, textAlign: "center" }}>{item.qty}</Typography>
                        <IconButton size="small" onClick={() => addToCart(item)} sx={{ bgcolor: C.oliveSubtle, color: C.olive }}><Add fontSize="small" /></IconButton>
                      </Box>
                    </Box>
                  ))
                )}
              </Box>

              <Box sx={{ borderTop: `1px solid ${C.glassBorder}`, pt: 2 }}>
                <Box sx={{ display: "flex", gap: 1, mb: 2 }}>
                  {["hall", "takeout", "delivery"].map(type => (
                    <Button key={type} onClick={() => setOrderType(type)} variant={orderType === type ? "contained" : "outlined"} sx={{ flex: 1, bgcolor: orderType === type ? C.btnGrad : "transparent", color: orderType === type ? "#fff" : C.sub, borderColor: C.glassBorder, fontSize: 11 }}>
                      {type === "hall" && <Storefront sx={{ fontSize: 14 }} />}
                      {type === "takeout" && <ShoppingBag sx={{ fontSize: 14 }} />}
                      {type === "delivery" && <DeliveryDining sx={{ fontSize: 14 }} />}
                      &nbsp;{t(`pos.order_type_${type}`)}
                    </Button>
                  ))}
                </Box>
                <TextField fullWidth label={t("pos.customer_name")} value={custName} onChange={(e) => setCustName(e.target.value)} sx={{ ...inputSx, mb: 1.5 }} size="small" />
                <TextField fullWidth label={t("pos.customer_phone")} value={custPhone} onChange={(e) => setCustPhone(e.target.value)} sx={{ ...inputSx, mb: 2 }} size="small" />
                
                <Box sx={{ display: "flex", justifyContent: "space-between", mb: 2 }}>
                  <Typography sx={{ fontWeight: 600, color: C.sub }}>{t("pos.total_payable")}:</Typography>
                  <Typography sx={{ fontWeight: 800, color: C.olive, fontSize: 18 }}>{cartTotal.toLocaleString()} {t("pos.toman")}</Typography>
                </Box>
                
                <Button fullWidth onClick={() => cart.length > 0 && setCheckoutOpen(true)} disabled={cart.length === 0} sx={{ bgcolor: C.btnGrad, color: "#fff", py: 1.5, fontSize: 14, "&:hover": { transform: "translateY(-2px)" }, "&.Mui-disabled": { bgcolor: C.muted, color: "#fff" } }}>
                  <CreditCard sx={{ ml: 1 }} /> {t("pos.btn_checkout")}
                </Button>
              </Box>
            </Box>
          </Grid>
        </Grid>
      )}

      {/* Other Tabs Placeholder */}
      {tabValue !== 0 && (
        <Box sx={{ ...glassCardSx, p: 8, textAlign: "center" }}>
          <Typography variant="h5" sx={{ fontWeight: 700, mb: 1, color: C.text }}>📋 {t(`pos.tab_${["pos", "online", "discount", "report", "close", "history"][tabValue]}`)}</Typography>
          <Typography sx={{ color: C.muted, fontSize: 14 }}>این بخش در نسخه React به صورت کامل پیاده‌سازی نشده است.</Typography>
        </Box>
      )}

      {/* Checkout Modal */}
      <Dialog open={checkoutOpen} onClose={() => setCheckoutOpen(false)} maxWidth="xs" fullWidth>
        <Box sx={{ bgcolor: C.glass, backdropFilter: "blur(28px)", p: 3, border: `1px solid ${C.glassBorder}`, borderRadius: "20px" }}>
          <Typography variant="h6" sx={{ fontWeight: 800, mb: 2, color: C.text, display: "flex", alignItems: "center", gap: 1 }}>
            <CreditCard sx={{ color: C.olive }} /> {t("pos.pay_title")}
          </Typography>
          <Box sx={{ p: 2, borderRadius: "12px", bgcolor: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)", textAlign: "center", mb: 3 }}>
            <Typography sx={{ fontSize: 11, color: C.muted }}>{t("pos.pay_amount")}</Typography>
            <Typography variant="h5" sx={{ fontWeight: 800, color: C.olive }}>{cartTotal.toLocaleString()} <Typography component="span" sx={{ fontSize: 12 }}>{t("pos.toman")}</Typography></Typography>
          </Box>
          <Typography sx={{ fontSize: 13, fontWeight: 600, color: C.sub, mb: 1.5 }}>{t("pos.pay_method")}</Typography>
          <Grid container spacing={1.5}>
            {[
              { method: "cash", icon: <Payments />, label: t("pos.method_cash") },
              { method: "transfer", icon: <AccountBalance />, label: t("pos.method_transfer") },
              { method: "credit", icon: <PersonAdd />, label: t("pos.method_credit") },
            ].map(m => (
              <Grid item xs={4} key={m.method}>
                <Button onClick={() => handleCheckout(m.method)} sx={{ p: 2, borderRadius: "12px", border: `1px solid ${C.glassBorder}`, bgcolor: C.inputBg, color: C.text, display: "flex", flexDirection: "column", gap: 1, width: "100%", "&:hover": { borderColor: C.olive, bgcolor: C.oliveSubtle } }}>
                  {m.icon}
                  <Typography sx={{ fontSize: 11, fontWeight: 600 }}>{m.label}</Typography>
                </Button>
              </Grid>
            ))}
          </Grid>
          <Button onClick={() => setCheckoutOpen(false)} sx={{ mt: 3, width: "100%", color: C.sub }}>{t("pos.btn_cancel")}</Button>
        </Box>
      </Dialog>

      {/* Receipt Modal */}
      <Dialog open={receiptOpen} onClose={() => setReceiptOpen(false)} maxWidth="xs" fullWidth>
        <Box sx={{ bgcolor: C.glass, backdropFilter: "blur(28px)", p: 3, border: `1px solid ${C.glassBorder}`, borderRadius: "20px" }}>
          <Box sx={{ textAlign: "center", mb: 3 }}>
            <CheckCircle sx={{ fontSize: 60, color: C.olive, mb: 1 }} />
            <Typography variant="h5" sx={{ fontWeight: 800, color: C.text }}>{t("pos.pay_success")}</Typography>
          </Box>
          {lastOrder && (
            <Box>
              <Box sx={{ display: "flex", justifyContent: "space-between", mb: 2, fontSize: 13, color: C.sub }}>
                <span>شماره سفارش: <b style={{ color: C.text }}>#{lastOrder.id}</b></span>
                <span>{lastOrder.date} - {lastOrder.time}</span>
              </Box>
              <Divider sx={{ mb: 2 }} />
              {lastOrder.items.map((item, idx) => (
                <Box key={idx} sx={{ display: "flex", justifyContent: "space-between", py: 0.5, fontSize: 13 }}>
                  <Typography sx={{ color: C.text }}>{item.qty}× {item.name}</Typography>
                  <Typography sx={{ color: C.sub }}>{(item.price * item.qty).toLocaleString()}</Typography>
                </Box>
              ))}
              <Divider sx={{ my: 2 }} />
              <Box sx={{ display: "flex", justifyContent: "space-between", fontWeight: 800 }}>
                <Typography>{t("pos.total_payable")}:</Typography>
                <Typography sx={{ color: C.olive }}>{lastOrder.total.toLocaleString()} {t("pos.toman")}</Typography>
              </Box>
            </Box>
          )}
          <Button onClick={() => setReceiptOpen(false)} sx={{ mt: 3, width: "100%", bgcolor: C.btnGrad, color: "#fff" }}>
            {t("pos.btn_confirm")}
          </Button>
        </Box>
      </Dialog>

      <Snackbar open={toast.open} autoHideDuration={3000} onClose={() => setToast({ ...toast, open: false })} anchorOrigin={{ vertical: "top", horizontal: "center" }}>
        <Alert severity={toast.type} sx={{ bgcolor: C.glass, backdropFilter: "blur(16px)", color: C.text, border: `1px solid ${C.olive}`, borderRadius: "12px", fontFamily: "'Vazirmatn', sans-serif" }}>{toast.message}</Alert>
      </Snackbar>
    </Box>
  );
}