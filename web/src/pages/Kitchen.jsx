import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLang } from "../contexts/LangContext";
import { kitchenApi } from "../api/kitchen";
import {
  Box, Typography, Grid, Paper, TextField, Button, IconButton, Chip,
  Select, MenuItem, FormControl, InputLabel, CircularProgress, Divider,
  Dialog, DialogTitle, DialogContent, DialogActions, Table, TableBody,
  TableCell, TableHead, TableRow, TableContainer, Badge, Tooltip,
  Alert, InputAdornment,
} from "@mui/material";
import {
  Restaurant, Receipt, Inventory, AttachMoney, Delete, PlayArrow,
  DoneAll, Search, Refresh, Calculate, LocalFireDepartment, Add,
  Close, CheckCircle, Warning, DeleteSweep, History, ContentCut,
  Schedule, Cancel, Block, Undo, Edit, Save,
} from "@mui/icons-material";

/* ═══ ابزارها ═══ */
const toFa = (n) => (n == null ? "—" : Number(n).toLocaleString("fa-IR"));
const fmtPrice = (v) => toFa(Math.round(v || 0)) + " تومان";
const WASTE_REASONS = {
  expired:       { labelFa: "تاریخ گذشته",    labelEn: "Expired",       color: "#0ea5e9", bg: "rgba(14,165,233,0.1)",  icon: <Schedule fontSize="small" /> },
  damaged:       { labelFa: "آسیب‌دیده",        labelEn: "Damaged",       color: "#f59e0b", bg: "rgba(245,158,11,0.1)",  icon: <Warning fontSize="small" /> },
  overcooked:    { labelFa: "بیش‌پخت",          labelEn: "Overcooked",    color: "#d97706", bg: "rgba(217,119,6,0.1)",   icon: <LocalFireDepartment fontSize="small" /> },
  quality_issue: { labelFa: "مشکل کیفیت",      labelEn: "Quality Issue", color: "#dc2626", bg: "rgba(220,38,38,0.1)",   icon: <Block fontSize="small" /> },
  returned:      { labelFa: "برگشتی مشتری",    labelEn: "Returned",      color: "#7c3aed", bg: "rgba(124,58,237,0.1)",  icon: <Undo fontSize="small" /> },
  other:         { labelFa: "سایر",             labelEn: "Other",         color: "#6b7280", bg: "rgba(107,114,128,0.1)", icon: <ContentCut fontSize="small" /> },
};

/* ═══ سیستم نوتیفیکیشن با صدا ═══ */
function useNotifications() {
  const [items, setItems] = useState([]);
  const audioCtxRef = useRef(null);
  const knownIdsRef = useRef(new Set());
  const initRef = useRef(false);

  const playSound = useCallback(() => {
    try {
      if (!audioCtxRef.current) audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
      const ctx = audioCtxRef.current;
      if (ctx.state === "suspended") ctx.resume();
      const now = ctx.currentTime;
      const osc1 = ctx.createOscillator(); const g1 = ctx.createGain();
      osc1.type = "sine"; osc1.frequency.setValueAtTime(880, now);
      g1.gain.setValueAtTime(0.15, now); g1.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
      osc1.connect(g1); g1.connect(ctx.destination); osc1.start(now); osc1.stop(now + 0.15);
      const osc2 = ctx.createOscillator(); const g2 = ctx.createGain();
      osc2.type = "sine"; osc2.frequency.setValueAtTime(1100, now + 0.12);
      g2.gain.setValueAtTime(0, now); g2.gain.setValueAtTime(0.15, now + 0.12);
      g2.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
      osc2.connect(g2); g2.connect(ctx.destination); osc2.start(now + 0.12); osc2.stop(now + 0.3);
    } catch (e) { /* silent */ }
  }, []);

  const detect = useCallback((orders) => {
    const currentIds = new Set(orders.map((o) => o.id));
    for (const id of knownIdsRef.current) {
      if (!currentIds.has(id)) knownIdsRef.current.delete(id);
    }
    const newOrders = [];
    for (const order of orders) {
      if (!knownIdsRef.current.has(order.id)) {
        knownIdsRef.current.add(order.id);
        if (initRef.current) newOrders.push(order);
      }
    }
    if (newOrders.length > 0) {
      playSound();
      setItems((prev) => [...newOrders, ...prev]);
    }
  }, [playSound]);

  const markInit = useCallback(() => { initRef.current = true; }, []);
  const dismiss = useCallback((id) => {
    setItems((prev) => prev.filter((n) => n.id !== id));
  }, []);

  return { notifications: items, detect, markInit, dismiss };
}

/* ═══ آمار بالا ═══ */
function StatsCards({ dashboard, isRtl }) {
  const s = dashboard?.stats || {};
  const products = dashboard?.products || [];
  const inventory = dashboard?.inventory || [];
  const waste = dashboard?.waste || [];
  const today = new Date().toISOString().slice(0, 10);
  const todayWaste = waste.filter((w) => (w.created_at || "").slice(0, 10) === today);
  const todayQty = todayWaste.reduce((sum, w) => sum + (w.quantity || 0), 0);
  const totalStock = inventory.reduce((sum, inv) => sum + (inv.quantity || 0), 0);

  const stats = [
    { label: isRtl ? "محصولات" : "Products",      value: toFa(s.total_products || products.length), color: "#c2410c", icon: <Restaurant /> },
    { label: isRtl ? "کل موجودی" : "Total Stock",  value: toFa(totalStock),                            color: "#0d9488", icon: <Inventory /> },
    { label: isRtl ? "ارزش موجودی" : "Inv. Value",  value: fmtPrice(s.inventory_value || 0),            color: "#f59e0b", icon: <AttachMoney /> },
    { label: isRtl ? "ضایعات امروز" : "Today Waste", value: toFa(s.waste_today_qty || todayQty),         color: "#dc2626", icon: <DeleteSweep /> },
  ];

  return (
    <Grid container spacing={1.5} sx={{ mb: 3 }}>
      {stats.map((st, i) => (
        <Grid size={{ xs: 6, md: 3 }} key={i}>
          <Paper sx={{
            p: 2.5, borderRadius: 3, textAlign: "center",
            border: "1.5px solid", borderColor: "divider",
            transition: "all 0.25s",
            "&:hover": { transform: "translateY(-3px)", boxShadow: 4 },
          }}>
            <Box sx={{ color: st.color, mb: 1 }}>{st.icon}</Box>
            <Typography sx={{ fontWeight: 900, fontSize: 20, color: st.color }}>
              {st.value}
            </Typography>
            <Typography sx={{ fontSize: 12, color: "text.secondary", fontWeight: 600, mt: 0.5 }}>
              {st.label}
            </Typography>
          </Paper>
        </Grid>
      ))}
    </Grid>
  );
}

/* ═══ تب سفارشات ═══ */
function OrdersPanel({ orders, onMarkReady, isRtl, isFetching }) {
  if (isFetching && !orders.length) {
    return <Box sx={{ textAlign: "center", py: 8 }}><CircularProgress /></Box>;
  }
  if (!orders.length) {
    return (
      <Box sx={{ textAlign: "center", py: 8, color: "text.secondary" }}>
        <Receipt sx={{ fontSize: 64, opacity: 0.15, mb: 2 }} />
        <Typography sx={{ fontWeight: 700, fontSize: 16 }}>
          {isRtl ? "سفارشی نیست" : "No orders"}
        </Typography>
        <Typography sx={{ fontSize: 13, opacity: 0.6 }}>
          {isRtl ? "همه سفارشات آماده شده" : "All orders are ready"}
        </Typography>
      </Box>
    );
  }

  return (
    <Grid container spacing={2}>
      {orders.map((order) => (
        <Grid size={{ xs: 12, sm: 6, md: 4 }} key={order.id}>
          <Paper sx={{
            borderRadius: 3, overflow: "hidden",
            border: "1.5px solid", borderColor: "divider",
            transition: "all 0.25s",
            "&:hover": { boxShadow: 4, borderColor: "#f59e0b" },
          }}>
            <Box sx={{
              px: 2, py: 1.5, display: "flex", alignItems: "center", gap: 1.5,
              background: "rgba(245,158,11,0.08)",
              borderBottom: "1px solid", borderColor: "divider",
            }}>
              <Typography sx={{ fontWeight: 800, fontSize: 15 }}>
                {isRtl ? "سفارش" : "Order"} #{toFa(order.id)}
              </Typography>
              <Chip label={isRtl ? "در حال آماده‌سازی" : "Preparing"} size="small"
                sx={{ fontWeight: 700, fontSize: 11, background: "rgba(14,165,233,0.1)", color: "#0ea5e9" }} />
              <Box sx={{ flex: 1 }} />
              <Typography sx={{ fontSize: 11, color: "text.secondary" }}>
                {order.created_at || ""}
              </Typography>
            </Box>
            <Box sx={{ p: 2 }}>
              <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.8 }}>
                {(order.items || []).map((item, i) => (
                  <Chip key={i}
                    label={`${item.food_name} ×${item.quantity}`}
                    sx={{ fontWeight: 700, fontSize: 12, background: "rgba(194,65,12,0.06)", borderRadius: 2 }} />
                ))}
              </Box>
            </Box>
            <Box sx={{
              px: 2, py: 1.5, display: "flex", alignItems: "center", gap: 1.5,
              borderTop: "1px solid", borderColor: "divider", background: "rgba(0,0,0,0.01)",
            }}>
              <Typography sx={{ fontWeight: 800, color: "#c2410c", flex: 1 }}>
                {fmtPrice(order.total_price)}
              </Typography>
              <Button
                size="small" variant="contained"
                onClick={() => onMarkReady(order.id)}
                startIcon={<DoneAll />}
                sx={{
                  fontWeight: 800, fontSize: 12, borderRadius: 2.5,
                  background: "linear-gradient(135deg, #16a34a, #059669)",
                  "&:hover": { background: "linear-gradient(135deg, #059669, #047857)" },
                }}>
                {isRtl ? "آماده است" : "Ready"}
              </Button>
            </Box>
          </Paper>
        </Grid>
      ))}
    </Grid>
  );
}

/* ═══ تب غذاهای منو ═══ */
function MenuFoodsPanel({ dashboard, menuFoods, foodCategories, isRtl, onProduceFood, onProduceExisting, onShowCost }) {
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("all");
  const products = dashboard?.products || [];

  const kpMap = useMemo(() => {
    const m = {};
    products.forEach((p) => { m[p.name] = p; });
    return m;
  }, [products]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return menuFoods.filter((f) => {
      const ms = !q || (f.name || "").toLowerCase().includes(q);
      const mc = catFilter === "all" || String(f.category_id) === catFilter;
      return ms && mc;
    });
  }, [menuFoods, search, catFilter]);

  const catCounts = useMemo(() => {
    const cc = {};
    menuFoods.forEach((f) => { cc[String(f.category_id)] = (cc[String(f.category_id)] || 0) + 1; });
    return cc;
  }, [menuFoods]);

  const inKitchen = menuFoods.filter((f) => !!kpMap[f.name]).length;

  return (
    <Box>
      {/* آمار */}
      <Box sx={{ display: "flex", gap: 1.5, mb: 2, flexWrap: "wrap" }}>
        <Chip label={`${isRtl ? "کل منو" : "Total"}: ${menuFoods.length}`}
          sx={{ fontWeight: 700, background: "rgba(194,65,12,0.08)", color: "#c2410c" }} />
        <Chip label={`${isRtl ? "در آشپزخانه" : "In Kitchen"}: ${inKitchen}`}
          sx={{ fontWeight: 700, background: "rgba(22,163,74,0.08)", color: "#16a34a" }} />
        <Chip label={`${isRtl ? "منتظر ورود" : "Pending"}: ${menuFoods.length - inKitchen}`}
          sx={{ fontWeight: 700, background: "rgba(220,38,38,0.08)", color: "#dc2626" }} />
      </Box>

      {/* جستجو + فیلتر */}
      <Box sx={{ display: "flex", gap: 1.5, mb: 2, flexWrap: "wrap", alignItems: "center" }}>
        <TextField size="small" placeholder={isRtl ? "جستجوی غذا..." : "Search food..."}
          value={search} onChange={(e) => setSearch(e.target.value)}
          slotProps={{ input: { startAdornment: <InputAdornment position="start"><Search fontSize="small" sx={{ opacity: 0.4 }} /></InputAdornment> } }}
          sx={{ minWidth: 220, "& .MuiOutlinedInput-root": { borderRadius: 3 } }} />
        <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
          <Chip label={`${isRtl ? "همه" : "All"} (${menuFoods.length})`}
            onClick={() => setCatFilter("all")}
            variant={catFilter === "all" ? "filled" : "outlined"}
            sx={{ fontWeight: 700, fontSize: 12, borderRadius: 2,
              ...(catFilter === "all" ? { background: "linear-gradient(135deg, #c2410c, #f59e0b)", color: "#fff" } : {}) }} />
          {(foodCategories || []).map((cat) => {
            const n = catCounts[String(cat.id)] || 0;
            if (n === 0) return null;
            return (
              <Chip key={cat.id} label={`${cat.name} (${n})`}
                onClick={() => setCatFilter(String(cat.id))}
                variant={catFilter === String(cat.id) ? "filled" : "outlined"}
                sx={{ fontWeight: 700, fontSize: 12, borderRadius: 2,
                  ...(catFilter === String(cat.id) ? { background: "linear-gradient(135deg, #c2410c, #f59e0b)", color: "#fff" } : {}) }} />
            );
          })}
        </Box>
      </Box>

      {/* کارت‌ها */}
      {!filtered.length ? (
        <Box sx={{ textAlign: "center", py: 8, color: "text.secondary" }}>
          <Search sx={{ fontSize: 48, opacity: 0.2, mb: 1 }} />
          <Typography>{isRtl ? "نتیجه‌ای یافت نشد" : "No results"}</Typography>
        </Box>
      ) : (
        <Grid container spacing={1.5}>
          {filtered.map((food) => {
            const kp = kpMap[food.name];
            const ik = !!kp;
            const price = ik && kp.selling_price != null ? Number(kp.selling_price) : Number(food.final_price || food.price || 0);
            const cost = ik ? Number(kp.cost) || 0 : 0;

            return (
              <Grid size={{ xs: 12, sm: 6, md: 4, lg: 3 }} key={food.id}>
                <Paper sx={{
                  p: 2, borderRadius: 3, border: "1.5px solid", borderColor: "divider",
                  transition: "all 0.25s", position: "relative", overflow: "hidden",
                  "&:hover": { borderColor: "#c2410c", transform: "translateY(-3px)", boxShadow: 4 },
                  "&::before": { content: '""', position: "absolute", top: 0, left: 0, right: 0, height: 3,
                    background: "linear-gradient(90deg, #c2410c, #f59e0b)", opacity: 0, transition: "opacity 0.2s" },
                  "&:hover::before": { opacity: 1 },
                }}>
                  {/* تصویر */}
                  <Box sx={{
                    height: 120, borderRadius: 2, mb: 1.5, overflow: "hidden",
                    background: "linear-gradient(135deg, #fff7ed, #fef3c7)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    {food.image ? (
                      <Box component="img" src={food.image} sx={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    ) : (
                      <Restaurant sx={{ fontSize: 48, opacity: 0.2, color: "#c2410c" }} />
                    )}
                  </Box>

                  <Typography sx={{ fontWeight: 800, fontSize: 14, mb: 0.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {food.name}
                  </Typography>

                  <Box sx={{ display: "flex", gap: 0.5, alignItems: "center", mb: 1, flexWrap: "wrap" }}>
                    <Chip label={food.category_name || (isRtl ? "بدون دسته" : "No category")} size="small"
                      sx={{ fontWeight: 600, fontSize: 10, background: "rgba(245,158,11,0.1)", color: "#d97706", borderRadius: 1.5 }} />
                    {ik && cost > 0 && (
                      <Typography sx={{ fontSize: 11, fontWeight: 700, color: "#dc2626" }}>
                        {isRtl ? "هزینه:" : "Cost:"} {fmtPrice(cost)}
                      </Typography>
                    )}
                    <Typography sx={{ fontSize: 13, fontWeight: 900, color: "#c2410c", mr: "auto" }}>
                      {price > 0 ? fmtPrice(price) : "—"}
                    </Typography>
                  </Box>

                  {/* موجودی */}
                  {ik && (
                    <Box sx={{ mb: 1 }}>
                      <StockBadge productId={kp.id} dashboard={dashboard} isRtl={isRtl} />
                    </Box>
                  )}

                  {/* دکمه‌ها */}
                  {ik ? (
                    <Box sx={{ display: "flex", gap: 0.5 }}>
                      <Button size="small" fullWidth variant="outlined"
                        onClick={() => onShowCost(kp.id)}
                        sx={{ fontWeight: 700, fontSize: 11, borderRadius: 2, color: "#c2410c", borderColor: "#c2410c" }}>
                        {isRtl ? "هزینه و قیمت" : "Cost & Price"}
                      </Button>
                      <Button size="small" fullWidth variant="contained"
                        onClick={() => onProduceExisting(kp.id)}
                        sx={{ fontWeight: 700, fontSize: 11, borderRadius: 2,
                          background: "linear-gradient(135deg, #0d9488, #0f766e)" }}>
                        {isRtl ? "تولید" : "Produce"}
                      </Button>
                    </Box>
                  ) : (
                    <Button size="small" fullWidth variant="contained"
                      onClick={() => onProduceFood(food.id)}
                      sx={{ fontWeight: 700, fontSize: 11, borderRadius: 2,
                        background: "linear-gradient(135deg, #c2410c, #9a3412)" }}>
                      {isRtl ? "تولید غذا" : "Produce Food"}
                    </Button>
                  )}
                </Paper>
              </Grid>
            );
          })}
        </Grid>
      )}
    </Box>
  );
}

/* ═══ بج موجودی ═══ */
function StockBadge({ productId, dashboard, isRtl }) {
  const inventory = dashboard?.inventory || [];
  const products = dashboard?.products || [];
  const stock = inventory.find((inv) => (inv.kitchen_product_id || inv.kitchen_product) === productId);
  const product = products.find((p) => p.id === productId);
  const avail = stock ? (stock.available_quantity != null ? stock.available_quantity : stock.quantity || 0) : 0;
  const min = product?.min_stock || product?.minimum_stock || 0;

  if (!stock) {
    return <Chip size="small" label={isRtl ? "بدون انبار" : "No stock"}
      sx={{ fontWeight: 700, fontSize: 10, background: "rgba(220,38,38,0.1)", color: "#dc2626" }} />;
  }

  const level = avail <= 0 ? "error" : (min > 0 && avail < min) ? "warn" : "ok";
  const colors = {
    ok:    { bg: "rgba(22,163,74,0.1)", color: "#16a34a" },
    warn:  { bg: "rgba(245,158,11,0.1)", color: "#f59e0b" },
    error: { bg: "rgba(220,38,38,0.1)", color: "#dc2626" },
  };
  const c = colors[level];

  return (
    <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
      <Chip size="small" icon={level === "ok" ? <CheckCircle /> : <Warning />}
        label={`${isRtl ? "موجودی" : "Stock"}: ${toFa(avail)}`}
        sx={{ fontWeight: 700, fontSize: 10, background: c.bg, color: c.color }} />
      {min > 0 && (
        <Chip size="small" label={`${isRtl ? "حداقل" : "Min"}: ${toFa(min)}`}
          sx={{ fontWeight: 600, fontSize: 10, background: "rgba(0,0,0,0.04)" }} />
      )}
    </Box>
  );
}

/* ═══ تب ضایعات ═══ */
function WastePanel({ dashboard, isRtl, onAdd, onDelete }) {
  const [search, setSearch] = useState("");
  const [reasonFilter, setReasonFilter] = useState("all");
  const waste = dashboard?.waste || [];
  const today = new Date().toISOString().slice(0, 10);
  const todayWaste = waste.filter((w) => (w.created_at || "").slice(0, 10) === today);
  const todayQty = todayWaste.reduce((s, w) => s + (w.quantity || 0), 0);
  const todayCost = todayWaste.reduce((s, w) => s + (w.total_cost || w.cost * (w.quantity || 1) || 0), 0);
  const totalQty = waste.reduce((s, w) => s + (w.quantity || 0), 0);
  const totalCost = waste.reduce((s, w) => s + (w.total_cost || w.cost * (w.quantity || 1) || 0), 0);

  const reasonCounts = useMemo(() => {
    const rc = {};
    waste.forEach((w) => { rc[w.reason] = (rc[w.reason] || 0) + 1; });
    return rc;
  }, [waste]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return waste.filter((w) => {
      const mr = reasonFilter === "all" || w.reason === reasonFilter;
      const mq = !q || (w.product_name || w.kitchen_product_name || "").toLowerCase().includes(q) || (w.notes || "").toLowerCase().includes(q);
      return mr && mq;
    });
  }, [waste, search, reasonFilter]);

  return (
    <Box>
      {/* آمار */}
      <Box sx={{ display: "flex", gap: 1.5, mb: 2, flexWrap: "wrap" }}>
        <Chip label={`${isRtl ? "ضایعات امروز" : "Today"}: ${todayQty}`}
          sx={{ fontWeight: 700, background: "rgba(220,38,38,0.08)", color: "#dc2626" }} />
        <Chip label={`${isRtl ? "هزینه امروز" : "Today Cost"}: ${fmtPrice(todayCost)}`}
          sx={{ fontWeight: 700, background: "rgba(220,38,38,0.08)", color: "#dc2626" }} />
        <Chip label={`${isRtl ? "کل ضایعات" : "Total"}: ${totalQty}`}
          sx={{ fontWeight: 700, background: "rgba(245,158,11,0.08)", color: "#d97706" }} />
        <Chip label={`${isRtl ? "کل هزینه" : "Total Cost"}: ${fmtPrice(totalCost)}`}
          sx={{ fontWeight: 700, background: "rgba(245,158,11,0.08)", color: "#d97706" }} />
      </Box>

      {/* جستجو + فیلتر + دکمه */}
      <Box sx={{ display: "flex", gap: 1.5, mb: 2, flexWrap: "wrap", alignItems: "center" }}>
        <TextField size="small" placeholder={isRtl ? "جستجوی ضایعات..." : "Search waste..."}
          value={search} onChange={(e) => setSearch(e.target.value)}
          slotProps={{ input: { startAdornment: <InputAdornment position="start"><Search fontSize="small" sx={{ opacity: 0.4 }} /></InputAdornment> } }}
          sx={{ minWidth: 220, "& .MuiOutlinedInput-root": { borderRadius: 3 } }} />
        <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
          <Chip label={`${isRtl ? "همه" : "All"} (${waste.length})`}
            onClick={() => setReasonFilter("all")}
            variant={reasonFilter === "all" ? "filled" : "outlined"}
            sx={{ fontWeight: 700, fontSize: 12, borderRadius: 2,
              ...(reasonFilter === "all" ? { background: "linear-gradient(135deg, #dc2626, #f59e0b)", color: "#fff" } : {}) }} />
          {Object.entries(WASTE_REASONS).map(([key, val]) => {
            const n = reasonCounts[key] || 0;
            if (n === 0) return null;
            return (
              <Chip key={key} icon={val.icon}
                label={`${isRtl ? val.labelFa : val.labelEn} (${n})`}
                onClick={() => setReasonFilter(key)}
                variant={reasonFilter === key ? "filled" : "outlined"}
                sx={{ fontWeight: 700, fontSize: 12, borderRadius: 2,
                  ...(reasonFilter === key ? { background: val.bg, color: val.color, borderColor: val.color } : {}) }} />
            );
          })}
        </Box>
        <Box sx={{ flex: 1 }} />
        <Button variant="contained" onClick={onAdd} startIcon={<Add />}
          sx={{ fontWeight: 700, borderRadius: 2.5, background: "linear-gradient(135deg, #dc2626, #b91c1c)" }}>
          {isRtl ? "ثبت ضایعات" : "Add Waste"}
        </Button>
      </Box>

      {/* جدول */}
      <TableContainer component={Paper} sx={{ borderRadius: 3, border: "1px solid", borderColor: "divider" }}>
        <Table size="small">
          <TableHead>
            <TableRow sx={{ background: "rgba(220,38,38,0.04)" }}>
              {["#", isRtl ? "محصول" : "Product", isRtl ? "تعداد" : "Qty", isRtl ? "دلیل" : "Reason", isRtl ? "هزینه" : "Cost", isRtl ? "تاریخ" : "Date", isRtl ? "یادداشت" : "Notes", isRtl ? "عملیات" : "Actions"].map((h) => (
                <TableCell key={h} sx={{ fontWeight: 700, color: "#dc2626", textAlign: "center", fontSize: 12 }}>{h}</TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} sx={{ textAlign: "center", py: 6 }}>
                  <DeleteSweep sx={{ fontSize: 48, opacity: 0.15 }} />
                  <Typography sx={{ fontWeight: 600, color: "text.secondary" }}>
                    {isRtl ? "ضایعاتی ثبت نشده" : "No waste records"}
                  </Typography>
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((w, i) => {
                const ri = WASTE_REASONS[w.reason] || WASTE_REASONS.other;
                const costVal = w.total_cost || w.cost * (w.quantity || 1) || 0;
                const dt = w.created_at ? new Date(w.created_at) : null;
                return (
                  <TableRow key={w.id || i} sx={{ "&:hover": { background: "rgba(220,38,38,0.02)" } }}>
                    <TableCell sx={{ textAlign: "center", fontWeight: 600 }}>{i + 1}</TableCell>
                    <TableCell sx={{ fontWeight: 700, textAlign: "center" }}>{w.product_name || w.kitchen_product_name || "—"}</TableCell>
                    <TableCell sx={{ fontWeight: 700, color: "#dc2626", textAlign: "center" }}>{toFa(w.quantity)}</TableCell>
                    <TableCell sx={{ textAlign: "center" }}>
                      <Chip icon={ri.icon} label={isRtl ? ri.labelFa : ri.labelEn} size="small"
                        sx={{ fontWeight: 700, fontSize: 10, background: ri.bg, color: ri.color }} />
                    </TableCell>
                    <TableCell sx={{ fontWeight: 700, color: "#dc2626", textAlign: "center" }}>{fmtPrice(costVal)}</TableCell>
                    <TableCell sx={{ textAlign: "center", fontSize: 12 }}>
                      {dt ? dt.toLocaleDateString("fa-IR") : "—"}
                    </TableCell>
                    <TableCell sx={{ textAlign: "center", fontSize: 12, maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {w.notes || "—"}
                    </TableCell>
                    <TableCell sx={{ textAlign: "center" }}>
                      <IconButton size="small" onClick={() => onDelete(w.id)}
                        sx={{ color: "#dc2626", "&:hover": { background: "rgba(220,38,38,0.1)" } }}>
                        <Delete fontSize="small" />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}

/* ═══ مودال تولید غذا ═══ */
function ProduceFoodModal({ open, onClose, foodId, productId, dashboard, menuFoods, recipes, isRtl, queryClient }) {
  const [recipe, setRecipe] = useState("");
  const [recipeCost, setRecipeCost] = useState(0);
  const [markupPct, setMarkupPct] = useState(30);
  const [sellingPrice, setSellingPrice] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [stockResult, setStockResult] = useState(null);

  const products = dashboard?.products || [];
  const food = foodId ? menuFoods.find((f) => f.id === foodId) : null;
  const product = productId ? products.find((p) => p.id === productId) : null;

  useEffect(() => {
    if (!open) return;
    setError(""); setSuccess(""); setStockResult(null);
    if (product) {
      setRecipe(product.recipe_id || product.recipe || "");
      const cost = Number(product.cost) || 0;
      setRecipeCost(cost);
      const price = Number(product.selling_price) || 0;
      const pct = cost > 0 ? Math.round(((price - cost) / cost) * 100) : 30;
      setMarkupPct(pct);
      setSellingPrice(price);
      setQuantity(1);
    } else {
      setRecipe(""); setRecipeCost(0); setMarkupPct(30); setSellingPrice(0); setQuantity(1);
    }
  }, [open, product]);

  const handleRecipeChange = (val) => {
    setRecipe(val);
    const r = recipes.find((rec) => rec.id === val);
    const cost = r ? Number(r.cost || r.total_cost || 0) : 0;
    setRecipeCost(cost);
    const pct = parseFloat(markupPct) || 0;
    setSellingPrice(Math.round(cost * (1 + pct / 100)));
  };

  const handlePctChange = (pct) => {
    setMarkupPct(pct);
    setSellingPrice(Math.round(recipeCost * (1 + (parseFloat(pct) || 0) / 100)));
  };

  const handlePriceChange = (price) => {
    setSellingPrice(price);
    setMarkupPct(recipeCost > 0 ? Math.round(((price - recipeCost) / recipeCost) * 100) : 0);
  };

  const profit = sellingPrice - recipeCost;
  const margin = recipeCost > 0 ? Math.round((profit / recipeCost) * 100) : 0;
  const totalCost = recipeCost * quantity;
  const totalRevenue = sellingPrice * quantity;
  const totalProfit = totalRevenue - totalCost;

  const handleProduce = async () => {
    if (!recipe) { setError(isRtl ? "دستور پخت را انتخاب کنید" : "Select a recipe"); return; }
    if (recipeCost <= 0) { setError(isRtl ? "هزینه رسپی نامعتبر است" : "Invalid recipe cost"); return; }
    if (sellingPrice <= 0) { setError(isRtl ? "قیمت فروش را وارد کنید" : "Enter selling price"); return; }
    if (quantity <= 0) { setError(isRtl ? "مقدار تولید نامعتبر" : "Invalid quantity"); return; }

    setLoading(true); setError(""); setStockResult(null);

    try {
      let pid = productId;
      if (!pid && food) {
        const existing = products.find((p) => p.name === food.name);
        if (existing) {
          pid = existing.id;
          await kitchenApi.updateProduct(pid, { selling_price: sellingPrice, recipe: parseInt(recipe) });
        } else {
          const res = await kitchenApi.createProduct({
            name: food.name, category: food.category_name || "other",
            selling_price: sellingPrice, recipe: parseInt(recipe),
            description: "تولید از منو",
          });
          pid = res.data.id || res.data.pk;
        }
      } else if (pid) {
        await kitchenApi.updateProduct(pid, { selling_price: sellingPrice, recipe: parseInt(recipe) });
      }

      if (!pid) throw new Error(isRtl ? "شناسه محصول دریافت نشد" : "Product ID not received");

      // Check stock
      try {
        const matRes = await kitchenApi.calculateMaterials({ items: [{ product_id: pid, quantity }] });
        const matData = matRes.data;
        if (matData.shortage_count > 0) {
          setStockResult({ ok: false, data: matData });
          setLoading(false);
          return;
        }
      } catch (e) { /* server will validate */ }

      await kitchenApi.produceProduct(pid, { quantity, notes: "تولید از منو" });
      await kitchenApi.updateProduct(pid, { selling_price });

      setSuccess(isRtl ? `«${food?.name || product?.name || "محصول"}» — ${toFa(quantity)} واحد تولید شد` : `Produced ${quantity} units`);
      queryClient.invalidateQueries(["kitchenDashboard"]);
      setTimeout(() => onClose(), 1500);
    } catch (e) {
      setError(e.response?.data?.detail || e.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontWeight: 900 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <LocalFireDepartment sx={{ color: "#0d9488" }} />
          {isRtl ? "تولید غذا" : "Produce Food"}
        </Box>
        <IconButton onClick={onClose} size="small"><Close /></IconButton>
      </DialogTitle>
      <DialogContent>
        {/* نام غذا */}
        <Alert severity="info" sx={{ mb: 2, borderRadius: 3, textAlign: "center" }}>
          <Typography sx={{ fontWeight: 800, fontSize: 16 }}>
            {food?.name || product?.name || "—"}
          </Typography>
          {food && (
            <Typography sx={{ fontSize: 12, mt: 0.5 }}>
              {food.category_name || ""} — {isRtl ? "قیمت منو:" : "Menu price:"} {fmtPrice(food.final_price || food.price || 0)}
            </Typography>
          )}
          {product && (
            <Typography sx={{ fontSize: 12, mt: 0.5 }}>
              {isRtl ? "موجودی فعلی:" : "Current stock:"} {toFa(dashboard?.inventory?.find((inv) => (inv.kitchen_product_id || inv.kitchen_product) === product.id)?.available_quantity || 0)} {isRtl ? "واحد" : "units"}
            </Typography>
          )}
        </Alert>

        {/* رسپی */}
        <FormControl fullWidth sx={{ mb: 2 }}>
          <InputLabel>{isRtl ? "دستور پخت" : "Recipe"} *</InputLabel>
          <Select value={recipe} onChange={(e) => handleRecipeChange(e.target.value)}
            label={isRtl ? "دستور پخت" : "Recipe"} sx={{ borderRadius: 2 }}>
            <MenuItem value="">{isRtl ? "انتخاب کنید..." : "Select..."}</MenuItem>
            {(recipes || []).map((r) => (
              <MenuItem key={r.id} value={r.id}>{r.name}</MenuItem>
            ))}
          </Select>
        </FormControl>

        {/* هزینه */}
        <Paper sx={{ p: 2, mb: 2, textAlign: "center", background: "rgba(220,38,38,0.03)", border: "1.5px solid rgba(220,38,38,0.15)", borderRadius: 3 }}>
          <Typography sx={{ fontSize: 12, color: "text.secondary" }}>
            {isRtl ? "هزینه تولید هر واحد (از رسپی)" : "Production cost per unit (from recipe)"}
          </Typography>
          <Typography sx={{ fontSize: 22, fontWeight: 900, color: recipeCost > 0 ? "#dc2626" : "text.secondary" }}>
            {recipeCost > 0 ? fmtPrice(recipeCost) : "—"}
          </Typography>
        </Paper>

        {/* قیمت فروش */}
        <Paper sx={{ p: 2, mb: 2, border: "1.5px solid", borderColor: "divider", borderRadius: 3 }}>
          <Typography sx={{ fontWeight: 700, mb: 1.5, display: "flex", alignItems: "center", gap: 0.5 }}>
            <AttachMoney sx={{ color: "#16a34a", fontSize: 18 }} />
            {isRtl ? "قیمت فروش (صندوق)" : "Selling Price (POS)"}
          </Typography>
          <Grid container spacing={1.5}>
            <Grid size={6}>
              <TextField fullWidth size="small" type="number"
                label={isRtl ? "درصد سود" : "Markup %"}
                value={markupPct} onChange={(e) => handlePctChange(e.target.value)}
                slotProps={{ input: { endAdornment: <InputAdornment position="end">%</InputAdornment> } }}
                sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2 } }} />
            </Grid>
            <Grid size={6}>
              <TextField fullWidth size="small" type="number"
                label={isRtl ? "قیمت فروش (تومان)" : "Price (Toman)"}
                value={sellingPrice} onChange={(e) => handlePriceChange(parseInt(e.target.value) || 0)}
                sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2 } }} />
            </Grid>
          </Grid>
          <Box sx={{ mt: 1.5, p: 1.5, background: "rgba(0,0,0,0.02)", borderRadius: 2, display: "flex", justifyContent: "space-between" }}>
            <Box sx={{ textAlign: "center" }}>
              <Typography sx={{ fontSize: 11, color: "text.secondary" }}>{isRtl ? "سود واحد" : "Unit Profit"}</Typography>
              <Typography sx={{ fontWeight: 800, fontSize: 13, color: profit >= 0 ? "#16a34a" : "#dc2626" }}>
                {sellingPrice > 0 ? fmtPrice(profit) : "—"}
              </Typography>
            </Box>
            <Box sx={{ textAlign: "center" }}>
              <Typography sx={{ fontSize: 11, color: "text.secondary" }}>{isRtl ? "حاشیه سود" : "Margin"}</Typography>
              <Typography sx={{ fontWeight: 800, fontSize: 13, color: profit >= 0 ? "#16a34a" : "#dc2626" }}>
                {sellingPrice > 0 ? `${margin}%` : "—"}
              </Typography>
            </Box>
          </Box>
        </Paper>

        {/* مقدار تولید */}
        <TextField fullWidth size="small" type="number"
          label={isRtl ? "مقدار تولید" : "Quantity"} value={quantity}
          onChange={(e) => setQuantity(parseInt(e.target.value) || 0)}
          sx={{ mb: 2, "& .MuiOutlinedInput-root": { borderRadius: 2 } }} />

        {/* خلاصه */}
        {quantity > 0 && recipeCost > 0 && (
          <Paper sx={{ p: 2, mb: 2, background: "rgba(13,148,136,0.04)", border: "1.5px solid rgba(13,148,136,0.2)", borderRadius: 3 }}>
            <Typography sx={{ fontWeight: 700, fontSize: 13, color: "#0d9488", mb: 1.5, textAlign: "center" }}>
              {isRtl ? "خلاصه تولید" : "Production Summary"}
            </Typography>
            <Grid container spacing={1}>
              {[
                { label: isRtl ? "تعداد" : "Qty", value: toFa(quantity), color: "text.primary" },
                { label: isRtl ? "هزینه کل" : "Total Cost", value: fmtPrice(totalCost), color: "#dc2626" },
                { label: isRtl ? "درآمد کل" : "Total Revenue", value: fmtPrice(totalRevenue), color: "#16a34a" },
              ].map((item, i) => (
                <Grid size={4} key={i}>
                  <Box sx={{ textAlign: "center", p: 1, background: "rgba(255,255,255,0.5)", borderRadius: 2 }}>
                    <Typography sx={{ fontSize: 11, color: "text.secondary" }}>{item.label}</Typography>
                    <Typography sx={{ fontWeight: 800, fontSize: 14, color: item.color }}>{item.value}</Typography>
                  </Box>
                </Grid>
              ))}
            </Grid>
            <Typography sx={{ textAlign: "center", mt: 1.5, fontWeight: 700, fontSize: 13, color: totalProfit >= 0 ? "#16a34a" : "#dc2626" }}>
              {totalProfit >= 0
                ? `${isRtl ? "سود کل:" : "Total Profit:"} ${fmtPrice(totalProfit)}`
                : `${isRtl ? "زیان:" : "Loss:"} ${fmtPrice(Math.abs(totalProfit))}`}
            </Typography>
          </Paper>
        )}

        {/* نتیجه بررسی موجودی */}
        {stockResult && !stockResult.ok && (
          <Alert severity="error" sx={{ mb: 2, borderRadius: 3 }}>
            <Typography sx={{ fontWeight: 700, mb: 1 }}>
              {isRtl ? "کمبود مواد! امکان تولید نیست" : "Material shortage! Cannot produce"}
            </Typography>
            {[...(stockResult.data.raw_materials || []), ...(stockResult.data.semi_materials || [])].map((m, i) => (
              <Box key={i} sx={{ display: "flex", justifyContent: "space-between", fontSize: 12, py: 0.3 }}>
                <Typography sx={{ fontSize: 12 }}>{m.name}</Typography>
                <Typography sx={{ fontSize: 12, color: m.available < m.required ? "#dc2626" : "#16a34a", fontWeight: 600 }}>
                  {isRtl ? "نیاز:" : "Need:"} {toFa(m.required)} / {isRtl ? "موجود:" : "Avail:"} {toFa(m.available)} {m.unit || ""}
                </Typography>
              </Box>
            ))}
          </Alert>
        )}

        {error && <Alert severity="error" sx={{ mb: 2, borderRadius: 3 }}>{error}</Alert>}
        {success && <Alert severity="success" sx={{ mb: 2, borderRadius: 3 }}>{success}</Alert>}
      </DialogContent>
      <DialogActions sx={{ p: 2, gap: 1 }}>
        <Button onClick={onClose} variant="outlined" sx={{ borderRadius: 2.5 }}>
          {isRtl ? "انصراف" : "Cancel"}
        </Button>
        <Button onClick={handleProduce} disabled={loading} variant="contained"
          startIcon={loading ? <CircularProgress size={18} /> : <LocalFireDepartment />}
          sx={{
            flex: 1, fontWeight: 800, borderRadius: 2.5,
            background: "linear-gradient(135deg, #0d9488, #0f766e)",
            "&:hover": { background: "linear-gradient(135deg, #0f766e, #115e59)" },
          }}>
          {isRtl ? "تولید و ارسال به صندوق" : "Produce & Send to POS"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/* ═══ مودال هزینه و قیمت ═══ */
function CostPriceModal({ open, onClose, productId, dashboard, isRtl, queryClient }) {
  const products = dashboard?.products || [];
  const inventory = dashboard?.inventory || [];
  const product = products.find((p) => p.id === productId);
  const stock = inventory.find((inv) => (inv.kitchen_product_id || inv.kitchen_product) === productId);
  const [newPrice, setNewPrice] = useState(0);
  const [pct, setPct] = useState(0);
  const [minStock, setMinStock] = useState(0);

  useEffect(() => {
    if (!open || !product) return;
    const cost = Number(product.cost) || 0;
    const price = Number(product.selling_price) || 0;
    setNewPrice(price);
    setPct(cost > 0 ? Math.round(((price - cost) / cost) * 100) : 0);
    setMinStock(product.min_stock || product.minimum_stock || 0);
  }, [open, product]);

  if (!product) return null;
  const cost = Number(product.cost) || 0;
  const profit = newPrice - cost;
  const margin = cost > 0 ? Math.round((profit / cost) * 100) : 0;
  const avail = stock ? (stock.available_quantity != null ? stock.available_quantity : stock.quantity || 0) : 0;

  const handleSavePrice = async () => {
    try {
      await kitchenApi.updateProduct(productId, { selling_price: newPrice });
      queryClient.invalidateQueries(["kitchenDashboard"]);
    } catch (e) { /* handled */ }
  };

  const handleSaveMinStock = async () => {
    try {
      await kitchenApi.updateProduct(productId, { min_stock: minStock });
      queryClient.invalidateQueries(["kitchenDashboard"]);
    } catch (e) { /* handled */ }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontWeight: 900 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Calculate sx={{ color: "#c2410c" }} />
          {product.name}
        </Box>
        <IconButton onClick={onClose} size="small"><Close /></IconButton>
      </DialogTitle>
      <DialogContent>
        {/* خلاصه */}
        <Grid container spacing={1.5} sx={{ mb: 2 }}>
          {[
            { label: isRtl ? "هزینه تولید" : "Production Cost", value: fmtPrice(cost), color: "#dc2626" },
            { label: isRtl ? "قیمت فروش" : "Selling Price", value: fmtPrice(product.selling_price), color: "#16a34a" },
            { label: isRtl ? "سود واحد" : "Unit Profit", value: fmtPrice(profit), color: profit >= 0 ? "#16a34a" : "#dc2626" },
          ].map((item, i) => (
            <Grid size={4} key={i}>
              <Paper sx={{ p: 1.5, textAlign: "center", border: "1px solid", borderColor: "divider", borderRadius: 2 }}>
                <Typography sx={{ fontWeight: 800, fontSize: 15, color: item.color }}>{item.value}</Typography>
                <Typography sx={{ fontSize: 11, color: "text.secondary", mt: 0.5 }}>{item.label}</Typography>
              </Paper>
            </Grid>
          ))}
        </Grid>

        <Paper sx={{ p: 1.5, mb: 2, textAlign: "center", borderRadius: 2,
          background: profit >= 0 ? "rgba(22,163,74,0.05)" : "rgba(220,38,38,0.05)",
          border: "1px solid", borderColor: profit >= 0 ? "rgba(22,163,74,0.2)" : "rgba(220,38,38,0.2)" }}>
          <Typography sx={{ fontWeight: 700, color: profit >= 0 ? "#16a34a" : "#dc2626" }}>
            {isRtl ? "حاشیه سود:" : "Margin:"} {margin}%
          </Typography>
        </Paper>

        {/* حداقل موجودی */}
        <Paper sx={{ p: 2, mb: 2, border: "1.5px solid", borderColor: "divider", borderRadius: 3 }}>
          <Typography sx={{ fontWeight: 700, mb: 1.5 }}>
            {isRtl ? "حداقل موجودی" : "Minimum Stock"}
          </Typography>
          <Grid container spacing={1.5} sx={{ mb: 1.5 }}>
            {[
              { label: isRtl ? "موجودی فعلی" : "Current", value: toFa(avail), color: avail > 0 ? "#16a34a" : "#dc2626" },
              { label: isRtl ? "حداقل" : "Minimum", value: minStock > 0 ? toFa(minStock) : (isRtl ? "تعیین نشده" : "Not set"), color: minStock > 0 ? (avail < minStock ? "#dc2626" : "#16a34a") : "#6b7280" },
              { label: isRtl ? "مانده" : "Remaining", value: minStock > 0 ? toFa(Math.max(0, avail - minStock)) : "—", color: minStock > 0 && avail - minStock < 0 ? "#dc2626" : "#f59e0b" },
            ].map((item, i) => (
              <Grid size={4} key={i}>
                <Box sx={{ textAlign: "center", p: 1, background: "rgba(0,0,0,0.02)", borderRadius: 2 }}>
                  <Typography sx={{ fontWeight: 800, fontSize: 14, color: item.color }}>{item.value}</Typography>
                  <Typography sx={{ fontSize: 10, color: "text.secondary" }}>{item.label}</Typography>
                </Box>
              </Grid>
            ))}
          </Grid>
          {minStock > 0 && avail < minStock && (
            <Alert severity="error" sx={{ mb: 1.5, borderRadius: 2 }}>
              {isRtl ? `موجودی زیر حداقل! (موجود: ${toFa(avail)} — حداقل: ${toFa(minStock)})` : `Stock below minimum! (Available: ${avail} — Min: ${minStock})`}
            </Alert>
          )}
          <TextField fullWidth size="small" type="number" label={isRtl ? "حداقل موجودی" : "Min Stock"} value={minStock}
            onChange={(e) => setMinStock(parseInt(e.target.value) || 0)}
            sx={{ mb: 1, "& .MuiOutlinedInput-root": { borderRadius: 2 } }} />
          <Typography sx={{ fontSize: 11, color: "text.secondary", mb: 1 }}>
            {isRtl ? "صفر = بدون محدودیت حداقل" : "0 = no minimum limit"}
          </Typography>
          <Button fullWidth size="small" onClick={handleSaveMinStock} variant="outlined"
            sx={{ fontWeight: 700, borderRadius: 2, color: "#0d9488", borderColor: "#0d9488" }}>
            {isRtl ? "ذخیره حداقل موجودی" : "Save Min Stock"}
          </Button>
        </Paper>

        {/* تنظیم قیمت */}
        <Paper sx={{ p: 2, border: "1.5px solid", borderColor: "divider", borderRadius: 3 }}>
          <Typography sx={{ fontWeight: 700, mb: 1.5 }}>
            {isRtl ? "تنظیم قیمت فروش" : "Set Selling Price"}
          </Typography>
          <Paper sx={{ p: 1.5, mb: 2, textAlign: "center", background: "rgba(0,0,0,0.02)", borderRadius: 2 }}>
            <Typography sx={{ fontSize: 11, color: "text.secondary" }}>{isRtl ? "هزینه تولید" : "Production Cost"}</Typography>
            <Typography sx={{ fontWeight: 800, fontSize: 18, color: "#dc2626" }}>{fmtPrice(cost)}</Typography>
          </Paper>
          <Grid container spacing={1.5}>
            <Grid size={6}>
              <TextField fullWidth size="small" type="number" label={isRtl ? "درصد افزایش" : "Markup %"} value={pct}
                onChange={(e) => {
                  const p = parseFloat(e.target.value) || 0;
                  setPct(p);
                  setNewPrice(Math.round(cost * (1 + p / 100)));
                }}
                sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2 } }} />
            </Grid>
            <Grid size={6}>
              <TextField fullWidth size="small" type="number" label={isRtl ? "قیمت فروش" : "Selling Price"} value={newPrice}
                onChange={(e) => {
                  const p = parseInt(e.target.value) || 0;
                  setNewPrice(p);
                  setPct(cost > 0 ? Math.round(((p - cost) / cost) * 100) : 0);
                }}
                sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2 } }} />
            </Grid>
          </Grid>
          <Button fullWidth onClick={handleSavePrice} variant="contained" sx={{ mt: 2, fontWeight: 800, borderRadius: 2.5,
            background: "linear-gradient(135deg, #f59e0b, #d97706)" }}>
            {isRtl ? "ذخیره قیمت" : "Save Price"}
          </Button>
        </Paper>
      </DialogContent>
      <DialogActions sx={{ p: 2 }}>
        <Button onClick={onClose} variant="outlined" sx={{ borderRadius: 2.5 }}>{isRtl ? "بستن" : "Close"}</Button>
      </DialogActions>
    </Dialog>
  );
}

/* ═══ مودال برنامه‌ریزی مواد ═══ */
function MaterialPlanModal({ open, onClose, dashboard, isRtl }) {
  const [qtys, setQtys] = useState({});
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const products = dashboard?.products || [];

  const handleCalc = async () => {
    const items = Object.entries(qtys).filter(([_, q]) => q > 0).map(([pid, q]) => ({ product_id: parseInt(pid), quantity: q }));
    if (!items.length) return;
    setLoading(true); setResult(null);
    try {
      const res = await kitchenApi.calculateMaterials({ items });
      setResult(res.data);
    } catch (e) { setResult({ error: e.message }); }
    finally { setLoading(false); }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontWeight: 900 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Calculate sx={{ color: "#c2410c" }} />
          {isRtl ? "برنامه‌ریزی مواد اولیه" : "Material Planning"}
        </Box>
        <IconButton onClick={onClose} size="small"><Close /></IconButton>
      </DialogTitle>
      <DialogContent>
        <Alert severity="info" sx={{ mb: 2, borderRadius: 3, textAlign: "center" }}>
          {isRtl ? "تعداد مورد نیاز هر محصول را مشخص کنید" : "Specify the required quantity for each product"}
        </Alert>

        <Box sx={{ maxHeight: 300, overflowY: "auto", mb: 2 }}>
          {products.map((p) => (
            <Paper key={p.id} sx={{ display: "flex", alignItems: "center", gap: 1.5, p: 1.5, mb: 1, borderRadius: 2, border: "1px solid", borderColor: "divider" }}>
              <Box sx={{ flex: 1 }}>
                <Typography sx={{ fontWeight: 700, fontSize: 13 }}>{p.name}</Typography>
                <Typography sx={{ fontSize: 11, color: "text.secondary" }}>
                  {isRtl ? "موجودی:" : "Stock:"} {p.stock || 0} | {isRtl ? "ظرفیت:" : "Capacity:"} {p.max_production || 0}
                </Typography>
              </Box>
              <TextField size="small" type="number" value={qtys[p.id] || 0}
                onChange={(e) => setQtys({ ...qtys, [p.id]: parseInt(e.target.value) || 0 })}
                sx={{ width: 80, "& .MuiOutlinedInput-root": { borderRadius: 2, textAlign: "center" } }} />
            </Paper>
          ))}
        </Box>

        <Button fullWidth onClick={handleCalc} disabled={loading} variant="contained" startIcon={loading ? <CircularProgress size={18} /> : <Calculate />}
          sx={{ mb: 2, fontWeight: 800, borderRadius: 2.5, background: "linear-gradient(135deg, #f59e0b, #d97706)" }}>
          {isRtl ? "محاسبه مواد مورد نیاز" : "Calculate Materials"}
        </Button>

        {result && !result.error && (
          <Box>
            {(result.raw_materials || []).length > 0 && (
              <Typography sx={{ fontWeight: 700, mb: 1, color: "#c2410c" }}>
                {isRtl ? "مواد اولیه" : "Raw Materials"}
              </Typography>
            )}
            {(result.raw_materials || []).map((m, i) => (
              <Paper key={i} sx={{ p: 1.5, mb: 1, borderRadius: 2, border: "1px solid",
                borderColor: m.available >= m.required ? "divider" : "rgba(220,38,38,0.3)" }}>
                <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <Typography sx={{ fontWeight: 700, fontSize: 13 }}>{m.name}</Typography>
                  <Chip size="small" label={m.available >= m.required ? (isRtl ? "موجود" : "OK") : (isRtl ? "کمبود" : "Shortage")}
                    sx={{ fontWeight: 700, fontSize: 10,
                      background: m.available >= m.required ? "rgba(22,163,74,0.1)" : "rgba(220,38,38,0.1)",
                      color: m.available >= m.required ? "#16a34a" : "#dc2626" }} />
                </Box>
                <Box sx={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "text.secondary", mt: 0.5 }}>
                  <span>{isRtl ? "نیاز:" : "Need:"} {toFa(m.required)} {m.unit || ""}</span>
                  <span>{isRtl ? "موجود:" : "Avail:"} {toFa(m.available)} {m.unit || ""}</span>
                </Box>
                {!m.available >= m.required && m.required > m.available && (
                  <Typography sx={{ fontSize: 11, color: "#dc2626", fontWeight: 600, mt: 0.5 }}>
                    {isRtl ? "کمبود:" : "Short:"} {toFa(m.required - m.available)} {m.unit || ""}
                  </Typography>
                )}
              </Paper>
            ))}
            {(result.semi_materials || []).length > 0 && (
              <>
                <Typography sx={{ fontWeight: 700, mb: 1, mt: 2, color: "#f59e0b" }}>
                  {isRtl ? "مواد نیمه‌آماده" : "Semi-Finished"}
                </Typography>
                {(result.semi_materials || []).map((m, i) => (
                  <Paper key={i} sx={{ p: 1.5, mb: 1, borderRadius: 2, border: "1px solid",
                    borderColor: m.available >= m.required ? "divider" : "rgba(220,38,38,0.3)" }}>
                    <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <Typography sx={{ fontWeight: 700, fontSize: 13 }}>{m.name}</Typography>
                      <Chip size="small" label={m.available >= m.required ? (isRtl ? "موجود" : "OK") : (isRtl ? "کمبود" : "Shortage")}
                        sx={{ fontWeight: 700, fontSize: 10,
                          background: m.available >= m.required ? "rgba(22,163,74,0.1)" : "rgba(220,38,38,0.1)",
                          color: m.available >= m.required ? "#16a34a" : "#dc2626" }} />
                    </Box>
                    <Box sx={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "text.secondary", mt: 0.5 }}>
                      <span>{isRtl ? "نیاز:" : "Need:"} {toFa(m.required)} {m.unit || ""}</span>
                      <span>{isRtl ? "موجود:" : "Avail:"} {toFa(m.available)} {m.unit || ""}</span>
                    </Box>
                  </Paper>
                ))}
              </>
            )}
            {result.shortage_count > 0 ? (
              <Alert severity="error" sx={{ mt: 2, borderRadius: 3, textAlign: "center", fontWeight: 700 }}>
                {isRtl ? `${result.shortage_count} قلم کمبود!` : `${result.shortage_count} items shortage!`}
              </Alert>
            ) : (
              <Alert severity="success" sx={{ mt: 2, borderRadius: 3, textAlign: "center", fontWeight: 700 }}>
                {isRtl ? "همه مواد موجود!" : "All materials available!"}
              </Alert>
            )}
          </Box>
        )}
      </DialogContent>
      <DialogActions sx={{ p: 2 }}>
        <Button onClick={onClose} variant="outlined" sx={{ borderRadius: 2.5 }}>{isRtl ? "بستن" : "Close"}</Button>
      </DialogActions>
    </Dialog>
  );
}

/* ═══ مودال ثبت ضایعات ═══ */
function WasteCreateModal({ open, onClose, dashboard, isRtl, queryClient }) {
  const [product, setProduct] = useState("");
  const [qty, setQty] = useState(1);
  const [reason, setReason] = useState("expired");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const products = dashboard?.products || [];
  const inventory = dashboard?.inventory || [];

  const selectedProduct = products.find((p) => p.id === parseInt(product));
  const cost = selectedProduct ? Number(selectedProduct.cost) || 0 : 0;
  const totalCost = cost * qty;

  const handleSave = async () => {
    if (!product) return;
    if (qty <= 0) return;
    setLoading(true);
    try {
      await kitchenApi.createWaste({ kitchen_product: parseInt(product), quantity: qty, reason, notes });
      queryClient.invalidateQueries(["kitchenDashboard"]);
      onClose();
    } catch (e) { /* handled */ }
    finally { setLoading(false); }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontWeight: 900 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <DeleteSweep sx={{ color: "#dc2626" }} />
          {isRtl ? "ثبت ضایعات" : "Add Waste"}
        </Box>
        <IconButton onClick={onClose} size="small"><Close /></IconButton>
      </DialogTitle>
      <DialogContent>
        <Alert severity="warning" sx={{ mb: 2, borderRadius: 3, textAlign: "center" }}>
          {isRtl ? "ضایعات از موجودی آشپزخانه کم می‌شود" : "Waste reduces kitchen inventory"}
        </Alert>

        <FormControl fullWidth sx={{ mb: 2 }}>
          <InputLabel>{isRtl ? "محصول" : "Product"} *</InputLabel>
          <Select value={product} onChange={(e) => setProduct(e.target.value)} label={isRtl ? "محصول" : "Product"} sx={{ borderRadius: 2 }}>
            {products.map((p) => {
              const inv = inventory.find((i) => (i.kitchen_product_id || i.kitchen_product) === p.id);
              const avail = inv ? (inv.available_quantity != null ? inv.available_quantity : inv.quantity || 0) : 0;
              return <MenuItem key={p.id} value={p.id}>{p.name} ({isRtl ? "موجودی:" : "Stock:"} {toFa(avail)})</MenuItem>;
            })}
          </Select>
        </FormControl>

        <Grid container spacing={1.5} sx={{ mb: 2 }}>
          <Grid size={6}>
            <TextField fullWidth size="small" type="number" label={isRtl ? "تعداد" : "Quantity"} value={qty}
              onChange={(e) => setQty(parseInt(e.target.value) || 0)}
              sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2 } }} />
          </Grid>
          <Grid size={6}>
            <FormControl fullWidth size="small">
              <InputLabel>{isRtl ? "دلیل" : "Reason"}</InputLabel>
              <Select value={reason} onChange={(e) => setReason(e.target.value)} label={isRtl ? "دلیل" : "Reason"} sx={{ borderRadius: 2 }}>
                {Object.entries(WASTE_REASONS).map(([key, val]) => (
                  <MenuItem key={key} value={key}>{isRtl ? val.labelFa : val.labelEn}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
        </Grid>

        <TextField fullWidth size="small" multiline rows={2} label={isRtl ? "توضیحات" : "Notes"} value={notes}
          onChange={(e) => setNotes(e.target.value)} placeholder={isRtl ? "توضیحات اختیاری..." : "Optional notes..."}
          sx={{ mb: 2, "& .MuiOutlinedInput-root": { borderRadius: 2 } }} />

        {product && qty > 0 && (
          <Paper sx={{ p: 2, textAlign: "center", background: "rgba(220,38,38,0.04)", border: "1.5px solid rgba(220,38,38,0.2)", borderRadius: 3 }}>
            <Typography sx={{ fontSize: 12, color: "text.secondary" }}>{isRtl ? "هزینه تخمینی ضایعات" : "Estimated waste cost"}</Typography>
            <Typography sx={{ fontSize: 20, fontWeight: 900, color: "#dc2626" }}>{fmtPrice(totalCost)}</Typography>
            <Typography sx={{ fontSize: 11, color: "text.secondary" }}>
              ({fmtPrice(cost)} × {toFa(qty)} {isRtl ? "واحد" : "units"})
            </Typography>
          </Paper>
        )}
      </DialogContent>
      <DialogActions sx={{ p: 2, gap: 1 }}>
        <Button onClick={onClose} variant="outlined" sx={{ borderRadius: 2.5 }}>{isRtl ? "انصراف" : "Cancel"}</Button>
        <Button onClick={handleSave} disabled={loading || !product || qty <= 0} variant="contained"
          startIcon={loading ? <CircularProgress size={18} /> : <CheckCircle />}
          sx={{ fontWeight: 800, borderRadius: 2.5, background: "linear-gradient(135deg, #dc2626, #b91c1c)" }}>
          {isRtl ? "ثبت ضایعات" : "Save Waste"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/* ════════════════════════════════════════════════
   صفحه اصلی آشپزخانه
   ════════════════════════════════════════════════ */
export default function Kitchen() {
  const { isRtl } = useLang();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState(0);
  const { notifications, detect, markInit, dismiss } = useNotifications();

  // مودال‌ها
  const [produceModal, setProduceModal] = useState({ open: false, foodId: null, productId: null });
  const [costModal, setCostModal] = useState({ open: false, productId: null });
  const [materialPlanOpen, setMaterialPlanOpen] = useState(false);
  const [wasteModalOpen, setWasteModalOpen] = useState(false);

  // داده‌ها
  const { data: dashboard, isLoading } = useQuery({
    queryKey: ["kitchenDashboard"],
    queryFn: () => kitchenApi.dashboard().then((r) => r.data),
    refetchInterval: 30000,
  });

  const { data: menuFoodsData } = useQuery({
    queryKey: ["menuFoods"],
    queryFn: () => kitchenApi.getMenuFoods().then((r) => r.data),
  });

  const { data: foodCatsData } = useQuery({
    queryKey: ["foodCategories"],
    queryFn: () => kitchenApi.getFoodCategories().then((r) => r.data),
  });

  const { data: ordersData, refetch: refetchOrders } = useQuery({
    queryKey: ["kitchenOrders"],
    queryFn: () => kitchenApi.getKitchenOrders().then((r) => r.data),
    refetchInterval: 15000,
  });

  const recipes = dashboard?.recipes || [];
  const menuFoods = Array.isArray(menuFoodsData) ? menuFoodsData : menuFoodsData?.items || menuFoodsData?.results || [];
  const foodCategories = Array.isArray(foodCatsData) ? foodCatsData : foodCatsData?.results || [];
  const orders = ordersData?.orders || ordersData?.results || [];

  // نوتیفیکیشن
  useEffect(() => {
    if (orders.length > 0) {
      detect(orders);
    }
  }, [orders, detect]);

  useEffect(() => {
    const timer = setTimeout(() => markInit(), 3000);
    return () => clearTimeout(timer);
  }, [markInit]);

  // میوتیشن‌ها
  const markReadyMutation = useMutation({
    mutationFn: (id) => kitchenApi.markOrderReady(id),
    onSuccess: () => {
      queryClient.invalidateQueries(["kitchenOrders"]);
      queryClient.invalidateQueries(["kitchenDashboard"]);
    },
  });

  const deleteWasteMutation = useMutation({
    mutationFn: (id) => kitchenApi.deleteWaste(id),
    onSuccess: () => queryClient.invalidateQueries(["kitchenDashboard"]),
  });

  return (
    <Box>
      {/* نوتیفیکیشن‌ها */}
      <Box sx={{ position: "fixed", top: 16, left: isRtl ? "auto" : 16, right: isRtl ? 16 : "auto", zIndex: 9998,
        display: "flex", flexDirection: "column", gap: 1.5, maxWidth: 380, width: "calc(100% - 32px)" }}>
        {notifications.map((n) => (
          <Paper key={n.id} sx={{
            p: 0, borderRadius: 4, overflow: "hidden",
            boxShadow: "0 8px 40px rgba(0,0,0,0.18)",
            animation: "slideIn 0.4s cubic-bezier(.22,1,.36,1)",
            border: "1px solid rgba(0,0,0,0.06)",
            "@keyframes slideIn": { from: { opacity: 0, transform: "translateX(-30px)" }, to: { opacity: 1, transform: "translateX(0)" } },
          }}>
            <Box sx={{ height: 4, background: "linear-gradient(90deg, #ef4444, #f59e0b, #ef4444)", backgroundSize: "200% 100%",
              animation: "stripe 2s linear infinite", "@keyframes stripe": { "0%": { backgroundPosition: "0 0" }, "100%": { backgroundPosition: "200% 0" } } }} />
            <Box sx={{ px: 2, pt: 1.5, pb: 0.5, display: "flex", alignItems: "center", gap: 1 }}>
              <Box sx={{ width: 10, height: 10, borderRadius: "50%", background: "#ef4444",
                animation: "pulse 1.2s ease-in-out infinite", boxShadow: "0 0 0 4px rgba(239,68,68,0.2)",
                "@keyframes pulse": { "0%,100%": { transform: "scale(1)" }, "50%": { transform: "scale(1.4)" } } }} />
              <Chip label={isRtl ? "سفارش جدید" : "New Order"} size="small"
                sx={{ fontWeight: 700, fontSize: 10, background: "rgba(220,38,38,0.08)", color: "#dc2626" }} />
              <Box sx={{ flex: 1 }} />
              <IconButton size="small" onClick={() => dismiss(n.id)}><Close fontSize="small" /></IconButton>
            </Box>
            <Box sx={{ px: 2, pb: 1 }}>
              <Typography sx={{ fontWeight: 800, fontSize: 15 }}>
                {isRtl ? "سفارش" : "Order"} #{toFa(n.id)}
              </Typography>
              <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5, my: 1 }}>
                {(n.items || []).map((item, i) => (
                  <Chip key={i} label={`${item.quantity}× ${item.food_name}`} size="small"
                    sx={{ fontWeight: 600, fontSize: 11, background: "rgba(0,0,0,0.04)" }} />
                ))}
              </Box>
              <Typography sx={{ fontSize: 12, color: "text.secondary" }}>
                {fmtPrice(n.total_price)}
                {n.customer_name && n.customer_name !== "—" ? ` — ${n.customer_name}` : ""}
              </Typography>
            </Box>
            <Box sx={{ p: 1.5, display: "flex", gap: 1 }}>
              <Button fullWidth size="small" variant="contained"
                onClick={() => { markReadyMutation.mutate(n.id); dismiss(n.id); }}
                startIcon={<DoneAll />}
                sx={{ fontWeight: 800, fontSize: 12, borderRadius: 2.5, background: "#c2410c" }}>
                {isRtl ? "آماده است" : "Ready"}
              </Button>
              <Button fullWidth size="small" variant="outlined"
                onClick={() => dismiss(n.id)}
                sx={{ fontWeight: 700, fontSize: 12, borderRadius: 2.5 }}>
                {isRtl ? "بعداً" : "Later"}
              </Button>
            </Box>
          </Paper>
        ))}
      </Box>

      {/* هدر */}
      <Box sx={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", mb: 3, flexWrap: "wrap", gap: 1.5 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
          <Box sx={{
            width: 48, height: 48, borderRadius: 3.5,
            background: "linear-gradient(135deg, #c2410c, #f59e0b)",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "#fff", fontSize: 22, boxShadow: "0 4px 14px rgba(194,65,12,0.3)",
          }}>
            <LocalFireDepartment />
          </Box>
          <Box>
            <Typography variant="h5" sx={{ fontWeight: 900 }}>
              {isRtl ? "مدیریت آشپزخانه" : "Kitchen Management"}
            </Typography>
            <Typography sx={{ fontSize: 12, color: "text.secondary" }}>
              {isRtl ? "تولید، موجودی، ضایعات و سفارشات" : "Production, inventory, waste & orders"}
            </Typography>
          </Box>
        </Box>
        <Box sx={{ display: "flex", gap: 1 }}>
          <Button size="small" variant="outlined" onClick={() => setMaterialPlanOpen(true)}
            startIcon={<Calculate />}
            sx={{ fontWeight: 700, borderRadius: 2.5, color: "#f59e0b", borderColor: "#f59e0b" }}>
            {isRtl ? "برنامه مواد" : "Material Plan"}
          </Button>
          <IconButton onClick={() => { queryClient.invalidateQueries(["kitchenDashboard"]); refetchOrders(); }}
            sx={{ border: "1px solid", borderColor: "divider", "&:hover": { borderColor: "#c2410c", color: "#c2410c" } }}>
            <Refresh />
          </IconButton>
        </Box>
      </Box>

      {/* آمار */}
      <StatsCards dashboard={dashboard} isRtl={isRtl} />

      {/* تب‌ها */}
      <Box sx={{ display: "flex", gap: 0.5, mb: 3, borderBottom: "2px solid", borderColor: "divider", overflowX: "auto" }}>
        {[
          { icon: <Receipt fontSize="small" />, label: isRtl ? "سفارشات" : "Orders", badge: orders.length },
          { icon: <Restaurant fontSize="small" />, label: isRtl ? "غذاهای منو" : "Menu Foods" },
          { icon: <DeleteSweep fontSize="small" />, label: isRtl ? "ضایعات" : "Waste" },
        ].map((t, i) => (
          <Box key={i} onClick={() => setTab(i)} sx={{
            px: 2, py: 1.5, cursor: "pointer", borderRadius: "8px 8px 0 0",
            fontWeight: 800, fontSize: 13, display: "flex", alignItems: "center", gap: 0.8,
            color: tab === i ? "#c2410c" : "text.secondary",
            background: tab === i ? "rgba(194,65,12,0.05)" : "transparent",
            borderBottom: tab === i ? "3px solid #c2410c" : "3px solid transparent",
            mb: "-2px", whiteSpace: "nowrap", transition: "all 0.2s",
            "&:hover": { color: "#c2410c" },
          }}>
            {t.icon}
            {t.label}
            {t.badge > 0 && (
              <Badge badgeContent={toFa(t.badge)} sx={{ "& .MuiBadge-badge": {
                background: "linear-gradient(135deg, #f59e0b, #d97706)", color: "#fff", fontWeight: 900, fontSize: 11 } }} />
            )}
          </Box>
        ))}
      </Box>

      {/* محتوای تب‌ها */}
      {isLoading ? (
        <Box sx={{ textAlign: "center", py: 8 }}><CircularProgress /></Box>
      ) : (
        <>
          {tab === 0 && (
            <OrdersPanel orders={orders} onMarkReady={(id) => markReadyMutation.mutate(id)} isRtl={isRtl} />
          )}
          {tab === 1 && (
            <MenuFoodsPanel
              dashboard={dashboard} menuFoods={menuFoods} foodCategories={foodCategories} isRtl={isRtl}
              onProduceFood={(fid) => setProduceModal({ open: true, foodId: fid, productId: null })}
              onProduceExisting={(pid) => setProduceModal({ open: true, foodId: null, productId: pid })}
              onShowCost={(pid) => setCostModal({ open: true, productId: pid })}
            />
          )}
          {tab === 2 && (
            <WastePanel dashboard={dashboard} isRtl={isRtl}
              onAdd={() => setWasteModalOpen(true)}
              onDelete={(id) => { if (window.confirm(isRtl ? "حذف رکورد ضایعات؟" : "Delete waste record?")) deleteWasteMutation.mutate(id); }}
            />
          )}
        </>
      )}

      {/* مودال‌ها */}
      <ProduceFoodModal open={produceModal.open} onClose={() => setProduceModal({ open: false, foodId: null, productId: null })}
        foodId={produceModal.foodId} productId={produceModal.productId}
        dashboard={dashboard} menuFoods={menuFoods} recipes={recipes} isRtl={isRtl} queryClient={queryClient} />

      <CostPriceModal open={costModal.open} onClose={() => setCostModal({ open: false, productId: null })}
        productId={costModal.productId} dashboard={dashboard} isRtl={isRtl} queryClient={queryClient} />

      <MaterialPlanModal open={materialPlanOpen} onClose={() => setMaterialPlanOpen(false)} dashboard={dashboard} isRtl={isRtl} />

      <WasteCreateModal open={wasteModalOpen} onClose={() => setWasteModalOpen(false)} dashboard={dashboard} isRtl={isRtl} queryClient={queryClient} />
    </Box>
  );
}