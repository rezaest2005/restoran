import { useState, useCallback, useRef, useMemo, useEffect } from "react";
import {
  Box, Typography, Button, TextField, Select, MenuItem,
  CircularProgress, IconButton, Chip,
} from "@mui/material";
import { Add, Delete, Refresh, ReceiptLong } from "@mui/icons-material";
import { getUnitLabel } from "../../../../shared/common/units";

const F = (size) => Math.round(size * 1.1);

const LS_MATERIALS = "local_materials";
const LS_WAREHOUSES = "local_warehouses";
const LS_SUPPLIERS = "local_suppliers";
const LS_INVOICES = "local_purchase_invoices";

const readJSON = (key, def = []) => {
  try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(def)); }
  catch { return def; }
};
const writeJSON = (key, val) => {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
};

const MOTHER = { id: "mother", name: "انبار مرکزی", is_mother: true };
const emptyItem = () => ({ code: "", raw_material_id: "", quantity: "", unit_price: "" });
const todayISO = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};
const supMobile = (s) => s?.mobile || s?.phone || "";

// ═══════════ تأمین‌کننده: نام، نام خانوادگی، موبایل، آدرس ═══════════
// سازگار با رکوردهای قدیمی که فقط «name» دارند
const supParts = (s) => ({
  first: s?.first_name ?? s?.name ?? "",
  last: s?.last_name ?? "",
  mobile: supMobile(s),
  address: s?.address || "",
});
const supFullName = (first, last) => [first, last].map((x) => (x || "").trim()).filter(Boolean).join(" ");
const digitsOnly = (s) => toLatin(s || "").replace(/\D/g, "");

// ═══════════ تاریخ شمسی (جلالی) ═══════════
const FA_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
const toFa = (s) => String(s).replace(/\d/g, (d) => FA_DIGITS[d]);
const toLatin = (s) =>
  String(s)
    .replace(/[۰-۹]/g, (d) => FA_DIGITS.indexOf(d))
    .replace(/[٠-٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d));
const pad2 = (n) => String(n).padStart(2, "0");
const div = (a, b) => Math.trunc(a / b);
const G_DM = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];

function gregorianToJalali(gy, gm, gd) {
  const gy2 = gm > 2 ? gy + 1 : gy;
  let days = 355666 + 365 * gy + div(gy2 + 3, 4) - div(gy2 + 99, 100) + div(gy2 + 399, 400) + gd + G_DM[gm - 1];
  let jy = -1595 + 33 * div(days, 12053);
  days %= 12053;
  jy += 4 * div(days, 1461);
  days %= 1461;
  if (days > 365) { jy += div(days - 1, 365); days = (days - 1) % 365; }
  const jm = days < 186 ? 1 + div(days, 31) : 7 + div(days - 186, 30);
  const jd = 1 + (days < 186 ? days % 31 : (days - 186) % 30);
  return [jy, jm, jd];
}

function jalaliToGregorian(jy, jm, jd) {
  jy += 1595;
  let days = -355668 + 365 * jy + div(jy, 33) * 8 + div((jy % 33) + 3, 4) + jd + (jm < 7 ? (jm - 1) * 31 : (jm - 7) * 30 + 186);
  let gy = 400 * div(days, 146097);
  days %= 146097;
  if (days > 36524) {
    gy += 100 * div(--days, 36524);
    days %= 36524;
    if (days >= 365) days++;
  }
  gy += 4 * div(days, 1461);
  days %= 1461;
  if (days > 365) { gy += div(days - 1, 365); days = (days - 1) % 365; }
  let gd = days + 1;
  const leap = (gy % 4 === 0 && gy % 100 !== 0) || gy % 400 === 0;
  const sal = [0, 31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  let gm = 0;
  while (gm < 13 && gd > sal[gm]) { gd -= sal[gm]; gm++; }
  return [gy, gm, gd];
}

// "2026-10-25" → "1405/08/03" (ارقام لاتین)
const isoToJalaliText = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ""));
  if (!m) return "";
  const [jy, jm, jd] = gregorianToJalali(+m[1], +m[2], +m[3]);
  return `${jy}/${pad2(jm)}/${pad2(jd)}`;
};

// "1405/08/03" → "2026-10-25" (یا "" اگر نامعتبر باشد)
const jalaliTextToIso = (txt) => {
  const m = /^(\d{4})\/(\d{2})\/(\d{2})$/.exec(txt);
  if (!m) return "";
  const jy = +m[1], jm = +m[2], jd = +m[3];
  if (jm < 1 || jm > 12 || jd < 1) return "";
  if (jd > (jm <= 6 ? 31 : jm <= 11 ? 30 : 30)) return "";
  const [gy, gm, gd] = jalaliToGregorian(jy, jm, jd);
  return `${gy}-${pad2(gm)}-${pad2(gd)}`;
};

// نمایش تاریخ شمسی با ارقام فارسی
const fmtDate = (d) => {
  const t = isoToJalaliText(String(d || "").slice(0, 10));
  return t ? toFa(t) : "—";
};

const ITEM_COLS = "28px 90px 1.6fr 100px 56px 80px 100px 100px 32px";
const CTRL_H = 34;

// فیلد تاریخ شمسی: ورودی با ماسک ۱۴۰۵/۰۸/۰۳، مقدار ذخیره‌شده ISO میلادی
function JalaliDateField({ C, value, onChange, sx }) {
  const [text, setText] = useState(() => isoToJalaliText(value));

  // اگر مقدار از بیرون عوض شد (مثلاً بعد از ذخیره)، متن را هماهنگ کن
  useEffect(() => {
    if (value && jalaliTextToIso(text) !== value) setText(isoToJalaliText(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const handle = (e) => {
    const digits = toLatin(e.target.value).replace(/\D/g, "").slice(0, 8);
    let out = digits;
    if (digits.length > 4) out = `${digits.slice(0, 4)}/${digits.slice(4)}`;
    if (digits.length > 6) out = `${digits.slice(0, 4)}/${digits.slice(4, 6)}/${digits.slice(6)}`;
    setText(out);
    onChange(jalaliTextToIso(out));
  };

  const setToday = () => {
    const iso = todayISO();
    setText(isoToJalaliText(iso));
    onChange(iso);
  };

  const invalid = text.length > 0 && !jalaliTextToIso(text);

  return (
    <TextField
      size="small" fullWidth
      value={toFa(text)}
      onChange={handle}
      error={invalid}
      placeholder="۱۴۰۵/۰۱/۰۱"
      inputProps={{ dir: "ltr", inputMode: "numeric", style: { textAlign: "center", fontWeight: 700, letterSpacing: 0.5 } }}
      InputProps={{
        endAdornment: (
          <Box
            component="span" onClick={setToday} title="امروز"
            sx={{
              cursor: "pointer", fontSize: F(10), fontWeight: 800, color: C.olive,
              bgcolor: C.oliveSubtle, borderRadius: "5px", px: 0.7, py: 0.2, ml: 0.5,
              userSelect: "none", whiteSpace: "nowrap",
              "&:hover": { bgcolor: C.olive + "30" },
            }}
          >
            امروز
          </Box>
        ),
      }}
      sx={sx}
    />
  );
}

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

export default function PurchaseInvoiceTab({ C: CBase, isDark, showToast }) {
  // همه متن‌ها سفید/واضح: رنگ‌های کم‌رنگ (sub/muted) با رنگ اصلی متن جایگزین می‌شوند
  const C = useMemo(() => ({ ...CBase, sub: CBase.text, muted: CBase.text }), [CBase]);

  const [materials, setMaterials] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const [form, setForm] = useState({
    supplier_id: "",
    sup_first: "",
    sup_last: "",
    sup_mobile: "",
    sup_address: "",
    invoice_number: "",
    invoice_date: todayISO(),
    warehouse_id: "mother",
    payment_method: "cash",
    paid_amount: "",
    description: "",
  });

  // لیست پیشنهادی تأمین‌کنندگان (با ↑ ↓ باز و پیمایش می‌شود)
  const [supOpen, setSupOpen] = useState(false);
  const [supActive, setSupActive] = useState(-1);

  const [items, setItems] = useState([emptyItem()]);

  // ── refs ──
  const invoiceNumberRef = useRef(null);
  const savingRef = useRef(false);
  const formRef = useRef(form); formRef.current = form;
  const itemsRef = useRef(items); itemsRef.current = items;
  const showFormRef = useRef(showForm); showFormRef.current = showForm;

  const notify = useCallback((msg, type = "info") => {
    if (typeof showToast === "function") showToast(msg, type);
  }, [showToast]);

  // ═══════════ بارگذاری ═══════════
  const load = useCallback(() => {
    setLoading(true);
    setMaterials(readJSON(LS_MATERIALS, []));
    setSuppliers(readJSON(LS_SUPPLIERS, []));
    const subs = readJSON(LS_WAREHOUSES, []).filter((w) => !w.is_mother);
    setWarehouses([MOTHER, ...subs]);
    setInvoices(readJSON(LS_INVOICES, []));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const focusCell = useCallback((cell) => {
    const el = document.querySelector(`[data-cell="${cell}"]`);
    if (el) { el.focus(); el.select?.(); }
  }, []);

  // ── حرکت بین همه‌ی خانه‌های فرم به ترتیب: شماره فاکتور ← تاریخ ← تأمین‌کننده ← انبار ← پرداخت ← ردیف‌ها ← پرداختی ← یادداشت ──
  const formBoxRef = useRef(null);
  const moveFocus = useCallback((delta) => {
    const root = formBoxRef.current;
    if (!root) return;
    const nodes = Array.from(
      root.querySelectorAll('input, [role="combobox"], [aria-haspopup="listbox"]')
    ).filter((el) =>
      !el.disabled && el.getAttribute("aria-hidden") !== "true" && el.tabIndex !== -1 && el.offsetParent !== null
    );
    if (!nodes.length) return;
    const active = document.activeElement;
    const cur = nodes.findIndex((n) => n === active || n.contains(active));
    const next = cur === -1 ? (delta > 0 ? 0 : nodes.length - 1) : cur + delta;
    if (next < 0 || next >= nodes.length) return;
    const el = nodes[next];
    el.focus();
    if (el.tagName === "INPUT") el.select?.();
    el.scrollIntoView?.({ block: "nearest" });
  }, []);

  // ── مدیریت اقلام ──
  const addItem = useCallback(() => {
    setItems((prev) => [...prev, emptyItem()]);
  }, []);

  const removeItem = useCallback((idx) => {
    setItems((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev));
  }, []);

  const updateItem = useCallback((idx, field, val) => {
    setItems((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: val };
      return next;
    });
  }, []);

  // انتخاب کالا (از روی کد یا لیست) → کد، کالا و قیمت پیش‌فرض یکجا ست می‌شود
  const pickMaterial = useCallback((idx, mat) => {
    setItems((prev) => {
      const next = [...prev];
      const cur = next[idx];
      next[idx] = {
        ...cur,
        raw_material_id: mat.id,
        code: mat.code || cur.code,
        unit_price: cur.unit_price !== "" ? cur.unit_price : (mat.price ?? ""),
      };
      return next;
    });
  }, []);

  const handleCodeChange = useCallback((idx, value) => {
    const v = value.trim().toLowerCase();
    const mat = v
      ? materials.find((m) => String(m.code || "").trim().toLowerCase() === v)
      : null;
    if (mat) {
      pickMaterial(idx, mat);
      // کد را همان‌طور که تایپ شده نگه می‌داریم تا کاربر مزاحمت نبیند
      updateItem(idx, "code", value);
    } else {
      setItems((prev) => {
        const next = [...prev];
        next[idx] = { ...next[idx], code: value, raw_material_id: "" };
        return next;
      });
    }
  }, [materials, pickMaterial, updateItem]);

  // ── محاسبات ──
  const getMat = useCallback((id) => materials.find((m) => String(m.id) === String(id)), [materials]);
  const lineTotal = useCallback((it) => (parseFloat(it.quantity) || 0) * (parseFloat(it.unit_price) || 0), []);
  const grandTotal = useMemo(() => items.reduce((s, i) => s + lineTotal(i), 0), [items, lineTotal]);
  const validItems = useMemo(() => items.filter((i) => i.raw_material_id && parseFloat(i.quantity) > 0), [items]);

  // تأمین‌کنندگان هم‌خوان با آنچه تایپ شده (اگر چیزی تایپ نشده، همه)
  const supMatches = useMemo(() => {
    const typedName = supFullName(form.sup_first, form.sup_last).toLowerCase();
    const typedMobile = digitsOnly(form.sup_mobile);
    return suppliers.filter((s) => {
      const p = supParts(s);
      const full = (s.name || supFullName(p.first, p.last)).toLowerCase();
      if (typedName && !full.includes(typedName)) return false;
      if (typedMobile && !digitsOnly(p.mobile).includes(typedMobile)) return false;
      return true;
    });
  }, [suppliers, form.sup_first, form.sup_last, form.sup_mobile]);

  const hasTypedSupplier = !!(form.sup_first.trim() || form.sup_last.trim() || form.sup_mobile.trim() || form.sup_address.trim());

  const selectSupplier = useCallback((s) => {
    const p = supParts(s);
    setForm((f) => ({
      ...f,
      supplier_id: s.id,
      sup_first: p.first,
      sup_last: p.last,
      sup_mobile: p.mobile,
      sup_address: p.address,
    }));
    setSupOpen(false);
    setSupActive(-1);
    setTimeout(() => focusCell("code-0"), 30); // برو بعدی: اولین ردیف کالا
  }, [focusCell]);

  // تغییر فیلدهای تأمین‌کننده؛ تغییر نام/نام‌خانوادگی یعنی دیگر همان تأمین‌کننده‌ی انتخاب‌شده نیست
  const onSupField = useCallback((field, value) => {
    setForm((f) => ({
      ...f,
      [field]: value,
      supplier_id: field === "sup_first" || field === "sup_last" ? "" : f.supplier_id,
    }));
    setSupOpen(true);
    setSupActive(-1);
  }, []);

  const onSupKeyDown = useCallback((e) => {
    const n = supMatches.length;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (n === 0) return;
      e.preventDefault();
      e.stopPropagation();
      if (!supOpen) {
        setSupOpen(true);
        setSupActive(e.key === "ArrowDown" ? 0 : n - 1);
      } else {
        setSupActive((a) => (e.key === "ArrowDown" ? Math.min(a + 1, n - 1) : Math.max(a - 1, 0)));
      }
      return;
    }
    if (e.key === "Enter" && supOpen && supActive >= 0 && supMatches[supActive]) {
      e.preventDefault();
      e.stopPropagation();
      selectSupplier(supMatches[supActive]);
      return;
    }
    if (e.key === "Escape" && supOpen) {
      e.preventDefault();
      e.stopPropagation();
      setSupOpen(false);
      setSupActive(-1);
    }
  }, [supMatches, supOpen, supActive, selectSupplier]);

  // ═══════════ ذخیره ═══════════
  const handleSave = useCallback(() => {
    const f = formRef.current;
    const its = itemsRef.current;
    const valid = its.filter((i) => i.raw_material_id && parseFloat(i.quantity) > 0);

    if (!f.warehouse_id) {
      notify("انبار را انتخاب کنید", "warning");
      return;
    }
    if (!f.invoice_date) {
      notify("تاریخ فاکتور معتبر نیست (مثال: ۱۴۰۵/۰۸/۰۳)", "warning");
      return;
    }
    if (valid.length === 0) {
      notify("حداقل یک قلم با کالا و تعداد وارد کنید", "warning");
      return;
    }
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);

    // ── تأمین‌کننده: موجود را پیدا کن، یا اگر جدید است در لیست تأمین‌کنندگان ذخیره کن ──
    const first = f.sup_first.trim();
    const last = f.sup_last.trim();
    const mobile = f.sup_mobile.trim();
    const address = f.sup_address.trim();
    const fullName = supFullName(first, last);
    let sup = null;
    let newSupplier = false;

    if (fullName || mobile || address) {
      const list = readJSON(LS_SUPPLIERS, []);
      let found = f.supplier_id
        ? list.find((s) => String(s.id) === String(f.supplier_id))
        : null;
      if (!found && mobile) {
        found = list.find((s) => digitsOnly(supMobile(s)) === digitsOnly(mobile));
      }
      if (!found && fullName) {
        found = list.find((s) => (s.name || "").trim().toLowerCase() === fullName.toLowerCase());
      }

      if (found) {
        // فقط جاهای خالیِ تأمین‌کننده‌ی موجود را پر می‌کنیم (چیزی بازنویسی نمی‌شود)
        const patched = {
          ...found,
          mobile: supMobile(found) || mobile,
          phone: found.phone || mobile,
          address: found.address || address,
        };
        const changed = patched.mobile !== (found.mobile || "") || patched.phone !== (found.phone || "") || patched.address !== (found.address || "");
        if (changed) {
          const next = list.map((s) => (s.id === found.id ? patched : s));
          writeJSON(LS_SUPPLIERS, next);
          setSuppliers(next);
        }
        sup = patched;
      } else {
        if (!fullName) {
          savingRef.current = false;
          setSaving(false);
          notify("برای تأمین‌کننده‌ی جدید، نام را وارد کنید", "warning");
          return;
        }
        sup = {
          id: Date.now() + 1,
          name: fullName,
          first_name: first,
          last_name: last,
          mobile,
          phone: mobile,
          address,
          contact_person: "",
          description: "",
        };
        const next = [...list, sup];
        writeJSON(LS_SUPPLIERS, next);
        setSuppliers(next);
        newSupplier = true;
      }
    }

    const invoice = {
      id: Date.now(),
      invoice_number: f.invoice_number.trim() || `PI-${Date.now().toString().slice(-6)}`,
      invoice_date: f.invoice_date,
      supplier_id: sup?.id ?? "",
      supplier_name: sup?.name || "",
      supplier_mobile: supMobile(sup),
      supplier_address: sup?.address || "",
      warehouse_id: f.warehouse_id,
      payment_method: f.payment_method,
      paid_amount: parseFloat(f.paid_amount) || 0,
      description: f.description.trim(),
      items: valid.map((i) => {
        const mat = getMat(i.raw_material_id);
        return {
          raw_material_id: i.raw_material_id,
          material_name: mat?.name || "",
          material_code: mat?.code || "",
          unit: mat?.unit || "",
          category: mat?.category || "",
          quantity: parseFloat(i.quantity) || 0,
          unit_price: parseFloat(i.unit_price) || 0,
          line_total: lineTotal(i),
        };
      }),
      grand_total: valid.reduce((s, i) => s + lineTotal(i), 0),
      items_count: valid.length,
      created_at: new Date().toISOString(),
    };

    setInvoices((prev) => {
      const next = [invoice, ...prev];
      writeJSON(LS_INVOICES, next);
      return next;
    });

    notify(
      `فاکتور «${invoice.invoice_number}» ثبت شد ✅${newSupplier ? ` — تأمین‌کننده‌ی «${sup.name}» هم به لیست اضافه شد` : ""}`,
      "success"
    );

    setSupOpen(false);
    setSupActive(-1);
    setForm({
      supplier_id: "",
      sup_first: "",
      sup_last: "",
      sup_mobile: "",
      sup_address: "",
      invoice_number: "",
      invoice_date: todayISO(),
      warehouse_id: f.warehouse_id,
      payment_method: "cash",
      paid_amount: "",
      description: "",
    });
    setItems([emptyItem()]);
    setShowForm(false);
    savingRef.current = false;
    setSaving(false);
    setTimeout(() => invoiceNumberRef.current?.focus(), 100);
  }, [notify, getMat, lineTotal]);

  // ── حذف فاکتور ──
  const handleDeleteInvoice = useCallback((id) => {
    setInvoices((prev) => {
      const next = prev.filter((inv) => inv.id !== id);
      writeJSON(LS_INVOICES, next);
      return next;
    });
    notify("فاکتور حذف شد", "info");
  }, [notify]);

  // ── باز/بستن فرم ──
  const openForm = useCallback(() => {
    setShowForm(true);
    setTimeout(() => invoiceNumberRef.current?.focus(), 200);
  }, []);

  const closeForm = useCallback(() => {
    setShowForm(false);
  }, []);

  // ═══════════ کیبورد کامل ═══════════
  const handleFormKeyDown = useCallback((e) => {
    const sf = showFormRef.current;
    const isCtrl = e.ctrlKey && !e.altKey;

    // ── F2 = قلم جدید (اگر فرم بسته است، فاکتور جدید باز می‌شود) ──
    if (e.key === "F2") {
      e.preventDefault();
      if (!sf) { openForm(); return; }
      const n = itemsRef.current.length;
      addItem();
      setTimeout(() => focusCell(`code-${n}`), 50);
      return;
    }

    if (e.key === "Escape") {
      e.preventDefault();
      if (sf) closeForm();
      return;
    }

    // Ctrl+D (ذخیره) در شنونده‌ی جدا و زودتر (capture) مدیریت می‌شود

    // ── Enter = رفتن به خانه بعدی؛ در آخرین خانه ردیف، قلم جدید ──
    if (e.key === "Enter" && !isCtrl && !e.altKey && sf) {
      const tag = e.target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") {
        if (!formBoxRef.current?.contains(e.target)) return;
        e.preventDefault();
        const cell = e.target.dataset?.cell;
        if (!cell) { moveFocus(1); return; }
        const [kind, i] = cell.split("-");
        const idx = parseInt(i, 10);
        if (kind === "code") focusCell(`qty-${idx}`);
        else if (kind === "qty") focusCell(`price-${idx}`);
        else if (kind === "price") {
          if (idx < itemsRef.current.length - 1) focusCell(`code-${idx + 1}`);
          else {
            addItem();
            setTimeout(() => focusCell(`code-${idx + 1}`), 50);
          }
        }
      }
      return;
    }

    // ── Ctrl+A = ردیف بعدی ، Ctrl+Z = ردیف قبلی (همان ستونی که روی آن هستید) ──
    if (isCtrl && sf && (e.code === "KeyA" || e.code === "KeyZ")) {
      // وقتی منوی بازِ یک لیست انتخاب است، دخالت نکن
      if (document.activeElement?.closest?.('[role="listbox"], [role="menu"]')) return;
      e.preventDefault();
      moveFocus(e.code === "KeyA" ? 1 : -1);
      return;
    }
  }, [openForm, closeForm, addItem, focusCell, moveFocus]);
  // (Enter روی خانه‌های بالای فرم هم به خانه‌ی بعدی می‌رود)

  useEffect(() => {
    const handler = (e) => handleFormKeyDown(e);
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleFormKeyDown]);

  // ── ذخیره با Ctrl+D ──
  // در فاز capture ثبت می‌شود تا قبل از هر چیز دیگر (حتی «افزودن نشانک» مرورگر) اجرا شود
  const handleSaveRef = useRef(handleSave); handleSaveRef.current = handleSave;
  useEffect(() => {
    const onSaveKey = (e) => {
      if (!showFormRef.current) return;
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const k = String(e.key || "").toLowerCase();
      const isD = e.code === "KeyD" || k === "d" || k === "ی"; // ی = حرف D در کیبورد فارسی
      if (!isD) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (!e.repeat) handleSaveRef.current();
    };
    window.addEventListener("keydown", onSaveKey, true);
    return () => window.removeEventListener("keydown", onSaveKey, true);
  }, []);

  // ── استایل‌ها ──
  const inputSx = {
    "& .MuiOutlinedInput-root": {
      borderRadius: "8px", bgcolor: C.inputBg,
      fontSize: F(11), color: C.text, height: CTRL_H,
      "& fieldset": { borderColor: C.glassBorder },
      "&:hover fieldset": { borderColor: C.olive + "60" },
      "&.Mui-focused fieldset": { borderColor: C.olive, borderWidth: 1.5 },
      "&.Mui-focused": { boxShadow: `0 0 0 2px ${C.olive}18` },
      "&.Mui-error fieldset": { borderColor: C.danger },
    },
    "& .MuiInputLabel-root": { fontSize: F(12), color: C.sub },
    "& .MuiInputBase-input": { color: C.text, py: 0, px: 1.2, height: CTRL_H, boxSizing: "border-box" },
    "& .MuiInputBase-input::placeholder": { color: C.text, opacity: 0.45 },
  };

  const selectSx = {
    ...inputSx,
    "& .MuiSelect-select": {
      fontSize: F(11), px: 1.2, height: `${CTRL_H}px !important`, minHeight: 0,
      py: 0, display: "flex", alignItems: "center", boxSizing: "border-box",
      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
    },
  };

  const centerInputSx = {
    ...inputSx,
    "& .MuiInputBase-input": {
      color: C.text, py: 0, px: 0.6, height: CTRL_H, textAlign: "center",
      boxSizing: "border-box", fontSize: F(11),
    },
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

  const getWhName = (id) =>
    id === "mother" ? MOTHER.name : (warehouses.find((x) => String(x.id) === String(id))?.name || "—");

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
        <CircularProgress sx={{ color: C.olive }} size={32} />
      </Box>
    );
  }

  return (
    <Box>
      {/* ── هدر ── */}
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2, flexWrap: "wrap", gap: 1 }}>
        <Box>
          <Typography sx={{ fontSize: F(15), fontWeight: 800, color: C.text }}>
            🧾 ثبت فاکتور خرید
          </Typography>
          <Typography sx={{ fontSize: F(12), color: C.sub, mt: 0.2 }}>
            {invoices.length} فاکتور ثبت شده
          </Typography>
        </Box>
        <Box sx={{ display: "flex", gap: 0.8 }}>
          <IconButton onClick={load} size="small"
            sx={{ border: `1px solid ${C.glassBorder}`, borderRadius: "8px", bgcolor: C.glass, color: C.text, p: 0.8 }}>
            <Refresh sx={{ fontSize: 16 }} />
          </IconButton>
          <Button onClick={() => (showForm ? closeForm() : openForm())} sx={btnSx}>
            {showForm ? "✖ بستن فرم (Esc)" : "➕ فاکتور جدید (F2)"}
          </Button>
        </Box>
      </Box>

      {/* ═══════════ فرم ═══════════ */}
      {showForm && (
        <Box ref={formBoxRef} sx={{
          bgcolor: C.glass, border: `1px solid ${C.glassBorder}`,
          borderRadius: "12px", p: { xs: 1.5, sm: 2 }, mb: 2,
          animation: "fadeUp 0.2s ease-out",
        }}>
          {/* ── ردیف ۱: همه فیلدها در یک خط و هم‌راستا ── */}
          <Box sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr 1fr", md: "130px 150px minmax(160px,1fr) 110px" },
            gap: 1, mb: 1, alignItems: "end",
          }}>
            <FieldBox C={C} label="شماره فاکتور">
              <TextField size="small" fullWidth inputRef={invoiceNumberRef}
                value={form.invoice_number}
                onChange={(e) => setForm({ ...form, invoice_number: e.target.value })}
                placeholder="PI-1001" sx={inputSx} />
            </FieldBox>

            <FieldBox C={C} label="تاریخ فاکتور">
              <JalaliDateField C={C}
                value={form.invoice_date}
                onChange={(iso) => setForm((f) => ({ ...f, invoice_date: iso }))}
                sx={inputSx} />
            </FieldBox>

            <FieldBox C={C} label="انبار">
              <Select size="small" fullWidth value={form.warehouse_id}
                onChange={(e) => setForm({ ...form, warehouse_id: e.target.value })} sx={selectSx}>
                {warehouses.map((w) => (
                  <MenuItem key={w.id} value={w.id} sx={{ fontSize: F(11) }}>
                    {w.name} {w.is_mother ? "⭐" : ""}
                  </MenuItem>
                ))}
              </Select>
            </FieldBox>

            <FieldBox C={C} label="پرداخت">
              <Select size="small" fullWidth value={form.payment_method}
                onChange={(e) => setForm({ ...form, payment_method: e.target.value })} sx={selectSx}>
                <MenuItem value="cash" sx={{ fontSize: F(11) }}>نقدی</MenuItem>
                <MenuItem value="credit" sx={{ fontSize: F(11) }}>اعتباری</MenuItem>
                <MenuItem value="cheque" sx={{ fontSize: F(11) }}>چک</MenuItem>
                <MenuItem value="transfer" sx={{ fontSize: F(11) }}>حواله</MenuItem>
              </Select>
            </FieldBox>
          </Box>

          {/* ── تأمین‌کننده (خط بعدی): نام، نام خانوادگی، موبایل، آدرس ── */}
          <Box
            onBlur={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget)) { setSupOpen(false); setSupActive(-1); }
            }}
            sx={{
              position: "relative", mb: 1.5, p: 1.2, borderRadius: "10px",
              border: `1px dashed ${C.glassBorder}`, bgcolor: C.inputBg,
            }}
          >
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap", mb: 0.8 }}>
              <Typography sx={{ fontSize: F(12), fontWeight: 800, color: C.text }}>👤 تأمین‌کننده</Typography>
              {form.supplier_id ? (
                <Chip size="small" label="✓ از لیست تأمین‌کنندگان"
                  sx={{ height: 20, fontSize: F(10), fontWeight: 700, borderRadius: "5px", bgcolor: C.oliveSubtle, color: C.olive }} />
              ) : hasTypedSupplier ? (
                <Chip size="small" label="🆕 جدید — با ذخیره‌ی فاکتور به لیست تأمین‌کنندگان اضافه می‌شود"
                  sx={{ height: 20, fontSize: F(10), fontWeight: 700, borderRadius: "5px", ...blueChip }} />
              ) : (
                <Typography sx={{ fontSize: F(10), color: C.sub, opacity: 0.85 }}>
                  اختیاری — با ↑ ↓ لیست تأمین‌کنندگان را ببینید
                </Typography>
              )}
            </Box>

            <Box sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr 1fr", md: "minmax(110px,1fr) minmax(110px,1fr) 160px minmax(200px,2fr)" },
              gap: 1, alignItems: "end",
            }}>
              <FieldBox C={C} label="نام">
                <TextField size="small" fullWidth autoComplete="off"
                  value={form.sup_first}
                  onChange={(e) => onSupField("sup_first", e.target.value)}
                  onKeyDown={onSupKeyDown}
                  sx={inputSx} />
              </FieldBox>

              <FieldBox C={C} label="نام خانوادگی">
                <TextField size="small" fullWidth autoComplete="off"
                  value={form.sup_last}
                  onChange={(e) => onSupField("sup_last", e.target.value)}
                  onKeyDown={onSupKeyDown}
                  sx={inputSx} />
              </FieldBox>

              <FieldBox C={C} label="شماره موبایل">
                <TextField size="small" fullWidth autoComplete="off" placeholder="09123456789"
                  value={form.sup_mobile}
                  onChange={(e) => onSupField("sup_mobile", toLatin(e.target.value))}
                  onKeyDown={onSupKeyDown}
                  inputProps={{ inputMode: "tel", dir: "ltr", style: { textAlign: "center" } }}
                  sx={inputSx} />
              </FieldBox>

              <FieldBox C={C} label="آدرس">
                <TextField size="small" fullWidth autoComplete="off"
                  value={form.sup_address}
                  onChange={(e) => onSupField("sup_address", e.target.value)}
                  onKeyDown={onSupKeyDown}
                  sx={inputSx} />
              </FieldBox>
            </Box>

            {/* لیست پیشنهادی تأمین‌کنندگان */}
            {supOpen && supMatches.length > 0 && (
              <Box
                role="listbox"
                sx={{
                  position: "absolute", top: "100%", left: 0, right: 0, mt: 0.5, zIndex: 30,
                  maxHeight: 240, overflowY: "auto", borderRadius: "10px", p: 0.5,
                  bgcolor: isDark ? "#1A1A2E" : "#fff",
                  border: `1px solid ${C.glassBorder}`,
                  boxShadow: "0 12px 32px rgba(0,0,0,0.4)",
                }}
              >
                {supMatches.map((s, i) => {
                  const p = supParts(s);
                  const active = i === supActive;
                  return (
                    <Box
                      key={s.id}
                      role="option"
                      aria-selected={active}
                      ref={(el) => { if (el && active) el.scrollIntoView?.({ block: "nearest" }); }}
                      onMouseDown={(e) => { e.preventDefault(); selectSupplier(s); }}
                      onMouseEnter={() => setSupActive(i)}
                      sx={{
                        display: "flex", alignItems: "center", gap: 1.2, flexWrap: "wrap",
                        px: 1.2, py: 0.8, borderRadius: "8px", cursor: "pointer",
                        bgcolor: active ? C.oliveSubtle : "transparent",
                        border: `1px solid ${active ? C.olive + "60" : "transparent"}`,
                      }}
                    >
                      <Typography sx={{ fontSize: F(12), fontWeight: 800, color: C.text }}>
                        {s.name || supFullName(p.first, p.last)}
                      </Typography>
                      {p.mobile && (
                        <Typography sx={{ fontSize: F(11), fontWeight: 700, color: C.text, fontFamily: "monospace" }}>
                          📞 {p.mobile}
                        </Typography>
                      )}
                      {p.address && (
                        <Typography sx={{ fontSize: F(11), color: C.text, opacity: 0.85 }}>
                          📍 {p.address}
                        </Typography>
                      )}
                    </Box>
                  );
                })}
                <Typography sx={{ fontSize: F(10), color: C.sub, opacity: 0.8, px: 1.2, pt: 0.5, pb: 0.3 }}>
                  ↑ ↓ برای انتخاب — Enter برای تأیید — Esc برای بستن
                </Typography>
              </Box>
            )}
          </Box>

          {/* ── هدر جدول اقلام ── */}
          <Box sx={{
            display: { xs: "none", md: "grid" },
            gridTemplateColumns: ITEM_COLS,
            gap: 1.2, mt: 2.5, mb: 1, px: 1.5, pb: 1, alignItems: "center",
            borderBottom: `1px solid ${C.glassBorder}`,
          }}>
            {["#", "کد کالا", "نام کالا", "دسته‌بندی", "واحد", "تعداد", "قیمت واحد", "جمع ردیف", ""].map((h, i) => (
              <Typography key={i} sx={{
                fontSize: F(11), fontWeight: 800, color: C.text, letterSpacing: 0.2,
                // «نام کالا» اول سطر (سمت شروع)، بقیه وسط ستون خودشان
                textAlign: i === 2 ? "start" : "center",
                whiteSpace: "nowrap",
              }}>
                {h}
              </Typography>
            ))}
          </Box>

          {/* ── ردیف‌های اقلام ── */}
          {items.map((it, idx) => {
            const mat = getMat(it.raw_material_id);
            const codeNotFound = it.code.trim() !== "" && !it.raw_material_id;
            return (
              <Box
                key={idx}
                sx={{
                  display: "grid",
                  gridTemplateColumns: { xs: "1fr 1fr", md: ITEM_COLS },
                  gap: 1.2, mb: 1.2, alignItems: "center",
                  px: 1.5, py: 1.2, borderRadius: "10px",
                  bgcolor: isDark ? "rgba(255,255,255,0.025)" : "rgba(0,0,0,0.02)",
                  border: `1px solid ${C.glassBorder}`,
                  transition: "border-color 0.15s ease",
                  "&:focus-within": { borderColor: C.olive + "70" },
                }}
              >
                {/* شماره */}
                <Typography sx={{ fontSize: F(12), color: C.text, textAlign: "center", fontWeight: 800, display: { xs: "none", md: "block" } }}>
                  {idx + 1}
                </Typography>

                {/* کد کالا — با تایپ کد، نام کالا خودکار پر می‌شود */}
                <TextField size="small" fullWidth placeholder="کد"
                  value={it.code}
                  error={codeNotFound}
                  onChange={(e) => handleCodeChange(idx, e.target.value)}
                  inputProps={{ "data-cell": `code-${idx}`, style: { fontFamily: "monospace", fontWeight: 700, textAlign: "center" } }}
                  sx={centerInputSx} />

                {/* نام کالا */}
                <Select
                  size="small" fullWidth displayEmpty
                  value={it.raw_material_id}
                  onChange={(e) => {
                    const m = materials.find((x) => String(x.id) === String(e.target.value));
                    if (m) pickMaterial(idx, m);
                    else setItems((prev) => {
                      const next = [...prev];
                      next[idx] = { ...next[idx], raw_material_id: "", code: "" };
                      return next;
                    });
                  }}
                  renderValue={(v) => {
                    const m = materials.find((x) => String(x.id) === String(v));
                    if (m) return <span style={{ fontWeight: 700 }}>{m.name}</span>;
                    return (
                      <span style={{ color: codeNotFound ? C.danger : C.muted }}>
                        {codeNotFound ? "کدی با این مقدار پیدا نشد" : "نام کالا یا کد را وارد کنید"}
                      </span>
                    );
                  }}
                  MenuProps={{ PaperProps: { sx: { maxHeight: 320 } } }}
                  sx={selectSx}
                >
                  <MenuItem value="" sx={{ fontSize: F(11) }}>انتخاب کنید</MenuItem>
                  {materials.map((m) => (
                    <MenuItem key={m.id} value={m.id} sx={{ fontSize: F(11), gap: 1 }}>
                      <span style={{
                        fontFamily: "monospace", color: C.text, fontSize: F(11), fontWeight: 800,
                        minWidth: 56, textAlign: "center", padding: "2px 8px", borderRadius: 5,
                        background: C.oliveSubtle, border: `1px solid ${C.olive}40`,
                      }}>{m.code || "—"}</span>
                      <span style={{ fontWeight: 700 }}>{m.name}</span>
                      {m.unit ? (
                        <span style={{ marginInlineStart: "auto", color: C.text, fontSize: F(12), fontWeight: 700 }}>
                          {getUnitLabel(m.unit)}
                        </span>
                      ) : null}
                    </MenuItem>
                  ))}
                </Select>

                {/* دسته‌بندی */}
                <Chip size="small" label={mat?.category || "—"}
                  sx={{
                    height: 26, fontSize: F(12), fontWeight: 700, borderRadius: "6px",
                    bgcolor: mat?.category ? blueChip.bgcolor : "transparent",
                    color: mat?.category ? blueChip.color : C.sub,
                    justifyContent: "center", maxWidth: "100%",
                  }} />

                {/* واحد — با انتخاب کالا یا تایپ کد، خودکار پر می‌شود */}
                <Box sx={{
                  height: 26, display: "flex", alignItems: "center", justifyContent: "center",
                  borderRadius: "6px", px: 0.5,
                  bgcolor: mat ? C.oliveSubtle : "transparent",
                  border: `1px solid ${mat ? C.olive + "40" : "transparent"}`,
                }}>
                  <Typography sx={{ fontSize: F(11), color: mat ? C.text : C.sub, fontWeight: 800 }}>
                    {mat ? getUnitLabel(mat.unit) : "—"}
                  </Typography>
                </Box>

                {/* تعداد */}
                <TextField size="small" type="number" placeholder="تعداد" fullWidth
                  value={it.quantity}
                  onChange={(e) => updateItem(idx, "quantity", e.target.value)}
                  inputProps={{ "data-cell": `qty-${idx}`, min: 0 }}
                  sx={centerInputSx} />

                {/* قیمت واحد */}
                <TextField size="small" type="number" placeholder="قیمت" fullWidth
                  value={it.unit_price}
                  onChange={(e) => updateItem(idx, "unit_price", e.target.value)}
                  inputProps={{ "data-cell": `price-${idx}`, min: 0 }}
                  sx={centerInputSx} />

                {/* جمع ردیف */}
                <Typography sx={{ fontSize: F(11), fontWeight: 700, color: C.text, textAlign: "center" }}>
                  {lineTotal(it).toLocaleString("en-US")}
                </Typography>

                {/* حذف */}
                <IconButton size="small" onClick={() => removeItem(idx)}
                  sx={{ color: C.danger, bgcolor: C.dangerBg, borderRadius: "6px", p: 0.5 }}>
                  <Delete sx={{ fontSize: 14 }} />
                </IconButton>
              </Box>
            );
          })}

          {/* ── افزودن قلم ── */}
          <Button startIcon={<Add sx={{ fontSize: 14 }} />} onClick={addItem} size="small"
            sx={{ mt: 0.5, mb: 0.5, color: C.olive, fontWeight: 700, fontSize: F(12), textTransform: "none", py: 0.5, px: 1.2, borderRadius: "8px", border: `1px dashed ${C.olive}50` }}>
            افزودن قلم (F2)
          </Button>

          {/* ── جمع + پرداخت ── */}
          <Box sx={{
            display: "grid", gridTemplateColumns: { xs: "1fr", sm: "160px 140px 1fr" },
            gap: 1, mt: 2, p: 1.5,
            bgcolor: C.inputBg, borderRadius: "10px",
            border: `1px solid ${C.glassBorder}`, alignItems: "end",
          }}>
            <Box>
              <Typography sx={{ fontSize: F(11), color: C.sub, fontWeight: 700 }}>جمع کل</Typography>
              <Box sx={{ display: "flex", alignItems: "baseline", gap: 1, mt: 0.3 }}>
                <Typography sx={{ fontSize: F(18), fontWeight: 800, color: C.olive, lineHeight: 1.4, fontVariantNumeric: "tabular-nums" }}>
                  {grandTotal.toLocaleString("en-US")}
                </Typography>
                <Typography sx={{ fontSize: F(11), fontWeight: 700, color: C.text, opacity: 0.85 }}>تومان</Typography>
              </Box>
            </Box>
            <FieldBox C={C} label="پرداختی">
              <TextField size="small" fullWidth type="number"
                value={form.paid_amount}
                onChange={(e) => setForm({ ...form, paid_amount: e.target.value })}
                sx={inputSx} />
            </FieldBox>
            <FieldBox C={C} label="یادداشت">
              <TextField size="small" fullWidth
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                sx={inputSx} />
            </FieldBox>
          </Box>

          {/* ── دکمه‌ها ── */}
          <Box sx={{ display: "flex", justifyContent: "flex-end", gap: 1, mt: 1.5 }}>
            <Button onClick={closeForm} sx={cancelBtnSx}>انصراف (Esc)</Button>
            <Button onClick={handleSave} disabled={saving || validItems.length === 0} sx={btnSx}>
              {saving ? <CircularProgress size={14} sx={{ color: "#fff" }} /> : "💾 ذخیره (Ctrl+D)"}
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
          { key: "F2", label: "قلم جدید" },
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

      {/* ═══════════ لیست فاکتورها ═══════════ */}
      {invoices.length === 0 ? (
        <Box sx={{ textAlign: "center", py: 5 }}>
          <Typography sx={{ fontSize: 32, mb: 0.5 }}>🧾</Typography>
          <Typography sx={{ fontSize: F(13), fontWeight: 700, color: C.text }}>
            هنوز فاکتوری ثبت نشده
          </Typography>
          <Typography sx={{ fontSize: F(12), color: C.sub, mt: 0.3 }}>
            F2 بزنید یا روی «فاکتور جدید» کلیک کنید
          </Typography>
        </Box>
      ) : (
        <Box>
          <Typography sx={{ fontSize: F(12), fontWeight: 700, color: C.text, mb: 1 }}>
            📋 فاکتورهای ثبت‌شده ({invoices.length})
          </Typography>

          <Box sx={{ display: "flex", flexDirection: "column", gap: 0.8 }}>
            {invoices.map((inv, i) => {
              const supName = inv.supplier_name
                || suppliers.find((x) => String(x.id) === String(inv.supplier_id))?.name
                || "";
              return (
                <Box key={inv.id} sx={{
                  bgcolor: C.glass, border: `1px solid ${C.glassBorder}`,
                  borderRadius: "10px", p: 1.5,
                  opacity: 0,
                  animation: `fadeUp 0.3s ease-out ${i * 0.04}s forwards`,
                }}>
                  {/* ── هدر فاکتور ── */}
                  <Box sx={{
                    display: "flex", justifyContent: "space-between",
                    alignItems: "center", flexWrap: "wrap", gap: 0.8,
                  }}>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
                      <ReceiptLong sx={{ fontSize: 18, color: C.olive }} />
                      <Typography sx={{ fontSize: F(11), fontWeight: 800, color: C.text, fontFamily: "monospace" }}>
                        {inv.invoice_number}
                      </Typography>
                      <Chip size="small" label={`📅 ${fmtDate(inv.invoice_date || inv.created_at)}`}
                        sx={{
                          height: 20, fontSize: F(10), fontWeight: 700,
                          borderRadius: "5px", bgcolor: C.inputBg, color: C.sub,
                        }} />
                      <Chip size="small" label={getWhName(inv.warehouse_id)}
                        sx={{
                          height: 20, fontSize: F(10), fontWeight: 700,
                          borderRadius: "5px", bgcolor: C.oliveSubtle, color: C.olive,
                        }} />
                      {supName && (
                        <Chip size="small" label={supName}
                          sx={{ height: 20, fontSize: F(10), fontWeight: 700, borderRadius: "5px", ...blueChip }} />
                      )}
                      {inv.supplier_mobile && (
                        <Typography sx={{ fontSize: F(11), color: C.sub, fontFamily: "monospace" }}>
                          📞 {inv.supplier_mobile}
                        </Typography>
                      )}
                      <Chip size="small" label={`${inv.items_count} قلم`}
                        sx={{
                          height: 20, fontSize: F(10), fontWeight: 700,
                          borderRadius: "5px", bgcolor: C.inputBg, color: C.sub,
                        }} />
                    </Box>

                    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                      <Box sx={{ display: "flex", alignItems: "baseline", gap: 0.8 }}>
                        <Typography sx={{ fontSize: F(14), fontWeight: 800, color: C.olive, fontVariantNumeric: "tabular-nums" }}>
                          {inv.grand_total.toLocaleString("en-US")}
                        </Typography>
                        <Typography sx={{ fontSize: F(10), fontWeight: 700, color: C.text, opacity: 0.85 }}>تومان</Typography>
                      </Box>
                      <IconButton size="small" onClick={() => handleDeleteInvoice(inv.id)}
                        sx={{ color: C.danger, bgcolor: C.dangerBg, borderRadius: "6px", p: 0.4 }}>
                        <Delete sx={{ fontSize: 14 }} />
                      </IconButton>
                    </Box>
                  </Box>

                  {inv.supplier_address && (
                    <Typography sx={{ fontSize: F(11), color: C.muted, mt: 0.5, pr: 3 }}>
                      📍 {inv.supplier_address}
                    </Typography>
                  )}

                  {/* ── اقلام ── */}
                  <Box sx={{ mt: 1, pr: 3, display: "flex", flexDirection: "column", gap: 0.3 }}>
                    {inv.items.map((it, j) => (
                      <Box key={j} sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
                        <Box sx={{ width: 5, height: 5, borderRadius: "50%", bgcolor: C.olive + "60", flexShrink: 0 }} />
                        <Chip size="small" label={it.material_code || "—"}
                          sx={{
                            height: 18, fontSize: F(9), fontFamily: "monospace",
                            borderRadius: "4px", bgcolor: C.oliveSubtle, color: C.olive, minWidth: 40,
                          }} />
                        <Typography sx={{ fontSize: F(12), fontWeight: 700, color: C.text }}>
                          {it.material_name}
                        </Typography>
                        {it.category && (
                          <Chip size="small" label={it.category}
                            sx={{ height: 17, fontSize: F(9), borderRadius: "4px", ...blueChip }} />
                        )}
                        <Typography sx={{ fontSize: F(11), color: C.muted }}>
                          {it.quantity} {getUnitLabel(it.unit)} × {it.unit_price.toLocaleString("en-US")}
                        </Typography>
                        <Typography sx={{ fontSize: F(12), fontWeight: 700, color: C.olive, mr: "auto" }}>
                          {it.line_total.toLocaleString("en-US")}
                        </Typography>
                      </Box>
                    ))}
                  </Box>

                  {inv.description && (
                    <Typography sx={{ fontSize: F(11), color: C.muted, mt: 0.5, pr: 3 }}>
                      📝 {inv.description}
                    </Typography>
                  )}
                </Box>
              );
            })}
          </Box>
        </Box>
      )}
    </Box>
  );
}