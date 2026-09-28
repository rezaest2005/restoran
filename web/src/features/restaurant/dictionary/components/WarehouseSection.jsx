import { useState, useEffect, useMemo } from "react";
import {
  Box, Typography, Button, TextField, Chip, CircularProgress,
  Dialog, DialogTitle, DialogContent, DialogActions,
  Select, MenuItem,
} from "@mui/material";
import {
  fetchWarehouses,
  saveWarehouse,
  deleteWarehouse,
} from "../api";

const TYPE_OPTIONS = [
  { value: "mother", label: "🏭 انبار مرکزی" },
  { value: "kitchen", label: "🍳 آشپزخانه" },
  { value: "cold_storage", label: "❄️ سردخانه" },
  { value: "freezer", label: "🧊 فریزر" },
  { value: "vegetables", label: "🥬 انبار سبزیجات" },
  { value: "branch", label: "🏪 شعبه" },
  { value: "other", label: "📦 سایر" },
];

export default function WarehouseSection({ C, isDark, showToast }) {
  const [warehouses, setWarehouses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editWarehouse, setEditWarehouse] = useState(null);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    name: "",
    warehouse_type: "other",
    description: "",
  });

  const notify = (msg, type = "info") => {
    if (typeof showToast === "function") showToast(msg, type);
  };

  const load = async () => {
    setLoading(true);
    try {
      const data = await fetchWarehouses();
      setWarehouses(data.warehouses || []);
    } catch (err) {
      console.error("Fetch warehouses error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return warehouses;
    const q = search.toLowerCase();
    return warehouses.filter(w =>
      w.name?.toLowerCase().includes(q) ||
      w.warehouse_type?.includes(q)
    );
  }, [warehouses, search]);

  const openCreate = () => {
    setEditWarehouse(null);
    setForm({ name: "", warehouse_type: "other", description: "" });
    setFormOpen(true);
  };

  const openEdit = (w) => {
    setEditWarehouse(w);
    setForm({
      name: w.name || "",
      warehouse_type: w.warehouse_type || "other",
      description: w.description || "",
    });
    setFormOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      notify("نام انبار الزامی است", "warning");
      return;
    }
    if (saving) return;
    setSaving(true);
    try {
      const payload = {
        id: editWarehouse?.id,
        name: form.name.trim(),
        warehouse_type: form.warehouse_type,
        description: form.description.trim(),
      };
      const res = await saveWarehouse(payload);
      notify(res.msg || "ذخیره شد", "success");
      setFormOpen(false);
      setEditWarehouse(null);
      load();
    } catch (err) {
      notify(err.response?.data?.error || err.message || "خطا", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (w) => {
    if (!window.confirm(`«${w.name}» غیرفعال شود؟`)) return;
    try {
      await deleteWarehouse({ id: w.id });
      notify(`«${w.name}» غیرفعال شد`, "success");
      load();
    } catch (err) {
      notify(err.response?.data?.error || err.message || "خطا", "error");
    }
  };

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
      {/* هدر */}
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2.5, flexWrap: "wrap", gap: 1.5 }}>
        <Box>
          <Typography sx={{ fontSize: { xs: 16, sm: 18 }, fontWeight: 800, color: C.text }}>
            📦 انبارها
          </Typography>
          <Typography sx={{ fontSize: 12, color: C.sub, mt: 0.3 }}>
            تعریف انبارها — هر رستوران یک انبار مرکزی دارد
          </Typography>
        </Box>
        <Button
          onClick={openCreate}
          sx={{
            borderRadius: "12px", fontSize: 12, fontWeight: 700, textTransform: "none",
            px: 2.5, py: 1, color: "#fff", background: C.btnGrad,
            boxShadow: `0 4px 20px ${C.olive}30`,
            "&:hover": { transform: "translateY(-1px)", boxShadow: `0 6px 28px ${C.olive}40` },
          }}
        >
          ➕ انبار جدید
        </Button>
      </Box>

      {/* جستجو */}
      <TextField
        size="small"
        placeholder="جستجو انبار..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        sx={{ ...inputSx, width: "100%", maxWidth: 300, mb: 2 }}
      />

      {/* لیست */}
      {filtered.length === 0 ? (
        <Box sx={{ textAlign: "center", py: 6 }}>
          <Typography sx={{ fontSize: 36, mb: 1 }}>📦</Typography>
          <Typography sx={{ fontSize: 14, fontWeight: 700, color: C.text }}>
            هنوز انباری تعریف نشده
          </Typography>
          <Typography sx={{ fontSize: 12, color: C.sub, mt: 0.5 }}>
            انبار مرکزی به‌صورت خودکار ساخته می‌شود
          </Typography>
        </Box>
      ) : (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 0.8 }}>
          {filtered.map((w, i) => (
            <Box
              key={w.id}
              sx={{
                display: "flex", alignItems: "center", flexWrap: "wrap", gap: 1,
                px: { xs: 1.5, sm: 2 }, py: { xs: 1, sm: 1.5 },
                borderRadius: "12px", bgcolor: C.glass, backdropFilter: "blur(12px)",
                border: `1px solid ${w.is_mother ? C.olive + "40" : C.glassBorder}`,
                transition: "all 0.2s ease",
                opacity: 0,
                animation: `fadeUp 0.35s ease-out ${i * 0.04}s forwards`,
                "&:hover": { bgcolor: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.02)" },
              }}
            >
              <Box sx={{ flex: 1, minWidth: 140 }}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
                  <Typography sx={{ fontSize: 13, fontWeight: 700, color: C.text }}>
                    {w.name}
                  </Typography>
                  {w.is_mother && (
                    <Chip size="small" label="مرکزی" sx={{
                      height: 18, fontSize: 9, fontWeight: 600,
                      borderRadius: "5px", bgcolor: C.olive, color: "#fff",
                    }} />
                  )}
                  <Chip
                    size="small"
                    label={w.warehouse_type_display || w.warehouse_type}
                    sx={{
                      height: 18, fontSize: 9, fontWeight: 600,
                      borderRadius: "5px", bgcolor: C.oliveSubtle, color: C.olive,
                    }}
                  />
                </Box>
                <Box sx={{ display: "flex", gap: 1, mt: 0.5 }}>
                  <Typography sx={{ fontSize: 11, color: C.sub }}>
                    📦 {w.stock_count || 0} قلم کالا
                  </Typography>
                  {w.description && (
                    <Typography sx={{ fontSize: 11, color: C.muted }}>
                      {w.description}
                    </Typography>
                  )}
                </Box>
              </Box>

              <Box sx={{ display: "flex", gap: 0.5, flexShrink: 0 }}>
                <Box
                  onClick={() => openEdit(w)}
                  sx={{
                    display: "flex", flexDirection: "column", alignItems: "center",
                    gap: 0.3, px: 1, py: 0.5, borderRadius: "8px", cursor: "pointer",
                    color: C.olive, transition: "all 0.2s ease",
                    "&:hover": { bgcolor: C.oliveSubtle },
                  }}
                >
                  <Typography sx={{ fontSize: 14, lineHeight: 1 }}>✏️</Typography>
                  <Typography sx={{ fontSize: 8, fontWeight: 600 }}>ویرایش</Typography>
                </Box>
                {!w.is_mother && (
                  <Box
                    onClick={() => handleDelete(w)}
                    sx={{
                      display: "flex", flexDirection: "column", alignItems: "center",
                      gap: 0.3, px: 1, py: 0.5, borderRadius: "8px", cursor: "pointer",
                      color: C.danger, transition: "all 0.2s ease",
                      "&:hover": { bgcolor: C.dangerBg },
                    }}
                  >
                    <Typography sx={{ fontSize: 14, lineHeight: 1 }}>🗑️</Typography>
                    <Typography sx={{ fontSize: 8, fontWeight: 600 }}>حذف</Typography>
                  </Box>
                )}
              </Box>
            </Box>
          ))}
        </Box>
      )}

      {/* دیالوگ ایجاد/ویرایش */}
      <Dialog
        open={formOpen}
        onClose={() => setFormOpen(false)}
        maxWidth="xs"
        fullWidth
        slotProps={{ paper: { sx: dialogPaperSx } }}
      >
        <DialogTitle sx={{ fontSize: 15, fontWeight: 800, color: C.text }}>
          {editWarehouse ? `✏️ ویرایش ${editWarehouse.name}` : "➕ انبار جدید"}
        </DialogTitle>
        <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 1.5, pt: "12px !important" }}>
          <TextField
            size="small" label="نام انبار *"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            sx={inputSx}
          />
          <Box>
            <Typography sx={{ fontSize: 11, color: C.sub, mb: 0.5 }}>نوع انبار</Typography>
            <Select
              size="small" fullWidth
              value={form.warehouse_type}
              onChange={(e) => setForm({ ...form, warehouse_type: e.target.value })}
              sx={{ ...inputSx, fontSize: 13 }}
            >
              {TYPE_OPTIONS.map((t) => (
                <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>
              ))}
            </Select>
          </Box>
          <TextField
            size="small" label="توضیحات"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            multiline rows={2}
            sx={inputSx}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button
            onClick={() => setFormOpen(false)}
            sx={{ borderRadius: "10px", fontSize: 12, textTransform: "none", color: C.sub }}
          >
            انصراف
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving}
            sx={{
              borderRadius: "10px", fontSize: 12, fontWeight: 700, textTransform: "none",
              px: 2.5, color: "#fff", background: C.btnGrad, opacity: saving ? 0.6 : 1,
            }}
          >
            {saving ? "..." : editWarehouse ? "بروزرسانی" : "ایجاد"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}