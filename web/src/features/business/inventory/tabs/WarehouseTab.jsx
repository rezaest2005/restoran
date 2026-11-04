import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  Box,
  Typography,
  Button,
  TextField,
  Chip,
  CircularProgress,
  Select,
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  Divider,
} from "@mui/material";
import { Add, Delete, Close, SwapHoriz } from "@mui/icons-material";
import { getUnitLabel } from "../../../../shared/common/units";
import { getCurrentUser, now, faDate, faTime, faDay, whIcon, makeScale, useRegisteredShortcuts, KbdHint } from "../common";
import { fetchWarehouses, fetchStock, fetchRawMaterials, createTransfer } from "../api";

const F = makeScale(1.1);

// ═══════════ محاسبه موجودی (با material_code) ═══════════

// ═══════════ کامپوننت ═══════════
export default function WarehouseTab({ C, isDark, showToast }) {
  const { t } = useTranslation();
  const [warehouses, setWarehouses] = useState([]);
  const [selectedWh, setSelectedWh] = useState(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [stockRows, setStockRows] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  const [transferOpen, setTransferOpen] = useState(false);
  const [transferForm, setTransferForm] = useState({
    from_warehouse: "",
    to_warehouse: "",
    description: "",
    items: [{ material_name: "", quantity: "" }],
  });

  const transferFormRef = useRef(transferForm);
  transferFormRef.current = transferForm;
  const materialsRef = useRef([]);
  useEffect(() => { materialsRef.current = materials; }, [materials]);

  // موجودی هر انبار از روی ردیف‌های سرور (فقط مقادیر مثبت)
  const calcStock = (whId) =>
    stockRows
      .filter((r) => String(r.warehouse_id) === String(whId) && Number(r.quantity) > 0)
      .map((r) => ({
        name: r.material_name,
        qty: Number(r.quantity),
        unit: r.material_unit_display || r.material_unit,
        code: "",
        category: "",
        price: r.material_price || 0,
      }));

  const notify = useCallback(
    (msg, type = "info") => {
      if (typeof showToast === "function") showToast(msg, type);
    },
    [showToast],
  );

  // ── بارگذاری انبارها، موجودی و کالاها از سرور ──
  const load = useCallback(async () => {
    try {
      const [whData, stockData, mats] = await Promise.all([
        fetchWarehouses(),
        fetchStock({}),
        fetchRawMaterials(),
      ]);
      const all = whData.warehouses || [];
      setWarehouses(all);
      setStockRows(stockData.items || []);
      setMaterials(Array.isArray(mats) ? mats : []);
      setSelectedWh((prev) => {
        if (prev) {
          const found = all.find((w) => String(w.id) === String(prev.id));
          return found || all[0] || null;
        }
        return all[0] || null;
      });
    } catch (err) {
      console.error("Load warehouses error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // ═══════════ محاسبه مستقیم موجودی (بدون useState/useMemo) ═══════════
  // هر بار render → محاسبه تازه از localStorage
  const stockItems = (() => {
    if (!selectedWh) return [];
    let items = calcStock(selectedWh.id);
    if (search.trim()) {
      const q = search.toLowerCase();
      items = items.filter(
        (s) => s.name?.toLowerCase().includes(q) || s.code?.includes(q),
      );
    }
    return items;
  })();

  const totalValue = stockItems.reduce(
    (s, i) => s + Math.max(0, i.qty) * (i.price || 0),
    0,
  );

  // ── محاسبات حواله ──
  const transferTotal = useMemo(
    () =>
      transferForm.items.reduce((s, it) => {
        const mat = materials.find((m) => m.name === it.material_name);
        return s + (parseFloat(it.quantity) || 0) * (mat?.price || 0);
      }, 0),
    [transferForm.items, materials],
  );

  const validTransferItems = useMemo(
    () =>
      transferForm.items.filter(
        (it) => it.material_name && parseFloat(it.quantity) > 0,
      ),
    [transferForm.items],
  );

  // ── مدیریت اقلام ──
  const addTransferItem = useCallback(() => {
    setTransferForm((f) => ({
      ...f,
      items: [...f.items, { material_name: "", quantity: "" }],
    }));
  }, []);

  const removeTransferItem = useCallback((idx) => {
    setTransferForm((f) => {
      const items = f.items.filter((_, i) => i !== idx);
      return {
        ...f,
        items: items.length ? items : [{ material_name: "", quantity: "" }],
      };
    });
  }, []);

  const removeLastTransferItem = useCallback(() => {
    setTransferForm((f) => {
      if (f.items.length <= 1) return f;
      return { ...f, items: f.items.slice(0, -1) };
    });
  }, []);

  const updateTransferItem = useCallback((idx, field, val) => {
    setTransferForm((f) => {
      const items = [...f.items];
      items[idx] = { ...items[idx], [field]: val };
      return { ...f, items };
    });
  }, []);

  // ── باز/بستن ──
  const openTransfer = useCallback(() => {
    setTransferForm({
      from_warehouse: selectedWh?.id ?? warehouses[0]?.id ?? "",
      to_warehouse:
        warehouses.find((w) => String(w.id) !== String(selectedWh?.id))?.id ??
        "",
      description: "",
      items: [{ material_name: "", quantity: "" }],
    });
    setTransferOpen(true);
  }, [selectedWh, warehouses]);

  const closeTransfer = useCallback(() => {
    setTransferOpen(false);
  }, []);

  // ── ثبت حواله (هر قلم یک انتقال سمت سرور) ──
  const handleSaveTransfer = useCallback(async () => {
    if (savingRef.current) return;
    const f = transferFormRef.current;
    const mats = materialsRef.current;
    const valid = f.items.filter(
      (it) => it.material_name && parseFloat(it.quantity) > 0,
    );

    if (valid.length === 0) {
      notify("حداقل یک قلم وارد کنید", "warning");
      return;
    }
    if (!f.from_warehouse || !f.to_warehouse) {
      notify("انبار مبدأ و مقصد را انتخاب کنید", "warning");
      return;
    }
    if (String(f.from_warehouse) === String(f.to_warehouse)) {
      notify("انبار مبدأ و مقصد نمیتوانند یکی باشند", "warning");
      return;
    }

    savingRef.current = true;
    setSaving(true);
    let done = 0;
    try {
      for (const it of valid) {
        const mat = mats.find((m) => m.name === it.material_name);
        if (!mat) throw new Error("کالا یافت نشد.");
        await createTransfer({
          source_warehouse_id: f.from_warehouse,
          destination_warehouse_id: f.to_warehouse,
          raw_material_id: mat.id,
          quantity: parseFloat(it.quantity),
          notes: f.description.trim(),
        });
        done += 1;
      }
      notify(t("ui_j.warehouse.transfer_done", { count: done }), "success");
      setTransferOpen(false);
    } catch (err) {
      const msg = err.response?.data?.error || err.message || "خطا در انتقال";
      notify(done ? `${msg} (${t("ui_j.warehouse.partial_done", { count: done })})` : msg, "error");
    } finally {
      savingRef.current = false;
      setSaving(false);
      if (done) load();
    }
  }, [notify, load, t]);

  // ── میان‌برها ──
  // صفحه: F2 حواله جدید · Ctrl+A/Z انبار بعدی/قبلی
  // دیالوگ حواله: Ctrl+D ثبت · Escape بستن · F3 قلم جدید · Enter (در فیلد) قلم جدید · Ctrl+Backspace حذف آخرین قلم
  const stepWarehouse = (delta) => {
    if (!warehouses.length) return false;
    const idx = warehouses.findIndex((w) => String(w.id) === String(selectedWh?.id));
    const next = Math.min(Math.max((idx < 0 ? 0 : idx + delta), 0), warehouses.length - 1);
    setSelectedWh(warehouses[next]);
  };
  useRegisteredShortcuts([
    { combo: "F2", label: t("ui_h.warehouse.new_transfer"), handler: openTransfer },
    { combo: "Ctrl+A", label: t("shortcuts.next"), handler: () => stepWarehouse(1) },
    { combo: "Ctrl+Z", label: t("shortcuts.prev"), handler: () => stepWarehouse(-1) },
  ]);
  useRegisteredShortcuts(
    [
      { combo: "Ctrl+D", label: t("shortcuts.save"), handler: handleSaveTransfer, scope: "dialog" },
      { combo: "Escape", label: t("shortcuts.close_dialog"), handler: closeTransfer, scope: "dialog" },
      { combo: "F3", label: t("ui_h.new_line"), handler: addTransferItem, scope: "dialog" },
      { combo: "Ctrl+Backspace", label: t("ui_h.remove_last_line"), handler: removeLastTransferItem, scope: "dialog" },
      {
        combo: "Enter", label: t("ui_h.new_line"), scope: "dialog", allowInInput: true,
        handler: (e) => {
          const tag = e.target.tagName;
          if (tag !== "INPUT" && tag !== "TEXTAREA") return false;
          addTransferItem();
        },
      },
    ],
    { enabled: transferOpen },
  );

  // ── استایل‌ها ──
  const inputSx = {
    "& .MuiOutlinedInput-root": {
      borderRadius: "8px",
      bgcolor: C.inputBg,
      fontSize: F(12),
      color: C.text,
      "& fieldset": { borderColor: C.glassBorder },
      "&:hover fieldset": { borderColor: C.olive + "60" },
      "&.Mui-focused fieldset": { borderColor: C.olive, borderWidth: 1.5 },
      "&.Mui-focused": { boxShadow: `0 0 0 2px ${C.olive}18` },
    },
    "& .MuiInputLabel-root": { fontSize: F(10), color: C.sub },
    "& .MuiInputBase-input": { color: C.text, py: 0.8 },
    "& .MuiInputBase-input::placeholder": { color: C.muted, opacity: 1 },
  };

  const transferBtnSx = {
    borderRadius: "8px",
    fontSize: F(11),
    fontWeight: 700,
    textTransform: "none",
    px: 2,
    py: 0.7,
    color: C.info,
    bgcolor: C.infoBg,
    border: `1px solid ${C.info}30`,
    "&:hover": { bgcolor: C.infoBg, transform: "translateY(-1px)" },
  };

  const menuProps = {
    slotProps: {
      paper: {
        sx: {
          bgcolor: isDark ? "#1a1a2e" : "#fff",
          borderRadius: "10px",
          border: `1px solid ${C.olive}30`,
          boxShadow: "0 12px 40px rgba(0,0,0,0.25)",
          maxHeight: 200,
          overflowY: "auto",
          "& .MuiMenuItem-root": {
            fontSize: F(11),
            minHeight: 30,
            py: 0.3,
            px: 1.5,
            borderRadius: "6px",
            mx: 0.5,
            "&.Mui-selected": {
              bgcolor: C.oliveSubtle,
              color: C.olive,
              fontWeight: 700,
            },
            "&:hover": { bgcolor: C.oliveSubtle },
          },
        },
      },
    },
    disableScrollLock: true,
  };

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
        <CircularProgress sx={{ color: C.olive }} size={32} />
      </Box>
    );
  }

  return (
    <Box>
      {/* ═══════════ هدر ═══════════ */}
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          mb: 2,
          flexWrap: "wrap",
          gap: 1,
        }}
      >
        <Box>
          <Typography sx={{ fontSize: F(15), fontWeight: 800, color: C.text }}>
            📦 انبارها
          </Typography>
          <Typography sx={{ fontSize: F(10), color: C.sub, mt: 0.2 }}>
            موجودی + حواله انتقال | F2 = حواله | Ctrl+A / Ctrl+Z = انبار بعدی / قبلی
          </Typography>
        </Box>
        <Button onClick={openTransfer} sx={transferBtnSx}>
          🔄 حواله انتقال<KbdHint>F2</KbdHint>
        </Button>
      </Box>

      {/* ═══════════ کارت‌های انبار ═══════════ */}
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: {
            xs: "1fr 1fr",
            sm: "1fr 1fr 1fr",
            md: "repeat(auto-fill, minmax(180px, 1fr))",
          },
          gap: 1,
          mb: 2,
        }}
      >
        {warehouses.map((w, i) => {
          const items = calcStock(w.id);
          const value = items.reduce(
            (s, it) => s + Math.max(0, it.qty) * (it.price || 0),
            0,
          );
          const isSelected = selectedWh?.id === w.id;
          return (
            <Box
              key={w.id}
              onClick={() => setSelectedWh(w)}
              sx={{
                p: 1.5,
                borderRadius: "12px",
                cursor: "pointer",
                bgcolor: isSelected ? C.oliveSubtle : C.glass,
                border: `2px solid ${isSelected ? C.olive : C.glassBorder}`,
                transition: "all 0.2s ease",
                opacity: 0,
                animation: `fadeUp 0.3s ease-out ${i * 0.05}s forwards`,
                "&:hover": {
                  transform: "translateY(-2px)",
                  boxShadow: `0 4px 16px ${C.olive}15`,
                },
              }}
            >
              <Typography sx={{ fontSize: 22 }}>{whIcon(w)}</Typography>
              <Typography
                sx={{
                  fontSize: F(11),
                  fontWeight: 800,
                  color: isSelected ? C.olive : C.text,
                  mt: 0.3,
                }}
              >
                {w.name}
              </Typography>
              <Typography sx={{ fontSize: F(9), color: C.muted, mt: 0.2 }}>
                {items.length} کالا
              </Typography>
              <Typography
                sx={{
                  fontSize: F(10),
                  fontWeight: 700,
                  color: C.olive,
                  mt: 0.3,
                }}
              >
                {value.toLocaleString("en-US")} تومان
              </Typography>
            </Box>
          );
        })}
      </Box>

      {/* ═══════════ خلاصه جمع کل سیستم ═══════════ */}
      {(() => {
        const allStock = {};
        for (const w of warehouses) {
          for (const item of calcStock(w.id)) {
            if (!allStock[item.name])
              allStock[item.name] = {
                qty: 0,
                unit: item.unit,
                code: item.code,
                price: item.price || 0,
              };
            allStock[item.name].qty += item.qty;
          }
        }
        return Object.keys(allStock).length > 0 ? (
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1.5,
              p: 1.2,
              mb: 2,
              borderRadius: "10px",
              bgcolor: isDark ? "rgba(255,214,0,0.06)" : "rgba(255,214,0,0.08)",
              border: `1.5px solid rgba(255,214,0,0.2)`,
              flexWrap: "wrap",
            }}
          >
            <Chip
              size="small"
              label="📊 جمع کل سیستم"
              sx={{
                height: 24,
                fontSize: F(10),
                fontWeight: 800,
                borderRadius: "6px",
                bgcolor: "#FFD600",
                color: "#1A1A00",
              }}
            />
            {Object.entries(allStock).map(([name, info]) => (
              <Chip
                key={name}
                size="small"
                label={`${info.code} ${name}: ${info.qty.toLocaleString("en-US")} ${getUnitLabel(info.unit)}`}
                sx={{
                  height: 24,
                  fontSize: F(9),
                  fontWeight: 700,
                  borderRadius: "6px",
                  bgcolor: isDark
                    ? "rgba(255,255,255,0.06)"
                    : "rgba(0,0,0,0.05)",
                  color: C.text,
                  border: `1px solid ${C.glassBorder}`,
                }}
              />
            ))}
          </Box>
        ) : null;
      })()}

      {/* ═══════════ هدر موجودی ═══════════ */}
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          mb: 1.5,
          flexWrap: "wrap",
          gap: 1,
        }}
      >
        <Typography sx={{ fontSize: F(13), fontWeight: 800, color: C.text }}>
          {whIcon(selectedWh)} موجودی — {selectedWh?.name}
        </Typography>
        <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
          <Chip
            size="small"
            label={`${stockItems.length} کالا`}
            sx={{
              height: 24,
              fontSize: F(10),
              fontWeight: 700,
              borderRadius: "6px",
              bgcolor: C.oliveSubtle,
              color: C.olive,
            }}
          />
          <Chip
            size="small"
            label={`${totalValue.toLocaleString("en-US")} تومان`}
            sx={{
              height: 24,
              fontSize: F(10),
              fontWeight: 700,
              borderRadius: "6px",
              bgcolor: C.olive,
              color: "#fff",
            }}
          />
          <TextField
            size="small"
            placeholder="🔍 جستجو..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            sx={{ ...inputSx, width: 180 }}
          />
        </Box>
      </Box>

      {/* ═══════════ جدول موجودی ═══════════ */}
      {stockItems.length === 0 ? (
        <Box sx={{ textAlign: "center", py: 5 }}>
          <Typography sx={{ fontSize: 32, mb: 0.5 }}>📦</Typography>
          <Typography sx={{ fontSize: F(13), fontWeight: 700, color: C.text }}>
            موجودی خالی است
          </Typography>
          <Typography sx={{ fontSize: F(10), color: C.sub, mt: 0.3 }}>
            با فاکتور خرید، کالا وارد انبار میشود
          </Typography>
        </Box>
      ) : (
        <Box>
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns:
                "60px 1.5fr 100px 80px 70px 100px 110px 80px",
              gap: 1,
              px: 1.5,
              py: 0.8,
              borderRadius: "8px",
              bgcolor: isDark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.02)",
            }}
          >
            {[
              "کد",
              "نام کالا",
              "دسته‌بندی",
              "موجودی",
              "واحد",
              "قیمت واحد",
              "ارزش",
              "وضعیت",
            ].map((h) => (
              <Typography
                key={h}
                sx={{ fontSize: F(9), fontWeight: 700, color: C.muted }}
              >
                {h}
              </Typography>
            ))}
          </Box>

          {stockItems.map((item, i) => (
            <Box
              key={item.name}
              sx={{
                display: "grid",
                gridTemplateColumns:
                  "60px 1.5fr 100px 80px 70px 100px 110px 80px",
                gap: 1,
                px: 1.5,
                py: 1,
                borderRadius: "10px",
                mt: 0.5,
                bgcolor: C.glass,
                border: `1px solid ${C.glassBorder}`,
                opacity: 0,
                animation: `fadeUp 0.3s ease-out ${i * 0.03}s forwards`,
                "&:hover": {
                  bgcolor: isDark
                    ? "rgba(255,255,255,0.04)"
                    : "rgba(0,0,0,0.02)",
                },
              }}
            >
              <Chip
                size="small"
                label={item.code || "—"}
                sx={{
                  height: 22,
                  fontSize: F(9),
                  fontWeight: 700,
                  borderRadius: "5px",
                  bgcolor: C.oliveSubtle,
                  color: C.olive,
                  fontFamily: "monospace",
                  width: "100%",
                  justifyContent: "center",
                }}
              />

              <Typography
                sx={{
                  fontSize: F(12),
                  fontWeight: 700,
                  color: C.text,
                  alignSelf: "center",
                }}
              >
                {item.name}
              </Typography>

              <Chip
                size="small"
                label={item.category || "—"}
                sx={{
                  height: 20,
                  fontSize: F(8),
                  borderRadius: "5px",
                  alignSelf: "center",
                  bgcolor: item.category
                    ? isDark
                      ? "rgba(100,140,255,0.1)"
                      : "rgba(50,90,200,0.08)"
                    : "transparent",
                  color: item.category
                    ? isDark
                      ? "#8AAFFF"
                      : "#2A4AAA"
                    : C.muted,
                  justifyContent: "center",
                }}
              />

              <Typography
                sx={{
                  fontSize: F(13),
                  fontWeight: 800,
                  alignSelf: "center",
                  color:
                    item.qty <= 0
                      ? C.danger
                      : item.qty < 10
                        ? C.warning
                        : C.text,
                }}
              >
                {item.qty.toLocaleString("en-US")}
              </Typography>

              <Typography
                sx={{ fontSize: F(10), color: C.sub, alignSelf: "center" }}
              >
                {getUnitLabel(item.unit)}
              </Typography>

              <Typography
                sx={{ fontSize: F(10), color: C.sub, alignSelf: "center" }}
              >
                {item.price > 0 ? item.price.toLocaleString("en-US") : "—"}
              </Typography>

              <Typography
                sx={{
                  fontSize: F(11),
                  fontWeight: 700,
                  color: C.olive,
                  alignSelf: "center",
                }}
              >
                {(Math.max(0, item.qty) * item.price).toLocaleString("en-US")}
              </Typography>

              <Chip
                size="small"
                label={
                  item.qty <= 0 ? "ناموجود" : item.qty < 10 ? "کمبود" : "موجود"
                }
                sx={{
                  height: 20,
                  fontSize: F(8),
                  fontWeight: 700,
                  borderRadius: "5px",
                  alignSelf: "center",
                  justifyContent: "center",
                  bgcolor:
                    item.qty <= 0
                      ? C.dangerBg
                      : item.qty < 10
                        ? C.warningBg
                        : C.oliveSubtle,
                  color:
                    item.qty <= 0
                      ? C.danger
                      : item.qty < 10
                        ? C.warning
                        : C.olive,
                }}
              />
            </Box>
          ))}
        </Box>
      )}

      {/* ═══════════════════════════════════════
           مودال حواله انتقال
      ════════════════════════════════════════ */}
      <Dialog
        open={transferOpen}
        onClose={closeTransfer}
        maxWidth="md"
        fullWidth
        slotProps={{
          paper: {
            sx: {
              borderRadius: "20px",
              bgcolor: isDark ? "#0f1128" : "#ffffff",
              border: `2px solid ${C.olive}40`,
              boxShadow: "0 24px 100px rgba(0,0,0,0.5)",
            },
          },
        }}
      >
        <DialogTitle
          sx={{
            px: 3,
            pt: 2.5,
            pb: 2,
            borderBottom: `2px solid ${C.olive}20`,
            bgcolor: isDark
              ? "rgba(107,155,110,0.1)"
              : "rgba(46,77,48,0.07)",
          }}
        >
          <Box
            sx={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
              <Box
                sx={{
                  width: 52,
                  height: 52,
                  borderRadius: "14px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  bgcolor: C.infoBg,
                  border: `2px solid ${C.info}40`,
                }}
              >
                <SwapHoriz sx={{ fontSize: 30, color: C.info }} />
              </Box>
              <Box>
                <Typography
                  sx={{
                    fontSize: 20,
                    fontWeight: 900,
                    color: C.text,
                    letterSpacing: "-0.3px",
                  }}
                >
                  حواله انتقال بین انبارها
                </Typography>
                <Chip
                  size="small"
                  label={t("ui_j.warehouse.new_transfer_badge")}
                  sx={{
                    height: 28,
                    fontSize: 14,
                    fontWeight: 800,
                    borderRadius: "8px",
                    bgcolor: C.olive,
                    color: "#fff",
                    px: 1,
                    mt: 0.5,
                  }}
                />
              </Box>
            </Box>
            <IconButton
              onClick={closeTransfer}
              size="large"
              sx={{
                color: C.danger,
                bgcolor: C.dangerBg,
                border: `2px solid ${C.danger}30`,
                borderRadius: "12px",
                p: 1,
                "&:hover": { bgcolor: C.danger, color: "#fff" },
              }}
            >
              <Close sx={{ fontSize: 24 }} />
            </IconButton>
          </Box>

          <Box sx={{ display: "flex", gap: 1.5, mt: 2, flexWrap: "wrap" }}>
            {[
              { icon: "👤", label: getCurrentUser(), color: "#7C4DFF" },
              { icon: "📅", label: faDate(now()), color: "#00897B" },
              { icon: "🕐", label: faTime(now()), color: "#F57C00" },
              { icon: "📆", label: faDay(now()), color: "#1565C0" },
            ].map((info, i) => (
              <Chip
                key={i}
                size="small"
                label={`${info.icon} ${info.label}`}
                sx={{
                  height: 34,
                  fontSize: 14,
                  fontWeight: 700,
                  borderRadius: "10px",
                  bgcolor: info.color + "18",
                  color: info.color,
                  border: `1.5px solid ${info.color}30`,
                  px: 0.5,
                }}
              />
            ))}
          </Box>
        </DialogTitle>

        <DialogContent sx={{ px: 3, py: 2.5 }}>
          {/* مبدأ → مقصد */}
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: "1fr 50px 1fr",
              gap: 1.5,
              alignItems: "center",
              mb: 2.5,
            }}
          >
            <Box>
              <Typography
                sx={{
                  fontSize: 14,
                  color: C.olive,
                  mb: 0.6,
                  fontWeight: 800,
                }}
              >
                📦 از انبار (مبدأ)
              </Typography>
              <Select
                size="small"
                fullWidth
                value={transferForm.from_warehouse}
                onChange={(e) =>
                  setTransferForm((f) => ({
                    ...f,
                    from_warehouse: e.target.value,
                  }))
                }
                sx={{
                  "& .MuiOutlinedInput-root": {
                    borderRadius: "12px",
                    bgcolor: isDark
                      ? "rgba(107,155,110,0.08)"
                      : "rgba(46,77,48,0.05)",
                    fontSize: 16,
                    color: C.text,
                    "& fieldset": {
                      borderColor: C.olive + "50",
                      borderWidth: 2,
                    },
                    "&:hover fieldset": { borderColor: C.olive + "80" },
                    "&.Mui-focused fieldset": {
                      borderColor: C.olive,
                      borderWidth: 2.5,
                    },
                  },
                  "& .MuiSelect-select": {
                    fontSize: 16,
                    py: 1.3,
                    px: 2,
                    fontWeight: 700,
                  },
                }}
                MenuProps={menuProps}
              >
                {warehouses.map((w) => (
                  <MenuItem key={w.id} value={w.id} sx={{ fontSize: 15 }}>
                    {whIcon(w)} {w.name}
                  </MenuItem>
                ))}
              </Select>
            </Box>

            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 50,
                height: 50,
                borderRadius: "50%",
                bgcolor: C.olive,
                color: "#fff",
                mt: 2.8,
                boxShadow: `0 4px 16px ${C.olive}50`,
              }}
            >
              <SwapHoriz sx={{ fontSize: 28 }} />
            </Box>

            <Box>
              <Typography
                sx={{
                  fontSize: 14,
                  color: C.info,
                  mb: 0.6,
                  fontWeight: 800,
                }}
              >
                📦 به انبار (مقصد)
              </Typography>
              <Select
                size="small"
                fullWidth
                value={transferForm.to_warehouse}
                onChange={(e) =>
                  setTransferForm((f) => ({
                    ...f,
                    to_warehouse: e.target.value,
                  }))
                }
                sx={{
                  "& .MuiOutlinedInput-root": {
                    borderRadius: "12px",
                    bgcolor: isDark
                      ? "rgba(21,101,192,0.08)"
                      : "rgba(21,101,192,0.05)",
                    fontSize: 16,
                    color: C.text,
                    "& fieldset": {
                      borderColor: C.info + "50",
                      borderWidth: 2,
                    },
                    "&:hover fieldset": { borderColor: C.info + "80" },
                    "&.Mui-focused fieldset": {
                      borderColor: C.info,
                      borderWidth: 2.5,
                    },
                  },
                  "& .MuiSelect-select": {
                    fontSize: 16,
                    py: 1.3,
                    px: 2,
                    fontWeight: 700,
                  },
                }}
                MenuProps={menuProps}
              >
                {warehouses
                  .filter(
                    (w) => String(w.id) !== String(transferForm.from_warehouse),
                  )
                  .map((w) => (
                    <MenuItem key={w.id} value={w.id} sx={{ fontSize: 15 }}>
                      {whIcon(w)} {w.name}
                    </MenuItem>
                  ))}
              </Select>
            </Box>
          </Box>

          <Divider
            sx={{ mb: 2, borderColor: C.olive + "25", borderWidth: 1.5 }}
          />

          {/* هدر جدول اقلام */}
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: "36px 90px 1.8fr 90px 120px 44px",
              gap: 1,
              px: 1,
              mb: 1,
              py: 1,
              borderRadius: "10px",
              bgcolor: isDark
                ? "rgba(107,155,110,0.12)"
                : "rgba(46,77,48,0.08)",
            }}
          >
            {["#", "کد کالا", "نام کالا", "واحد", "تعداد", ""].map((h, i) => (
              <Typography
                key={i}
                sx={{
                  fontSize: 13,
                  fontWeight: 900,
                  color: isDark ? "#B8D4B9" : "#2E4D30",
                  textAlign: i >= 3 ? "center" : "right",
                  letterSpacing: "0.3px",
                }}
              >
                {h}
              </Typography>
            ))}
          </Box>

          {/* اقلام */}
          {transferForm.items.map((it, idx) => {
            const mat = materials.find((m) => m.name === it.material_name);
            return (
              <Box
                key={idx}
                sx={{
                  display: "grid",
                  gridTemplateColumns: "36px 90px 1.8fr 90px 120px 44px",
                  gap: 1,
                  mb: 1,
                  alignItems: "center",
                  px: 1,
                  py: 1,
                  borderRadius: "12px",
                  bgcolor:
                    idx % 2 === 0
                      ? isDark
                        ? "rgba(255,255,255,0.03)"
                        : "rgba(0,0,0,0.015)"
                      : "transparent",
                  border: `1.5px solid ${isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)"}`,
                  animation: `fadeUp 0.2s ease-out ${idx * 0.05}s backwards`,
                  transition: "all 0.15s ease",
                  "&:hover": {
                    bgcolor: isDark
                      ? "rgba(107,155,110,0.08)"
                      : "rgba(107,155,110,0.05)",
                    borderColor: C.olive + "40",
                  },
                }}
              >
                <Box
                  sx={{
                    width: 30,
                    height: 30,
                    borderRadius: "8px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    bgcolor: C.olive,
                    color: "#fff",
                    fontSize: 15,
                    fontWeight: 900,
                  }}
                >
                  {idx + 1}
                </Box>

                <Chip
                  size="small"
                  label={mat?.code || "—"}
                  sx={{
                    height: 30,
                    fontSize: 13,
                    fontWeight: 800,
                    borderRadius: "8px",
                    bgcolor: C.oliveSubtle,
                    color: C.olive,
                    fontFamily: "monospace",
                    width: "100%",
                    justifyContent: "center",
                    border: `1.5px solid ${C.olive}30`,
                  }}
                />

                <Select
                  size="small"
                  fullWidth
                  value={it.material_name}
                  onChange={(e) =>
                    updateTransferItem(idx, "material_name", e.target.value)
                  }
                  displayEmpty
                  sx={{
                    "& .MuiOutlinedInput-root": {
                      borderRadius: "10px",
                      bgcolor: isDark ? "rgba(255,255,255,0.06)" : "#fff",
                      fontSize: 15,
                      color: C.text,
                      "& fieldset": {
                        borderColor: C.glassBorder,
                        borderWidth: 2,
                      },
                      "&:hover fieldset": { borderColor: C.olive + "60" },
                      "&.Mui-focused fieldset": {
                        borderColor: C.olive,
                        borderWidth: 2.5,
                      },
                    },
                    "& .MuiSelect-select": {
                      fontSize: 15,
                      py: 1,
                      px: 1.5,
                      fontWeight: 600,
                    },
                  }}
                  MenuProps={menuProps}
                >
                  <MenuItem value="">انتخاب کنید</MenuItem>
                  {materials.map((m) => (
                    <MenuItem key={m.id} value={m.name} sx={{ fontSize: 15 }}>
                      {m.name}
                    </MenuItem>
                  ))}
                </Select>

                <Chip
                  size="small"
                  label={mat ? getUnitLabel(mat.unit) : "—"}
                  sx={{
                    height: 30,
                    fontSize: 13,
                    fontWeight: 700,
                    borderRadius: "8px",
                    bgcolor: isDark
                      ? "rgba(21,101,192,0.15)"
                      : "rgba(21,101,192,0.1)",
                    color: isDark ? "#82B1FF" : "#1565C0",
                    border: `1.5px solid ${isDark ? "rgba(21,101,192,0.3)" : "rgba(21,101,192,0.2)"}`,
                    width: "100%",
                    justifyContent: "center",
                  }}
                />

                <TextField
                  size="small"
                  type="number"
                  placeholder="0"
                  value={it.quantity}
                  onChange={(e) =>
                    updateTransferItem(idx, "quantity", e.target.value)
                  }
                  sx={{
                    "& .MuiOutlinedInput-root": {
                      borderRadius: "10px",
                      bgcolor: isDark
                        ? "rgba(255,214,0,0.08)"
                        : "rgba(255,214,0,0.1)",
                      fontSize: 18,
                      color: C.text,
                      "& fieldset": {
                        borderColor: "#FFD600",
                        borderWidth: 2.5,
                      },
                      "&:hover fieldset": {
                        borderColor: "#FFC107",
                        borderWidth: 3,
                      },
                      "&.Mui-focused fieldset": {
                        borderColor: "#FFA000",
                        borderWidth: 3,
                      },
                      "&.Mui-focused": {
                        boxShadow: `0 0 0 3px rgba(255,214,0,0.25)`,
                      },
                    },
                    "& .MuiInputBase-input": {
                      textAlign: "center",
                      py: 1.2,
                      px: 1,
                      fontSize: 20,
                      fontWeight: 900,
                      color: isDark ? "#FFE082" : "#E65100",
                      "&::placeholder": { color: C.muted, opacity: 0.5 },
                    },
                  }}
                />

                <IconButton
                  size="large"
                  onClick={() => removeTransferItem(idx)}
                  sx={{
                    color: C.danger,
                    bgcolor: C.dangerBg,
                    borderRadius: "10px",
                    p: 0.8,
                    border: `2px solid ${C.danger}30`,
                    "&:hover": {
                      bgcolor: C.danger,
                      color: "#fff",
                      transform: "scale(1.1)",
                    },
                    transition: "all 0.15s ease",
                  }}
                >
                  <Delete sx={{ fontSize: 22 }} />
                </IconButton>
              </Box>
            );
          })}

          <Button
            startIcon={<Add sx={{ fontSize: 22 }} />}
            onClick={addTransferItem}
            fullWidth
            sx={{
              mt: 1.5,
              mb: 2,
              color: C.olive,
              bgcolor: isDark
                ? "rgba(107,155,110,0.1)"
                : "rgba(107,155,110,0.08)",
              border: `2.5px dashed ${C.olive}50`,
              borderRadius: "12px",
              fontWeight: 800,
              fontSize: 16,
              textTransform: "none",
              py: 1.2,
              transition: "all 0.2s ease",
              "&:hover": {
                bgcolor: C.oliveSubtle,
                border: `2.5px solid ${C.olive}`,
                transform: "translateY(-2px)",
              },
            }}
          >
            افزودن قلم جدید (Enter / F3)
          </Button>

          {/* جمع + توضیح */}
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr", sm: "200px 1fr" },
              gap: 2,
              mt: 1,
              p: 2,
              bgcolor: isDark
                ? "rgba(107,155,110,0.12)"
                : "rgba(107,155,110,0.1)",
              borderRadius: "14px",
              border: `2px solid ${C.olive}35`,
              alignItems: "center",
            }}
          >
            <Box>
              <Typography
                sx={{ fontSize: 13, color: C.sub, fontWeight: 700 }}
              >
                💰 جمع کل
              </Typography>
              <Typography
                sx={{
                  fontSize: 26,
                  fontWeight: 900,
                  color: C.olive,
                  lineHeight: 1.2,
                }}
              >
                {transferTotal.toLocaleString("en-US")}
              </Typography>
              <Typography
                sx={{ fontSize: 12, color: C.muted, fontWeight: 600 }}
              >
                تومان
              </Typography>
            </Box>
            <Box>
              <Typography
                sx={{
                  fontSize: 13,
                  color: C.sub,
                  fontWeight: 700,
                  mb: 0.5,
                }}
              >
                📝 توضیحات
              </Typography>
              <TextField
                size="small"
                placeholder="توضیحات حواله..."
                value={transferForm.description}
                onChange={(e) =>
                  setTransferForm((f) => ({
                    ...f,
                    description: e.target.value,
                  }))
                }
                fullWidth
                multiline
                rows={2}
                sx={{
                  "& .MuiOutlinedInput-root": {
                    borderRadius: "10px",
                    bgcolor: isDark ? "rgba(255,255,255,0.06)" : "#fff",
                    fontSize: 15,
                    "& fieldset": {
                      borderColor: C.olive + "40",
                      borderWidth: 2,
                    },
                    "&:hover fieldset": { borderColor: C.olive + "60" },
                    "&.Mui-focused fieldset": {
                      borderColor: C.olive,
                      borderWidth: 2.5,
                    },
                  },
                  "& .MuiInputBase-input": { fontSize: 15, color: C.text },
                  "& .MuiInputBase-input::placeholder": { color: C.muted },
                }}
              />
            </Box>
          </Box>

          {/* راهنمای میان‌بر */}
          <Box
            sx={{
              display: "flex",
              flexWrap: "wrap",
              gap: 1,
              mt: 2,
              px: 2,
              py: 1.2,
              borderRadius: "12px",
              bgcolor: isDark
                ? "rgba(255,214,0,0.08)"
                : "rgba(255,214,0,0.1)",
              border: `2px solid rgba(255,214,0,0.25)`,
              alignItems: "center",
            }}
          >
            <Chip
              size="small"
              label="⌨️ راهنما"
              sx={{
                height: 28,
                fontSize: 13,
                fontWeight: 900,
                borderRadius: "8px",
                bgcolor: "#FFD600",
                color: "#1A1A00",
                px: 1.5,
              }}
            />
            {[
              { key: "Ctrl+D", label: "ثبت", color: "#2E7D32" },
              { key: "Enter", label: "قلم جدید", color: "#1565C0" },
              { key: "F3", label: "قلم جدید", color: "#1565C0" },
              { key: "Ctrl+⌫", label: "حذف قلم", color: "#C62828" },
              { key: "Esc", label: "بستن", color: "#E65100" },
            ].map((item) => (
              <Box
                key={item.key}
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 0.5,
                }}
              >
                <Box
                  sx={{
                    px: 1,
                    py: 0.3,
                    borderRadius: "6px",
                    bgcolor: item.color + "18",
                    border: `1.5px solid ${item.color}40`,
                    fontFamily: "monospace",
                    fontSize: 13,
                    fontWeight: 800,
                    color: item.color,
                  }}
                >
                  {item.key}
                </Box>
                <Typography
                  sx={{ fontSize: 12, color: C.sub, fontWeight: 600 }}
                >
                  {item.label}
                </Typography>
              </Box>
            ))}
          </Box>
        </DialogContent>

        <DialogActions
          sx={{
            px: 3,
            pb: 2.5,
            pt: 2,
            borderTop: `2px solid ${C.olive}20`,
            gap: 2,
          }}
        >
          <Button
            onClick={closeTransfer}
            size="large"
            sx={{
              borderRadius: "12px",
              fontSize: 16,
              fontWeight: 700,
              textTransform: "none",
              color: C.danger,
              bgcolor: C.dangerBg,
              border: `2px solid ${C.danger}30`,
              px: 3,
              py: 1,
              "&:hover": { bgcolor: C.danger, color: "#fff" },
            }}
          >
            ✖ انصراف (Esc)
          </Button>
          <Button
            onClick={handleSaveTransfer}
            disabled={validTransferItems.length === 0 || saving}
            size="large"
            sx={{
              borderRadius: "12px",
              fontSize: 16,
              fontWeight: 800,
              textTransform: "none",
              color: "#fff",
              background: C.btnGrad,
              boxShadow: `0 4px 20px ${C.olive}40`,
              px: 4,
              py: 1,
              transition: "all 0.2s ease",
              "&:hover": {
                transform: "translateY(-2px)",
                boxShadow: `0 8px 30px ${C.olive}50`,
              },
              "&:active": { transform: "scale(0.97)" },
              "&.Mui-disabled": {
                bgcolor: C.muted,
                color: "#fff",
                opacity: 0.4,
              },
            }}
          >
            {saving ? "..." : "💾 ثبت حواله (Ctrl+D)"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}