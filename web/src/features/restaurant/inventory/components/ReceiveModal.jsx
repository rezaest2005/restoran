import { useState, useEffect, useCallback } from "react";
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Box, Typography, Button, TextField, Select, MenuItem,
  CircularProgress, IconButton,
} from "@mui/material";
import { createReceiving, fetchRawMaterials, fetchSuppliers } from "../api";

const UNIT_LABELS = { kilogram: "کیلوگرم", gram: "گرم", liter: "لیتر", ml: "میلی‌لیتر", count: "عدد", box: "بسته", kg: "کیلوگرم", unit: "واحد" };

export default function ReceiveModal({ open, onClose, warehouse, C, isDark, onSuccess, showToast }) {
  const [materials, setMaterials] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // آیتم‌های ورود (می‌توان چند کالا وارد کرد)
  const [items, setItems] = useState([
    { raw_material_id: "", quantity: "", unit_price: "" },
  ]);

  const [form, setForm] = useState({
    supplier_id: "",
    invoice_number: "",
    notes: "",
  });

  const notify = useCallback((msg, type = "info") => {
    if (typeof showToast === "function") showToast(msg, type);
  }, [showToast]);

  useEffect(() => {
    if (!open) return;
    const load = async () => {
      setLoading(true);
      try {
        const [mats, sups] = await Promise.all([fetchRawMaterials(), fetchSuppliers()]);
        setMaterials(Array.isArray(mats) ? mats : []);
        setSuppliers(Array.isArray(sups) ? sups : sups.suppliers || []);
      } catch (err) {
        console.error("Load receive data error:", err);
      } finally {
        setLoading(false);
      }
    };
    load();
    setItems([{ raw_material_id: "", quantity: "", unit_price: "" }]);
    setForm({ supplier_id: "", invoice_number: "", notes: "" });
  }, [open]);

  const addItem = () => setItems([...items, { raw_material_id: "", quantity: "", unit_price: "" }]);
  const removeItem = (idx) => setItems(items.filter((_, i) => i !== idx));
  const updateItem = (idx, field, val) => {
    const updated = [...items];
    updated[idx] = { ...updated[idx], [field]: val };
    setItems(updated);
  };

  // محاسبه جمع کل
  const totalAmount = items.reduce((sum, item) => {
    const qty = parseFloat(item.quantity) || 0;
    const price = parseFloat(item.unit_price) || 0;
    return sum + qty * price;
  }, 0);

  const handleSubmit = async () => {
    const validItems = items.filter(i => i.raw_material_id && parseFloat(i.quantity) > 0);
    if (validItems.length === 0) {
      notify("حداقل یک کالا با مقدار وارد کنید", "warning");
      return;
    }

    setSaving(true);
    try {
      await createReceiving({
        warehouse_id: warehouse?.id,
        supplier_id: form.supplier_id || null,
        invoice_number: form.invoice_number.trim(),
        notes: form.notes.trim(),
        items: validItems.map(i => ({
          raw_material_id: i.raw_material_id,
          quantity: parseFloat(i.quantity),
          unit_price: parseFloat(i.unit_price) || 0,
        })),
      });
      notify("✅ کالا با موفقیت وارد شد", "success");
      onSuccess && onSuccess();
      onClose();
    } catch (err) {
      notify(err.response?.data?.error || err.message || "خطا در ورود کالا", "error");
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

  const dialogPaperSx = {
    borderRadius: "16px", bgcolor: isDark ? "#1A1A2E" : "#fff",
    border: `1px solid ${C.glassBorder}`,
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth slotProps={{ paper: { sx: dialogPaperSx } }}>
      <DialogTitle sx={{ fontSize: 15, fontWeight: 800, color: C.text }}>
        ➕ ورود کالا — {warehouse?.name || ""}
      </DialogTitle>
      <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 1.5, pt: "12px !important" }}>
        {loading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
            <CircularProgress sx={{ color: C.olive }} size={28} />
          </Box>
        ) : (
          <>
            {/* تأمین‌کننده + فاکتور */}
            <Box sx={{ display: "flex", gap: 1 }}>
              <Box sx={{ flex: 1 }}>
                <Typography sx={{ fontSize: 11, color: C.sub, mb: 0.5 }}>تأمین‌کننده</Typography>
                <Select size="small" fullWidth value={form.supplier_id}
                  onChange={(e) => setForm({ ...form, supplier_id: e.target.value })}
                  sx={{ ...inputSx, fontSize: 13 }} displayEmpty>
                  <MenuItem value="">
                    <Typography sx={{ fontSize: 12, color: C.muted }}>بدون تأمین‌کننده</Typography>
                  </MenuItem>
                  {suppliers.map(s => (
                    <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>
                  ))}
                </Select>
              </Box>
              <Box sx={{ flex: 1 }}>
                <Typography sx={{ fontSize: 11, color: C.sub, mb: 0.5 }}>شماره فاکتور</Typography>
                <TextField size="small" fullWidth placeholder="اختیاری"
                  value={form.invoice_number}
                  onChange={(e) => setForm({ ...form, invoice_number: e.target.value })}
                  sx={inputSx} />
              </Box>
            </Box>

            {/* لیست کالاها */}
            <Typography sx={{ fontSize: 12, fontWeight: 700, color: C.text, mt: 1 }}>
              📦 کالاها
            </Typography>

            {items.map((item, idx) => (
              <Box key={idx} sx={{
                p: 1.5, borderRadius: "12px", bgcolor: C.oliveSubtle,
                border: `1px solid ${C.glassBorder}`,
              }}>
                <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1 }}>
                  <Typography sx={{ fontSize: 10, fontWeight: 700, color: C.sub }}>
                    کالای {idx + 1}
                  </Typography>
                  {items.length > 1 && (
                    <IconButton size="small" onClick={() => removeItem(idx)} sx={{ color: C.danger, p: 0.5 }}>
                      <Typography sx={{ fontSize: 14 }}>🗑</Typography>
                    </IconButton>
                  )}
                </Box>

                <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                  {/* کالا */}
                  <Select size="small" fullWidth value={item.raw_material_id}
                    onChange={(e) => updateItem(idx, "raw_material_id", e.target.value)}
                    sx={{ ...inputSx, fontSize: 13 }} displayEmpty>
                    <MenuItem value="" disabled>
                      <Typography sx={{ fontSize: 12, color: C.muted }}>انتخاب کالا...</Typography>
                    </MenuItem>
                    {materials.map(m => (
                      <MenuItem key={m.id} value={m.id}>
                        {m.name} ({UNIT_LABELS[m.unit] || m.unit})
                      </MenuItem>
                    ))}
                  </Select>

                  <Box sx={{ display: "flex", gap: 1 }}>
                    {/* مقدار */}
                    <TextField size="small" type="number" placeholder="مقدار"
                      value={item.quantity}
                      onChange={(e) => updateItem(idx, "quantity", e.target.value)}
                      sx={{ ...inputSx, flex: 1 }}
                      inputProps={{ min: 0, step: 0.001 }} />
                    {/* قیمت واحد */}
                    <TextField size="small" type="number" placeholder="قیمت واحد (تومان)"
                      value={item.unit_price}
                      onChange={(e) => updateItem(idx, "unit_price", e.target.value)}
                      sx={{ ...inputSx, flex: 1 }}
                      inputProps={{ min: 0 }} />
                  </Box>
                </Box>
              </Box>
            ))}

            {/* دکمه افزودن کالا */}
            <Button onClick={addItem} sx={{
              borderRadius: "10px", fontSize: 11, fontWeight: 600,
              textTransform: "none", color: C.olive,
              border: `1px dashed ${C.olive}40`, py: 0.8,
            }}>
              ➕ افزودن کالای دیگر
            </Button>

            {/* جمع کل */}
            {totalAmount > 0 && (
              <Box sx={{ p: 1.5, borderRadius: "10px", bgcolor: C.infoBg, border: `1px solid ${C.info}30` }}>
                <Typography sx={{ fontSize: 11, color: C.sub }}>جمع کل:</Typography>
                <Typography sx={{ fontSize: 16, fontWeight: 800, color: C.info }}>
                  {totalAmount.toLocaleString("fa-IR")} تومان
                </Typography>
              </Box>
            )}

            {/* توضیحات */}
            <TextField size="small" label="توضیحات" value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              multiline rows={2} sx={inputSx} />
          </>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} sx={{ borderRadius: "10px", fontSize: 12, textTransform: "none", color: C.sub }}>
          انصراف
        </Button>
        <Button onClick={handleSubmit} disabled={saving || loading} sx={{
          borderRadius: "10px", fontSize: 12, fontWeight: 700, textTransform: "none",
          px: 2.5, color: "#fff", background: C.btnGrad, opacity: saving ? 0.6 : 1,
        }}>
          {saving ? "..." : "✅ ثبت ورود"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}