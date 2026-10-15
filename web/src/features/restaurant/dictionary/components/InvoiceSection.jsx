import { useState, useEffect, useCallback } from "react";
import { Box, Typography, Button, TextField, Select, MenuItem, IconButton, CircularProgress, Chip } from "@mui/material";
import client from "../../api/client";

const UNIT_OPTIONS = [
  { value: "kg", label: "کیلوگرام" },
  { value: "g", label: "گرم" },
  { value: "l", label: "لیتر" },
  { value: "ml", label: "میلی‌لیتر" },
  { value: "unit", label: "عدد" },
  { value: "bunch", label: "دسته" },
  { value: "pack", label: "بسته" },
];

export default function InvoiceSection({ C, isDark, showToast }) {
  const [materials, setMaterials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  const [form, setForm] = useState({
    name: "",
    unit: "kg",
    price: "",
    minimum_stock: "",
  });

  const fetchMaterials = useCallback(async () => {
    setLoading(true);
    try {
      const res = await client.get("/api/raw-materials/");
      setMaterials(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error("Fetch materials error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMaterials();
  }, [fetchMaterials]);

  const handleSave = async () => {
    if (!form.name.trim()) {
      if (showToast) showToast("نام کالا الزامی است", "warning");
      return;
    }
    setSaving(true);
    try {
      await client.post("/api/raw-materials/save/", {
        name: form.name.trim(),
        unit: form.unit,
        price: parseFloat(form.price) || 0,
        minimum_stock: parseFloat(form.minimum_stock) || 0,
      });
      if (showToast) showToast("کالا با موفقیت ثبت شد", "success");
      setForm({ name: "", unit: "kg", price: "", minimum_stock: "" });
      fetchMaterials();
    } catch (err) {
      if (showToast) showToast(err.response?.data?.error || "خطا در ثبت", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      await client.post("/api/raw-materials/delete/", { id });
      if (showToast) showToast("کالا حذف شد", "info");
      fetchMaterials();
    } catch (err) {
      if (showToast) showToast("خطا در حذف", "error");
    }
  };

  const inputSx = {
    "& .MuiOutlinedInput-root": {
      borderRadius: "10px", bgcolor: C.inputBg, backdropFilter: "blur(8px)",
      fontSize: 13, color: C.text,
      "& fieldset": { borderColor: C.glassBorder },
      "&:hover fieldset": { borderColor: C.olive + "60" },
      "&.Mui-focused fieldset": { borderColor: C.olive, borderWidth: 1.5 },
    },
    "& .MuiInputLabel-root": { fontSize: 12, color: C.sub },
  };

  return (
    <Box>
      <Typography sx={{ fontSize: 16, fontWeight: 800, color: C.text, mb: 2 }}>
        🧾 تعریف کالاهای فاکتور خرید
      </Typography>
      
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "2fr 1fr 1fr 1fr auto" }, gap: 1.5, mb: 3, p: 2, borderRadius: "14px", bgcolor: C.glass, border: `1px solid ${C.glassBorder}` }}>
        <TextField size="small" label="نام کالا" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} sx={inputSx} />
        
        <Select size="small" label="واحد" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} sx={inputSx}>
          {UNIT_OPTIONS.map(opt => <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>)}
        </Select>

        <TextField size="small" type="number" label="قیمت پایه (تومان)" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} sx={inputSx} inputProps={{ min: 0 }} />
        
        <TextField size="small" type="number" label="حداقل موجودی" value={form.minimum_stock} onChange={(e) => setForm({ ...form, minimum_stock: e.target.value })} sx={inputSx} inputProps={{ min: 0 }} />

        <Button onClick={handleSave} disabled={saving} sx={{ borderRadius: "10px", fontSize: 12, fontWeight: 700, color: "#fff", background: C.btnGrad, px: 3, "&:hover": { opacity: 0.9 } }}>
          {saving ? <CircularProgress size={20} sx={{ color: "#fff" }} /> : "افزودن"}
        </Button>
      </Box>

      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}><CircularProgress sx={{ color: C.olive }} /></Box>
      ) : (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
          {materials.length === 0 ? (
            <Typography sx={{ textAlign: "center", color: C.muted, fontSize: 13, py: 4 }}>هنوز کالایی تعریف نشده است.</Typography>
          ) : (
            materials.map((mat) => (
              <Box key={mat.id} sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", p: 1.5, borderRadius: "10px", bgcolor: C.oliveSubtle, border: `1px solid ${C.glassBorder}` }}>
                <Typography sx={{ fontSize: 13, fontWeight: 600, color: C.text }}>{mat.name}</Typography>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                  <Chip label={UNIT_OPTIONS.find(u => u.value === mat.unit)?.label || mat.unit} size="small" sx={{ bgcolor: C.glassBorder, color: C.sub, fontSize: 11 }} />
                  <IconButton size="small" onClick={() => handleDelete(mat.id)} sx={{ color: C.danger }}>
                    🗑
                  </IconButton>
                </Box>
              </Box>
            ))
          )}
        </Box>
      )}
    </Box>
  );
}