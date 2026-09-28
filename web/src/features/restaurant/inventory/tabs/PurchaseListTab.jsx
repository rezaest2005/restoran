import { useState, useEffect, useCallback } from "react";
import {
  Box, Typography, Button, TextField, Select, MenuItem,
  CircularProgress, Chip, IconButton,
} from "@mui/material";
import { fetchPurchaseList, addToPurchaseList, updatePurchaseListStatus, fetchRawMaterials } from "../api";

const STATUS_LABELS = {
  pending: { label: "در انتظار", icon: "⏳", color: "warning", bg: "warningBg" },
  ordered: { label: "سفارش داده شده", icon: "🛒", color: "info", bg: "infoBg" },
  received: { label: "دریافت شده", icon: "✅", color: "olive", bg: "oliveSubtle" },
  cancelled: { label: "لغو شده", icon: "❌", color: "danger", bg: "dangerBg" },
};

const UNIT_LABELS = { kilogram: "کیلو", gram: "گرم", liter: "لیتر", ml: "میلی‌لیتر", count: "عدد", box: "بسته", kg: "کیلو", unit: "واحد" };

export default function PurchaseListTab({ C, isDark, showToast }) {
  const [items, setItems] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [addingOpen, setAddingOpen] = useState(false);

  const [newItem, setNewItem] = useState({ raw_material_id: "", quantity: "" });

  const notify = useCallback((msg, type = "info") => {
    if (typeof showToast === "function") showToast(msg, type);
  }, [showToast]);

  const load = async () => {
    setLoading(true);
    try {
      const [plData, mats] = await Promise.all([
        fetchPurchaseList(),
        fetchRawMaterials(),
      ]);
      setItems(plData.items || []);
      setMaterials(Array.isArray(mats) ? mats : []);
    } catch (err) {
      console.error("Load purchase list error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleAdd = async () => {
    if (!newItem.raw_material_id || !parseFloat(newItem.quantity)) {
      notify("کالا و مقدار الزامی است", "warning");
      return;
    }
    setSaving(true);
    try {
      await addToPurchaseList({
        raw_material_id: newItem.raw_material_id,
        quantity: parseFloat(newItem.quantity),
      });
      notify("✅ آیتم به لیست خرید اضافه شد", "success");
      setNewItem({ raw_material_id: "", quantity: "" });
      setAddingOpen(false);
      load();
    } catch (err) {
      notify(err.response?.data?.error || err.message || "خطا", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (item, newStatus) => {
    try {
      await updatePurchaseListStatus({ id: item.id, status: newStatus });
      const st = STATUS_LABELS[newStatus]?.label || newStatus;
      notify(`✅ وضعیت به «${st}» تغییر کرد`, "success");
      load();
    } catch (err) {
      notify(err.response?.data?.error || err.message || "خطا", "error");
    }
  };

  const filtered = items.filter(i => {
    if (statusFilter !== "all" && i.status !== statusFilter) return false;
    return true;
  });

  const pendingCount = items.filter(i => i.status === "pending").length;
  const orderedCount = items.filter(i => i.status === "ordered").length;

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
      <Box sx={{
        display: "flex", justifyContent: "space-between",
        alignItems: "center", mb: 2.5, flexWrap: "wrap", gap: 1.5,
      }}>
        <Box>
          <Typography sx={{ fontSize: { xs: 16, sm: 18 }, fontWeight: 800, color: C.text }}>
            🛒 لیست خرید
          </Typography>
          <Typography sx={{ fontSize: 12, color: C.sub, mt: 0.3 }}>
            {pendingCount} در انتظار — {orderedCount} سفارش داده شده
          </Typography>
        </Box>
        <Button
          onClick={() => setAddingOpen(!addingOpen)}
          sx={{
            borderRadius: "12px", fontSize: 12, fontWeight: 700, textTransform: "none",
            px: 2.5, py: 1, color: "#fff", background: C.btnGrad,
            boxShadow: `0 4px 20px ${C.olive}30`,
            "&:hover": { transform: "translateY(-1px)", boxShadow: `0 6px 28px ${C.olive}40` },
          }}
        >
          ➕ افزودن به لیست
        </Button>
      </Box>

      {/* ── فرم افزودن (تاشو) ── */}
      {addingOpen && (
        <Box sx={{
          display: "flex", gap: 1, mb: 2.5, p: 2, borderRadius: "14px",
          bgcolor: C.oliveSubtle, border: `1px solid ${C.glassBorder}`,
          flexWrap: "wrap", alignItems: "flex-end",
          opacity: 0,
          animation: "fadeUp 0.3s ease-out forwards",
        }}>
          <Box sx={{ flex: 2, minWidth: 160 }}>
            <Typography sx={{ fontSize: 11, color: C.sub, mb: 0.5 }}>کالا</Typography>
            <Select size="small" fullWidth value={newItem.raw_material_id}
              onChange={(e) => setNewItem({ ...newItem, raw_material_id: e.target.value })}
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
          </Box>

          <Box sx={{ flex: 1, minWidth: 100 }}>
            <Typography sx={{ fontSize: 11, color: C.sub, mb: 0.5 }}>مقدار</Typography>
            <TextField size="small" type="number" placeholder="مقدار" fullWidth
              value={newItem.quantity}
              onChange={(e) => setNewItem({ ...newItem, quantity: e.target.value })}
              sx={inputSx} inputProps={{ min: 0, step: 0.001 }} />
          </Box>

          <Button
            onClick={handleAdd}
            disabled={saving}
            sx={{
              borderRadius: "10px", fontSize: 12, fontWeight: 700, textTransform: "none",
              px: 2.5, py: 1, color: "#fff", background: C.btnGrad,
              opacity: saving ? 0.6 : 1,
            }}
          >
            {saving ? "..." : "✅ افزودن"}
          </Button>
        </Box>
      )}

      {/* ── فیلتر وضعیت ── */}
      <Box sx={{ display: "flex", gap: 1, mb: 2, flexWrap: "wrap" }}>
        <Chip
          clickable label={`📋 همه (${items.length})`}
          onClick={() => setStatusFilter("all")}
          sx={{
            height: 26, fontSize: 11, fontWeight: 600, borderRadius: "8px",
            bgcolor: statusFilter === "all" ? C.oliveSubtle : C.glass,
            color: statusFilter === "all" ? C.olive : C.sub,
            border: `1px solid ${statusFilter === "all" ? C.olive + "40" : C.glassBorder}`,
          }}
        />
        {Object.entries(STATUS_LABELS).map(([key, val]) => {
          const count = items.filter(i => i.status === key).length;
          return (
            <Chip
              key={key} clickable
              label={`${val.icon} ${val.label} (${count})`}
              onClick={() => setStatusFilter(key)}
              sx={{
                height: 26, fontSize: 11, fontWeight: 600, borderRadius: "8px",
                bgcolor: statusFilter === key ? C[val.bg] : C.glass,
                color: statusFilter === key ? C[val.color] : C.sub,
                border: `1px solid ${statusFilter === key ? C[val.color] + "40" : C.glassBorder}`,
              }}
            />
          );
        })}
      </Box>

      {/* ── لیست ── */}
      {filtered.length === 0 ? (
        <Box sx={{ textAlign: "center", py: 8 }}>
          <Typography sx={{ fontSize: 40, mb: 1 }}>🛒</Typography>
          <Typography sx={{ fontSize: 14, fontWeight: 700, color: C.text }}>
            لیست خرید خالی است
          </Typography>
          <Typography sx={{ fontSize: 12, color: C.sub, mt: 0.5 }}>
            با دکمه «افزودن به لیست» شروع کنید
          </Typography>
        </Box>
      ) : (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 0.8 }}>
          {filtered.map((item, i) => {
            const st = STATUS_LABELS[item.status] || STATUS_LABELS.pending;
            const mat = materials.find(m => m.id == item.raw_material_id);
            return (
              <Box
                key={item.id}
                sx={{
                  display: "flex", alignItems: "center", flexWrap: "wrap", gap: 1,
                  px: { xs: 1.5, sm: 2 }, py: { xs: 1, sm: 1.5 },
                  borderRadius: "12px", bgcolor: C.glass, backdropFilter: "blur(12px)",
                  border: `1px solid ${item.status === "received" ? C.olive + "30" : C.glassBorder}`,
                  transition: "all 0.2s ease",
                  opacity: 0,
                  animation: `fadeUp 0.3s ease-out ${i * 0.04}s forwards`,
                  "&:hover": {
                    bgcolor: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.02)",
                  },
                }}
              >
                {/* اطلاعات */}
                <Box sx={{ flex: 1, minWidth: 140 }}>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
                    <Typography sx={{ fontSize: 13, fontWeight: 700, color: C.text }}>
                      {item.material_name}
                    </Typography>
                    <Chip size="small" label={`${st.icon} ${st.label}`} sx={{
                      height: 18, fontSize: 9, fontWeight: 700,
                      borderRadius: "5px", bgcolor: C[st.bg], color: C[st.color],
                    }} />
                  </Box>
                  <Typography sx={{ fontSize: 11, color: C.sub, mt: 0.3 }}>
                    مقدار: {Number(item.quantity).toLocaleString("fa-IR")} {UNIT_LABELS[item.unit] || item.unit}
                    {item.notes ? ` — ${item.notes}` : ""}
                  </Typography>
                </Box>

                {/* اکشن‌ها — تغییر وضعیت */}
                <Box sx={{ display: "flex", gap: 0.5, flexShrink: 0, flexWrap: "wrap" }}>
                  {item.status === "pending" && (
                    <>
                      <Box
                        onClick={() => handleStatusChange(item, "ordered")}
                        sx={{
                          display: "flex", flexDirection: "column", alignItems: "center",
                          gap: 0.3, px: 1, py: 0.5, borderRadius: "8px", cursor: "pointer",
                          color: C.info, transition: "all 0.2s ease",
                          "&:hover": { bgcolor: C.infoBg },
                        }}
                      >
                        <Typography sx={{ fontSize: 14, lineHeight: 1 }}>🛒</Typography>
                        <Typography sx={{ fontSize: 8, fontWeight: 600 }}>سفارش</Typography>
                      </Box>
                      <Box
                        onClick={() => handleStatusChange(item, "cancelled")}
                        sx={{
                          display: "flex", flexDirection: "column", alignItems: "center",
                          gap: 0.3, px: 1, py: 0.5, borderRadius: "8px", cursor: "pointer",
                          color: C.danger, transition: "all 0.2s ease",
                          "&:hover": { bgcolor: C.dangerBg },
                        }}
                      >
                        <Typography sx={{ fontSize: 14, lineHeight: 1 }}>❌</Typography>
                        <Typography sx={{ fontSize: 8, fontWeight: 600 }}>لغو</Typography>
                      </Box>
                    </>
                  )}
                  {item.status === "ordered" && (
                    <>
                      <Box
                        onClick={() => handleStatusChange(item, "received")}
                        sx={{
                          display: "flex", flexDirection: "column", alignItems: "center",
                          gap: 0.3, px: 1, py: 0.5, borderRadius: "8px", cursor: "pointer",
                          color: C.olive, transition: "all 0.2s ease",
                          "&:hover": { bgcolor: C.oliveSubtle },
                        }}
                      >
                        <Typography sx={{ fontSize: 14, lineHeight: 1 }}>✅</Typography>
                        <Typography sx={{ fontSize: 8, fontWeight: 600 }}>دریافت</Typography>
                      </Box>
                      <Box
                        onClick={() => handleStatusChange(item, "cancelled")}
                        sx={{
                          display: "flex", flexDirection: "column", alignItems: "center",
                          gap: 0.3, px: 1, py: 0.5, borderRadius: "8px", cursor: "pointer",
                          color: C.danger, transition: "all 0.2s ease",
                          "&:hover": { bgcolor: C.dangerBg },
                        }}
                      >
                        <Typography sx={{ fontSize: 14, lineHeight: 1 }}>❌</Typography>
                        <Typography sx={{ fontSize: 8, fontWeight: 600 }}>لغو</Typography>
                      </Box>
                    </>
                  )}
                  {(item.status === "received" || item.status === "cancelled") && (
                    <Typography sx={{ fontSize: 10, color: C.muted, px: 1 }}>
                      بسته شده
                    </Typography>
                  )}
                </Box>
              </Box>
            );
          })}
        </Box>
      )}
    </Box>
  );
}