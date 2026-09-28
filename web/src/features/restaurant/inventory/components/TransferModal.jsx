import { useState, useEffect, useCallback } from "react";
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Box, Typography, Button, TextField, Select, MenuItem, CircularProgress,
} from "@mui/material";
import {
  createTransfer,
  fetchRawMaterials,
  fetchStock,
} from "../api";

export default function TransferModal({ open, onClose, warehouses, C, isDark, onSuccess, showToast }) {
  const [materials, setMaterials] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    source_warehouse_id: "",
    destination_warehouse_id: "",
    raw_material_id: "",
    quantity: "",
    notes: "",
  });

  const [sourceStock, setSourceStock] = useState(0);

  const notify = useCallback((msg, type = "info") => {
    if (typeof showToast === "function") showToast(msg, type);
  }, [showToast]);

  // ── لود مواد اولیه ──
  useEffect(() => {
    if (!open) return;
    const load = async () => {
      setLoading(true);
      try {
        const mats = await fetchRawMaterials();
        setMaterials(Array.isArray(mats) ? mats : []);
      } catch (err) {
        console.error("Load materials error:", err);
      } finally {
        setLoading(false);
      }
    };
    load();
    // ریست فرم
    setForm({
      source_warehouse_id: warehouses.find(w => w.is_mother)?.id || warehouses[0]?.id || "",
      destination_warehouse_id: "",
      raw_material_id: "",
      quantity: "",
      notes: "",
    });
    setSourceStock(0);
  }, [open]);

  // ── بررسی موجودی مبدأ ──
  useEffect(() => {
    if (!form.source_warehouse_id || !form.raw_material_id) {
      setSourceStock(0);
      return;
    }
    const checkStock = async () => {
      try {
        const data = await fetchStock({
          warehouse_id: form.source_warehouse_id,
        });
        const item = (data.items || []).find(
          s => s.raw_material_id == form.raw_material_id
        );
        setSourceStock(item ? item.quantity : 0);
      } catch {
        setSourceStock(0);
      }
    };
    checkStock();
  }, [form.source_warehouse_id, form.raw_material_id]);

  const handleSubmit = async () => {
    if (!form.source_warehouse_id || !form.destination_warehouse_id || !form.raw_material_id) {
      notify("انبار مبدأ، مقصد و کالا الزامی است", "warning");
      return;
    }
    if (form.source_warehouse_id === form.destination_warehouse_id) {
      notify("انبار مبدأ و مقصد نمی‌توانند یکسان باشند", "warning");
      return;
    }
    const qty = parseFloat(form.quantity);
    if (!qty || qty <= 0) {
      notify("مقدار باید بیشتر از صفر باشد", "warning");
      return;
    }
    if (qty > sourceStock) {
      notify(`موجودی کافی نیست. موجودی فعلی: ${sourceStock}`, "error");
      return;
    }

    setSaving(true);
    try {
      const result = await createTransfer({
        source_warehouse_id: form.source_warehouse_id,
        destination_warehouse_id: form.destination_warehouse_id,
        raw_material_id: form.raw_material_id,
        quantity: qty,
        notes: form.notes,
      });
      notify("✅ انتقال با موفقیت انجام شد", "success");
      onSuccess && onSuccess();
      onClose();
    } catch (err) {
      notify(err.response?.data?.error || err.message || "خطا در انتقال", "error");
    } finally {
      setSaving(false);
    }
  };

  const sourceWarehouse = warehouses.find(w => w.id == form.source_warehouse_id);
  const destWarehouse = warehouses.find(w => w.id == form.destination_warehouse_id);
  const selectedMaterial = materials.find(m => m.id == form.raw_material_id);

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

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="xs"
      fullWidth
      slotProps={{ paper: { sx: dialogPaperSx } }}
    >
      <DialogTitle sx={{ fontSize: 15, fontWeight: 800, color: C.text }}>
        🔄 انتقال کالا
      </DialogTitle>
      <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 1.5, pt: "12px !important" }}>
        {loading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
            <CircularProgress sx={{ color: C.olive }} size={28} />
          </Box>
        ) : (
          <>
            {/* انبار مبدأ */}
            <Box>
              <Typography sx={{ fontSize: 11, color: C.sub, mb: 0.5 }}>
                از انبار:
              </Typography>
              <Select
                size="small" fullWidth
                value={form.source_warehouse_id}
                onChange={(e) => setForm({ ...form, source_warehouse_id: e.target.value })}
                sx={{ ...inputSx, fontSize: 13 }}
              >
                {warehouses.map(w => (
                  <MenuItem key={w.id} value={w.id}>
                    {w.name} {w.is_mother ? "(مرکزی)" : ""}
                  </MenuItem>
                ))}
              </Select>
            </Box>

            {/* انبار مقصد */}
            <Box>
              <Typography sx={{ fontSize: 11, color: C.sub, mb: 0.5 }}>
                به انبار:
              </Typography>
              <Select
                size="small" fullWidth
                value={form.destination_warehouse_id}
                onChange={(e) => setForm({ ...form, destination_warehouse_id: e.target.value })}
                sx={{ ...inputSx, fontSize: 13 }}
                displayEmpty
              >
                <MenuItem value="" disabled>
                  <Typography sx={{ fontSize: 12, color: C.muted }}>
                    انتخاب انبار مقصد...
                  </Typography>
                </MenuItem>
                {warehouses
                  .filter(w => w.id !== form.source_warehouse_id)
                  .map(w => (
                    <MenuItem key={w.id} value={w.id}>
                      {w.name} {w.is_mother ? "(مرکزی)" : ""}
                    </MenuItem>
                  ))}
              </Select>
            </Box>

            {/* کالا */}
            <Box>
              <Typography sx={{ fontSize: 11, color: C.sub, mb: 0.5 }}>
                کالا:
              </Typography>
              <Select
                size="small" fullWidth
                value={form.raw_material_id}
                onChange={(e) => setForm({ ...form, raw_material_id: e.target.value })}
                sx={{ ...inputSx, fontSize: 13 }}
                displayEmpty
              >
                <MenuItem value="" disabled>
                  <Typography sx={{ fontSize: 12, color: C.muted }}>
                    انتخاب کالا...
                  </Typography>
                </MenuItem>
                {materials.map(m => (
                  <MenuItem key={m.id} value={m.id}>
                    {m.name}
                  </MenuItem>
                ))}
              </Select>
            </Box>

            {/* موجودی فعلی */}
            {form.raw_material_id && (
              <Box sx={{
                p: 1.5, borderRadius: "10px",
                bgcolor: C.oliveSubtle,
                border: `1px solid ${C.olive}20`,
              }}>
                <Typography sx={{ fontSize: 11, color: C.sub }}>
                  موجودی فعلی مبدأ:
                </Typography>
                <Typography sx={{ fontSize: 16, fontWeight: 800, color: C.olive }}>
                  {sourceStock.toLocaleString("fa-IR")} {selectedMaterial?.unit || ""}
                </Typography>
              </Box>
            )}

            {/* مقدار انتقال */}
            <TextField
              size="small"
              label="مقدار انتقال"
              type="number"
              value={form.quantity}
              onChange={(e) => setForm({ ...form, quantity: e.target.value })}
              sx={inputSx}
              inputProps={{ min: 0, step: 0.001 }}
            />

            {/* توضیحات */}
            <TextField
              size="small"
              label="توضیحات (اختیاری)"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              multiline
              rows={2}
              sx={inputSx}
            />

            {/* خلاصه تأیید */}
            {form.source_warehouse_id && form.destination_warehouse_id && form.raw_material_id && form.quantity && (
              <Box sx={{
                p: 1.5, borderRadius: "10px",
                bgcolor: C.infoBg, border: `1px solid ${C.info}30`,
              }}>
                <Typography sx={{ fontSize: 11, fontWeight: 700, color: C.info, mb: 0.5 }}>
                  📋 خلاصه انتقال
                </Typography>
                <Typography sx={{ fontSize: 11, color: C.sub }}>
                  {parseFloat(form.quantity).toLocaleString("fa-IR")} {selectedMaterial?.unit || ""}
                  {" "}«{selectedMaterial?.name || ""}»
                  {" "}از «{sourceWarehouse?.name || ""}»
                  {" "}به «{destWarehouse?.name || ""}»
                </Typography>
              </Box>
            )}
          </>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button
          onClick={onClose}
          sx={{ borderRadius: "10px", fontSize: 12, textTransform: "none", color: C.sub }}
        >
          انصراف
        </Button>
        <Button
          onClick={handleSubmit}
          disabled={saving || loading}
          sx={{
            borderRadius: "10px", fontSize: 12, fontWeight: 700,
            textTransform: "none", px: 2.5,
            color: "#fff", background: C.btnGrad,
            opacity: saving ? 0.6 : 1,
          }}
        >
          {saving ? "..." : "✅ تأیید انتقال"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}