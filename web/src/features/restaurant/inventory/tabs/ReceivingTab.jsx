import { useState, useEffect, useCallback } from "react";
import {
  Box, Typography, Button, TextField, Select, MenuItem,
  CircularProgress, Chip, Dialog, DialogTitle, DialogContent,
} from "@mui/material";
import { fetchWarehouseMovements, fetchWarehouses } from "../api";
import ReceiveModal from "../components/ReceiveModal";
import IssueModal from "../components/IssueModal";
import WasteModal from "../components/WasteModal";

const TYPE_FILTERS = [
  { value: "all", label: "همه", icon: "📋" },
  { value: "receive", label: "ورود", icon: "📥" },
  { value: "issue", label: "خروج", icon: "📤" },
  { value: "waste", label: "ضایعات", icon: "🗑" },
  { value: "transfer", label: "انتقال", icon: "🔄" },
];

const TYPE_COLORS = {
  receive: { bg: "oliveSubtle", color: "olive", label: "ورود", icon: "📥" },
  issue: { bg: "warningBg", color: "warning", label: "خروج", icon: "📤" },
  waste: { bg: "dangerBg", color: "danger", label: "ضایعات", icon: "🗑" },
  transfer: { bg: "infoBg", color: "info", label: "انتقال", icon: "🔄" },
  adjustment: { bg: "oliveSubtle", color: "olive", label: "اصلاح", icon: "✏️" },
};

const WASTE_REASONS = {
  spoiled: "خراب شده",
  expired: "تاریخ گذشته",
  damaged: "آسیب‌دیده",
  spillage: "ریخته شده",
  quality: "کیفیت نامناسب",
  other: "سایر",
};

function formatDate(dateStr) {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString("fa-IR") + " " + d.toLocaleTimeString("fa-IR", { hour: "2-digit", minute: "2-digit" });
  } catch { return dateStr; }
}

export default function ReceivingTab({ C, isDark, showToast }) {
  const [movements, setMovements] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [warehouseFilter, setWarehouseFilter] = useState("");
  const [detailOpen, setDetailOpen] = useState(null);

  // Modals
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [issueOpen, setIssueOpen] = useState(false);
  const [wasteOpen, setWasteOpen] = useState(false);
  const [selectedWarehouse, setSelectedWarehouse] = useState(null);

  const notify = useCallback((msg, type = "info") => {
    if (typeof showToast === "function") showToast(msg, type);
  }, [showToast]);

  const load = async () => {
    setLoading(true);
    try {
      const [movData, whData] = await Promise.all([
        fetchWarehouseMovements({}),
        fetchWarehouses(),
      ]);
      setMovements(movData.movements || []);
      const whList = whData.warehouses || [];
      setWarehouses(whList);

      // انبار پیش‌فرض برای Modalها
      const mother = whList.find(w => w.is_mother) || whList[0];
      if (mother) setSelectedWarehouse(mother);
    } catch (err) {
      console.error("Load movements error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const filtered = movements.filter(m => {
    if (typeFilter !== "all" && m.movement_type !== typeFilter) return false;
    if (warehouseFilter && m.warehouse_id != warehouseFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        m.material_name?.toLowerCase().includes(q) ||
        m.notes?.toLowerCase().includes(q) ||
        m.supplier_name?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const handleSuccess = () => load();

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

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
        <CircularProgress sx={{ color: C.olive }} size={36} />
      </Box>
    );
  }

  return (
    <Box>
      {/* ── هدر + دکمه‌ها ── */}
      <Box sx={{
        display: "flex", justifyContent: "space-between",
        alignItems: "center", mb: 2.5, flexWrap: "wrap", gap: 1.5,
      }}>
        <Box>
          <Typography sx={{ fontSize: { xs: 16, sm: 18 }, fontWeight: 800, color: C.text }}>
            🚚 تحویل بار — تاریخچه حرکات
          </Typography>
          <Typography sx={{ fontSize: 12, color: C.sub, mt: 0.3 }}>
            {filtered.length} رکورد
          </Typography>
        </Box>

        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
          <Button
            onClick={() => setReceiveOpen(true)}
            sx={{
              borderRadius: "10px", fontSize: 11, fontWeight: 700,
              textTransform: "none", px: 2, py: 0.8,
              color: "#fff", background: C.btnGrad,
              "&:hover": { transform: "translateY(-1px)" },
            }}
          >
            ➕ ورود کالا
          </Button>
          <Button
            onClick={() => setIssueOpen(true)}
            sx={{
              borderRadius: "10px", fontSize: 11, fontWeight: 700,
              textTransform: "none", px: 2, py: 0.8,
              color: C.warning, bgcolor: C.warningBg,
              border: `1px solid ${C.warning}30`,
            }}
          >
            ➖ خروج
          </Button>
          <Button
            onClick={() => setWasteOpen(true)}
            sx={{
              borderRadius: "10px", fontSize: 11, fontWeight: 700,
              textTransform: "none", px: 2, py: 0.8,
              color: C.danger, bgcolor: C.dangerBg,
              border: `1px solid ${C.danger}30`,
            }}
          >
            🗑 ضایعات
          </Button>
        </Box>
      </Box>

      {/* ── فیلترها ── */}
      <Box sx={{ display: "flex", gap: 1, mb: 2, flexWrap: "wrap", alignItems: "center" }}>
        {/* فیلتر نوع */}
        {TYPE_FILTERS.map(tf => (
          <Chip
            key={tf.value}
            clickable
            label={`${tf.icon} ${tf.label}`}
            onClick={() => setTypeFilter(tf.value)}
            sx={{
              height: 26, fontSize: 11, fontWeight: 600, borderRadius: "8px",
              bgcolor: typeFilter === tf.value ? C.oliveSubtle : C.glass,
              color: typeFilter === tf.value ? C.olive : C.sub,
              border: `1px solid ${typeFilter === tf.value ? C.olive + "40" : C.glassBorder}`,
              "&:hover": { bgcolor: C.oliveSubtle },
            }}
          />
        ))}

        <Box sx={{ flex: 1 }} />

        {/* فیلتر انبار */}
        <Select
          size="small"
          value={warehouseFilter}
          onChange={(e) => setWarehouseFilter(e.target.value)}
          displayEmpty
          sx={{ ...inputSx, fontSize: 12, minWidth: 140 }}
        >
          <MenuItem value="">همه انبارها</MenuItem>
          {warehouses.map(w => (
            <MenuItem key={w.id} value={w.id}>{w.name}</MenuItem>
          ))}
        </Select>

        {/* جستجو */}
        <TextField
          size="small"
          placeholder="جستجو..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          sx={{ ...inputSx, width: 180 }}
        />
      </Box>

      {/* ── لیست حرکات ── */}
      {filtered.length === 0 ? (
        <Box sx={{ textAlign: "center", py: 8 }}>
          <Typography sx={{ fontSize: 40, mb: 1 }}>🚚</Typography>
          <Typography sx={{ fontSize: 14, fontWeight: 700, color: C.text }}>
            هیچ رکوردی یافت نشد
          </Typography>
          <Typography sx={{ fontSize: 12, color: C.sub, mt: 0.5 }}>
            با دکمه‌های بالا عملیات جدید ثبت کنید
          </Typography>
        </Box>
      ) : (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 0.6 }}>
          {/* هدر جدول */}
          <Box sx={{
            display: "flex", px: 2, py: 1,
            borderRadius: "8px", bgcolor: C.oliveSubtle,
            fontSize: 10, fontWeight: 700, color: C.sub,
          }}>
            <Box sx={{ width: 50 }}>نوع</Box>
            <Box sx={{ flex: 1.5 }}>تاریخ</Box>
            <Box sx={{ flex: 1.5 }}>کالا</Box>
            <Box sx={{ flex: 1, textAlign: "center" }}>مقدار</Box>
            <Box sx={{ flex: 1, textAlign: "center" }}>ارزش</Box>
            <Box sx={{ flex: 1 }}>انبار</Box>
            <Box sx={{ width: 60 }} />
          </Box>

          {filtered.map((m, i) => {
            const tc = TYPE_COLORS[m.movement_type] || TYPE_COLORS.adjustment;
            return (
              <Box
                key={m.id || i}
                onClick={() => setDetailOpen(m)}
                sx={{
                  display: "flex", alignItems: "center",
                  px: 2, py: 1.2, borderRadius: "10px",
                  bgcolor: C.glass, backdropFilter: "blur(12px)",
                  border: `1px solid ${C.glassBorder}`,
                  cursor: "pointer",
                  transition: "all 0.2s ease",
                  opacity: 0,
                  animation: `fadeUp 0.3s ease-out ${i * 0.02}s forwards`,
                  "&:hover": {
                    bgcolor: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.02)",
                    borderColor: C[tc.color] + "40",
                  },
                }}
              >
                {/* نوع */}
                <Box sx={{ width: 50 }}>
                  <Chip size="small" label={`${tc.icon} ${tc.label}`} sx={{
                    height: 18, fontSize: 8, fontWeight: 700,
                    borderRadius: "5px", bgcolor: C[tc.bg], color: C[tc.color],
                  }} />
                </Box>

                {/* تاریخ */}
                <Box sx={{ flex: 1.5 }}>
                  <Typography sx={{ fontSize: 11, color: C.sub }}>
                    {formatDate(m.created_at)}
                  </Typography>
                </Box>

                {/* کالا */}
                <Box sx={{ flex: 1.5, minWidth: 0 }}>
                  <Typography sx={{
                    fontSize: 12, fontWeight: 700, color: C.text,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {m.material_name}
                  </Typography>
                </Box>

                {/* مقدار */}
                <Box sx={{ flex: 1, textAlign: "center" }}>
                  <Typography sx={{
                    fontSize: 13, fontWeight: 700,
                    color: m.movement_type === "receive" ? C.olive :
                           m.movement_type === "waste" ? C.danger :
                           m.movement_type === "issue" ? C.warning : C.text,
                  }}>
                    {m.movement_type === "receive" ? "+" : "-"}
                    {Math.abs(Number(m.quantity)).toLocaleString("fa-IR")}
                  </Typography>
                </Box>

                {/* ارزش */}
                <Box sx={{ flex: 1, textAlign: "center" }}>
                  <Typography sx={{ fontSize: 11, color: C.sub, fontWeight: 600 }}>
                    {Number(m.total_value || 0).toLocaleString("fa-IR")}
                  </Typography>
                </Box>

                {/* انبار */}
                <Box sx={{ flex: 1 }}>
                  <Typography sx={{
                    fontSize: 11, color: C.muted,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {m.warehouse_name}
                  </Typography>
                </Box>

                {/* جزئیات */}
                <Box sx={{ width: 60, textAlign: "center" }}>
                  <Typography sx={{ fontSize: 9, color: C.olive, fontWeight: 600 }}>
                    جزئیات ←
                  </Typography>
                </Box>
              </Box>
            );
          })}
        </Box>
      )}

      {/* ── دیالوگ جزئیات ── */}
      <Dialog
        open={!!detailOpen}
        onClose={() => setDetailOpen(null)}
        maxWidth="xs"
        fullWidth
        slotProps={{ paper: { sx: dialogPaperSx } }}
      >
        <DialogTitle sx={{ fontSize: 15, fontWeight: 800, color: C.text }}>
          {TYPE_COLORS[detailOpen?.movement_type]?.icon || "📋"} جزئیات حرکت
        </DialogTitle>
        <DialogContent sx={{ pt: "12px !important" }}>
          {detailOpen && (
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
              {[
                { label: "نوع", value: TYPE_COLORS[detailOpen.movement_type]?.label },
                { label: "تاریخ", value: formatDate(detailOpen.created_at) },
                { label: "کالا", value: detailOpen.material_name },
                { label: "مقدار", value: `${Math.abs(Number(detailOpen.quantity))}` },
                { label: "واحد", value: detailOpen.material_unit_display || "" },
                { label: "انبار", value: detailOpen.warehouse_name },
                { label: "قیمت واحد", value: Number(detailOpen.unit_price || 0).toLocaleString("fa-IR") + " تومان" },
                { label: "ارزش کل", value: Number(detailOpen.total_value || 0).toLocaleString("fa-IR") + " تومان" },
                detailOpen.supplier_name ? { label: "تأمین‌کننده", value: detailOpen.supplier_name } : null,
                detailOpen.waste_reason ? { label: "دلیل ضایعات", value: WASTE_REASONS[detailOpen.waste_reason] || detailOpen.waste_reason } : null,
                detailOpen.notes ? { label: "توضیحات", value: detailOpen.notes } : null,
              ].filter(Boolean).map((row, idx) => (
                <Box key={idx} sx={{
                  display: "flex", justifyContent: "space-between",
                  py: 0.5, borderBottom: idx < 7 ? `1px solid ${C.glassBorder}` : "none",
                }}>
                  <Typography sx={{ fontSize: 12, color: C.sub }}>{row.label}</Typography>
                  <Typography sx={{ fontSize: 12, fontWeight: 700, color: C.text, textAlign: "left" }}>
                    {row.value}
                  </Typography>
                </Box>
              ))}
            </Box>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Modals ── */}
      <ReceiveModal
        open={receiveOpen}
        onClose={() => setReceiveOpen(false)}
        warehouse={selectedWarehouse}
        C={C} isDark={isDark}
        onSuccess={handleSuccess}
        showToast={showToast}
      />
      <IssueModal
        open={issueOpen}
        onClose={() => setIssueOpen(false)}
        warehouse={selectedWarehouse}
        C={C} isDark={isDark}
        onSuccess={handleSuccess}
        showToast={showToast}
      />
      <WasteModal
        open={wasteOpen}
        onClose={() => setWasteOpen(false)}
        warehouse={selectedWarehouse}
        C={C} isDark={isDark}
        onSuccess={handleSuccess}
        showToast={showToast}
      />
    </Box>
  );
}