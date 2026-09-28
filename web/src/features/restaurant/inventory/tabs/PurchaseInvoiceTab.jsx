import { useState, useEffect, useCallback } from "react";
import {
  Box, Typography, Button, TextField, Select, MenuItem,
  CircularProgress, IconButton, Divider,
} from "@mui/material";
import { createReceiving, fetchRawMaterials, fetchSuppliers, fetchWarehouses } from "../api";

const UNIT_LABELS = { kilogram: "کیلو", gram: "گرم", liter: "لیتر", ml: "میلی‌لیتر", count: "عدد", box: "بسته", kg: "کیلو", unit: "واحد" };

export default function PurchaseInvoiceTab({ C, isDark, showToast }) {
  const [materials, setMaterials] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    supplier_id: "",
    invoice_number: "",
    warehouse_id: "",
    notes: "",
  });

  const [items, setItems] = useState([
    { raw_material_id: "", quantity: "", unit_price: "" },
  ]);

  const notify = useCallback((msg, type = "info") => {
    if (typeof showToast === "function") showToast(msg, type);
  }, [showToast]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [mats, sups, whs] = await Promise.all([
          fetchRawMaterials(),
          fetchSuppliers(),
          fetchWarehouses(),
        ]);
        setMaterials(Array.isArray(mats) ? mats : []);
        setSuppliers(Array.isArray(sups) ? sups : sups.suppliers || []);
        setWarehouses(whs.warehouses || []);

        // انتخاب پیش‌فرض انبار مرکزی
        const whList = whs.warehouses || [];
        const mother = whList.find(w => w.is_mother) || whList[0];
        if (mother) setForm(f => ({ ...f, warehouse_id: mother.id }));
      } catch (err) {
        console.error("Load invoice data error:", err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const addItem = () => setItems([...items, { raw_material_id: "", quantity: "", unit_price: "" }]);
  const removeItem = (idx) => setItems(items.filter((_, i) => i !== idx));
  const updateItem = (idx, field, val) => {
    const updated = [...items];
    updated[idx] = { ...updated[idx], [field]: val };
    setItems(updated);
  };

  const getMaterialUnit = (matId) => {
    const mat = materials.find(m => m.id == matId);
    return mat ? UNIT_LABELS[mat.unit] || mat.unit : "";
  };

  const lineTotal = (item) => {
    return (parseFloat(item.quantity) || 0) * (parseFloat(item.unit_price) || 0);
  };

  const grandTotal = items.reduce((sum, item) => sum + lineTotal(item), 0);
  const validItems = items.filter(i => i.raw_material_id && parseFloat(i.quantity) > 0);

  const handleSave = async () => {
    if (!form.warehouse_id) {
      notify("انبار را انتخاب کنید", "warning");
      return;
    }
    if (validItems.length === 0) {
      notify("حداقل یک کالا با مقدار وارد کنید", "warning");
      return;
    }

    setSaving(true);
    try {
      await createReceiving({
        warehouse_id: form.warehouse_id,
        supplier_id: form.supplier_id || null,
        invoice_number: form.invoice_number.trim(),
        notes: form.notes.trim(),
        items: validItems.map(i => ({
          raw_material_id: i.raw_material_id,
          quantity: parseFloat(i.quantity),
          unit_price: parseFloat(i.unit_price) || 0,
        })),
      });
      notify(`✅ فاکتور ثبت شد — جمع: ${grandTotal.toLocaleString("fa-IR")} تومان`, "success");
      // ریست فرم
      setItems([{ raw_material_id: "", quantity: "", unit_price: "" }]);
      setForm(f => ({ ...f, supplier_id: "", invoice_number: "", notes: "" }));
    } catch (err) {
      notify(err.response?.data?.error || err.message || "خطا در ثبت فاکتور", "error");
    } finally {
      setSaving(false);
    }
  };

  const inputSx = {
    "& .MuiOutlinedInput-root": {
      borderRadius: "12px", bgcolor: C.inputBg, backdropFilter: "blur(8px)",
      fontSize: 13, fontFamily: "'Vazirmatn', 'Plus Jakarta Sans', sans-serif", color: C.text,
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
            ثبت فاکتور تأمین‌کننده — کالاها به انبار اضافه می‌شوند
          </Typography>
        </Box>
        <Button
          onClick={handleSave}
          disabled={saving}
          sx={{
            borderRadius: "12px", fontSize: 12, fontWeight: 700, textTransform: "none",
            px: 3, py: 1, color: "#fff", background: C.btnGrad,
            boxShadow: `0 4px 20px ${C.olive}30`,
            opacity: saving ? 0.6 : 1,
            "&:hover": { transform: "translateY(-1px)", boxShadow: `0 6px 28px ${C.olive}40` },
          }}
        >
          {saving ? "..." : "✅ ثبت فاکتور"}
        </Button>
      </Box>

      {/* ── اطلاعات فاکتور ── */}
      <Box sx={{
        display: "grid",
        gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr 1fr" },
        gap: 1.5,
        mb: 3,
        p: 2,
        borderRadius: "14px",
        bgcolor: C.oliveSubtle,
        border: `1px solid ${C.glassBorder}`,
      }}>
        <Box>
          <Typography sx={{ fontSize: 11, color: C.sub, mb: 0.5 }}>تأمین‌کننده *</Typography>
          <Select size="small" fullWidth value={form.supplier_id}
            onChange={(e) => setForm({ ...form, supplier_id: e.target.value })}
            sx={{ ...inputSx, fontSize: 13 }} displayEmpty>
            <MenuItem value="">
              <Typography sx={{ fontSize: 12, color: C.muted }}>انتخاب تأمین‌کننده...</Typography>
            </MenuItem>
            {suppliers.map(s => (
              <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>
            ))}
          </Select>
        </Box>

        <Box>
          <Typography sx={{ fontSize: 11, color: C.sub, mb: 0.5 }}>شماره فاکتور</Typography>
          <TextField size="small" fullWidth placeholder="مثلاً INV-1404-001"
            value={form.invoice_number}
            onChange={(e) => setForm({ ...form, invoice_number: e.target.value })}
            sx={inputSx} />
        </Box>

        <Box>
          <Typography sx={{ fontSize: 11, color: C.sub, mb: 0.5 }}>انبار مقصد *</Typography>
          <Select size="small" fullWidth value={form.warehouse_id}
            onChange={(e) => setForm({ ...form, warehouse_id: e.target.value })}
            sx={{ ...inputSx, fontSize: 13 }}>
            {warehouses.map(w => (
              <MenuItem key={w.id} value={w.id}>
                {w.name} {w.is_mother ? "(مرکزی)" : ""}
              </MenuItem>
            ))}
          </Select>
        </Box>
      </Box>

      {/* ── هدر جدول کالاها ── */}
      <Box sx={{
        display: "flex", alignItems: "center", justifyContent: "space-between", mb: 1.5,
      }}>
        <Typography sx={{ fontSize: 14, fontWeight: 800, color: C.text }}>
          📦 کالاها ({validItems.length})
        </Typography>
        <Button
          onClick={addItem}
          sx={{
            borderRadius: "8px", fontSize: 11, fontWeight: 600,
            textTransform: "none", color: C.olive,
            border: `1px dashed ${C.olive}40`, px: 2, py: 0.5,
            "&:hover": { bgcolor: C.oliveSubtle },
          }}
        >
          ➕ افزودن کالا
        </Button>
      </Box>

      {/* ── ستون‌های هدر ── */}
      <Box sx={{
        display: "flex", gap: 1, px: 2, py: 1,
        borderRadius: "8px", bgcolor: C.oliveSubtle,
        fontSize: 10, fontWeight: 700, color: C.sub,
        mb: 1,
      }}>
        <Box sx={{ flex: 3 }}>کالا</Box>
        <Box sx={{ flex: 1, textAlign: "center" }}>مقدار</Box>
        <Box sx={{ flex: 1.5, textAlign: "center" }}>قیمت واحد (تومان)</Box>
        <Box sx={{ flex: 1.5, textAlign: "center" }}>جمع (تومان)</Box>
        <Box sx={{ width: 30 }} />
      </Box>

      {/* ── ردیف‌های کالا ── */}
      <Box sx={{ display: "flex", flexDirection: "column", gap: 1, mb: 2 }}>
        {items.map((item, idx) => (
          <Box key={idx} sx={{
            display: "flex", gap: 1, alignItems: "center",
            p: 1.5, borderRadius: "12px",
            bgcolor: C.glass, backdropFilter: "blur(12px)",
            border: `1px solid ${C.glassBorder}`,
            opacity: 0,
            animation: `fadeUp 0.3s ease-out ${idx * 0.05}s forwards`,
          }}>
            {/* کالا */}
            <Select size="small" value={item.raw_material_id}
              onChange={(e) => updateItem(idx, "raw_material_id", e.target.value)}
              sx={{ ...inputSx, fontSize: 13, flex: 3 }} displayEmpty>
              <MenuItem value="" disabled>
                <Typography sx={{ fontSize: 11, color: C.muted }}>انتخاب کالا...</Typography>
              </MenuItem>
              {materials.map(m => (
                <MenuItem key={m.id} value={m.id}>
                  {m.name} ({UNIT_LABELS[m.unit] || m.unit})
                </MenuItem>
              ))}
            </Select>

            {/* مقدار */}
            <TextField size="small" type="number" placeholder="مقدار"
              value={item.quantity}
              onChange={(e) => updateItem(idx, "quantity", e.target.value)}
              sx={{ ...inputSx, flex: 1 }}
              inputProps={{ min: 0, step: 0.001 }} />

            {/* قیمت واحد */}
            <TextField size="small" type="number" placeholder="0"
              value={item.unit_price}
              onChange={(e) => updateItem(idx, "unit_price", e.target.value)}
              sx={{ ...inputSx, flex: 1.5 }}
              inputProps={{ min: 0 }} />

            {/* جمع ردیف */}
            <Box sx={{ flex: 1.5, textAlign: "center" }}>
              <Typography sx={{
                fontSize: 13, fontWeight: 700,
                color: lineTotal(item) > 0 ? C.olive : C.muted,
              }}>
                {lineTotal(item) > 0 ? lineTotal(item).toLocaleString("fa-IR") : "—"}
              </Typography>
            </Box>

            {/* حذف */}
            <IconButton
              size="small"
              onClick={() => items.length > 1 && removeItem(idx)}
              sx={{
                width: 30, height: 30,
                color: items.length > 1 ? C.danger : C.muted,
                opacity: items.length > 1 ? 1 : 0.3,
              }}
            >
              <Typography sx={{ fontSize: 14 }}>🗑</Typography>
            </IconButton>
          </Box>
        ))}
      </Box>

      {/* ── جمع کل ── */}
      <Box sx={{
        display: "flex", justifyContent: "flex-end", mb: 3,
      }}>
        <Box sx={{
          display: "flex", gap: 3, alignItems: "center",
          px: 3, py: 1.5,
          borderRadius: "12px",
          bgcolor: C.infoBg, border: `1px solid ${C.info}30`,
        }}>
          <Typography sx={{ fontSize: 13, fontWeight: 700, color: C.sub }}>
            جمع کل فاکتور:
          </Typography>
          <Typography sx={{ fontSize: 20, fontWeight: 900, color: C.info }}>
            {grandTotal.toLocaleString("fa-IR")}
          </Typography>
          <Typography sx={{ fontSize: 12, color: C.sub }}>تومان</Typography>
        </Box>
      </Box>

      {/* ── توضیحات ── */}
      <TextField size="small" fullWidth label="توضیحات فاکتور"
        value={form.notes}
        onChange={(e) => setForm({ ...form, notes: e.target.value })}
        multiline rows={2} sx={inputSx} />
    </Box>
  );
}