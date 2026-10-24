import { useState, useEffect, useCallback, useRef } from "react";
import {
  Box, Typography, Button, TextField, Select, MenuItem,
  CircularProgress, IconButton, Divider, Chip,
  Dialog, DialogTitle, DialogContent, DialogActions,
} from "@mui/material";
import {
  Add, Delete, Refresh, PersonAdd,
} from "@mui/icons-material";
import {
  fetchSalesInvoices, createSalesInvoice, deleteSalesInvoice,
  fetchCustomers, createCustomer,
} from "../api";

const UNIT_LABELS = {
  kg: "کیلو", g: "گرم", l: "لیتر", ml: "میلی‌لیتر",
  unit: "واحد", bunch: "دسته", pack: "بسته",
};

const PAY_METHODS = [
  { value: "cash", label: "نقدی", color: "#6B9B6E" },
  { value: "card", label: "کارت", color: "#3B82F6" },
  { value: "credit", label: "نسیه", color: "#D4B76A" },
];

export default function SalesInvoiceTab({ C, isDark, showToast }) {
  const [customers, setCustomers] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);

  // ── فرم فاکتور ──
  const [form, setForm] = useState({
    customer: "",
    customer_name: "",
    invoice_number: "",
    payment_method: "cash",
    paid_amount: "",
    description: "",
  });
  const [items, setItems] = useState([
    { item_name: "", quantity: "", unit: "unit", unit_price: "", cost_price: "", discount: "" },
  ]);

  // ── دیالوگ افزودن سریع مشتری ──
  const [quickCustOpen, setQuickCustOpen] = useState(false);
  const [quickCustSaving, setQuickCustSaving] = useState(false);
  const [quickCust, setQuickCust] = useState({
    name: "", phone: "", address: "", note: "",
  });

  // ── ref ها برای ناوبری کیبورد ──
  const invoiceNumberRef = useRef(null);
  const firstItemRef = useRef(null);
  const quickCustNameRef = useRef(null);

  const notify = useCallback((msg, type = "info") => {
    if (typeof showToast === "function") showToast(msg, type);
  }, [showToast]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [invData, custData] = await Promise.all([
        fetchSalesInvoices(),
        fetchCustomers(),
      ]);
      setInvoices(invData.results || []);
      setCustomers(custData.results || []);
    } catch (err) {
      console.error("Load sales data error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── افزودن سریع مشتری ──
  const handleQuickCustomer = async () => {
    if (!quickCust.name.trim()) {
      notify("نام مشتری الزامی است", "warning");
      quickCustNameRef.current?.focus();
      return;
    }
    if (quickCustSaving) return;
    setQuickCustSaving(true);
    try {
      const result = await createCustomer({
        name: quickCust.name.trim(),
        phone: quickCust.phone.trim(),
        address: quickCust.address.trim(),
        opening_balance: 0,
        note: quickCust.note.trim(),
        is_active: true,
      });
      notify(`«${quickCust.name}» اضافه شد`, "success");

      // فوری به لیست اضافه کن + انتخابش کن
      const newId = result.id;
      setCustomers((prev) => [
        ...prev,
        {
          id: newId,
          name: quickCust.name.trim(),
          phone: quickCust.phone.trim(),
          address: quickCust.address.trim(),
          total_debt: 0,
          is_active: true,
        },
      ]);
      setForm((f) => ({
        ...f,
        customer: newId,
        customer_name: quickCust.name.trim(),
      }));

      // ریست و بستن
      setQuickCust({ name: "", phone: "", address: "", note: "" });
      setQuickCustOpen(false);
    } catch (err) {
      notify(err.response?.data?.detail || err.message || "خطا در ثبت مشتری", "error");
    } finally {
      setQuickCustSaving(false);
    }
  };

  // ── مدیریت اقلام ──
  const addItem = () =>
    setItems([...items, { item_name: "", quantity: "", unit: "unit", unit_price: "", cost_price: "", discount: "" }]);
  const removeItem = (idx) => setItems(items.filter((_, i) => i !== idx));
  const updateItem = (idx, field, val) => {
    const updated = [...items];
    updated[idx] = { ...updated[idx], [field]: val };
    setItems(updated);
  };

  const lineTotal = (item) =>
    (parseFloat(item.quantity) || 0) * (parseFloat(item.unit_price) || 0) - (parseFloat(item.discount) || 0);
  const lineProfit = (item) =>
    ((parseFloat(item.unit_price) || 0) - (parseFloat(item.cost_price) || 0)) * (parseFloat(item.quantity) || 0) - (parseFloat(item.discount) || 0);

  const grandTotal = items.reduce((s, i) => s + lineTotal(i), 0);
  const grandProfit = items.reduce((s, i) => s + lineProfit(i), 0);
  const validItems = items.filter((i) => i.item_name.trim() && parseFloat(i.quantity) > 0);

  // ── ذخیره فاکتور ──
  const handleSave = async () => {
    if (validItems.length === 0) {
      notify("حداقل یک قلم با نام کالا و تعداد وارد کنید", "warning");
      return;
    }
    if (saving) return;
    setSaving(true);
    try {
      const payload = {
        customer: form.customer || null,
        customer_name: form.customer_name,
        invoice_number: form.invoice_number,
        date: new Date().toISOString().split("T")[0],
        payment_method: form.payment_method,
        discount: 0,
        paid_amount: parseFloat(form.paid_amount) || grandTotal,
        description: form.description,
        items: validItems.map((i) => ({
          item_name: i.item_name.trim(),
          quantity: parseFloat(i.quantity) || 0,
          unit: i.unit,
          unit_price: parseFloat(i.unit_price) || 0,
          cost_price: parseFloat(i.cost_price) || 0,
          discount: parseFloat(i.discount) || 0,
        })),
      };
      await createSalesInvoice(payload);
      notify("فاکتور فروش ثبت شد ✅", "success");
      setShowForm(false);
      setForm({ customer: "", customer_name: "", invoice_number: "", payment_method: "cash", paid_amount: "", description: "" });
      setItems([{ item_name: "", quantity: "", unit: "unit", unit_price: "", cost_price: "", discount: "" }]);
      load();
    } catch (err) {
      notify(err.response?.data?.detail || err.message || "خطا در ثبت فاکتور", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (inv) => {
    if (!window.confirm(`فاکتور «${inv.invoice_number || inv.id}» حذف شود؟`)) return;
    try {
      await deleteSalesInvoice(inv.id);
      notify("فاکتور حذف شد", "success");
      load();
    } catch {
      notify("خطا در حذف", "error");
    }
  };

  const getPayLabel = (val) => PAY_METHODS.find((p) => p.value === val)?.label || val;
  const getPayColor = (val) => PAY_METHODS.find((p) => p.value === val)?.color || C.sub;

  // ═══════════ کیبورد ═══════════
  const handleFormKeyDown = (e) => {
    if (e.key === "Enter" && e.ctrlKey) {
      e.preventDefault();
      handleSave();
    }
    if (e.key === "Escape") {
      e.preventDefault();
      setShowForm(false);
    }
  };

  const handleQuickCustKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleQuickCustomer();
    }
    if (e.key === "Escape") {
      e.preventDefault();
      setQuickCustOpen(false);
    }
  };

  // ═══════════ استایل‌ها ═══════════
  const inputSx = {
    "& .MuiOutlinedInput-root": {
      borderRadius: "12px",
      bgcolor: C.inputBg,
      backdropFilter: "blur(8px)",
      fontSize: 13,
      fontFamily: "'Vazirmatn', 'Plus Jakarta Sans', sans-serif",
      color: C.text,
      transition: "all 0.25s ease",
      "& fieldset": { borderColor: C.glassBorder },
      "&:hover fieldset": { borderColor: C.olive + "60" },
      "&.Mui-focused fieldset": { borderColor: C.olive, borderWidth: 1.5 },
      "&.Mui-focused": { boxShadow: `0 0 0 3px ${C.olive}18` },
    },
    "& .MuiInputLabel-root": { fontSize: 12, color: C.sub },
    "& .MuiInputBase-input": { color: C.text },
    "& .MuiInputBase-input::placeholder": { color: C.muted, opacity: 1 },
  };

  const btnSx = {
    borderRadius: "12px", fontSize: 12, fontWeight: 700, textTransform: "none",
    px: 2.5, py: 1, color: "#fff", background: C.btnGrad,
    boxShadow: `0 4px 20px ${C.olive}30`,
    transition: "all 0.25s ease",
    "&:hover": { transform: "translateY(-1px)", boxShadow: `0 6px 28px ${C.olive}40` },
    "&:active": { transform: "scale(0.985)" },
    "&.Mui-disabled": { bgcolor: C.muted, color: C.sub },
  };

  const cancelBtnSx = {
    borderRadius: "10px", fontSize: 12, fontWeight: 600, textTransform: "none",
    color: C.sub, border: `1px solid ${C.glassBorder}`,
    "&:hover": { bgcolor: C.oliveSubtle },
  };

  const dialogPaperSx = {
    borderRadius: "16px",
    bgcolor: isDark ? "#1A1A2E" : "#fff",
    border: `1px solid ${C.glassBorder}`,
  };

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
        <CircularProgress sx={{ color: C.olive }} size={36} />
      </Box>
    );
  }

  return (
    <Box>
      {/* ── هدر ── */}
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2.5, flexWrap: "wrap", gap: 1.5 }}>
        <Box>
          <Typography sx={{ fontSize: { xs: 16, sm: 18 }, fontWeight: 800, color: C.text }}>
            💰 ثبت فاکتور فروش
          </Typography>
          <Typography sx={{ fontSize: 12, color: C.sub, mt: 0.3 }}>
            ثبت فروش — نقدی، کارت یا نسیه | Ctrl+Enter ذخیره | Escape بستن
          </Typography>
        </Box>
        <Box sx={{ display: "flex", gap: 1 }}>
          <IconButton onClick={load} sx={{ border: `1px solid ${C.glassBorder}`, borderRadius: "10px", bgcolor: C.glass, color: C.text }}>
            <Refresh sx={{ fontSize: 18 }} />
          </IconButton>
          <Button onClick={() => { setShowForm(!showForm); setTimeout(() => invoiceNumberRef.current?.focus(), 200); }} sx={btnSx}>
            {showForm ? "✖ بستن فرم" : "➕ فاکتور جدید"}
          </Button>
        </Box>
      </Box>

      {/* ── فرم ثبت ── */}
      {showForm && (
        <Box
          onKeyDown={handleFormKeyDown}
          sx={{
            bgcolor: C.glass, backdropFilter: "blur(16px)",
            border: `1px solid ${C.glassBorder}`, borderRadius: "16px",
            p: { xs: 2, sm: 3 }, mb: 3,
          }}
        >
          <Typography sx={{ fontSize: 13, fontWeight: 700, color: C.text, mb: 1.5 }}>
            📋 اطلاعات فاکتور
          </Typography>

          {/* ردیف فیلدها */}
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr 1fr 1fr" }, gap: 1.5, mb: 2 }}>
            <TextField
              size="small" label="شماره فاکتور"
              inputRef={invoiceNumberRef}
              value={form.invoice_number}
              onChange={(e) => setForm({ ...form, invoice_number: e.target.value })}
              sx={inputSx}
            />

            {/* مشتری + دکمه افزودن سریع */}
            <Box sx={{ display: "flex", gap: 0.5 }}>
              <Box sx={{ flex: 1 }}>
                <Typography sx={{ fontSize: 11, color: C.sub, mb: 0.5 }}>مشتری</Typography>
                <Select
                  size="small" fullWidth
                  value={form.customer}
                  onChange={(e) => {
                    const c = customers.find((c) => c.id === e.target.value);
                    setForm({ ...form, customer: e.target.value, customer_name: c?.name || "" });
                  }}
                  sx={{ ...inputSx, fontSize: 13 }}
                >
                  <MenuItem value="">نقدی (بدون مشتری)</MenuItem>
                  {customers.map((c) => (
                    <MenuItem key={c.id} value={c.id}>
                      {c.name} {Number(c.total_debt || 0) > 0 ? `(بدهی: ${Number(c.total_debt).toLocaleString("en-US")})` : ""}
                    </MenuItem>
                  ))}
                </Select>
              </Box>
              <IconButton
                onClick={() => { setQuickCustOpen(true); setTimeout(() => quickCustNameRef.current?.focus(), 200); }}
                sx={{
                  alignSelf: "flex-end", mb: 0.2,
                  border: `1px solid ${C.olive}40`, borderRadius: "10px",
                  bgcolor: C.oliveSubtle, color: C.olive,
                  width: 36, height: 36,
                  "&:hover": { bgcolor: C.olive, color: "#fff" },
                }}
                title="افزودن سریع مشتری (Ctrl+N)"
              >
                <PersonAdd fontSize="small" />
              </IconButton>
            </Box>

            <Box>
              <Typography sx={{ fontSize: 11, color: C.sub, mb: 0.5 }}>نوع پرداخت</Typography>
              <Select
                size="small" fullWidth
                value={form.payment_method}
                onChange={(e) => setForm({ ...form, payment_method: e.target.value })}
                sx={{ ...inputSx, fontSize: 13 }}
              >
                {PAY_METHODS.map((p) => (
                  <MenuItem key={p.value} value={p.value}>{p.label}</MenuItem>
                ))}
              </Select>
            </Box>

            <TextField
              size="small" label="مبلغ پرداخت‌شده" type="number"
              value={form.paid_amount}
              onChange={(e) => setForm({ ...form, paid_amount: e.target.value })}
              placeholder={String(grandTotal)}
              sx={inputSx}
            />
          </Box>

          <Divider sx={{ borderColor: C.glassBorder, mb: 2 }} />

          {/* ── اقلام ── */}
          <Typography sx={{ fontSize: 13, fontWeight: 700, color: C.text, mb: 1.5 }}>
            🛒 اقلام فاکتور
          </Typography>

          {items.map((it, idx) => (
            <Box
              key={idx}
              onKeyDown={(e) => {
                if (e.key === "Enter" && idx === items.length - 1) {
                  e.preventDefault();
                  addItem();
                }
              }}
              sx={{
                display: "grid",
                gridTemplateColumns: { xs: "1fr 1fr", sm: "2fr 1fr 1fr 1fr 1fr 1fr auto" },
                gap: 1, mb: 1,
                animation: `fadeUp 0.3s ease-out ${idx * 0.05}s backwards`,
              }}
            >
              <TextField
                size="small" label="نام کالا"
                inputRef={idx === 0 ? firstItemRef : null}
                value={it.item_name}
                onChange={(e) => updateItem(idx, "item_name", e.target.value)}
                sx={inputSx}
              />
              <TextField
                size="small" label="تعداد" type="number"
                value={it.quantity}
                onChange={(e) => updateItem(idx, "quantity", e.target.value)}
                sx={inputSx}
              />
              <Box>
                <Typography sx={{ fontSize: 11, color: C.sub, mb: 0.5 }}>واحد</Typography>
                <Select
                  size="small" fullWidth
                  value={it.unit}
                  onChange={(e) => updateItem(idx, "unit", e.target.value)}
                  sx={{ ...inputSx, fontSize: 13 }}
                >
                  {Object.entries(UNIT_LABELS).map(([k, v]) => (
                    <MenuItem key={k} value={k}>{v}</MenuItem>
                  ))}
                </Select>
              </Box>
              <TextField
                size="small" label="قیمت فروش" type="number"
                value={it.unit_price}
                onChange={(e) => updateItem(idx, "unit_price", e.target.value)}
                sx={inputSx}
              />
              <TextField
                size="small" label="قیمت خرید" type="number"
                value={it.cost_price}
                onChange={(e) => updateItem(idx, "cost_price", e.target.value)}
                sx={inputSx}
              />
              <TextField
                size="small" label="تخفیف" type="number"
                value={it.discount}
                onChange={(e) => updateItem(idx, "discount", e.target.value)}
                sx={inputSx}
              />
              <IconButton
                size="small"
                onClick={() => removeItem(idx)}
                sx={{ color: C.danger, bgcolor: C.dangerBg, alignSelf: "center" }}
              >
                <Delete fontSize="small" />
              </IconButton>
            </Box>
          ))}

          <Button
            startIcon={<Add />}
            onClick={addItem}
            size="small"
            sx={{ mt: 1, color: C.olive, fontWeight: 600, fontSize: 12, textTransform: "none" }}
          >
            افزودن قلم (Enter)
          </Button>

          {/* جمع */}
          <Box sx={{
            display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr 1fr" },
            gap: 2, mt: 3, p: 2,
            bgcolor: C.inputBg, borderRadius: "14px", border: `1px solid ${C.glassBorder}`,
          }}>
            <Box>
              <Typography sx={{ fontSize: 11, color: C.sub, fontWeight: 600 }}>جمع کل</Typography>
              <Typography sx={{ fontSize: 18, fontWeight: 800, color: C.text }}>
                {grandTotal.toLocaleString("en-US")} <Typography component="span" sx={{ fontSize: 10, color: C.muted }}>تومان</Typography>
              </Typography>
            </Box>
            <Box>
              <Typography sx={{ fontSize: 11, color: C.sub, fontWeight: 600 }}>سود تقریبی</Typography>
              <Typography sx={{ fontSize: 18, fontWeight: 800, color: grandProfit >= 0 ? C.success : C.danger }}>
                {grandProfit.toLocaleString("en-US")} <Typography component="span" sx={{ fontSize: 10, color: C.muted }}>تومان</Typography>
              </Typography>
            </Box>
            <TextField
              size="small" label="یادداشت"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              sx={inputSx}
            />
          </Box>

          {/* دکمه‌ها */}
          <Box sx={{ display: "flex", justifyContent: "flex-end", gap: 1.5, mt: 2.5 }}>
            <Button onClick={() => setShowForm(false)} sx={cancelBtnSx}>
              انصراف (Esc)
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving || validItems.length === 0}
              sx={btnSx}
            >
              {saving ? <CircularProgress size={18} sx={{ color: "#fff" }} /> : "💾 ذخیره فاکتور (Ctrl+Enter)"}
            </Button>
          </Box>
        </Box>
      )}

      {/* ── لیست فاکتورها ── */}
      {invoices.length === 0 && !showForm ? (
        <Box sx={{ textAlign: "center", py: 6 }}>
          <Typography sx={{ fontSize: 36, mb: 1 }}>💰</Typography>
          <Typography sx={{ fontSize: 14, fontWeight: 700, color: C.text }}>
            هنوز فاکتور فروشی ثبت نشده
          </Typography>
          <Typography sx={{ fontSize: 12, color: C.sub, mt: 0.5 }}>
            برای شروع، فاکتور جدید ثبت کنید
          </Typography>
        </Box>
      ) : (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 0.8 }}>
          <Box sx={{
            display: "flex", alignItems: "center",
            px: { xs: 1.5, sm: 2 }, py: { xs: 0.8, sm: 1 },
            borderRadius: "10px",
            bgcolor: isDark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.02)",
          }}>
            <Typography sx={{ flex: 2, fontSize: 10, fontWeight: 700, color: C.muted, letterSpacing: "0.05em", textTransform: "uppercase" }}>
              شماره / مشتری
            </Typography>
            <Typography sx={{ flex: 1, fontSize: 10, fontWeight: 700, color: C.muted, letterSpacing: "0.05em", textTransform: "uppercase", textAlign: "center" }}>
              نوع پرداخت
            </Typography>
            <Typography sx={{ flex: 1, fontSize: 10, fontWeight: 700, color: C.muted, letterSpacing: "0.05em", textTransform: "uppercase", textAlign: "center" }}>
              جمع کل
            </Typography>
            <Typography sx={{ flex: 1, fontSize: 10, fontWeight: 700, color: C.muted, letterSpacing: "0.05em", textTransform: "uppercase", textAlign: "center", display: { xs: "none", sm: "block" } }}>
              سود
            </Typography>
            <Box sx={{ minWidth: 50 }} />
          </Box>

          {invoices.map((inv, i) => (
            <Box key={inv.id} sx={{
              display: "flex", alignItems: "center", flexWrap: "wrap",
              px: { xs: 1.5, sm: 2 }, py: { xs: 1, sm: 1.5 },
              borderRadius: "12px",
              bgcolor: C.glass, backdropFilter: "blur(12px)",
              border: `1px solid ${C.glassBorder}`,
              transition: "all 0.2s ease",
              opacity: 0,
              animation: `fadeUp 0.35s ease-out ${i * 0.04}s forwards`,
              "&:hover": {
                bgcolor: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.02)",
                transform: "translateX(2px)",
              },
            }}>
              <Box sx={{ flex: 2, minWidth: 0 }}>
                <Typography sx={{ fontSize: 13, fontWeight: 700, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {inv.invoice_number || `#${inv.id}`}
                </Typography>
                <Typography sx={{ fontSize: 11, color: C.sub, mt: 0.2 }}>
                  {inv.customer_name || "نقدی"} — {inv.date}
                </Typography>
              </Box>

              <Box sx={{ flex: 1, textAlign: "center" }}>
                <Chip
                  size="small"
                  label={getPayLabel(inv.payment_method)}
                  sx={{
                    height: 22, fontSize: 10, fontWeight: 600, borderRadius: "6px",
                    bgcolor: getPayColor(inv.payment_method) + "20",
                    color: getPayColor(inv.payment_method),
                  }}
                />
              </Box>

              <Box sx={{ flex: 1, textAlign: "center" }}>
                <Typography sx={{ fontSize: 13, fontWeight: 700, color: C.text }}>
                  {Number(inv.total || 0).toLocaleString("en-US")}
                </Typography>
              </Box>

              <Box sx={{ flex: 1, textAlign: "center", display: { xs: "none", sm: "block" } }}>
                <Typography sx={{ fontSize: 13, fontWeight: 700, color: Number(inv.profit || 0) >= 0 ? C.success : C.danger }}>
                  {Number(inv.profit || 0).toLocaleString("en-US")}
                </Typography>
              </Box>

              <Box sx={{ minWidth: 50, display: "flex", justifyContent: "center" }}>
                <IconButton size="small" onClick={() => handleDelete(inv)} sx={{ color: C.danger, "&:hover": { bgcolor: C.dangerBg } }}>
                  <Delete fontSize="small" />
                </IconButton>
              </Box>
            </Box>
          ))}
        </Box>
      )}

      {/* ═══════════ دیالوگ افزودن سریع مشتری ═══════════ */}
      <Dialog
        open={quickCustOpen}
        onClose={() => setQuickCustOpen(false)}
        maxWidth="xs"
        fullWidth
        slotProps={{ paper: { sx: dialogPaperSx } }}
      >
        <DialogTitle sx={{ fontSize: 15, fontWeight: 800, color: C.text, display: "flex", alignItems: "center", gap: 1 }}>
          <PersonAdd sx={{ color: C.olive, fontSize: 20 }} /> افزودن سریع مشتری
        </DialogTitle>
        <DialogContent
          onKeyDown={handleQuickCustKeyDown}
          sx={{ display: "flex", flexDirection: "column", gap: 1.5, pt: "12px !important" }}
        >
          <Typography sx={{ fontSize: 11, color: C.sub }}>
            مشتری جدید مستقیماً به لیست مشتریان (تعاریف) اضافه و انتخاب می‌شود
          </Typography>
          <TextField
            size="small" label="نام مشتری *"
            inputRef={quickCustNameRef}
            value={quickCust.name}
            onChange={(e) => setQuickCust({ ...quickCust, name: e.target.value })}
            sx={inputSx}
          />
          <TextField
            size="small" label="تلفن"
            value={quickCust.phone}
            onChange={(e) => setQuickCust({ ...quickCust, phone: e.target.value })}
            sx={inputSx}
          />
          <TextField
            size="small" label="آدرس"
            value={quickCust.address}
            onChange={(e) => setQuickCust({ ...quickCust, address: e.target.value })}
            sx={inputSx}
          />
          <TextField
            size="small" label="یادداشت"
            value={quickCust.note}
            onChange={(e) => setQuickCust({ ...quickCust, note: e.target.value })}
            sx={inputSx}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button
            onClick={() => setQuickCustOpen(false)}
            sx={{ borderRadius: "10px", fontSize: 12, textTransform: "none", color: C.sub }}
          >
            انصراف (Esc)
          </Button>
          <Button
            onClick={handleQuickCustomer}
            disabled={quickCustSaving || !quickCust.name.trim()}
            sx={{
              borderRadius: "10px", fontSize: 12, fontWeight: 700, textTransform: "none",
              px: 2.5, color: "#fff", background: C.btnGrad, opacity: quickCustSaving ? 0.6 : 1,
            }}
          >
            {quickCustSaving ? <CircularProgress size={16} sx={{ color: "#fff" }} /> : "ثبت (Enter)"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}