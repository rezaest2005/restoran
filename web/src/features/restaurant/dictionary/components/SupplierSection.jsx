import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  Box, Typography, Button, TextField, Chip, CircularProgress, IconButton,
} from "@mui/material";
import { Add, Delete, Edit, Refresh, Person } from "@mui/icons-material";
import {
  fetchSuppliers,
  saveSupplier,
  deleteSupplier,
} from "../api";

// ═══════════ ثابت‌ها و ابزارها (هم‌سبک با «ثبت فاکتور خرید») ═══════════
const F = (size) => Math.round(size * 1.1);
const CTRL_H = 34;

const FA_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
const toLatin = (s) =>
  String(s)
    .replace(/[۰-۹]/g, (d) => FA_DIGITS.indexOf(d))
    .replace(/[٠-٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d));

const emptyForm = () => ({
  first_name: "",
  last_name: "",
  mobile: "",
  address: "",
  description: "",
});

// برچسب بالای فیلد (یکسان برای همه فیلدها تا هم‌راستا شوند)
function FieldBox({ C, label, children }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography sx={{ fontSize: F(11), color: C.sub, mb: 0.3, fontWeight: 700, lineHeight: 1.4 }}>
        {label}
      </Typography>
      {children}
    </Box>
  );
}

export default function SupplierSection({ C: CBase, isDark, showToast }) {
  // همه متن‌ها سفید/واضح: رنگ‌های کم‌رنگ (sub/muted) با رنگ اصلی متن جایگزین می‌شوند
  const C = useMemo(() => ({ ...CBase, sub: CBase.text, muted: CBase.text }), [CBase]);

  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editSupplier, setEditSupplier] = useState(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm());

  // ── refs ──
  const rootRef = useRef(null);
  const formBoxRef = useRef(null);
  const firstNameRef = useRef(null);
  const savingRef = useRef(false);
  const formStateRef = useRef(form); formStateRef.current = form;
  const editRef = useRef(editSupplier); editRef.current = editSupplier;
  const showFormRef = useRef(showForm); showFormRef.current = showForm;

  const notify = useCallback((msg, type = "info") => {
    if (typeof showToast === "function") showToast(msg, type);
  }, [showToast]);

  // ═══════════ بارگذاری ═══════════
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchSuppliers();
      setSuppliers(Array.isArray(data) ? data : data.suppliers || []);
    } catch (err) {
      console.error("Fetch suppliers error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    if (!search.trim()) return suppliers;
    const q = search.toLowerCase();
    return suppliers.filter((s) =>
      s.name?.toLowerCase().includes(q) ||
      s.first_name?.toLowerCase().includes(q) ||
      s.last_name?.toLowerCase().includes(q) ||
      s.mobile?.includes(q) ||
      s.phone?.includes(q) ||
      s.contact_person?.toLowerCase().includes(q)
    );
  }, [suppliers, search]);

  // ── باز/بستن فرم ──
  const focusFirst = useCallback(() => {
    setTimeout(() => firstNameRef.current?.focus(), 150);
  }, []);

  const openCreate = useCallback(() => {
    setEditSupplier(null);
    setForm(emptyForm());
    setShowForm(true);
    focusFirst();
  }, [focusFirst]);

  const openEdit = useCallback((s) => {
    setEditSupplier(s);
    // رکوردهای قدیمی فقط «name» دارند؛ آن را در «نام» می‌گذاریم تا چیزی گم نشود
    setForm({
      first_name: s.first_name ?? s.name ?? "",
      last_name: s.last_name ?? "",
      mobile: s.mobile || s.phone || "",
      address: s.address || "",
      description: s.description || "",
    });
    setShowForm(true);
    focusFirst();
  }, [focusFirst]);

  const closeForm = useCallback(() => {
    setShowForm(false);
    setEditSupplier(null);
  }, []);

  // ═══════════ ذخیره ═══════════
  const handleSave = useCallback(async () => {
    const f = formStateRef.current;
    const first = f.first_name.trim();
    const last = f.last_name.trim();
    if (!first && !last) {
      notify("نام تأمین‌کننده الزامی است", "warning");
      return;
    }
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      const mobile = f.mobile.trim();
      const edit = editRef.current;
      const payload = {
        id: edit?.id,
        // «name» = نام کامل؛ بقیه‌ی بخش‌ها (فاکتور، لیست‌ها) همچنان از آن استفاده می‌کنند
        name: [first, last].filter(Boolean).join(" "),
        first_name: first,
        last_name: last,
        mobile,
        phone: mobile, // سازگاری با بخش‌هایی که هنوز «phone» می‌خوانند
        address: f.address.trim(),
        contact_person: edit?.contact_person || "", // مقدار قبلی حفظ می‌شود
        description: f.description.trim(),
      };
      const res = await saveSupplier(payload);
      notify(res?.msg || "ذخیره شد ✅", "success");
      setShowForm(false);
      setEditSupplier(null);
      setForm(emptyForm());
      load();
    } catch (err) {
      notify(err.response?.data?.error || err.message || "خطا", "error");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }, [notify, load]);

  const handleDelete = useCallback(async (s) => {
    if (!window.confirm(`«${s.name}» حذف شود؟`)) return;
    try {
      await deleteSupplier({ id: s.id });
      notify(`«${s.name}» حذف شد`, "success");
      load();
    } catch (err) {
      notify(err.response?.data?.error || err.message || "خطا", "error");
    }
  }, [notify, load]);

  // ═══════════ کیبورد (همان کلیدهای «ثبت فاکتور خرید») ═══════════
  // حرکت بین همه‌ی خانه‌های فرم: نام ← نام خانوادگی ← موبایل ← آدرس ← توضیحات
  const moveFocus = useCallback((delta) => {
    const root = formBoxRef.current;
    if (!root) return;
    const nodes = Array.from(root.querySelectorAll("input, textarea")).filter(
      (el) => !el.disabled && el.tabIndex !== -1 && el.offsetParent !== null
    );
    if (!nodes.length) return;
    const cur = nodes.findIndex((n) => n === document.activeElement);
    const next = cur === -1 ? (delta > 0 ? 0 : nodes.length - 1) : cur + delta;
    if (next < 0 || next >= nodes.length) return;
    nodes[next].focus();
    nodes[next].select?.();
  }, []);

  const isVisible = () => !!rootRef.current && rootRef.current.offsetParent !== null;

  const handleKeyDown = useCallback((e) => {
    if (!isVisible()) return;
    const sf = showFormRef.current;
    const isCtrl = e.ctrlKey && !e.altKey;

    // F2 = تأمین‌کننده جدید
    if (e.key === "F2") {
      e.preventDefault();
      if (!sf || editRef.current) openCreate();
      else firstNameRef.current?.focus();
      return;
    }

    // Esc = بستن
    if (e.key === "Escape") {
      if (sf) { e.preventDefault(); closeForm(); }
      return;
    }

    // Enter = خانه بعدی
    if (e.key === "Enter" && !isCtrl && !e.altKey && sf) {
      const tag = e.target.tagName;
      if ((tag === "INPUT" || tag === "TEXTAREA") && formBoxRef.current?.contains(e.target)) {
        e.preventDefault();
        moveFocus(1);
      }
      return;
    }

    // Ctrl+A = بعدی ، Ctrl+Z = قبلی
    if (isCtrl && sf && (e.code === "KeyA" || e.code === "KeyZ")) {
      e.preventDefault();
      moveFocus(e.code === "KeyA" ? 1 : -1);
    }
  }, [openCreate, closeForm, moveFocus]);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  // Ctrl+D = ذخیره (فاز capture تا قبل از «افزودن نشانک» مرورگر اجرا شود)
  const handleSaveRef = useRef(handleSave); handleSaveRef.current = handleSave;
  useEffect(() => {
    const onSaveKey = (e) => {
      if (!showFormRef.current || !isVisible()) return;
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const k = String(e.key || "").toLowerCase();
      if (!(e.code === "KeyD" || k === "d" || k === "ی")) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (!e.repeat) handleSaveRef.current();
    };
    window.addEventListener("keydown", onSaveKey, true);
    return () => window.removeEventListener("keydown", onSaveKey, true);
  }, []);

  // ── استایل‌ها (همان استایل ثبت فاکتور) ──
  const inputSx = {
    "& .MuiOutlinedInput-root": {
      borderRadius: "8px", bgcolor: C.inputBg,
      fontSize: F(11), color: C.text, height: CTRL_H,
      "& fieldset": { borderColor: C.glassBorder },
      "&:hover fieldset": { borderColor: C.olive + "60" },
      "&.Mui-focused fieldset": { borderColor: C.olive, borderWidth: 1.5 },
      "&.Mui-focused": { boxShadow: `0 0 0 2px ${C.olive}18` },
    },
    "& .MuiInputLabel-root": { fontSize: F(12), color: C.sub },
    "& .MuiInputBase-input": { color: C.text, py: 0, px: 1.2, height: CTRL_H, boxSizing: "border-box" },
    "& .MuiInputBase-input::placeholder": { color: C.text, opacity: 0.45 },
  };

  const btnSx = {
    borderRadius: "8px", fontSize: F(11), fontWeight: 700, textTransform: "none",
    px: 2, py: 0.7, color: "#fff", background: C.btnGrad,
    boxShadow: `0 2px 12px ${C.olive}25`,
    transition: "all 0.2s ease",
    "&:hover": { transform: "translateY(-1px)", boxShadow: `0 4px 16px ${C.olive}35` },
    "&:active": { transform: "scale(0.98)" },
  };

  const cancelBtnSx = {
    borderRadius: "8px", fontSize: F(11), fontWeight: 700, textTransform: "none",
    color: C.sub, border: `1px solid ${C.glassBorder}`, px: 2, py: 0.7,
    "&:hover": { bgcolor: C.oliveSubtle },
  };

  const blueChip = {
    bgcolor: isDark ? "rgba(100,140,255,0.1)" : "rgba(50,90,200,0.08)",
    color: isDark ? "#8AAFFF" : "#2A4AAA",
  };

  if (loading && suppliers.length === 0) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
        <CircularProgress sx={{ color: C.olive }} size={32} />
      </Box>
    );
  }

  return (
    <Box ref={rootRef}>
      {/* ── هدر ── */}
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2, flexWrap: "wrap", gap: 1 }}>
        <Box>
          <Typography sx={{ fontSize: F(15), fontWeight: 800, color: C.text }}>
            🏭 تأمین‌کنندگان
          </Typography>
          <Typography sx={{ fontSize: F(12), color: C.sub, mt: 0.2 }}>
            {suppliers.length} تأمین‌کننده ثبت شده
          </Typography>
        </Box>
        <Box sx={{ display: "flex", gap: 0.8 }}>
          <IconButton onClick={load} size="small"
            sx={{ border: `1px solid ${C.glassBorder}`, borderRadius: "8px", bgcolor: C.glass, color: C.text, p: 0.8 }}>
            <Refresh sx={{ fontSize: 16 }} />
          </IconButton>
          <Button onClick={() => (showForm ? closeForm() : openCreate())} sx={btnSx}>
            {showForm ? "✖ بستن فرم (Esc)" : "➕ تأمین‌کننده جدید (F2)"}
          </Button>
        </Box>
      </Box>

      {/* ═══════════ فرم (داخل صفحه، نه مودال) ═══════════ */}
      {showForm && (
        <Box ref={formBoxRef} sx={{
          bgcolor: C.glass, border: `1px solid ${C.glassBorder}`,
          borderRadius: "12px", p: { xs: 1.5, sm: 2 }, mb: 2,
          animation: "fadeUp 0.2s ease-out",
        }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap", mb: 1.5 }}>
            <Typography sx={{ fontSize: F(12), fontWeight: 800, color: C.text }}>
              👤 {editSupplier ? `ویرایش «${editSupplier.name}»` : "تأمین‌کننده جدید"}
            </Typography>
            <Chip size="small" label={editSupplier ? "✏️ حالت ویرایش" : "🆕 جدید"}
              sx={{ height: 20, fontSize: F(10), fontWeight: 700, borderRadius: "5px", ...(editSupplier ? { bgcolor: C.oliveSubtle, color: C.olive } : blueChip) }} />
          </Box>

          {/* ردیف ۱: نام، نام خانوادگی، موبایل، آدرس در یک خط */}
          <Box sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr 1fr", md: "minmax(120px,1fr) minmax(120px,1fr) 170px minmax(220px,2fr)" },
            gap: 1, mb: 1.2, alignItems: "end",
          }}>
            <FieldBox C={C} label="نام *">
              <TextField size="small" fullWidth autoComplete="off" inputRef={firstNameRef}
                value={form.first_name}
                onChange={(e) => setForm({ ...form, first_name: e.target.value })}
                sx={inputSx} />
            </FieldBox>

            <FieldBox C={C} label="نام خانوادگی">
              <TextField size="small" fullWidth autoComplete="off"
                value={form.last_name}
                onChange={(e) => setForm({ ...form, last_name: e.target.value })}
                sx={inputSx} />
            </FieldBox>

            <FieldBox C={C} label="شماره موبایل">
              <TextField size="small" fullWidth autoComplete="off" placeholder="09123456789"
                value={form.mobile}
                onChange={(e) => setForm({ ...form, mobile: toLatin(e.target.value) })}
                inputProps={{ inputMode: "tel", dir: "ltr", style: { textAlign: "center" } }}
                sx={inputSx} />
            </FieldBox>

            <FieldBox C={C} label="آدرس">
              <TextField size="small" fullWidth autoComplete="off"
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                sx={inputSx} />
            </FieldBox>
          </Box>

          {/* ردیف ۲: توضیحات */}
          <FieldBox C={C} label="توضیحات">
            <TextField size="small" fullWidth autoComplete="off"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              sx={inputSx} />
          </FieldBox>

          {/* ── دکمه‌ها ── */}
          <Box sx={{ display: "flex", justifyContent: "flex-end", gap: 1, mt: 1.5 }}>
            <Button onClick={closeForm} sx={cancelBtnSx}>انصراف (Esc)</Button>
            <Button onClick={handleSave} disabled={saving} sx={btnSx}>
              {saving
                ? <CircularProgress size={14} sx={{ color: "#fff" }} />
                : editSupplier ? "💾 بروزرسانی (Ctrl+D)" : "💾 ذخیره (Ctrl+D)"}
            </Button>
          </Box>
        </Box>
      )}

      {/* ══ راهنمای کیبورد ══ */}
      <Box sx={{
        display: "flex", flexWrap: "wrap", gap: 0.6,
        alignItems: "center", mb: 2, px: 1.5, py: 1,
        borderRadius: "10px",
        bgcolor: isDark ? "rgba(107,155,110,0.07)" : "rgba(46,77,48,0.06)",
        border: `1px solid ${C.olive}20`,
      }}>
        <Chip size="small" label="راهنما"
          sx={{
            height: 22, fontSize: F(11), fontWeight: 900,
            borderRadius: "5px", bgcolor: "#FFD600", color: "#1A1A00",
            px: 0.8, mr: 0.5,
          }} />
        {[
          { key: "Ctrl+D", label: "ذخیره" },
          { key: "Ctrl+A", label: "بعدی" },
          { key: "Ctrl+Z", label: "قبلی" },
          { key: "F2", label: "جدید" },
          { key: "Enter", label: "بعدی" },
          { key: "Esc", label: "بستن" },
        ].map((item, i) => (
          <Box key={i} sx={{ display: "flex", alignItems: "center", gap: 0.4 }}>
            <Chip size="small" label={item.key}
              sx={{
                height: 20, fontSize: F(11), fontWeight: 800,
                borderRadius: "5px", fontFamily: "monospace",
                bgcolor: C.oliveSubtle, color: C.olive,
                border: `1px solid ${C.olive}30`, px: 0.4,
              }} />
            <Typography sx={{ fontSize: F(11), color: C.sub, fontWeight: 700 }}>
              {item.label}
            </Typography>
          </Box>
        ))}
      </Box>

      {/* ═══════════ لیست تأمین‌کنندگان ═══════════ */}
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 1, mb: 1 }}>
        <Typography sx={{ fontSize: F(12), fontWeight: 700, color: C.text }}>
          📋 تأمین‌کنندگان ثبت‌شده ({filtered.length})
        </Typography>
        <TextField
          size="small"
          placeholder="جستجو (نام، موبایل)..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          sx={{ ...inputSx, width: "100%", maxWidth: 280 }}
        />
      </Box>

      {filtered.length === 0 ? (
        <Box sx={{ textAlign: "center", py: 5 }}>
          <Typography sx={{ fontSize: 32, mb: 0.5 }}>🏭</Typography>
          <Typography sx={{ fontSize: F(13), fontWeight: 700, color: C.text }}>
            {suppliers.length === 0 ? "هنوز تأمین‌کننده‌ای ثبت نشده" : "موردی پیدا نشد"}
          </Typography>
          {suppliers.length === 0 && (
            <Typography sx={{ fontSize: F(12), color: C.sub, mt: 0.3 }}>
              F2 بزنید یا روی «تأمین‌کننده جدید» کلیک کنید
            </Typography>
          )}
        </Box>
      ) : (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 0.8 }}>
          {filtered.map((s, i) => (
            <Box
              key={s.id}
              sx={{
                bgcolor: C.glass, border: `1px solid ${C.glassBorder}`,
                borderRadius: "10px", p: 1.5,
                opacity: 0,
                animation: `fadeUp 0.3s ease-out ${i * 0.04}s forwards`,
                transition: "border-color 0.15s ease",
                "&:hover": { borderColor: C.olive + "50" },
              }}
            >
              <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 0.8 }}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
                  <Person sx={{ fontSize: 18, color: C.olive }} />
                  <Typography sx={{ fontSize: F(12), fontWeight: 800, color: C.text }}>
                    {s.name}
                  </Typography>
                  {(s.mobile || s.phone) && (
                    <Chip size="small" label={`📞 ${s.mobile || s.phone}`}
                      sx={{ height: 20, fontSize: F(10), fontWeight: 700, borderRadius: "5px", fontFamily: "monospace", ...blueChip }} />
                  )}
                  {s.contact_person && (
                    <Chip size="small" label={s.contact_person}
                      sx={{ height: 20, fontSize: F(10), fontWeight: 700, borderRadius: "5px", bgcolor: C.oliveSubtle, color: C.olive }} />
                  )}
                </Box>

                <Box sx={{ display: "flex", alignItems: "center", gap: 0.6 }}>
                  <IconButton size="small" onClick={() => openEdit(s)} title="ویرایش"
                    sx={{ color: C.olive, bgcolor: C.oliveSubtle, borderRadius: "6px", p: 0.4 }}>
                    <Edit sx={{ fontSize: 14 }} />
                  </IconButton>
                  <IconButton size="small" onClick={() => handleDelete(s)} title="حذف"
                    sx={{ color: C.danger, bgcolor: C.dangerBg, borderRadius: "6px", p: 0.4 }}>
                    <Delete sx={{ fontSize: 14 }} />
                  </IconButton>
                </Box>
              </Box>

              {s.address && (
                <Typography sx={{ fontSize: F(11), color: C.sub, mt: 0.5, pr: 3 }}>
                  📍 {s.address}
                </Typography>
              )}
              {s.description && (
                <Typography sx={{ fontSize: F(11), color: C.sub, mt: 0.3, pr: 3 }}>
                  📝 {s.description}
                </Typography>
              )}
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}