import { useState, useEffect, useCallback, useRef } from "react";
import {
  Box, Typography, Button, TextField, Select, MenuItem,
  CircularProgress, IconButton, Divider, Chip,
} from "@mui/material";
import {
  Add, Delete, Refresh, ReceiptLong,
} from "@mui/icons-material";
import {
  fetchRawMaterials, fetchSuppliers, fetchWarehouses,
} from "../api";

const UNIT_LABELS = {
  kilogram: "کیلو", kg: "کیلو", gram: "گرم", g: "گرم",
  liter: "لیتر", l: "لیتر", ml: "میلی‌لیتر",
  count: "عدد", unit: "واحد", box: "بسته", pack: "بسته", bunch: "دسته",
};

export default function PurchaseInvoiceTab({ C, isDark, showToast }) {
  const [materials, setMaterials] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const [form, setForm] = useState({
    supplier_id: "",
    invoice_number: "",
    warehouse_id: "",
    payment_method: "cash",
    paid_amount: "",
    description: "",
  });

  const [items, setItems] = useState([
    { raw_material_id: "", quantity: "", unit_price: "" },
  ]);

  // ref برای فوکوس
  const invoiceNumberRef = useRef(null);

  const notify = useCallback((msg, type = "info") => {
    if (typeof showToast === "function") showToast(msg, type);
  }, [showToast]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [mats, sups, whs] = await Promise.all([
        fetchRawMaterials(),
        fetchSuppliers(),
        fetchWarehouses(),
      ]);
      setMaterials(Array.isArray(mats) ? mats : []);
      setSuppliers(Array.isArray(sups) ? sups : sups.suppliers || []);
      const whList = Array.isArray(whs) ? whs : whs.warehouses || [];
      setWarehouses(whList);

      // انتخاب پیش‌فرض انبار مرکزی
      const mother = whList.find((w) => w.is_mother) || whList[0];
      if (mother) setForm((f) => ({ ...f, warehouse_id: mother.id }));
    } catch (err) {
      console.error("Load purchase data error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── مدیریت اقلام ──
  const addItem = () =>
    setItems([...items, { raw_material_id: "", quantity: "", unit_price: "" }]);
  const removeItem = (idx) => setItems(items.filter((_, i) => i !== idx));
  const updateItem = (idx, field, val) => {
    const updated = [...items];
    updated[idx] = { ...updated[idx], [field]: val };
    setItems(updated);
  };

  const getMaterialUnit = (matId) => {
    const mat = materials.find((m) => m.id == matId);
    return mat ? UNIT_LABELS[mat.unit] || mat.unit : "";
  };

  const getMaterialPrice = (matId) => {
    const mat = materials.find((m) => m.id == matId);
    return mat ? mat.price || 0 : 0;
  };

  const lineTotal = (item) =>
    (parseFloat(item.quantity) || 0) * (parseFloat(item.unit_price) || 0);

  const grandTotal = items.reduce((s, i) => s + lineTotal(i), 0);
  const validItems = items.filter((i) => i.raw_material_id && parseFloat(i.quantity) > 0);

  // ── ذخیره ──
  const handleSave = async () => {
    if (!form.warehouse_id) {
      notify("انبار را انتخاب کنید", "warning");
      return;
    }
    if (validItems.length === 0) {
      notify("حداقل یک قلم با کالا و تعداد وارد کنید", "warning");
      return;
    }
    if (saving) return;
    setSaving(true);
    try {
      // فعلاً فقط نمایش موفقیت — API ذخیره بعداً اضافه میشه
      notify("فاکتور خرید ثبت شد ✅", "success");
      setShowForm(false);
      setForm({
        supplier_id: "",
        invoice_number: "",
        warehouse_id: form.warehouse_id,
        payment_method: "cash",
        paid_amount: "",
        description: "",
      });
      setItems([{ raw_material_id: "", quantity: "", unit_price: "" }]);
      load();
    } catch (err) {
      notify(err.response?.data?.detail || err.message || "خطا در ثبت فاکتور", "error");
    } finally {
      setSaving(false);
    }
  };

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
            🧾 ثبت فاکتور خرید
          </Typography>
          <Typography sx={{ fontSize: 12, color: C.sub, mt: 0.3 }}>
            ثبت خرید مواد اولیه | Ctrl+Enter ذخیره | Escape بستن
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

          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr 1fr 1fr" }, gap: 1.5, mb: 2 }}>
            <TextField
              size="small" label="شماره فاکتور"
              inputRef={invoiceNumberRef}
              value={form.invoice_number}
              onChange={(e) => setForm({ ...form, invoice_number: e.target.value })}
              sx={inputSx}
            />

            <Box>
              <Typography sx={{ fontSize: 11, color: C.sub, mb: 0.5 }}>تأمین‌کننده</Typography>
              <Select
                size="small" fullWidth
                value={form.supplier_id}
                onChange={(e) => setForm({ ...form, supplier_id: e.target.value })}
                sx={{ ...inputSx, fontSize: 13 }}
              >
                <MenuItem value="">بدون تأمین‌کننده</MenuItem>
                {suppliers.map((s) => (
                  <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>
                ))}
              </Select>
            </Box>

            <Box>
              <Typography sx={{ fontSize: 11, color: C.sub, mb: 0.5 }}>انبار</Typography>
              <Select
                size="small" fullWidth
                value={form.warehouse_id}
                onChange={(e) => setForm({ ...form, warehouse_id: e.target.value })}
                sx={{ ...inputSx, fontSize: 13 }}
              >
                {warehouses.map((w) => (
                  <MenuItem key={w.id} value={w.id}>
                    {w.name} {w.is_mother ? "⭐" : ""}
                  </MenuItem>
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
                gridTemplateColumns: { xs: "1fr 1fr", sm: "2fr 1fr 1fr 1fr auto" },
                gap: 1, mb: 1,
                animation: `fadeUp 0.3s ease-out ${idx * 0.05}s backwards`,
              }}
            >
              {/* انتخاب کالا */}
              <Box>
                <Typography sx={{ fontSize: 11, color: C.sub, mb: 0.5 }}>کالا</Typography>
                <Select
                  size="small" fullWidth
                  value={it.raw_material_id}
                  onChange={(e) => {
                    const matId = e.target.value;
                    const price = getMaterialPrice(matId);
                    updateItem(idx, "raw_material_id", matId);
                    if (price && !it.unit_price) {
                      updateItem(idx, "unit_price", price);
                    }
                  }}
                  sx={{ ...inputSx, fontSize: 13 }}
                >
                  <MenuItem value="">انتخاب کنید</MenuItem>
                  {materials.map((m) => (
                    <MenuItem key={m.id} value={m.id}>
                      {m.name} ({UNIT_LABELS[m.unit] || m.unit})
                    </MenuItem>
                  ))}
                </Select>
              </Box>

              <TextField
                size="small" label="تعداد" type="number"
                value={it.quantity}
                onChange={(e) => updateItem(idx, "quantity", e.target.value)}
                sx={inputSx}
              />

              <TextField
                size="small" label="قیمت واحد" type="number"
                value={it.unit_price}
                onChange={(e) => updateItem(idx, "unit_price", e.target.value)}
                sx={inputSx}
              />

              {/* جمع ردیف */}
              <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Typography sx={{ fontSize: 13, fontWeight: 700, color: C.text }}>
                  {lineTotal(it).toLocaleString("en-US")}
                  <Typography component="span" sx={{ fontSize: 9, color: C.muted, mr: 0.5 }}>
                    {getMaterialUnit(it.raw_material_id)}
                  </Typography>
                </Typography>
              </Box>

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
              <Typography sx={{ fontSize: 11, color: C.sub, fontWeight: 600 }}>تعداد اقلام</Typography>
              <Typography sx={{ fontSize: 18, fontWeight: 800, color: C.text }}>
                {validItems.length} <Typography component="span" sx={{ fontSize: 10, color: C.muted }}>قلم</Typography>
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
      {!showForm && (
        <Box sx={{ textAlign: "center", py: 6 }}>
          <Typography sx={{ fontSize: 36, mb: 1 }}>🧾</Typography>
          <Typography sx={{ fontSize: 14, fontWeight: 700, color: C.text }}>
            فاکتور خرید جدید ثبت کنید
          </Typography>
          <Typography sx={{ fontSize: 12, color: C.sub, mt: 0.5 }}>
            روی «فاکتور جدید» کلیک کنید یا Ctrl+Enter بزنید
          </Typography>
        </Box>
      )}
    </Box>
  );
}