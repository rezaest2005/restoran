import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  Box, Typography, Button, TextField, Chip, CircularProgress,
  Select, MenuItem, Dialog, DialogTitle, DialogContent, DialogActions,
  IconButton, Divider,
} from "@mui/material";
import { Add, Delete, Close, Receipt, Visibility } from "@mui/icons-material";
import { getUnitLabel } from "../../../../shared/common/units";
import { readJSON, writeJSON, getCurrentUser, now, faDate, faTime, faDay, whIcon, calcStock, makeScale, useRowCursor, cursorAttrs, cursorSx, cursorBindings, useRegisteredShortcuts, onEnter, KbdHint } from "../common";
import { soft } from "@shared/ui/colorUtil";

const F = makeScale(1.1);

const PAYMENTS = {
  cash: { label: "نقد", color: "var(--success)", icon: "💵" },
  credit: { label: "نسیه", color: "var(--danger)", icon: "📝" },
  check: { label: "چک", color: "var(--info)", icon: "📄" },
};

// ═══════════ کامپوننت ═══════════
export default function SalesInvoiceTab({ C, isDark, showToast }) {
  const { t } = useTranslation();
  const [invoices, setInvoices] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState(null);

  const emptyForm = {
    warehouse_id: "", customer_first_name: "", customer_last_name: "",
    customer_mobile: "", customer_address: "",
    items: [{ material_name: "", quantity: "", unit_price: "" }],
    payment_method: "cash", discount: "0", paid_amount: "0",
    check_number: "", check_due_date: "", description: "",
  };
  const [form, setForm] = useState(emptyForm);
  const formRef = useRef(form); formRef.current = form;
  const materialsRef = useRef([]);

  const notify = useCallback((msg, type = "info") => {
    if (typeof showToast === "function") showToast(msg, type);
  }, [showToast]);

  // ── بارگذاری ──
  const load = useCallback(() => {
    setInvoices(readJSON("local_sales_invoices", []));
    const whs = readJSON("local_warehouses", []);
    setWarehouses(whs);
    const mats = readJSON("local_materials", []);
    setMaterials(mats);
    materialsRef.current = mats;
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load, refreshKey]);

  // ── محاسبات فرم ──
  const subtotal = useMemo(() =>
    form.items.reduce((s, it) => s + (parseFloat(it.quantity) || 0) * (parseFloat(it.unit_price) || 0), 0),
    [form.items]
  );
  const discountNum = parseFloat(form.discount) || 0;
  const grandTotal = Math.max(0, subtotal - discountNum);
  const paidNum = parseFloat(form.paid_amount) || 0;
  const remaining = Math.max(0, grandTotal - paidNum);

  const validItems = useMemo(() =>
    form.items.filter((it) => it.material_name && parseFloat(it.quantity) > 0),
    [form.items]
  );

  // ── مدیریت اقلام ──
  const addItem = useCallback(() => {
    setForm((f) => ({ ...f, items: [...f.items, { material_name: "", quantity: "", unit_price: "" }] }));
  }, []);
  const removeItem = useCallback((idx) => {
    setForm((f) => {
      const items = f.items.filter((_, i) => i !== idx);
      return { ...f, items: items.length ? items : [{ material_name: "", quantity: "", unit_price: "" }] };
    });
  }, []);
  const removeLastItem = useCallback(() => {
    setForm((f) => {
      if (f.items.length <= 1) return f;
      return { ...f, items: f.items.slice(0, -1) };
    });
  }, []);
  const updateItem = useCallback((idx, field, val) => {
    setForm((f) => {
      const items = [...f.items];
      items[idx] = { ...items[idx], [field]: val };
      // وقتی کالا انتخاب شد → قیمت خودکار
      if (field === "material_name") {
        const mat = materialsRef.current.find((m) => m.name === val);
        if (mat && mat.price) items[idx].unit_price = String(mat.price);
      }
      return { ...f, items };
    });
  }, []);

  // ── باز/بستن ──
  const openNew = useCallback(() => {
    const whs = readJSON("local_warehouses", []);
    setForm({ ...emptyForm, warehouse_id: whs[0]?.id ?? "" });
    setDialogOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const closeDialog = useCallback(() => {
    setDialogOpen(false);
    setRefreshKey((k) => k + 1);
  }, []);

  const openDetail = useCallback((inv) => {
    setSelectedInvoice(inv);
    setDetailOpen(true);
  }, []);

  // ── ثبت فاکتور ──
  const handleSave = useCallback(() => {
    const f = formRef.current;
    const mats = materialsRef.current;
    const valid = f.items.filter((it) => it.material_name && parseFloat(it.quantity) > 0);

    if (!f.customer_first_name.trim()) { notify("نام مشتری را وارد کنید", "warning"); return; }
    if (!f.customer_last_name.trim()) { notify("نام خانوادگی مشتری را وارد کنید", "warning"); return; }
    if (!f.customer_mobile.trim()) { notify("شماره موبایل را وارد کنید", "warning"); return; }
    if (valid.length === 0) { notify("حداقل یک قلم وارد کنید", "warning"); return; }
    if (!f.warehouse_id) { notify("انبار را انتخاب کنید", "warning"); return; }

    // بررسی موجودی
    const stock = calcStock(f.warehouse_id);
    for (const it of valid) {
      const mat = mats.find((m) => m.name === it.material_name);
      const key = mat?.code || it.material_name;
      const stockItem = stock.find((s) => s.code === key || s.name === it.material_name);
      const available = stockItem?.qty || 0;
      const requested = parseFloat(it.quantity);
      if (requested > available) {
        notify(`موجودی «${it.material_name}» کافی نیست (موجود: ${available})`, "error");
        return;
      }
    }

    const d = now();
    const user = getCurrentUser();
    const allInvoices = readJSON("local_sales_invoices", []);

    const items = valid.map((it) => {
      const mat = mats.find((m) => m.name === it.material_name);
      const qty = parseFloat(it.quantity);
      const price = parseFloat(it.unit_price) || 0;
      return {
        material_name: mat?.name || it.material_name,
        material_code: mat?.code || "",
        unit: mat?.unit || "",
        quantity: qty,
        unit_price: price,
        line_total: qty * price,
      };
    });

    const invSubtotal = items.reduce((s, it) => s + it.line_total, 0);
    const invDiscount = parseFloat(f.discount) || 0;
    const invGrand = Math.max(0, invSubtotal - invDiscount);
    const invPaid = parseFloat(f.paid_amount) || 0;

    const invoice = {
      id: Date.now(),
      invoice_number: `SI-${String(allInvoices.length + 1).padStart(3, "0")}`,
      user,
      date: faDate(d),
      time: faTime(d),
      day: faDay(d),
      warehouse_id: f.warehouse_id,
      customer: {
        first_name: f.customer_first_name.trim(),
        last_name: f.customer_last_name.trim(),
        mobile: f.customer_mobile.trim(),
        address: f.customer_address.trim(),
      },
      items,
      payment_method: f.payment_method,
      subtotal: invSubtotal,
      discount: invDiscount,
      grand_total: invGrand,
      paid_amount: invPaid,
      remaining: Math.max(0, invGrand - invPaid),
      check_number: f.payment_method === "check" ? f.check_number.trim() : "",
      check_due_date: f.payment_method === "check" ? f.check_due_date.trim() : "",
      description: f.description.trim(),
      items_count: items.length,
      created_at: d.toISOString(),
    };

    allInvoices.push(invoice);
    writeJSON("local_sales_invoices", allInvoices);
    notify(`فاکتور «${invoice.invoice_number}» ثبت شد ✅`, "success");
    closeDialog();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notify, closeDialog]);

  // ── فیلتر ──
  const filteredInvoices = useMemo(() => {
    if (!search.trim()) return invoices;
    const q = search.toLowerCase();
    return invoices.filter((inv) =>
      inv.invoice_number?.toLowerCase().includes(q) ||
      inv.customer?.first_name?.includes(q) ||
      inv.customer?.last_name?.includes(q) ||
      inv.customer?.mobile?.includes(q)
    );
  }, [invoices, search]);

  // ── میان‌برها ──
  // صفحه: F2 فاکتور جدید · Ctrl+A/Z ردیف بعدی/قبلی · Enter جزئیات
  // دیالوگ فاکتور: Ctrl+D ثبت · Escape بستن · F3 قلم جدید · Enter (در فیلد) قلم جدید · Ctrl+Backspace حذف آخرین قلم
  const cursor = useRowCursor(filteredInvoices.length);
  useRegisteredShortcuts([
    { combo: "F2", label: t("shortcuts.new"), handler: openNew },
    ...cursorBindings(t, cursor),
    {
      combo: "Enter", label: t("ui_h.show_details"),
      handler: onEnter(() => { const r = filteredInvoices[cursor.index]; if (!r) return false; openDetail(r); }),
    },
  ]);
  useRegisteredShortcuts(
    [
      { combo: "Ctrl+D", label: t("shortcuts.save"), handler: handleSave, scope: "dialog" },
      { combo: "Escape", label: t("shortcuts.close_dialog"), handler: closeDialog, scope: "dialog" },
      { combo: "F3", label: t("ui_h.new_line"), handler: addItem, scope: "dialog" },
      { combo: "Ctrl+Backspace", label: t("ui_h.remove_last_line"), handler: removeLastItem, scope: "dialog" },
      {
        combo: "Enter", label: t("ui_h.new_line"), scope: "dialog", allowInInput: true,
        handler: (e) => {
          const tag = e.target.tagName;
          if (tag !== "INPUT" && tag !== "TEXTAREA") return false;
          addItem();
        },
      },
    ],
    { enabled: dialogOpen },
  );
  useRegisteredShortcuts(
    [
      { combo: "Enter", label: t("shortcuts.close_dialog"), handler: onEnter(() => setDetailOpen(false)), scope: "dialog", allowInInput: true },
      { combo: "Escape", label: t("shortcuts.close_dialog"), handler: () => setDetailOpen(false), scope: "dialog" },
    ],
    { enabled: detailOpen && !dialogOpen },
  );

  // ── استایل‌ها ──
  const inputSx = {
    "& .MuiOutlinedInput-root": {
      borderRadius: "8px", bgcolor: C.inputBg, fontSize: F(12), color: C.text,
      "& fieldset": { borderColor: C.glassBorder },
      "&:hover fieldset": { borderColor: soft(C.olive, "60") },
      "&.Mui-focused fieldset": { borderColor: C.olive, borderWidth: 1.5 },
      "&.Mui-focused": { boxShadow: `0 0 0 2px ${soft(C.olive, "18")}` },
    },
    "& .MuiInputBase-input": { color: C.text, py: 0.8 },
    "& .MuiInputBase-input::placeholder": { color: C.muted, opacity: 1 },
  };

  const menuProps = {
    slotProps: {
      paper: {
        sx: {
          bgcolor: isDark ? "var(--ink)" : "var(--surface)", borderRadius: "10px",
          border: `1px solid ${soft(C.olive, "30")}`, boxShadow: "0 12px 40px color-mix(in srgb, var(--ink) 25%, transparent)",
          maxHeight: 200, overflowY: "auto",
          "& .MuiMenuItem-root": {
            fontSize: F(11), minHeight: 30, py: 0.3, px: 1.5, borderRadius: "6px", mx: 0.5,
            "&.Mui-selected": { bgcolor: C.oliveSubtle, color: C.olive, fontWeight: 700 },
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
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2, flexWrap: "wrap", gap: 1 }}>
        <Box>
          <Typography sx={{ fontSize: F(15), fontWeight: 800, color: C.text }}>🧾 فاکتورهای فروش</Typography>
          <Typography sx={{ fontSize: F(10), color: C.sub, mt: 0.2 }}>
            ثبت فروش + اطلاعات مشتری + پرداخت | F2 = فاکتور جدید
          </Typography>
        </Box>
        <Box sx={{ display: "flex", gap: 1 }}>
          <TextField size="small" placeholder="🔍 جستجو..."
            value={search} onChange={(e) => setSearch(e.target.value)}
            sx={{ ...inputSx, width: 200 }} />
          <Button onClick={openNew} sx={{
            borderRadius: "8px", fontSize: F(11), fontWeight: 700, textTransform: "none",
            px: 2, py: 0.7, color: "var(--on-primary)", background: C.btnGrad,
            boxShadow: `0 2px 12px ${soft(C.olive, "25")}`,
            "&:hover": { transform: "translateY(-1px)" },
          }}>
            + فاکتور جدید<KbdHint>F2</KbdHint>
          </Button>
        </Box>
      </Box>

      {/* ═══════════ خلاصه ═══════════ */}
      <Box sx={{ display: "flex", gap: 1, mb: 2, flexWrap: "wrap" }}>
        {[
          { label: `${invoices.length} فاکتور`, color: C.olive, bg: C.oliveSubtle },
          { label: `فروش کل: ${invoices.reduce((s, i) => s + (i.grand_total || 0), 0).toLocaleString("en-US")} تومان`, color: "var(--success)", bg: "color-mix(in srgb, var(--success) 10%, transparent)" },
          { label: `بدهکاری: ${invoices.reduce((s, i) => s + (i.remaining || 0), 0).toLocaleString("en-US")} تومان`, color: "var(--danger)", bg: "color-mix(in srgb, var(--danger) 10%, transparent)" },
        ].map((c, i) => (
          <Chip key={i} size="small" label={c.label} sx={{
            height: 28, fontSize: F(10), fontWeight: 700, borderRadius: "8px",
            bgcolor: c.bg, color: c.color, border: `1px solid ${soft(c.color, "30")}`,
          }} />
        ))}
      </Box>

      {/* ═══════════ جدول فاکتورها ═══════════ */}
      {filteredInvoices.length === 0 ? (
        <Box sx={{ textAlign: "center", py: 5 }}>
          <Typography sx={{ fontSize: 32, mb: 0.5 }}>🧾</Typography>
          <Typography sx={{ fontSize: F(13), fontWeight: 700, color: C.text }}>فاکتوری ثبت نشده</Typography>
          <Typography sx={{ fontSize: F(10), color: C.sub, mt: 0.3 }}>F2 بزنید یا دکمه «فاکتور جدید»</Typography>
        </Box>
      ) : (
        <Box>
          {/* هدر جدول */}
          <Box sx={{
            display: "grid", gridTemplateColumns: "80px 1.2fr 100px 80px 100px 110px 90px 80px 60px",
            gap: 1, px: 1.5, py: 0.8, borderRadius: "8px",
            bgcolor: isDark ? "var(--surface-sunken)" : "color-mix(in srgb, var(--ink) 2%, transparent)",
          }}>
            {["شماره", "مشتری", "موبایل", "اقلام", "پرداخت", "مبلغ کل", "پرداختی", "باقی", ""].map((h) => (
              <Typography key={h} sx={{ fontSize: F(9), fontWeight: 700, color: C.muted }}>{h}</Typography>
            ))}
          </Box>

          {filteredInvoices.map((inv, i) => {
            const pay = PAYMENTS[inv.payment_method] || PAYMENTS.cash;
            return (
              <Box key={inv.id} {...cursorAttrs(cursor.isActive(i))} sx={{
                ...cursorSx(C, cursor.isActive(i)),
                display: "grid", gridTemplateColumns: "80px 1.2fr 100px 80px 100px 110px 90px 80px 60px",
                gap: 1, px: 1.5, py: 1, borderRadius: "10px", mt: 0.5,
                bgcolor: C.glass, border: `1px solid ${C.glassBorder}`,
                opacity: 0, animation: `fadeUp 0.3s ease-out ${i * 0.03}s forwards`,
                "&:hover": { bgcolor: isDark ? "var(--surface-sunken)" : "color-mix(in srgb, var(--ink) 2%, transparent)" },
              }}>
                <Chip size="small" label={inv.invoice_number} sx={{
                  height: 22, fontSize: F(9), fontWeight: 700, borderRadius: "5px",
                  bgcolor: C.oliveSubtle, color: C.olive, fontFamily: "monospace",
                  width: "100%", justifyContent: "center",
                }} />
                <Typography sx={{ fontSize: F(11), fontWeight: 700, color: C.text, alignSelf: "center" }}>
                  {inv.customer?.first_name} {inv.customer?.last_name}
                </Typography>
                <Typography sx={{ fontSize: F(10), color: C.sub, alignSelf: "center", fontFamily: "monospace" }}>
                  {inv.customer?.mobile}
                </Typography>
                <Typography sx={{ fontSize: F(10), color: C.sub, alignSelf: "center" }}>
                  {inv.items_count} قلم
                </Typography>
                <Chip size="small" label={`${pay.icon} ${pay.label}`} sx={{
                  height: 20, fontSize: F(8), fontWeight: 700, borderRadius: "5px",
                  alignSelf: "center", justifyContent: "center",
                  bgcolor: soft(pay.color, "18"), color: pay.color, border: `1px solid ${soft(pay.color, "30")}`,
                }} />
                <Typography sx={{ fontSize: F(11), fontWeight: 700, color: C.olive, alignSelf: "center" }}>
                  {(inv.grand_total || 0).toLocaleString("en-US")}
                </Typography>
                <Typography sx={{ fontSize: F(10), color: "var(--success)", alignSelf: "center" }}>
                  {(inv.paid_amount || 0).toLocaleString("en-US")}
                </Typography>
                <Typography sx={{
                  fontSize: F(10), fontWeight: 700, alignSelf: "center",
                  color: inv.remaining > 0 ? C.danger : "var(--success)",
                }}>
                  {(inv.remaining || 0).toLocaleString("en-US")}
                </Typography>
                <IconButton size="small" onClick={() => openDetail(inv)} sx={{
                  color: C.info, bgcolor: C.infoBg, borderRadius: "6px", p: 0.5,
                  "&:hover": { bgcolor: C.info, color: "var(--on-primary)" },
                }}>
                  <Visibility sx={{ fontSize: 16 }} />
                </IconButton>
              </Box>
            );
          })}
        </Box>
      )}

      {/* ═══════════════════════════════════════
           مودال فاکتور جدید
      ════════════════════════════════════════ */}
      <Dialog open={dialogOpen} onClose={closeDialog} maxWidth="md" fullWidth
        slotProps={{
          paper: {
            sx: {
              borderRadius: "20px", bgcolor: isDark ? "var(--ink)" : "var(--surface)",
              border: `2px solid ${soft(C.olive, "40")}`, boxShadow: "0 24px 100px color-mix(in srgb, var(--ink) 50%, transparent)",
            },
          },
        }}
      >
        <DialogTitle sx={{
          px: 3, pt: 2.5, pb: 2, borderBottom: `2px solid ${soft(C.olive, "20")}`,
          bgcolor: isDark ? "color-mix(in srgb, var(--success) 10%, transparent)" : "color-mix(in srgb, var(--success) 7%, transparent)",
        }}>
          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
              <Box sx={{
                width: 52, height: 52, borderRadius: "14px",
                display: "flex", alignItems: "center", justifyContent: "center",
                bgcolor: C.oliveSubtle, border: `2px solid ${soft(C.olive, "40")}`,
              }}>
                <Receipt sx={{ fontSize: 30, color: C.olive }} />
              </Box>
              <Box>
                <Typography sx={{ fontSize: 20, fontWeight: 900, color: C.text }}>فاکتور فروش جدید</Typography>
                <Chip size="small"
                  label={`شماره: SI-${String(readJSON("local_sales_invoices", []).length + 1).padStart(3, "0")}`}
                  sx={{ height: 26, fontSize: 13, fontWeight: 800, borderRadius: "8px", bgcolor: C.olive, color: "var(--on-primary)", px: 1, mt: 0.5 }}
                />
              </Box>
            </Box>
            <IconButton onClick={closeDialog} size="large" sx={{
              color: C.danger, bgcolor: C.dangerBg, border: `2px solid ${soft(C.danger, "30")}`,
              borderRadius: "12px", p: 1, "&:hover": { bgcolor: C.danger, color: "var(--on-status)" },
            }}>
              <Close sx={{ fontSize: 24 }} />
            </IconButton>
          </Box>

          <Box sx={{ display: "flex", gap: 1.5, mt: 2, flexWrap: "wrap" }}>
            {[
              { icon: "👤", label: getCurrentUser(), color: "var(--chart-4)" },
              { icon: "📅", label: faDate(now()), color: "var(--success)" },
              { icon: "🕐", label: faTime(now()), color: "var(--warning)" },
              { icon: "📆", label: faDay(now()), color: "var(--info)" },
            ].map((info, i) => (
              <Chip key={i} size="small" label={`${info.icon} ${info.label}`} sx={{
                height: 30, fontSize: 13, fontWeight: 700, borderRadius: "10px",
                bgcolor: soft(info.color, "18"), color: info.color, border: `1.5px solid ${soft(info.color, "30")}`, px: 0.5,
              }} />
            ))}
          </Box>
        </DialogTitle>

        <DialogContent sx={{ px: 3, py: 2.5 }}>
          {/* ── اطلاعات مشتری ── */}
          <Typography sx={{ fontSize: 14, fontWeight: 800, color: C.olive, mb: 1 }}>👤 اطلاعات مشتری</Typography>
          <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 1.5, mb: 2 }}>
            <TextField size="small" label="نام" placeholder="نام"
              value={form.customer_first_name}
              onChange={(e) => setForm((f) => ({ ...f, customer_first_name: e.target.value }))}
              sx={inputSx} />
            <TextField size="small" label="نام خانوادگی" placeholder="نام خانوادگی"
              value={form.customer_last_name}
              onChange={(e) => setForm((f) => ({ ...f, customer_last_name: e.target.value }))}
              sx={inputSx} />
            <TextField size="small" label="شماره موبایل" placeholder="0912..."
              value={form.customer_mobile}
              onChange={(e) => setForm((f) => ({ ...f, customer_mobile: e.target.value }))}
              sx={inputSx} />
          </Box>
          <TextField size="small" label="آدرس" placeholder="آدرس کامل مشتری"
            value={form.customer_address}
            onChange={(e) => setForm((f) => ({ ...f, customer_address: e.target.value }))}
            fullWidth sx={{ ...inputSx, mb: 2 }} />

          {/* ── انبار ── */}
          <Typography sx={{ fontSize: 14, fontWeight: 800, color: C.olive, mb: 1 }}>📦 انبار فروش</Typography>
          <Select size="small" fullWidth value={form.warehouse_id}
            onChange={(e) => setForm((f) => ({ ...f, warehouse_id: e.target.value }))}
            sx={{ ...inputSx, mb: 2, "& .MuiSelect-select": { fontSize: F(12), py: 0.8 } }}
            MenuProps={menuProps}
          >
            {warehouses.map((w) => (
              <MenuItem key={w.id} value={w.id}>{whIcon(w)} {w.name}</MenuItem>
            ))}
          </Select>

          <Divider sx={{ mb: 2, borderColor: soft(C.olive, "25") }} />

          {/* ── اقلام ── */}
          <Typography sx={{ fontSize: 14, fontWeight: 800, color: C.olive, mb: 1 }}>📋 اقلام فروش</Typography>

          <Box sx={{
            display: "grid", gridTemplateColumns: "36px 1.5fr 80px 100px 110px 44px",
            gap: 1, px: 1, mb: 1, py: 0.8, borderRadius: "8px",
            bgcolor: isDark ? "color-mix(in srgb, var(--success) 12%, transparent)" : "color-mix(in srgb, var(--success) 8%, transparent)",
          }}>
            {["#", "کالا", "واحد", "تعداد", "قیمت واحد", ""].map((h, i) => (
              <Typography key={i} sx={{
                fontSize: 12, fontWeight: 800,
                color: isDark ? "var(--success)" : "var(--success)",
                textAlign: i >= 2 ? "center" : "right",
              }}>{h}</Typography>
            ))}
          </Box>

          {form.items.map((it, idx) => {
            const mat = materials.find((m) => m.name === it.material_name);
            return (
              <Box key={idx} sx={{
                display: "grid", gridTemplateColumns: "36px 1.5fr 80px 100px 110px 44px",
                gap: 1, mb: 1, alignItems: "center", px: 1, py: 0.8,
                borderRadius: "10px",
                bgcolor: idx % 2 === 0 ? (isDark ? "var(--surface-sunken)" : "color-mix(in srgb, var(--ink) 2%, transparent)") : "transparent",
                border: `1px solid ${isDark ? "var(--line)" : "color-mix(in srgb, var(--ink) 5%, transparent)"}`,
              }}>
                <Box sx={{
                  width: 28, height: 28, borderRadius: "8px",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  bgcolor: C.olive, color: "var(--on-primary)", fontSize: 14, fontWeight: 900,
                }}>{idx + 1}</Box>

                <Select size="small" fullWidth value={it.material_name}
                  onChange={(e) => updateItem(idx, "material_name", e.target.value)}
                  displayEmpty
                  sx={{
                    "& .MuiOutlinedInput-root": {
                      borderRadius: "8px", bgcolor: isDark ? "var(--line)" : "var(--surface)",
                      fontSize: 13, "& fieldset": { borderColor: C.glassBorder },
                      "&:hover fieldset": { borderColor: soft(C.olive, "60") },
                      "&.Mui-focused fieldset": { borderColor: C.olive },
                    },
                    "& .MuiSelect-select": { fontSize: 13, py: 0.6 },
                  }}
                  MenuProps={menuProps}
                >
                  <MenuItem value="">انتخاب کنید</MenuItem>
                  {materials.map((m) => (
                    <MenuItem key={m.id} value={m.name}>{m.code} — {m.name}</MenuItem>
                  ))}
                </Select>

                <Chip size="small" label={mat ? getUnitLabel(mat.unit) : "—"} sx={{
                  height: 26, fontSize: 11, fontWeight: 700, borderRadius: "6px",
                  bgcolor: "color-mix(in srgb, var(--info) 10%, transparent)", color: "var(--info)",
                  width: "100%", justifyContent: "center",
                }} />

                <TextField size="small" type="number" placeholder="0"
                  value={it.quantity}
                  onChange={(e) => updateItem(idx, "quantity", e.target.value)}
                  sx={{
                    "& .MuiOutlinedInput-root": {
                      borderRadius: "8px", bgcolor: "color-mix(in srgb, var(--warning) 10%, transparent)",
                      "& fieldset": { borderColor: "var(--warning)", borderWidth: 2 },
                      "&:hover fieldset": { borderColor: "var(--warning)" },
                      "&.Mui-focused fieldset": { borderColor: "var(--warning)" },
                    },
                    "& .MuiInputBase-input": { textAlign: "center", fontSize: 16, fontWeight: 800, color: "var(--danger)" },
                  }} />

                <TextField size="small" type="number" placeholder="0"
                  value={it.unit_price}
                  onChange={(e) => updateItem(idx, "unit_price", e.target.value)}
                  sx={{
                    "& .MuiOutlinedInput-root": {
                      borderRadius: "8px", bgcolor: C.inputBg,
                      "& fieldset": { borderColor: C.glassBorder },
                      "&:hover fieldset": { borderColor: soft(C.olive, "60") },
                      "&.Mui-focused fieldset": { borderColor: C.olive },
                    },
                    "& .MuiInputBase-input": { textAlign: "center", fontSize: 13, color: C.text },
                  }} />

                <IconButton size="small" onClick={() => removeItem(idx)} sx={{
                  color: C.danger, bgcolor: C.dangerBg, borderRadius: "8px", p: 0.5,
                  "&:hover": { bgcolor: C.danger, color: "var(--on-status)" },
                }}>
                  <Delete sx={{ fontSize: 18 }} />
                </IconButton>
              </Box>
            );
          })}

          <Button startIcon={<Add sx={{ fontSize: 20 }} />} onClick={addItem} fullWidth sx={{
            mt: 1, mb: 2, color: C.olive,
            bgcolor: isDark ? "color-mix(in srgb, var(--success) 10%, transparent)" : "color-mix(in srgb, var(--success) 8%, transparent)",
            border: `2px dashed ${soft(C.olive, "50")}`, borderRadius: "10px",
            fontWeight: 800, fontSize: 14, textTransform: "none", py: 1,
            "&:hover": { bgcolor: C.oliveSubtle, border: `2px solid ${C.olive}` },
          }}>
            افزودن قلم (Enter / F3)
          </Button>

          <Divider sx={{ mb: 2, borderColor: soft(C.olive, "25") }} />

          {/* ── پرداخت ── */}
          <Typography sx={{ fontSize: 14, fontWeight: 800, color: C.olive, mb: 1 }}>💳 روش پرداخت</Typography>
          <Box sx={{ display: "flex", gap: 1, mb: 2 }}>
            {Object.entries(PAYMENTS).map(([key, val]) => (
              <Chip key={key} clickable
                label={`${val.icon} ${val.label}`}
                onClick={() => setForm((f) => ({ ...f, payment_method: key }))}
                sx={{
                  height: 36, fontSize: 13, fontWeight: 800, borderRadius: "10px",
                  bgcolor: form.payment_method === key ? soft(val.color, "25") : (isDark ? "var(--surface-sunken)" : "color-mix(in srgb, var(--ink) 4%, transparent)"),
                  color: form.payment_method === key ? val.color : C.sub,
                  border: `2px solid ${form.payment_method === key ? val.color : "transparent"}`,
                  px: 2,
                }}
              />
            ))}
          </Box>

          {form.payment_method === "check" && (
            <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.5, mb: 2 }}>
              <TextField size="small" label="شماره چک" placeholder="شماره چک"
                value={form.check_number}
                onChange={(e) => setForm((f) => ({ ...f, check_number: e.target.value }))}
                sx={inputSx} />
              <TextField size="small" label="سررسید چک" placeholder="۱۴۰۵/۹/۱"
                value={form.check_due_date}
                onChange={(e) => setForm((f) => ({ ...f, check_due_date: e.target.value }))}
                sx={inputSx} />
            </Box>
          )}

          {/* ── مبالغ ── */}
          <Box sx={{
            display: "grid", gridTemplateColumns: { xs: "1fr 1fr", sm: "1fr 1fr 1fr 1fr" },
            gap: 1.5, mb: 2,
          }}>
            <TextField size="small" label="تخفیف (تومان)" type="number"
              value={form.discount}
              onChange={(e) => setForm((f) => ({ ...f, discount: e.target.value }))}
              sx={inputSx} />
            <TextField size="small" label="مبلغ پرداختی" type="number"
              value={form.paid_amount}
              onChange={(e) => setForm((f) => ({ ...f, paid_amount: e.target.value }))}
              sx={inputSx} />
            <Box sx={{ p: 1, borderRadius: "8px", bgcolor: C.oliveSubtle, border: `1px solid ${soft(C.olive, "30")}` }}>
              <Typography sx={{ fontSize: 10, color: C.sub }}>جمع کل</Typography>
              <Typography sx={{ fontSize: 16, fontWeight: 900, color: C.olive }}>
                {grandTotal.toLocaleString("en-US")}
              </Typography>
            </Box>
            <Box sx={{
              p: 1, borderRadius: "8px",
              bgcolor: remaining > 0 ? "color-mix(in srgb, var(--danger) 10%, transparent)" : "color-mix(in srgb, var(--success) 10%, transparent)",
              border: `1px solid ${remaining > 0 ? "color-mix(in srgb, var(--danger) 19%, transparent)" : "color-mix(in srgb, var(--success) 19%, transparent)"}`,
            }}>
              <Typography sx={{ fontSize: 10, color: C.sub }}>باقی‌مانده</Typography>
              <Typography sx={{
                fontSize: 16, fontWeight: 900,
                color: remaining > 0 ? "var(--danger)" : "var(--success)",
              }}>
                {remaining.toLocaleString("en-US")}
              </Typography>
            </Box>
          </Box>

          <TextField size="small" label="توضیحات" placeholder="توضیحات فاکتور..."
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            fullWidth multiline rows={2} sx={{ ...inputSx, mb: 1 }} />

          {/* راهنمای میان‌بر */}
          <Box sx={{
            display: "flex", flexWrap: "wrap", gap: 1, mt: 1, px: 2, py: 1,
            borderRadius: "10px", bgcolor: isDark ? "color-mix(in srgb, var(--warning) 8%, transparent)" : "color-mix(in srgb, var(--warning) 10%, transparent)",
            border: `1.5px solid color-mix(in srgb, var(--warning) 25%, transparent)`, alignItems: "center",
          }}>
            <Chip size="small" label="⌨️" sx={{ height: 24, fontSize: 11, fontWeight: 900, borderRadius: "6px", bgcolor: "var(--warning)", color: "var(--ink)" }} />
            {[
              { key: "Ctrl+D", label: "ثبت", color: "var(--success)" },
              { key: "Enter", label: "قلم جدید", color: "var(--info)" },
              { key: "F3", label: "قلم جدید", color: "var(--info)" },
              { key: "Ctrl+⌫", label: "حذف قلم", color: "var(--danger)" },
              { key: "Esc", label: "بستن", color: "var(--danger)" },
            ].map((item) => (
              <Box key={item.key} sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                <Box sx={{
                  px: 0.8, py: 0.2, borderRadius: "5px", bgcolor: soft(item.color, "18"),
                  border: `1px solid ${soft(item.color, "40")}`, fontFamily: "monospace",
                  fontSize: 11, fontWeight: 800, color: item.color,
                }}>{item.key}</Box>
                <Typography sx={{ fontSize: 10, color: C.sub }}>{item.label}</Typography>
              </Box>
            ))}
          </Box>
        </DialogContent>

        <DialogActions sx={{ px: 3, pb: 2.5, pt: 2, borderTop: `2px solid ${soft(C.olive, "20")}`, gap: 2 }}>
          <Button onClick={closeDialog} size="large" sx={{
            borderRadius: "10px", fontSize: 14, fontWeight: 700, textTransform: "none",
            color: C.danger, bgcolor: C.dangerBg, border: `2px solid ${soft(C.danger, "30")}`, px: 3,
            "&:hover": { bgcolor: C.danger, color: "var(--on-status)" },
          }}>✖ انصراف (Esc)</Button>
          <Button onClick={handleSave} disabled={validItems.length === 0} size="large" sx={{
            borderRadius: "10px", fontSize: 14, fontWeight: 800, textTransform: "none",
            color: "var(--on-primary)", background: C.btnGrad, boxShadow: `0 4px 20px ${soft(C.olive, "40")}`, px: 4,
            "&:hover": { transform: "translateY(-2px)" },
            "&.Mui-disabled": { bgcolor: C.muted, color: "var(--on-primary)", opacity: 0.4 },
          }}>💾 ثبت فاکتور (Ctrl+D)</Button>
        </DialogActions>
      </Dialog>

      {/* ═══════════════════════════════════════
           مودال جزئیات فاکتور
      ════════════════════════════════════════ */}
      <Dialog open={detailOpen} onClose={() => setDetailOpen(false)} maxWidth="sm" fullWidth
        slotProps={{
          paper: {
            sx: {
              borderRadius: "16px", bgcolor: isDark ? "var(--ink)" : "var(--surface)",
              border: `2px solid ${soft(C.olive, "30")}`,
            },
          },
        }}
      >
        {selectedInvoice && (
          <>
            <DialogTitle sx={{
              px: 3, pt: 2, pb: 1.5,
              bgcolor: isDark ? "color-mix(in srgb, var(--success) 10%, transparent)" : "color-mix(in srgb, var(--success) 7%, transparent)",
            }}>
              <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <Typography sx={{ fontSize: 18, fontWeight: 900, color: C.text }}>
                  🧾 {selectedInvoice.invoice_number}
                </Typography>
                <IconButton onClick={() => setDetailOpen(false)} size="small">
                  <Close sx={{ fontSize: 20, color: C.danger }} />
                </IconButton>
              </Box>
            </DialogTitle>
            <DialogContent sx={{ px: 3, py: 2 }}>
              {/* مشتری */}
              <Box sx={{ p: 1.5, borderRadius: "10px", bgcolor: C.glass, border: `1px solid ${C.glassBorder}`, mb: 1.5 }}>
                <Typography sx={{ fontSize: 11, fontWeight: 800, color: C.olive, mb: 0.5 }}>👤 مشتری</Typography>
                <Typography sx={{ fontSize: 13, fontWeight: 700, color: C.text }}>
                  {selectedInvoice.customer?.first_name} {selectedInvoice.customer?.last_name}
                </Typography>
                <Typography sx={{ fontSize: 11, color: C.sub }}>
                  📱 {selectedInvoice.customer?.mobile} | 📍 {selectedInvoice.customer?.address || "—"}
                </Typography>
              </Box>

              {/* اطلاعات */}
              <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 1.5 }}>
                {[
                  `👤 ${selectedInvoice.user}`,
                  `📅 ${selectedInvoice.date}`,
                  `🕐 ${selectedInvoice.time}`,
                  `💳 ${(PAYMENTS[selectedInvoice.payment_method] || PAYMENTS.cash).label}`,
                ].map((t, i) => (
                  <Chip key={i} size="small" label={t} sx={{
                    height: 24, fontSize: 11, borderRadius: "6px",
                    bgcolor: C.oliveSubtle, color: C.olive,
                  }} />
                ))}
              </Box>

              {/* اقلام */}
              <Typography sx={{ fontSize: 12, fontWeight: 800, color: C.olive, mb: 0.5 }}>📋 اقلام</Typography>
              {selectedInvoice.items?.map((it, i) => (
                <Box key={i} sx={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  px: 1, py: 0.8, borderRadius: "8px", mb: 0.5,
                  bgcolor: i % 2 === 0 ? (isDark ? "var(--surface-sunken)" : "color-mix(in srgb, var(--ink) 2%, transparent)") : "transparent",
                }}>
                  <Typography sx={{ fontSize: 12, color: C.text }}>
                    {it.material_code} {it.material_name}
                  </Typography>
                  <Typography sx={{ fontSize: 11, color: C.sub }}>
                    {it.quantity} {getUnitLabel(it.unit)} × {it.unit_price.toLocaleString("en-US")}
                  </Typography>
                  <Typography sx={{ fontSize: 12, fontWeight: 700, color: C.olive }}>
                    {it.line_total.toLocaleString("en-US")}
                  </Typography>
                </Box>
              ))}

              <Divider sx={{ my: 1.5 }} />

              {/* مبالغ */}
              {[
                { label: "جمع کل", value: selectedInvoice.subtotal, color: C.text },
                { label: "تخفیف", value: selectedInvoice.discount, color: "var(--danger)" },
                { label: "مبلغ نهایی", value: selectedInvoice.grand_total, color: C.olive, bold: true },
                { label: "پرداختی", value: selectedInvoice.paid_amount, color: "var(--success)" },
                { label: "باقی‌مانده", value: selectedInvoice.remaining, color: selectedInvoice.remaining > 0 ? C.danger : "var(--success)" },
              ].map((row, i) => (
                <Box key={i} sx={{ display: "flex", justifyContent: "space-between", py: 0.3 }}>
                  <Typography sx={{ fontSize: 12, color: C.sub, fontWeight: row.bold ? 800 : 500 }}>{row.label}</Typography>
                  <Typography sx={{ fontSize: row.bold ? 14 : 12, fontWeight: row.bold ? 900 : 600, color: row.color }}>
                    {row.value?.toLocaleString("en-US")} تومان
                  </Typography>
                </Box>
              ))}

              {selectedInvoice.check_number && (
                <Box sx={{ mt: 1, p: 1, borderRadius: "8px", bgcolor: "color-mix(in srgb, var(--info) 10%, transparent)" }}>
                  <Typography sx={{ fontSize: 11, color: "var(--info)" }}>
                    📄 چک: {selectedInvoice.check_number} | سررسید: {selectedInvoice.check_due_date}
                  </Typography>
                </Box>
              )}
            </DialogContent>
          </>
        )}
      </Dialog>
    </Box>
  );
}