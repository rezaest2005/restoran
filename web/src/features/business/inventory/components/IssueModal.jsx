import { useTranslation } from "react-i18next";
import { useState, useEffect, useCallback } from "react";
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Box, Typography, Button, TextField, Select, MenuItem,
  CircularProgress,
} from "@mui/material";
import { createIssue, fetchRawMaterials, fetchStock } from "../api";
import { buildInputSx, buildDialogPaperSx, UNIT_LABELS, useRegisteredShortcuts, dialogBindings, KbdHint } from "../common";

export default function IssueModal({ open, onClose, warehouse, C, isDark, onSuccess, showToast }) {
  const { t } = useTranslation();
  const [materials, setMaterials] = useState([]);
  const [stockItems, setStockItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    raw_material_id: "",
    quantity: "",
    notes: "",
  });

  const notify = useCallback((msg, type = "info") => {
    if (typeof showToast === "function") showToast(msg, type);
  }, [showToast]);

  useEffect(() => {
    if (!open || !warehouse) return;
    const load = async () => {
      setLoading(true);
      try {
        const [mats, stock] = await Promise.all([
          fetchRawMaterials(),
          fetchStock({ warehouse_id: warehouse.id }),
        ]);
        setMaterials(Array.isArray(mats) ? mats : []);
        setStockItems(stock.items || []);
      } catch (err) {
        console.error("Load issue data error:", err);
      } finally {
        setLoading(false);
      }
    };
    load();
    setForm({ raw_material_id: "", quantity: "", notes: "" });
  }, [open, warehouse?.id]);

  const selectedStock = stockItems.find(s => s.raw_material_id == form.raw_material_id);
  const availableQty = selectedStock ? selectedStock.quantity : 0;

  const handleSubmit = async () => {
    if (!form.raw_material_id) {
      notify("کالا را انتخاب کنید", "warning");
      return;
    }
    const qty = parseFloat(form.quantity);
    if (!qty || qty <= 0) {
      notify("مقدار باید بیشتر از صفر باشد", "warning");
      return;
    }
    if (qty > availableQty) {
      notify(`موجودی کافی نیست. موجودی فعلی: ${availableQty}`, "error");
      return;
    }

    setSaving(true);
    try {
      await createIssue({
        warehouse_id: warehouse?.id,
        raw_material_id: form.raw_material_id,
        quantity: qty,
        notes: form.notes.trim(),
      });
      notify("✅ خروج کالا ثبت شد", "success");
      onSuccess && onSuccess();
      onClose();
    } catch (err) {
      notify(err.response?.data?.error || err.message || "خطا در خروج کالا", "error");
    } finally {
      setSaving(false);
    }
  };

  const selectedMaterial = materials.find(m => m.id == form.raw_material_id);

  // ── میان‌برها: Ctrl+D / Enter ثبت · Escape بستن ──
  useRegisteredShortcuts(
    [
      ...dialogBindings(t, { onConfirm: () => { if (!saving && !loading) handleSubmit(); }, onClose }),
    ],
    { enabled: open },
  );

  const inputSx = buildInputSx(C);

  const dialogPaperSx = buildDialogPaperSx(C, isDark);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth slotProps={{ paper: { sx: dialogPaperSx } }}>
      <DialogTitle sx={{ fontSize: 15, fontWeight: 800, color: C.text }}>
        ➖ خروج کالا — {warehouse?.name || ""}
      </DialogTitle>
      <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 1.5, pt: "12px !important" }}>
        {loading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
            <CircularProgress sx={{ color: C.olive }} size={28} />
          </Box>
        ) : (
          <>
            {/* کالا */}
            <Box>
              <Typography sx={{ fontSize: 11, color: C.sub, mb: 0.5 }}>کالا</Typography>
              <Select size="small" fullWidth value={form.raw_material_id}
                onChange={(e) => setForm({ ...form, raw_material_id: e.target.value })}
                sx={{ ...inputSx, fontSize: 13 }} displayEmpty>
                <MenuItem value="" disabled>
                  <Typography sx={{ fontSize: 12, color: C.muted }}>انتخاب کالا...</Typography>
                </MenuItem>
                {stockItems.map(s => {
                  const mat = materials.find(m => m.id == s.raw_material_id);
                  return (
                    <MenuItem key={s.raw_material_id} value={s.raw_material_id}>
                      {s.material_name} (موجودی: {s.quantity})
                    </MenuItem>
                  );
                })}
              </Select>
            </Box>

            {/* موجودی فعلی */}
            {form.raw_material_id && (
              <Box sx={{ p: 1.5, borderRadius: "10px", bgcolor: C.warningBg, border: `1px solid ${C.warning}30` }}>
                <Typography sx={{ fontSize: 11, color: C.sub }}>موجودی فعلی:</Typography>
                <Typography sx={{ fontSize: 16, fontWeight: 800, color: C.warning }}>
                  {availableQty.toLocaleString("fa-IR")} {selectedMaterial?.unit ? UNIT_LABELS[selectedMaterial.unit] || selectedMaterial.unit : ""}
                </Typography>
              </Box>
            )}

            {/* مقدار خروج */}
            <TextField size="small" label="مقدار خروج" type="number" value={form.quantity}
              onChange={(e) => setForm({ ...form, quantity: e.target.value })}
              sx={inputSx} slotProps={{ htmlInput: { min: 0, step: 0.001 } }} />

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
          px: 2.5, color: "var(--on-primary)", background: C.btnGrad, opacity: saving ? 0.6 : 1,
        }}>
          {saving ? "..." : "✅ ثبت خروج"}
          {!saving && <KbdHint>Ctrl+D</KbdHint>}
        </Button>
      </DialogActions>
    </Dialog>
  );
}