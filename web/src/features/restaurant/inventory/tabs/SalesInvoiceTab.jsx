import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  Box, Typography, Button, TextField, Chip, CircularProgress,
  Select, MenuItem, Dialog, DialogTitle, DialogContent, DialogActions,
  IconButton, Divider,
} from "@mui/material";
import { Add, Delete, Close, Receipt, Visibility } from "@mui/icons-material";
import { getUnitLabel } from "../../../../shared/common/units";

const F = (size) => Math.round(size * 1.1);

const readJSON = (key, def = []) => {
  try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(def)); }
  catch { return def; }
};
const writeJSON = (key, val) => {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
};

const getCurrentUser = () => {
  try {
    const u = JSON.parse(localStorage.getItem("user") || "{}");
    return u.username || u.full_name || "نامشخص";
  } catch { return "نامشخص"; }
};

const now = () => new Date();
const faDate = (d) => { try { return d.toLocaleDateString("fa-IR"); } catch { return d.toISOString().slice(0, 10); } };
const faTime = (d) => { try { return d.toLocaleTimeString("fa-IR", { hour: "2-digit", minute: "2-digit" }); } catch { return d.toTimeString().slice(0, 5); } };
const faDay = (d) => { try { return d.toLocaleDateString("fa-IR", { weekday: "long" }); } catch { return ""; } };

const whIcon = (w) => { if (!w) return "📦"; return w.icon || "📦"; };

const calcStock = (warehouseId) => {
  const invoices = readJSON("local_purchase_invoices", []);
  const salesInvoices = readJSON("local_sales_invoices", []);
  const transfers = readJSON("local_transfers", []);
  const stock = {};
  const getKey = (it) => it.material_code || it.material_name;
  const addStock = (key, data, qty) => {
    if (!stock[key]) stock[key] = { qty: 0, unit: data.unit, code: data.code, category: data.category, price: data.price || 0, name: data.name };
    stock[key].qty += qty;
    if (data.price) stock[key].price = data.price;
  };
  for (const inv of invoices) {
    if (String(inv.warehouse_id) !== String(warehouseId)) continue;
    for (const it of inv.items) addStock(getKey(it), { unit: it.unit, code: it.material_code, category: it.category, price: it.unit_price, name: it.material_name }, it.quantity);
  }
  for (const inv of salesInvoices) {
    if (String(inv.warehouse_id) !== String(warehouseId)) continue;
    for (const it of inv.items) addStock(getKey(it), { unit: it.unit, code: it.material_code, category: it.category, price: it.unit_price, name: it.material_name }, -it.quantity);
  }
  for (const tr of transfers) {
    for (const it of tr.items) {
      const base = { unit: it.unit, code: it.material_code, category: it.category || "", price: it.price, name: it.material_name };
      if (String(tr.from_warehouse) === String(warehouseId)) addStock(getKey(it), base, -it.quantity);
      if (String(tr.to_warehouse) === String(warehouseId)) addStock(getKey(it), base, it.quantity);
    }
  }
  return Object.values(stock).filter((s) => s.qty !== 0);
};

const PAYMENTS = {
  cash: { label: "نقد", color: "#2E7D32", icon: "💵" },
  credit: { label: "نسیه", color: "#E65100", icon: "📝" },
  check: { label: "چک", color: "#1565C0", icon: "📄" },
};

// ═══════════ کامپوننت ═══════════
export default function SalesInvoiceTab({ C, isDark, showToast }) {
  const [invoices, setInvoices] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState(null);

  const emptyForm = {
    warehouse_id: "", customer_first_name: "", customer_last_name: "",
    customer_mobile: "", customer_address: "",
    items: [{ material_name: "", quantity: "", unit_price: "" }],
    payment_method: "cash", discount: "0", paid_amount: "0",
    check_number: "", check_due_date: "", description: "",
  };
  const [form, setForm] = useState(emptyForm);
  const formRef = useRef(form); formRef.current = form;
  const dialogOpenRef = useRef(dialogOpen); dialogOpenRef.current = dialogOpen;
  const materialsRef = useRef([]);

  const notify = useCallback((msg, type = "info") => {
    if (typeof showToast === "function") showToast(msg, type);
  }, [showToast]);

  // ── بارگذاری ──
  const load = useCallback(() => {
    setInvoices(readJSON("local_sales_invoices", []));
    const whs = readJSON("local_warehouses", []);
    setWarehouses(whs);
    const mats = readJSON("local_materials", []);
    setMaterials(mats);
    materialsRef.current = mats;
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load, refreshKey]);

  // ── محاسبات فرم ──
  const subtotal = useMemo(() =>
    form.items.reduce((s, it) => s + (parseFloat(it.quantity) || 0) * (parseFloat(it.unit_price) || 0), 0),
    [form.items]
  );
  const discountNum = parseFloat(form.discount) || 0;
  const grandTotal = Math.max(0, subtotal - discountNum);
  const paidNum = parseFloat(form.paid_amount) || 0;
  const remaining = Math.max(0, grandTotal - paidNum);

  const validItems = useMemo(() =>
    form.items.filter((it) => it.material_name && parseFloat(it.quantity) > 0),
    [form.items]
  );

  // ── مدیریت اقلام ──
  const addItem = useCallback(() => {
    setForm((f) => ({ ...f, items: [...f.items, { material_name: "", quantity: "", unit_price: "" }] }));
  }, []);
  const removeItem = useCallback((idx) => {
    setForm((f) => {
      const items = f.items.filter((_, i) => i !== idx);
      return { ...f, items: items.length ? items : [{ material_name: "", quantity: "", unit_price: "" }] };
    });
  }, []);
  const removeLastItem = useCallback(() => {
    setForm((f) => {
      if (f.items.length <= 1) return f;
      return { ...f, items: f.items.slice(0, -1) };
    });
  }, []);
  const updateItem = useCallback((idx, field, val) => {
    setForm((f) => {
      const items = [...f.items];
      items[idx] = { ...items[idx], [field]: val };
      // وقتی کالا انتخاب شد → قیمت خودکار
      if (field === "material_name") {
        const mat = materialsRef.current.find((m) => m.name === val);
        if (mat && mat.price) items[idx].unit_price = String(mat.price);
      }
      return { ...f, items };
    });
  }, []);

  // ── باز/بستن ──
  const openNew = useCallback(() => {
    const whs = readJSON("local_warehouses", []);
    setForm({ ...emptyForm, warehouse_id: whs[0]?.id ?? "" });
    setDialogOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const closeDialog = useCallback(() => {
    setDialogOpen(false);
    setRefreshKey((k) => k + 1);
  }, []);

  const openDetail = useCallback((inv) => {
    setSelectedInvoice(inv);
    setDetailOpen(true);
  }, []);

  // ── ثبت فاکتور ──
  const handleSave = useCallback(() => {
    const f = formRef.current;
    const mats = materialsRef.current;
    const valid = f.items.filter((it) => it.material_name && parseFloat(it.quantity) > 0);

    if (!f.customer_first_name.trim()) { notify("نام مشتری را وارد کنید", "warning"); return; }
    if (!f.customer_last_name.trim()) { notify("نام خانوادگی مشتری را وارد کنید", "warning"); return; }
    if (!f.customer_mobile.trim()) { notify("شماره موبایل را وارد کنید", "warning"); return; }
    if (valid.length === 0) { notify("حداقل یک قلم وارد کنید", "warning"); return; }
    if (!f.warehouse_id) { notify("انبار را انتخاب کنید", "warning"); return; }

    // بررسی موجودی
    const stock = calcStock(f.warehouse_id);
    for (const it of valid) {
      const mat = mats.find((m) => m.name === it.material_name);
      const key = mat?.code || it.material_name;
      const stockItem = stock.find((s) => s.code === key || s.name === it.material_name);
      const available = stockItem?.qty || 0;
      const requested = parseFloat(it.quantity);
      if (requested > available) {
        notify(`موجودی «${it.material_name}» کافی نیست (موجود: ${available})`, "error");
        return;
      }
    }

    const d = now();
    const user = getCurrentUser();
    const allInvoices = readJSON("local_sales_invoices", []);

    const items = valid.map((it) => {
      const mat = mats.find((m) => m.name === it.material_name);
      const qty = parseFloat(it.quantity);
      const price = parseFloat(it.unit_price) || 0;
      return {
        material_name: mat?.name || it.material_name,
        material_code: mat?.code || "",
        unit: mat?.unit || "",
        quantity: qty,
        unit_price: price,
        line_total: qty * price,
      };
    });

    const invSubtotal = items.reduce((s, it) => s + it.line_total, 0);
    const invDiscount = parseFloat(f.discount) || 0;
    const invGrand = Math.max(0, invSubtotal - invDiscount);
    const invPaid = parseFloat(f.paid_amount) || 0;

    const invoice = {
      id: Date.now(),
      invoice_number: `SI-${String(allInvoices.length + 1).padStart(3, "0")}`,
      user,
      date: faDate(d),
      time: faTime(d),
      day: faDay(d),
      warehouse_id: f.warehouse_id,
      customer: {
        first_name: f.customer_first_name.trim(),
        last_name: f.customer_last_name.trim(),
        mobile: f.customer_mobile.trim(),
        address: f.customer_address.trim(),
      },
      items,
      payment_method: f.payment_method,
      subtotal: invSubtotal,
      discount: invDiscount,
      grand_total: invGrand,
      paid_amount: invPaid,
      remaining: Math.max(0, invGrand - invPaid),
      check_number: f.payment_method === "check" ? f.check_number.trim() : "",
      check_due_date: f.payment_method === "check" ? f.check_due_date.trim() : "",
      description: f.description.trim(),
      items_count: items.length,
      created_at: d.toISOString(),
    };

    allInvoices.push(invoice);
    writeJSON("local_sales_invoices", allInvoices);
    notify(`فاکتور «${invoice.invoice_number}» ثبت شد ✅`, "success");
    closeDialog();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notify, closeDialog]);

  // ── کیبورد ──
  useEffect(() => {
    const handler = (e) => {
      const to = dialogOpenRef.current;
      const isCtrl = e.ctrlKey && !e.altKey;
      if (e.key === "F3" && !to) { e.preventDefault(); openNew(); return; }
      if (!to) return;
      if (e.key === "Escape") { e.preventDefault(); closeDialog(); return; }
      if (isCtrl && e.code === "KeyD") { e.preventDefault(); handleSave(); return; }
      if (isCtrl && e.code === "KeyN") { e.preventDefault(); addItem(); return; }
      if (isCtrl && e.code === "KeyZ") { e.preventDefault(); removeLastItem(); return; }
      if (e.key === "Enter" && !isCtrl && !e.altKey) {
        const tag = e.target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA") { e.preventDefault(); addItem(); }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [openNew, closeDialog, handleSave, addItem, removeLastItem]);

  // ── فیلتر ──
  const filteredInvoices = useMemo(() => {
    if (!search.trim()) return invoices;
    const q = search.toLowerCase();
    return invoices.filter((inv) =>
      inv.invoice_number?.toLowerCase().includes(q) ||
      inv.customer?.first_name?.includes(q) ||
      inv.customer?.last_name?.includes(q) ||
      inv.customer?.mobile?.includes(q)
    );
  }, [invoices, search]);

  // ── استایل‌ها ──
  const inputSx = {
    "& .MuiOutlinedInput-root": {
      borderRadius: "8px", bgcolor: C.inputBg, fontSize: F(12), color: C.text,
      "& fieldset": { borderColor: C.glassBorder },
      "&:hover fieldset": { borderColor: C.olive + "60" },
      "&.Mui-focused fieldset": { borderColor: C.olive, borderWidth: 1.5 },
      "&.Mui-focused": { boxShadow: `0 0 0 2px ${C.olive}18` },
    },
    "& .MuiInputBase-input": { color: C.text, py: 0.8 },
    "& .MuiInputBase-input::placeholder": { color: C.muted, opacity: 1 },
  };

  const menuProps = {
    slotProps: {
      paper: {
        sx: {
          bgcolor: isDark ? "#1a1a2e" : "#fff", borderRadius: "10px",
          border: `1px solid ${C.olive}30`, boxShadow: "0 12px 40px rgba(0,0,0,0.25)",
          maxHeight: 200, overflowY: "auto",
          "& .MuiMenuItem-root": {
            fontSize: F(11), minHeight: 30, py: 0.3, px: 1.5, borderRadius: "6px", mx: 0.5,
            "&.Mui-selected": { bgcolor: C.oliveSubtle, color: C.olive, fontWeight: 700 },
            "&:hover": { bgcolor: C.oliveSubtle },
          },
        },
      },
    },
    disableScrollLock: true,
  };

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
        <CircularProgress sx={{ color: C.olive }} size={32} />
      </Box>
    );
  }

  return (
    <Box>
      {/* ═══════════ هدر ═══════════ */}
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2, flexWrap: "wrap", gap: 1 }}>
        <Box>
          <Typography sx={{ fontSize: F(15), fontWeight: 800, color: C.text }}>🧾 فاکتورهای فروش</Typography>
          <Typography sx={{ fontSize: F(10), color: C.sub, mt: 0.2 }}>
            ثبت فروش + اطلاعات مشتری + پرداخت | F3 = فاکتور جدید
          </Typography>
        </Box>
        <Box sx={{ display: "flex", gap: 1 }}>
          <TextField size="small" placeholder="🔍 جستجو..."
            value={search} onChange={(e) => setSearch(e.target.value)}
            sx={{ ...inputSx, width: 200 }} />
          <Button onClick={openNew} sx={{
            borderRadius: "8px", fontSize: F(11), fontWeight: 700, textTransform: "none",
            px: 2, py: 0.7, color: "#fff", background: C.btnGrad,
            boxShadow: `0 2px 12px ${C.olive}25`,
            "&:hover": { transform: "translateY(-1px)" },
          }}>
            + فاکتور جدید (F3)
          </Button>
        </Box>
      </Box>

      {/* ═══════════ خلاصه ═══════════ */}
      <Box sx={{ display: "flex", gap: 1, mb: 2, flexWrap: "wrap" }}>
        {[
          { label: `${invoices.length} فاکتور`, color: C.olive, bg: C.oliveSubtle },
          { label: `فروش کل: ${invoices.reduce((s, i) => s + (i.grand_total || 0), 0).toLocaleString("en-US")} تومان`, color: "#2E7D32", bg: "rgba(46,125,50,0.1)" },
          { label: `بدهکاری: ${invoices.reduce((s, i) => s + (i.remaining || 0), 0).toLocaleString("en-US")} تومان`, color: "#E65100", bg: "rgba(230,81,0,0.1)" },
        ].map((c, i) => (
          <Chip key={i} size="small" label={c.label} sx={{
            height: 28, fontSize: F(10), fontWeight: 700, borderRadius: "8px",
            bgcolor: c.bg, color: c.color, border: `1px solid ${c.color}30`,
          }} />
        ))}
      </Box>

      {/* ═══════════ جدول فاکتورها ═══════════ */}
      {filteredInvoices.length === 0 ? (
        <Box sx={{ textAlign: "center", py: 5 }}>
          <Typography sx={{ fontSize: 32, mb: 0.5 }}>🧾</Typography>
          <Typography sx={{ fontSize: F(13), fontWeight: 700, color: C.text }}>فاکتوری ثبت نشده</Typography>
          <Typography sx={{ fontSize: F(10), color: C.sub, mt: 0.3 }}>F3 بزنید یا دکمه «فاکتور جدید»</Typography>
        </Box>
      ) : (
        <Box>
          {/* هدر جدول */}
          <Box sx={{
            display: "grid", gridTemplateColumns: "80px 1.2fr 100px 80px 100px 110px 90px 80px 60px",
            gap: 1, px: 1.5, py: 0.8, borderRadius: "8px",
            bgcolor: isDark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.02)",
          }}>
            {["شماره", "مشتری", "موبایل", "اقلام", "پرداخت", "مبلغ کل", "پرداختی", "باقی", ""].map((h) => (
              <Typography key={h} sx={{ fontSize: F(9), fontWeight: 700, color: C.muted }}>{h}</Typography>
            ))}
          </Box>

          {filteredInvoices.map((inv, i) => {
            const pay = PAYMENTS[inv.payment_method] || PAYMENTS.cash;
            return (
              <Box key={inv.id} sx={{
                display: "grid", gridTemplateColumns: "80px 1.2fr 100px 80px 100px 110px 90px 80px 60px",
                gap: 1, px: 1.5, py: 1, borderRadius: "10px", mt: 0.5,
                bgcolor: C.glass, border: `1px solid ${C.glassBorder}`,
                opacity: 0, animation: `fadeUp 0.3s ease-out ${i * 0.03}s forwards`,
                "&:hover": { bgcolor: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.02)" },
              }}>
                <Chip size="small" label={inv.invoice_number} sx={{
                  height: 22, fontSize: F(9), fontWeight: 700, borderRadius: "5px",
                  bgcolor: C.oliveSubtle, color: C.olive, fontFamily: "monospace",
                  width: "100%", justifyContent: "center",
                }} />
                <Typography sx={{ fontSize: F(11), fontWeight: 700, color: C.text, alignSelf: "center" }}>
                  {inv.customer?.first_name} {inv.customer?.last_name}
                </Typography>
                <Typography sx={{ fontSize: F(10), color: C.sub, alignSelf: "center", fontFamily: "monospace" }}>
                  {inv.customer?.mobile}
                </Typography>
                <Typography sx={{ fontSize: F(10), color: C.sub, alignSelf: "center" }}>
                  {inv.items_count} قلم
                </Typography>
                <Chip size="small" label={`${pay.icon} ${pay.label}`} sx={{
                  height: 20, fontSize: F(8), fontWeight: 700, borderRadius: "5px",
                  alignSelf: "center", justifyContent: "center",
                  bgcolor: pay.color + "18", color: pay.color, border: `1px solid ${pay.color}30`,
                }} />
                <Typography sx={{ fontSize: F(11), fontWeight: 700, color: C.olive, alignSelf: "center" }}>
                  {(inv.grand_total || 0).toLocaleString("en-US")}
                </Typography>
                <Typography sx={{ fontSize: F(10), color: "#2E7D32", alignSelf: "center" }}>
                  {(inv.paid_amount || 0).toLocaleString("en-US")}
                </Typography>
                <Typography sx={{
                  fontSize: F(10), fontWeight: 700, alignSelf: "center",
                  color: inv.remaining > 0 ? C.danger : "#2E7D32",
                }}>
                  {(inv.remaining || 0).toLocaleString("en-US")}
                </Typography>
                <IconButton size="small" onClick={() => openDetail(inv)} sx={{
                  color: C.info, bgcolor: C.infoBg, borderRadius: "6px", p: 0.5,
                  "&:hover": { bgcolor: C.info, color: "#fff" },
                }}>
                  <Visibility sx={{ fontSize: 16 }} />
                </IconButton>
              </Box>
            );
          })}
        </Box>
      )}

      {/* ═══════════════════════════════════════
           مودال فاکتور جدید
      ════════════════════════════════════════ */}
      <Dialog open={dialogOpen} onClose={closeDialog} maxWidth="md" fullWidth
        slotProps={{
          paper: {
            sx: {
              borderRadius: "20px", bgcolor: isDark ? "#0f1128" : "#ffffff",
              border: `2px solid ${C.olive}40`, boxShadow: "0 24px 100px rgba(0,0,0,0.5)",
            },
          },
        }}
      >
        <DialogTitle sx={{
          px: 3, pt: 2.5, pb: 2, borderBottom: `2px solid ${C.olive}20`,
          bgcolor: isDark ? "rgba(107,155,110,0.1)" : "rgba(46,77,48,0.07)",
        }}>
          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
              <Box sx={{
                width: 52, height: 52, borderRadius: "14px",
                display: "flex", alignItems: "center", justifyContent: "center",
                bgcolor: C.oliveSubtle, border: `2px solid ${C.olive}40`,
              }}>
                <Receipt sx={{ fontSize: 30, color: C.olive }} />
              </Box>
              <Box>
                <Typography sx={{ fontSize: 20, fontWeight: 900, color: C.text }}>فاکتور فروش جدید</Typography>
                <Chip size="small"
                  label={`شماره: SI-${String(readJSON("local_sales_invoices", []).length + 1).padStart(3, "0")}`}
                  sx={{ height: 26, fontSize: 13, fontWeight: 800, borderRadius: "8px", bgcolor: C.olive, color: "#fff", px: 1, mt: 0.5 }}
                />
              </Box>
            </Box>
            <IconButton onClick={closeDialog} size="large" sx={{
              color: C.danger, bgcolor: C.dangerBg, border: `2px solid ${C.danger}30`,
              borderRadius: "12px", p: 1, "&:hover": { bgcolor: C.danger, color: "#fff" },
            }}>
              <Close sx={{ fontSize: 24 }} />
            </IconButton>
          </Box>

          <Box sx={{ display: "flex", gap: 1.5, mt: 2, flexWrap: "wrap" }}>
            {[
              { icon: "👤", label: getCurrentUser(), color: "#7C4DFF" },
              { icon: "📅", label: faDate(now()), color: "#00897B" },
              { icon: "🕐", label: faTime(now()), color: "#F57C00" },
              { icon: "📆", label: faDay(now()), color: "#1565C0" },
            ].map((info, i) => (
              <Chip key={i} size="small" label={`${info.icon} ${info.label}`} sx={{
                height: 30, fontSize: 13, fontWeight: 700, borderRadius: "10px",
                bgcolor: info.color + "18", color: info.color, border: `1.5px solid ${info.color}30`, px: 0.5,
              }} />
            ))}
          </Box>
        </DialogTitle>

        <DialogContent sx={{ px: 3, py: 2.5 }}>
          {/* ── اطلاعات مشتری ── */}
          <Typography sx={{ fontSize: 14, fontWeight: 800, color: C.olive, mb: 1 }}>👤 اطلاعات مشتری</Typography>
          <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 1.5, mb: 2 }}>
            <TextField size="small" label="نام" placeholder="نام"
              value={form.customer_first_name}
              onChange={(e) => setForm((f) => ({ ...f, customer_first_name: e.target.value }))}
              sx={inputSx} />
            <TextField size="small" label="نام خانوادگی" placeholder="نام خانوادگی"
              value={form.customer_last_name}
              onChange={(e) => setForm((f) => ({ ...f, customer_last_name: e.target.value }))}
              sx={inputSx} />
            <TextField size="small" label="شماره موبایل" placeholder="0912..."
              value={form.customer_mobile}
              onChange={(e) => setForm((f) => ({ ...f, customer_mobile: e.target.value }))}
              sx={inputSx} />
          </Box>
          <TextField size="small" label="آدرس" placeholder="آدرس کامل مشتری"
            value={form.customer_address}
            onChange={(e) => setForm((f) => ({ ...f, customer_address: e.target.value }))}
            fullWidth sx={{ ...inputSx, mb: 2 }} />

          {/* ── انبار ── */}
          <Typography sx={{ fontSize: 14, fontWeight: 800, color: C.olive, mb: 1 }}>📦 انبار فروش</Typography>
          <Select size="small" fullWidth value={form.warehouse_id}
            onChange={(e) => setForm((f) => ({ ...f, warehouse_id: e.target.value }))}
            sx={{ ...inputSx, mb: 2, "& .MuiSelect-select": { fontSize: F(12), py: 0.8 } }}
            MenuProps={menuProps}
          >
            {warehouses.map((w) => (
              <MenuItem key={w.id} value={w.id}>{whIcon(w)} {w.name}</MenuItem>
            ))}
          </Select>

          <Divider sx={{ mb: 2, borderColor: C.olive + "25" }} />

          {/* ── اقلام ── */}
          <Typography sx={{ fontSize: 14, fontWeight: 800, color: C.olive, mb: 1 }}>📋 اقلام فروش</Typography>

          <Box sx={{
            display: "grid", gridTemplateColumns: "36px 1.5fr 80px 100px 110px 44px",
            gap: 1, px: 1, mb: 1, py: 0.8, borderRadius: "8px",
            bgcolor: isDark ? "rgba(107,155,110,0.12)" : "rgba(46,77,48,0.08)",
          }}>
            {["#", "کالا", "واحد", "تعداد", "قیمت واحد", ""].map((h, i) => (
              <Typography key={i} sx={{
                fontSize: 12, fontWeight: 800,
                color: isDark ? "#B8D4B9" : "#2E4D30",
                textAlign: i >= 2 ? "center" : "right",
              }}>{h}</Typography>
            ))}
          </Box>

          {form.items.map((it, idx) => {
            const mat = materials.find((m) => m.name === it.material_name);
            return (
              <Box key={idx} sx={{
                display: "grid", gridTemplateColumns: "36px 1.5fr 80px 100px 110px 44px",
                gap: 1, mb: 1, alignItems: "center", px: 1, py: 0.8,
                borderRadius: "10px",
                bgcolor: idx % 2 === 0 ? (isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.015)") : "transparent",
                border: `1px solid ${isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)"}`,
              }}>
                <Box sx={{
                  width: 28, height: 28, borderRadius: "8px",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  bgcolor: C.olive, color: "#fff", fontSize: 14, fontWeight: 900,
                }}>{idx + 1}</Box>

                <Select size="small" fullWidth value={it.material_name}
                  onChange={(e) => updateItem(idx, "material_name", e.target.value)}
                  displayEmpty
                  sx={{
                    "& .MuiOutlinedInput-root": {
                      borderRadius: "8px", bgcolor: isDark ? "rgba(255,255,255,0.06)" : "#fff",
                      fontSize: 13, "& fieldset": { borderColor: C.glassBorder },
                      "&:hover fieldset": { borderColor: C.olive + "60" },
                      "&.Mui-focused fieldset": { borderColor: C.olive },
                    },
                    "& .MuiSelect-select": { fontSize: 13, py: 0.6 },
                  }}
                  MenuProps={menuProps}
                >
                  <MenuItem value="">انتخاب کنید</MenuItem>
                  {materials.map((m) => (
                    <MenuItem key={m.id} value={m.name}>{m.code} — {m.name}</MenuItem>
                  ))}
                </Select>

                <Chip size="small" label={mat ? getUnitLabel(mat.unit) : "—"} sx={{
                  height: 26, fontSize: 11, fontWeight: 700, borderRadius: "6px",
                  bgcolor: "rgba(21,101,192,0.1)", color: "#1565C0",
                  width: "100%", justifyContent: "center",
                }} />

                <TextField size="small" type="number" placeholder="0"
                  value={it.quantity}
                  onChange={(e) => updateItem(idx, "quantity", e.target.value)}
                  sx={{
                    "& .MuiOutlinedInput-root": {
                      borderRadius: "8px", bgcolor: "rgba(255,214,0,0.1)",
                      "& fieldset": { borderColor: "#FFD600", borderWidth: 2 },
                      "&:hover fieldset": { borderColor: "#FFC107" },
                      "&.Mui-focused fieldset": { borderColor: "#FFA000" },
                    },
                    "& .MuiInputBase-input": { textAlign: "center", fontSize: 16, fontWeight: 800, color: "#E65100" },
                  }} />

                <TextField size="small" type="number" placeholder="0"
                  value={it.unit_price}
                  onChange={(e) => updateItem(idx, "unit_price", e.target.value)}
                  sx={{
                    "& .MuiOutlinedInput-root": {
                      borderRadius: "8px", bgcolor: C.inputBg,
                      "& fieldset": { borderColor: C.glassBorder },
                      "&:hover fieldset": { borderColor: C.olive + "60" },
                      "&.Mui-focused fieldset": { borderColor: C.olive },
                    },
                    "& .MuiInputBase-input": { textAlign: "center", fontSize: 13, color: C.text },
                  }} />

                <IconButton size="small" onClick={() => removeItem(idx)} sx={{
                  color: C.danger, bgcolor: C.dangerBg, borderRadius: "8px", p: 0.5,
                  "&:hover": { bgcolor: C.danger, color: "#fff" },
                }}>
                  <Delete sx={{ fontSize: 18 }} />
                </IconButton>
              </Box>
            );
          })}

          <Button startIcon={<Add sx={{ fontSize: 20 }} />} onClick={addItem} fullWidth sx={{
            mt: 1, mb: 2, color: C.olive,
            bgcolor: isDark ? "rgba(107,155,110,0.1)" : "rgba(107,155,110,0.08)",
            border: `2px dashed ${C.olive}50`, borderRadius: "10px",
            fontWeight: 800, fontSize: 14, textTransform: "none", py: 1,
            "&:hover": { bgcolor: C.oliveSubtle, border: `2px solid ${C.olive}` },
          }}>
            افزودن قلم (Enter / Ctrl+N)
          </Button>

          <Divider sx={{ mb: 2, borderColor: C.olive + "25" }} />

          {/* ── پرداخت ── */}
          <Typography sx={{ fontSize: 14, fontWeight: 800, color: C.olive, mb: 1 }}>💳 روش پرداخت</Typography>
          <Box sx={{ display: "flex", gap: 1, mb: 2 }}>
            {Object.entries(PAYMENTS).map(([key, val]) => (
              <Chip key={key} clickable
                label={`${val.icon} ${val.label}`}
                onClick={() => setForm((f) => ({ ...f, payment_method: key }))}
                sx={{
                  height: 36, fontSize: 13, fontWeight: 800, borderRadius: "10px",
                  bgcolor: form.payment_method === key ? val.color + "25" : (isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)"),
                  color: form.payment_method === key ? val.color : C.sub,
                  border: `2px solid ${form.payment_method === key ? val.color : "transparent"}`,
                  px: 2,
                }}
              />
            ))}
          </Box>

          {form.payment_method === "check" && (
            <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.5, mb: 2 }}>
              <TextField size="small" label="شماره چک" placeholder="شماره چک"
                value={form.check_number}
                onChange={(e) => setForm((f) => ({ ...f, check_number: e.target.value }))}
                sx={inputSx} />
              <TextField size="small" label="سررسید چک" placeholder="۱۴۰۵/۹/۱"
                value={form.check_due_date}
                onChange={(e) => setForm((f) => ({ ...f, check_due_date: e.target.value }))}
                sx={inputSx} />
            </Box>
          )}

          {/* ── مبالغ ── */}
          <Box sx={{
            display: "grid", gridTemplateColumns: { xs: "1fr 1fr", sm: "1fr 1fr 1fr 1fr" },
            gap: 1.5, mb: 2,
          }}>
            <TextField size="small" label="تخفیف (تومان)" type="number"
              value={form.discount}
              onChange={(e) => setForm((f) => ({ ...f, discount: e.target.value }))}
              sx={inputSx} />
            <TextField size="small" label="مبلغ پرداختی" type="number"
              value={form.paid_amount}
              onChange={(e) => setForm((f) => ({ ...f, paid_amount: e.target.value }))}
              sx={inputSx} />
            <Box sx={{ p: 1, borderRadius: "8px", bgcolor: C.oliveSubtle, border: `1px solid ${C.olive}30` }}>
              <Typography sx={{ fontSize: 10, color: C.sub }}>جمع کل</Typography>
              <Typography sx={{ fontSize: 16, fontWeight: 900, color: C.olive }}>
                {grandTotal.toLocaleString("en-US")}
              </Typography>
            </Box>
            <Box sx={{
              p: 1, borderRadius: "8px",
              bgcolor: remaining > 0 ? "rgba(230,81,0,0.1)" : "rgba(46,125,50,0.1)",
              border: `1px solid ${remaining > 0 ? "#E6510030" : "#2E7D3230"}`,
            }}>
              <Typography sx={{ fontSize: 10, color: C.sub }}>باقی‌مانده</Typography>
              <Typography sx={{
                fontSize: 16, fontWeight: 900,
                color: remaining > 0 ? "#E65100" : "#2E7D32",
              }}>
                {remaining.toLocaleString("en-US")}
              </Typography>
            </Box>
          </Box>

          <TextField size="small" label="توضیحات" placeholder="توضیحات فاکتور..."
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            fullWidth multiline rows={2} sx={{ ...inputSx, mb: 1 }} />

          {/* راهنمای میان‌بر */}
          <Box sx={{
            display: "flex", flexWrap: "wrap", gap: 1, mt: 1, px: 2, py: 1,
            borderRadius: "10px", bgcolor: isDark ? "rgba(255,214,0,0.08)" : "rgba(255,214,0,0.1)",
            border: `1.5px solid rgba(255,214,0,0.25)`, alignItems: "center",
          }}>
            <Chip size="small" label="⌨️" sx={{ height: 24, fontSize: 11, fontWeight: 900, borderRadius: "6px", bgcolor: "#FFD600", color: "#1A1A00" }} />
            {[
              { key: "Ctrl+D", label: "ثبت", color: "#2E7D32" },
              { key: "Enter", label: "قلم جدید", color: "#1565C0" },
              { key: "Ctrl+Z", label: "حذف قلم", color: "#C62828" },
              { key: "Esc", label: "بستن", color: "#E65100" },
            ].map((item) => (
              <Box key={item.key} sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                <Box sx={{
                  px: 0.8, py: 0.2, borderRadius: "5px", bgcolor: item.color + "18",
                  border: `1px solid ${item.color}40`, fontFamily: "monospace",
                  fontSize: 11, fontWeight: 800, color: item.color,
                }}>{item.key}</Box>
                <Typography sx={{ fontSize: 10, color: C.sub }}>{item.label}</Typography>
              </Box>
            ))}
          </Box>
        </DialogContent>

        <DialogActions sx={{ px: 3, pb: 2.5, pt: 2, borderTop: `2px solid ${C.olive}20`, gap: 2 }}>
          <Button onClick={closeDialog} size="large" sx={{
            borderRadius: "10px", fontSize: 14, fontWeight: 700, textTransform: "none",
            color: C.danger, bgcolor: C.dangerBg, border: `2px solid ${C.danger}30`, px: 3,
            "&:hover": { bgcolor: C.danger, color: "#fff" },
          }}>✖ انصراف (Esc)</Button>
          <Button onClick={handleSave} disabled={validItems.length === 0} size="large" sx={{
            borderRadius: "10px", fontSize: 14, fontWeight: 800, textTransform: "none",
            color: "#fff", background: C.btnGrad, boxShadow: `0 4px 20px ${C.olive}40`, px: 4,
            "&:hover": { transform: "translateY(-2px)" },
            "&.Mui-disabled": { bgcolor: C.muted, color: "#fff", opacity: 0.4 },
          }}>💾 ثبت فاکتور (Ctrl+D)</Button>
        </DialogActions>
      </Dialog>

      {/* ═══════════════════════════════════════
           مودال جزئیات فاکتور
      ════════════════════════════════════════ */}
      <Dialog open={detailOpen} onClose={() => setDetailOpen(false)} maxWidth="sm" fullWidth
        slotProps={{
          paper: {
            sx: {
              borderRadius: "16px", bgcolor: isDark ? "#0f1128" : "#ffffff",
              border: `2px solid ${C.olive}30`,
            },
          },
        }}
      >
        {selectedInvoice && (
          <>
            <DialogTitle sx={{
              px: 3, pt: 2, pb: 1.5,
              bgcolor: isDark ? "rgba(107,155,110,0.1)" : "rgba(46,77,48,0.07)",
            }}>
              <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <Typography sx={{ fontSize: 18, fontWeight: 900, color: C.text }}>
                  🧾 {selectedInvoice.invoice_number}
                </Typography>
                <IconButton onClick={() => setDetailOpen(false)} size="small">
                  <Close sx={{ fontSize: 20, color: C.danger }} />
                </IconButton>
              </Box>
            </DialogTitle>
            <DialogContent sx={{ px: 3, py: 2 }}>
              {/* مشتری */}
              <Box sx={{ p: 1.5, borderRadius: "10px", bgcolor: C.glass, border: `1px solid ${C.glassBorder}`, mb: 1.5 }}>
                <Typography sx={{ fontSize: 11, fontWeight: 800, color: C.olive, mb: 0.5 }}>👤 مشتری</Typography>
                <Typography sx={{ fontSize: 13, fontWeight: 700, color: C.text }}>
                  {selectedInvoice.customer?.first_name} {selectedInvoice.customer?.last_name}
                </Typography>
                <Typography sx={{ fontSize: 11, color: C.sub }}>
                  📱 {selectedInvoice.customer?.mobile} | 📍 {selectedInvoice.customer?.address || "—"}
                </Typography>
              </Box>

              {/* اطلاعات */}
              <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 1.5 }}>
                {[
                  `👤 ${selectedInvoice.user}`,
                  `📅 ${selectedInvoice.date}`,
                  `🕐 ${selectedInvoice.time}`,
                  `💳 ${(PAYMENTS[selectedInvoice.payment_method] || PAYMENTS.cash).label}`,
                ].map((t, i) => (
                  <Chip key={i} size="small" label={t} sx={{
                    height: 24, fontSize: 11, borderRadius: "6px",
                    bgcolor: C.oliveSubtle, color: C.olive,
                  }} />
                ))}
              </Box>

              {/* اقلام */}
              <Typography sx={{ fontSize: 12, fontWeight: 800, color: C.olive, mb: 0.5 }}>📋 اقلام</Typography>
              {selectedInvoice.items?.map((it, i) => (
                <Box key={i} sx={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  px: 1, py: 0.8, borderRadius: "8px", mb: 0.5,
                  bgcolor: i % 2 === 0 ? (isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.015)") : "transparent",
                }}>
                  <Typography sx={{ fontSize: 12, color: C.text }}>
                    {it.material_code} {it.material_name}
                  </Typography>
                  <Typography sx={{ fontSize: 11, color: C.sub }}>
                    {it.quantity} {getUnitLabel(it.unit)} × {it.unit_price.toLocaleString("en-US")}
                  </Typography>
                  <Typography sx={{ fontSize: 12, fontWeight: 700, color: C.olive }}>
                    {it.line_total.toLocaleString("en-US")}
                  </Typography>
                </Box>
              ))}

              <Divider sx={{ my: 1.5 }} />

              {/* مبالغ */}
              {[
                { label: "جمع کل", value: selectedInvoice.subtotal, color: C.text },
                { label: "تخفیف", value: selectedInvoice.discount, color: "#E65100" },
                { label: "مبلغ نهایی", value: selectedInvoice.grand_total, color: C.olive, bold: true },
                { label: "پرداختی", value: selectedInvoice.paid_amount, color: "#2E7D32" },
                { label: "باقی‌مانده", value: selectedInvoice.remaining, color: selectedInvoice.remaining > 0 ? C.danger : "#2E7D32" },
              ].map((row, i) => (
                <Box key={i} sx={{ display: "flex", justifyContent: "space-between", py: 0.3 }}>
                  <Typography sx={{ fontSize: 12, color: C.sub, fontWeight: row.bold ? 800 : 500 }}>{row.label}</Typography>
                  <Typography sx={{ fontSize: row.bold ? 14 : 12, fontWeight: row.bold ? 900 : 600, color: row.color }}>
                    {row.value?.toLocaleString("en-US")} تومان
                  </Typography>
                </Box>
              ))}

              {selectedInvoice.check_number && (
                <Box sx={{ mt: 1, p: 1, borderRadius: "8px", bgcolor: "rgba(21,101,192,0.1)" }}>
                  <Typography sx={{ fontSize: 11, color: "#1565C0" }}>
                    📄 چک: {selectedInvoice.check_number} | سررسید: {selectedInvoice.check_due_date}
                  </Typography>
                </Box>
              )}
            </DialogContent>
          </>
        )}
      </Dialog>
    </Box>
  );
}