import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  Box, Typography, Button, TextField, Select, MenuItem,
  CircularProgress, Chip, Dialog, DialogTitle, DialogContent,
} from "@mui/material";
import { fetchMovementList, fetchWarehouses } from "../api";
import ReceiveModal from "../components/ReceiveModal";
import IssueModal from "../components/IssueModal";
import WasteModal from "../components/WasteModal";
import { buildInputSx, buildDialogPaperSx, useRowCursor, cursorAttrs, cursorSx, cursorBindings, useRegisteredShortcuts, onEnter, KbdHint } from "../common";
import { soft } from "@shared/ui/colorUtil";

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

const PAGE_SIZE = 100;

// جهت حرکت: +1 ورود، -1 خروج/ضایعات، تعدیل بر اساس تغییر موجودی
const directionOf = (m) => {
  if (m.movement_type === "in") return 1;
  if (m.movement_type === "adjustment") return Number(m.new_stock) >= Number(m.previous_stock) ? 1 : -1;
  return -1;
};

function formatDate(dateStr) {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString("fa-IR") + " " + d.toLocaleTimeString("fa-IR", { hour: "2-digit", minute: "2-digit" });
  } catch { return dateStr; }
}

export default function ReceivingTab({ C, isDark, showToast }) {
  const { t } = useTranslation();
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
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);

  const notify = useCallback((msg, type = "info") => {
    if (typeof showToast === "function") showToast(msg, type);
  }, [showToast]);

  // انبار هدف Modalها: انبار انتخاب‌شده در فیلتر، وگرنه انبار مرکزی
  const selectedWarehouse =
    warehouses.find(w => String(w.id) === String(warehouseFilter)) ||
    warehouses.find(w => w.is_mother) || warehouses[0] || null;

  const load = async () => {
    setLoading(true);
    try {
      const [movData, whData] = await Promise.all([
        fetchMovementList({ page: 1, page_size: PAGE_SIZE }),
        fetchWarehouses(),
      ]);
      setMovements(movData.results || []);
      setPage(1);
      setPages(movData.pages || 1);
      setWarehouses(whData.warehouses || []);
    } catch (err) {
      console.error("Load movements error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const next = page + 1;
      const data = await fetchMovementList({ page: next, page_size: PAGE_SIZE });
      setMovements(prev => [...prev, ...(data.results || [])]);
      setPage(next);
      setPages(data.pages || next);
    } catch (err) {
      console.error("Load more movements error:", err);
    } finally {
      setLoadingMore(false);
    }
  };

  const filtered = movements.filter(m => {
    if (typeFilter !== "all" && m.kind !== typeFilter) return false;
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

  // ── میان‌برها: F2 ورود کالا · F3 خروج · F4 ضایعات · Ctrl+A/Z ردیف · Enter جزئیات ──
  const cursor = useRowCursor(filtered.length);
  useRegisteredShortcuts([
    { combo: "F2", label: t("ui_h.receiving.receive"), handler: () => setReceiveOpen(true) },
    { combo: "F3", label: t("ui_h.receiving.issue"), handler: () => setIssueOpen(true) },
    { combo: "F4", label: t("ui_h.receiving.waste"), handler: () => setWasteOpen(true) },
    ...cursorBindings(t, cursor),
    {
      combo: "Enter", label: t("ui_h.show_details"),
      handler: onEnter(() => { const r = filtered[cursor.index]; if (!r) return false; setDetailOpen(r); }),
    },
  ]);
  useRegisteredShortcuts(
    [
      { combo: "Enter", label: t("shortcuts.close_dialog"), handler: onEnter(() => setDetailOpen(null)), scope: "dialog", allowInInput: true },
      { combo: "Escape", label: t("shortcuts.close_dialog"), handler: () => setDetailOpen(null), scope: "dialog" },
    ],
    { enabled: !!detailOpen },
  );

  const inputSx = buildInputSx(C);

  const dialogPaperSx = buildDialogPaperSx(C, isDark);

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
              color: "var(--on-primary)", background: C.btnGrad,
              "&:hover": { transform: "translateY(-1px)" },
            }}
          >
            ➕ ورود کالا<KbdHint>F2</KbdHint>
          </Button>
          <Button
            onClick={() => setIssueOpen(true)}
            sx={{
              borderRadius: "10px", fontSize: 11, fontWeight: 700,
              textTransform: "none", px: 2, py: 0.8,
              color: C.warning, bgcolor: C.warningBg,
              border: `1px solid ${soft(C.warning, "30")}`,
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
              border: `1px solid ${soft(C.danger, "30")}`,
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
              border: `1px solid ${typeFilter === tf.value ? soft(C.olive, "40") : C.glassBorder}`,
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
            const tc = TYPE_COLORS[m.kind] || TYPE_COLORS.adjustment;
            return (
              <Box
                key={m.id || i}
                onClick={() => setDetailOpen(m)}
                {...cursorAttrs(cursor.isActive(i))}
                sx={{
                  ...cursorSx(C, cursor.isActive(i)),
                  display: "flex", alignItems: "center",
                  px: 2, py: 1.2, borderRadius: "10px",
                  bgcolor: C.glass,                  border: `1px solid ${C.glassBorder}`,
                  cursor: "pointer",
                  transition: "all 0.2s ease",
                  opacity: 0,
                  animation: `fadeUp 0.3s ease-out ${i * 0.02}s forwards`,
                  "&:hover": {
                    bgcolor: isDark ? "var(--surface-sunken)" : "color-mix(in srgb, var(--ink) 2%, transparent)",
                    borderColor: soft(C[tc.color], "40"),
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
                    color: m.kind === "receive" ? C.olive :
                           m.kind === "waste" ? C.danger :
                           m.kind === "issue" ? C.warning : C.text,
                  }}>
                    {directionOf(m) > 0 ? "+" : "-"}
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
          {page < pages && (
            <Button onClick={loadMore} disabled={loadingMore} sx={{
              alignSelf: "center", mt: 1, borderRadius: "10px", fontSize: 12,
              fontWeight: 600, textTransform: "none", color: C.olive,
            }}>
              {loadingMore ? "..." : t("ui_j.receiving.load_more")}
            </Button>
          )}
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
          {TYPE_COLORS[detailOpen?.kind]?.icon || "📋"} جزئیات حرکت
        </DialogTitle>
        <DialogContent sx={{ pt: "12px !important" }}>
          {detailOpen && (
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
              {[
                { label: "نوع", value: TYPE_COLORS[detailOpen.kind]?.label },
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
                detailOpen.user ? { label: t("ui_j.receiving.user"), value: detailOpen.user } : null,
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