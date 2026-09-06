import { useState, useEffect, useMemo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  Box, Typography, Button, IconButton, TextField, Chip, Grid,
  Dialog, DialogTitle, DialogContent, DialogActions, Snackbar, Alert,
  InputAdornment, Fab, Tooltip
} from "@mui/material";
import {
  Add, Delete, Search, Receipt, HourglassEmpty, LocalFireDepartment,
  CheckCircle, BagCheck, Visibility, Close, Cancel, Send, Kitchen, DoneAll,
  DarkMode, LightMode, Language
} from "@mui/icons-material";
import { useThemeMode } from "../contexts/ThemeContext";
import { useLang } from "../contexts/LangContext";

const animations = `
  @keyframes orb1 { 0%, 100% { transform: translate(0, 0) scale(1); } 25% { transform: translate(60px, -80px) scale(1.1); } 50% { transform: translate(-20px, -40px) scale(0.95); } 75% { transform: translate(-50px, 50px) scale(1.05); } }
  @keyframes float { 0%, 100% { transform: translateY(0px); } 50% { transform: translateY(-6px); } }
  @keyframes shimmer { 0% { background-position: -200% center; } 100% { background-position: 200% center; } }
  @keyframes fadeUp { from { opacity: 0; transform: translateY(20px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
  @keyframes pulseRing { 0% { opacity: 0.5; transform: scale(1); } 50% { opacity: 0; transform: scale(1.4); } 100% { opacity: 0; transform: scale(1.4); } }
`;

const DEMO_FOODS = [
  { name: 'چلو کباب کوبیده', price: 185000 }, { name: 'چلو جوجه کباب', price: 165000 },
  { name: 'قورمه سبزی', price: 145000 }, { name: 'زرشک پلو با مرغ', price: 175000 },
  { name: 'آبگوشت', price: 155000 }, { name: 'سالاد شیرازی', price: 45000 },
  { name: 'نوشابه', price: 25000 }, { name: 'دوغ', price: 30000 },
];
const DEMO_CUSTOMERS = ['علی رضایی','مریم احمدی','حسن محمدی','زهرا کریمی','امیر حسینی','فاطمه نوری'];
const DEMO_TABLES = ['۱','۲','۳','۴','۵','۶','۷','۸','۱۲','VIP'];

export default function OrdersDashboard() {
  const { mode, toggleTheme } = useThemeMode();
  const { isRtl, toggleLang, lang } = useLang();
  const { t } = useTranslation();
  const isDark = mode === "dark";

  const [mounted, setMounted] = useState(false);
  const [orders, setOrders] = useState([]);
  const [filter, setFilter] = useState('active');
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState({ open: false, message: "", type: "info" });
  const [detailOrder, setDetailOrder] = useState(null);
  const [confirmModal, setConfirmModal] = useState({ open: false, title: "", desc: "", type: "info", onConfirm: null });

  useEffect(() => {
    const tmr = setTimeout(() => setMounted(true), 80);
    // Load Demo Data
    const demoOrders = [
      { id: 1001, status: 'pending', table: '۵', customer: 'علی رضایی', items: [{ name: 'چلو کباب کوبیده', qty: 1, price: 185000 }, { name: 'نوشابه', qty: 1, price: 25000 }], total: 210000, createdAt: new Date(Date.now() - 120000).toISOString() },
      { id: 1002, status: 'preparing', table: '۲', customer: 'مریم احمدی', items: [{ name: 'چلو جوجه کباب', qty: 2, price: 165000 }], total: 330000, createdAt: new Date(Date.now() - 300000).toISOString() },
      { id: 1003, status: 'ready', table: 'بیرون‌بر', customer: 'حسن محمدی', items: [{ name: 'آبگوشت', qty: 1, price: 155000 }, { name: 'دوغ', qty: 1, price: 30000 }], total: 185000, createdAt: new Date(Date.now() - 600000).toISOString() },
    ];
    setOrders(demoOrders);
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
  };

  const showToast = (message, type = "success") => setToast({ open: true, message, type });

  const stats = useMemo(() => {
    return {
      total: orders.filter(o => ['pending','confirmed','preparing','ready'].includes(o.status)).length,
      pending: orders.filter(o => o.status === 'pending').length,
      cooking: orders.filter(o => ['confirmed','preparing'].includes(o.status)).length,
      ready: orders.filter(o => o.status === 'ready').length,
    };
  }, [orders]);

  const filteredOrders = useMemo(() => {
    return orders.filter(o => {
      const matchFilter = filter === 'active' ? ['pending','confirmed','preparing','ready'].includes(o.status) : o.status === filter;
      const matchSearch = !search || String(o.id).includes(search) || o.customer.toLowerCase().includes(search.toLowerCase()) || o.table.includes(search) || o.items.some(it => it.name.toLowerCase().includes(search.toLowerCase()));
      return matchFilter && matchSearch;
    });
  }, [orders, filter, search]);

  const handleAdvanceStatus = (id) => {
    const order = orders.find(o => o.id === id);
    if (!order) return;
    const nextStatus = { pending: 'confirmed', confirmed: 'preparing', preparing: 'ready', ready: 'delivered' }[order.status];
    
    if (nextStatus === 'delivered') {
      setConfirmModal({
        open: true,
        title: t("orders.modal_deliver_title"),
        desc: t("orders.modal_deliver_desc", { id }),
        type: "success",
        onConfirm: () => doDeliver(id)
      });
    } else {
      setOrders(prev => prev.map(o => o.id === id ? { ...o, status: nextStatus } : o));
      showToast(`سفارش #${id} → ${t(`orders.status_${nextStatus}`)}`);
    }
  };

  const doDeliver = (id) => {
    setConfirmModal({ ...confirmModal, open: false });
    setOrders(prev => prev.filter(o => o.id !== id));
    showToast(`سفارش #${id} تحویل داده شد ✓`);
  };

  const handleCancelOrder = (id) => {
    setConfirmModal({
      open: true,
      title: t("orders.modal_cancel_title"),
      desc: t("orders.modal_cancel_desc", { id }),
      type: "danger",
      onConfirm: () => {
        setConfirmModal({ ...confirmModal, open: false });
        setOrders(prev => prev.filter(o => o.id !== id));
        showToast(`سفارش #${id} لغو شد`, "error");
      }
    });
  };

  const addSampleOrder = () => {
    const items = [];
    for(let i=0; i<Math.floor(Math.random()*3)+1; i++) {
      const f = DEMO_FOODS[Math.floor(Math.random()*DEMO_FOODS.length)];
      items.push({ name: f.name, qty: Math.floor(Math.random()*2)+1, price: f.price });
    }
    const newOrder = {
      id: Date.now(),
      status: 'pending',
      table: DEMO_TABLES[Math.floor(Math.random()*DEMO_TABLES.length)],
      customer: DEMO_CUSTOMERS[Math.floor(Math.random()*DEMO_CUSTOMERS.length)],
      items,
      total: items.reduce((s, it) => s + it.price * it.qty, 0),
      createdAt: new Date().toISOString()
    };
    setOrders(prev => [newOrder, ...prev]);
    showToast(`سفارش جدید #${newOrder.id} ثبت شد`, "info");
  };

  const clearDelivered = () => {
    setOrders(prev => prev.filter(o => o.status !== 'delivered'));
    showToast("سفارشات تحویل‌شده پاک شدند", "info");
  };

  const getStatusColor = (status) => {
    switch(status) {
      case 'pending': return C.gold;
      case 'confirmed': return C.olive;
      case 'preparing': return C.burgundy;
      case 'ready': return C.olive;
      default: return C.muted;
    }
  };

  return (
    <Box dir={isRtl ? "rtl" : "ltr"} sx={{ position: "relative", fontFamily: "'Vazirmatn', sans-serif", minHeight: "100vh", color: C.text, opacity: mounted ? 1 : 0, transition: "opacity 0.5s ease", pb: 10 }}>
      <style>{animations}</style>

      {/* Header */}
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 4, flexWrap: "wrap", gap: 2 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
          <Typography variant="h4" sx={{ fontWeight: 800, display: "flex", alignItems: "center", gap: 1.5 }}>
            <span style={{ fontSize: 28 }}>🧾</span> {t("orders.title")}
          </Typography>
          <Chip label={`${stats.total} ${t("orders.active_badge")}`} sx={{ bgcolor: C.oliveSubtle, color: C.olive, fontWeight: 700 }} />
        </Box>
        <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap" }}>
          <Button onClick={addSampleOrder} sx={{ bgcolor: C.oliveSubtle, color: C.olive, "&:hover": { bgcolor: C.oliveSubtle } }}>
            <Add /> {t("orders.btn_new_demo")}
          </Button>
          <Button onClick={clearDelivered} sx={{ bgcolor: C.dangerBg, color: C.danger, "&:hover": { bgcolor: C.dangerBg } }}>
            <Delete /> {t("orders.btn_clear_delivered")}
          </Button>
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
          { label: t("orders.stat_total"), value: stats.total, icon: <Receipt />, color: C.olive },
          { label: t("orders.stat_pending"), value: stats.pending, icon: <HourglassEmpty />, color: C.gold },
          { label: t("orders.stat_cooking"), value: stats.cooking, icon: <LocalFireDepartment />, color: C.burgundy },
          { label: t("orders.stat_ready"), value: stats.ready, icon: <CheckCircle />, color: C.olive },
        ].map((stat, i) => (
          <Grid item xs={12} sm={6} md={3} key={i}>
            <Box sx={{ ...glassCardSx, p: 2.5, display: "flex", alignItems: "center", gap: 2 }}>
              <Box sx={{ width: 48, height: 48, borderRadius: "12px", display: "flex", alignItems: "center", justifyContent: "center", background: `${stat.color}22`, border: `1px solid ${stat.color}33`, animation: "float 5s ease-in-out infinite", flexShrink: 0, color: stat.color }}>
                {stat.icon}
              </Box>
              <Box>
                <Typography sx={{ fontWeight: 800, fontSize: 20, color: C.text }}>{stat.value}</Typography>
                <Typography sx={{ fontSize: 12, fontWeight: 600, color: C.sub }}>{stat.label}</Typography>
              </Box>
            </Box>
          </Grid>
        ))}
      </Grid>

      {/* Toolbar */}
      <Box sx={{ ...glassCardSx, p: 2, mb: 3, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 2 }}>
        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
          {['active', 'pending', 'confirmed', 'preparing', 'ready'].map(f => (
            <Chip 
              key={f} 
              label={t(`orders.filter_${f}`)} 
              onClick={() => setFilter(f)} 
              variant={filter === f ? 'filled' : 'outlined'}
              sx={{ 
                bgcolor: filter === f ? C.olive : 'transparent', 
                color: filter === f ? '#fff' : C.sub, 
                borderColor: C.glassBorder, fontWeight: 600,
                "&:hover": { bgcolor: filter === f ? C.olive : C.oliveSubtle }
              }}
            />
          ))}
        </Box>
        <TextField 
          size="small" 
          placeholder={t("orders.search_placeholder")} 
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          sx={{ ...inputSx, maxWidth: 300 }}
          InputProps={{ endAdornment: <InputAdornment position="end"><Search sx={{ fontSize: 18, color: C.muted }} /></InputAdornment> }}
        />
      </Box>

      {/* Orders List */}
      <Grid container spacing={2.5}>
        {filteredOrders.length === 0 ? (
          <Grid item xs={12}>
            <Box sx={{ ...glassCardSx, p: 8, textAlign: "center" }}>
              <Typography variant="h5" sx={{ fontWeight: 700, mb: 1, color: C.text }}>📭 {t("orders.empty_title")}</Typography>
              <Typography sx={{ color: C.muted, fontSize: 14 }}>{t("orders.empty_sub")}</Typography>
            </Box>
          </Grid>
        ) : (
          filteredOrders.map((order, i) => {
            const statusColor = getStatusColor(order.status);
            return (
              <Grid item xs={12} md={6} key={order.id}>
                <Box sx={{ ...glassCardSx, p: 2.5, height: "100%", display: "flex", flexDirection: "column", animation: `fadeUp 0.4s ease-out ${i * 0.05}s backwards`, borderLeft: `4px solid ${statusColor}` }}>
                  <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
                    <Typography variant="h6" sx={{ fontWeight: 700 }}>#{order.id}</Typography>
                    <Chip label={t(`orders.status_${order.status}`)} size="small" sx={{ bgcolor: `${statusColor}22`, color: statusColor, fontWeight: 700 }} />
                  </Box>
                  
                  <Box sx={{ display: "flex", gap: 2, mb: 2, flexWrap: "wrap" }}>
                    <Typography sx={{ fontSize: 12, color: C.sub }}>میز: <span style={{ color: C.text, fontWeight: 600 }}>{order.table}</span></Typography>
                    <Typography sx={{ fontSize: 12, color: C.sub }}>مشتری: <span style={{ color: C.text, fontWeight: 600 }}>{order.customer}</span></Typography>
                  </Box>

                  <Box sx={{ flex: 1, mb: 2, p: 1.5, borderRadius: "10px", bgcolor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)' }}>
                    {order.items.map((item, idx) => (
                      <Box key={idx} sx={{ display: "flex", justifyContent: "space-between", py: 0.5, fontSize: 13 }}>
                        <Typography sx={{ color: C.text }}>{item.qty}× {item.name}</Typography>
                      </Box>
                    ))}
                  </Box>

                  <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", pt: 2, borderTop: `1px solid ${C.glassBorder}` }}>
                    <Typography sx={{ fontWeight: 800, color: C.olive, fontSize: 16 }}>{order.total.toLocaleString()} <Typography component="span" sx={{ fontSize: 11, fontWeight: 500 }}>{t("orders.toman")}</Typography></Typography>
                    <Box sx={{ display: "flex", gap: 1 }}>
                        <Tooltip title={t("orders.btn_detail")}>
                            <IconButton size="small" onClick={() => setDetailOrder(order)} sx={{ color: C.sub, bgcolor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' }}>
                                <Visibility fontSize="small" />
                            </IconButton>
                        </Tooltip>
                        {order.status !== 'delivered' && order.status !== 'cancelled' && (
                          <>
                            <Tooltip title={t("orders.btn_cancel")}>
                              <IconButton size="small" onClick={() => handleCancelOrder(order.id)} sx={{ color: C.danger, bgcolor: C.dangerBg }}>
                                <Cancel fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            <Button size="small" onClick={() => handleAdvanceStatus(order.id)} sx={{ bgcolor: C.btnGrad, color: "#fff", boxShadow: `0 2px 8px ${C.olive}55` }}>
                              {order.status === 'pending' && <><CheckCircle sx={{ fontSize: 16 }} /> {t("orders.btn_confirm")}</>}
                              {order.status === 'confirmed' && <><Kitchen sx={{ fontSize: 16 }} /> {t("orders.btn_prepare")}</>}
                              {order.status === 'preparing' && <><BagCheck sx={{ fontSize: 16 }} /> {t("orders.btn_ready")}</>}
                              {order.status === 'ready' && <><DoneAll sx={{ fontSize: 16 }} /> {t("orders.btn_deliver")}</>}
                            </Button>
                          </>
                        )}
                    </Box>
                  </Box>
                </Box>
              </Grid>
            );
          })
        )}
      </Grid>

      {/* FAB */}
      <Fab 
        color="primary" 
        aria-label="add" 
        onClick={addSampleOrder}
        sx={{ position: 'fixed', bottom: 24, right: isRtl ? 'auto' : 24, left: isRtl ? 24 : 'auto', bgcolor: C.btnGrad, color: "#fff", "&:hover": { bgcolor: C.btnGrad, transform: "translateY(-2px)" } }}
      >
        <Add />
      </Fab>

      {/* Detail Modal */}
      <Dialog open={Boolean(detailOrder)} onClose={() => setDetailOrder(null)} maxWidth="xs" fullWidth>
        <Box sx={{ bgcolor: C.glass, backdropFilter: "blur(28px)", p: 3, border: `1px solid ${C.glassBorder}`, borderRadius: "20px" }}>
          <Typography variant="h6" sx={{ fontWeight: 800, mb: 3, color: C.text, display: "flex", alignItems: "center", gap: 1 }}>
            <Visibility sx={{ color: C.olive }} /> {t("orders.detail_title")} #{detailOrder?.id}
          </Typography>
          {detailOrder && (
            <Box>
              <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2, mb: 3 }}>
                <Box><Typography sx={{ fontSize: 11, color: C.muted }}>{t("orders.table_label")}</Typography><Typography sx={{ fontWeight: 700 }}>{detailOrder.table}</Typography></Box>
                <Box><Typography sx={{ fontSize: 11, color: C.muted }}>{t("orders.customer_label")}</Typography><Typography sx={{ fontWeight: 700 }}>{detailOrder.customer}</Typography></Box>
              </Box>
              <Typography variant="subtitle2" sx={{ mb: 1, color: C.sub }}>{t("orders.detail_items")}</Typography>
              <Box sx={{ p: 1.5, borderRadius: "10px", bgcolor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)', mb: 2 }}>
                {detailOrder.items.map((item, idx) => (
                  <Box key={idx} sx={{ display: "flex", justifyContent: "space-between", py: 0.5, fontSize: 13 }}>
                    <Typography sx={{ color: C.text }}>{item.qty}× {item.name}</Typography>
                    <Typography sx={{ color: C.sub }}>{(item.price * item.qty).toLocaleString()} {t("orders.toman")}</Typography>
                  </Box>
                ))}
              </Box>
              <Box sx={{ display: "flex", justifyContent: "space-between", pt: 2, borderTop: `1px solid ${C.glassBorder}` }}>
                <Typography sx={{ fontWeight: 700 }}>{t("orders.detail_total")}</Typography>
                <Typography sx={{ fontWeight: 800, color: C.olive }}>{detailOrder.total.toLocaleString()} {t("orders.toman")}</Typography>
              </Box>
            </Box>
          )}
          <Button onClick={() => setDetailOrder(null)} sx={{ mt: 3, width: "100%", bgcolor: C.btnGrad, color: "#fff" }}>{t("common.close")}</Button>
        </Box>
      </Dialog>

      {/* Confirm Modal */}
      <Dialog open={confirmModal.open} onClose={() => setConfirmModal({ ...confirmModal, open: false })} maxWidth="xs" fullWidth>
        <Box sx={{ bgcolor: C.glass, backdropFilter: "blur(28px)", p: 3, border: `1px solid ${C.glassBorder}`, borderRadius: "20px", textAlign: "center" }}>
          <Box sx={{ width: 60, height: 60, mx: "auto", mb: 2, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "50%", bgcolor: confirmModal.type === 'danger' ? C.dangerBg : C.oliveSubtle, color: confirmModal.type === 'danger' ? C.danger : C.olive }}>
            {confirmModal.type === 'danger' ? <Cancel sx={{ fontSize: 30 }} /> : <DoneAll sx={{ fontSize: 30 }} />}
          </Box>
          <Typography variant="h6" sx={{ fontWeight: 700, mb: 1, color: C.text }}>{confirmModal.title}</Typography>
          <Typography sx={{ color: C.sub, fontSize: 13, mb: 3 }}>{confirmModal.desc}</Typography>
          <Box sx={{ display: "flex", gap: 2 }}>
            <Button onClick={() => setConfirmModal({ ...confirmModal, open: false })} sx={{ flex: 1, bgcolor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)', color: C.text }}>{t("common.cancel")}</Button>
            <Button onClick={confirmModal.onConfirm} sx={{ flex: 1, bgcolor: confirmModal.type === 'danger' ? C.danger : C.btnGrad, color: "#fff" }}>
              {confirmModal.type === 'danger' ? t("orders.modal_cancel_btn") : t("orders.modal_deliver_btn")}
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