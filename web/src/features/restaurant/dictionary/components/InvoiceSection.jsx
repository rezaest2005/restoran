import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  Box, Typography, Button, TextField, Select, MenuItem,
  CircularProgress, Chip,
} from "@mui/material";
import { Delete, Edit, DragIndicator, ArrowUpward, ArrowDownward } from "@mui/icons-material";
import client from "../../api/client";
import {
  getAllUnits, saveCustomUnit, getUnitLabel,
} from "../../../../shared/common/units";

const F = (size) => Math.round(size * 1.15);
const LS_ITEMS = "local_materials";
const LS_CATS = "local_categories";
const LS_ORDER = "local_materials_order";

const readJSON = (key, def = []) => {
  try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(def)); }
  catch { return def; }
};
const writeJSON = (key, val) => {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
};

const DEFAULT_CATS = ["خشکبار", "مایعات", "پروتئینی", "ادویه‌جات", "سبزیجات", "سایر"];

const sortByOrder = (items) => {
  const order = readJSON(LS_ORDER, []);
  if (!order.length) return items;
  const map = new Map(items.map((it) => [String(it.id), it]));
  const sorted = [];
  for (const id of order) {
    const item = map.get(String(id));
    if (item) { sorted.push(item); map.delete(String(id)); }
  }
  for (const item of map.values()) sorted.push(item);
  return sorted;
};

export default function InvoiceSection({ C, isDark, showToast }) {
  const [materials, setMaterials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [editId, setEditId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [allUnits, setAllUnits] = useState(() => getAllUnits());
  const [showUnitInput, setShowUnitInput] = useState(false);
  const [newUnitName, setNewUnitName] = useState("");
  const [form, setForm] = useState({ code: "", name: "", unit: "kg", category: "" });

  const [categories, setCategories] = useState(() => {
    const saved = readJSON(LS_CATS, []);
    return saved.length ? saved : DEFAULT_CATS;
  });
  const [showCatInput, setShowCatInput] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [showCatManager, setShowCatManager] = useState(false);

  const [viewMode, setViewMode] = useState("all");

  const dragItemIdx = useRef(null);
  const dragOverIdx = useRef(null);
  const [dragActive, setDragActive] = useState(null);

  const codeRef = useRef(null);
  const nameRef = useRef(null);
  const unitRef = useRef(null);
  const catRef = useRef(null);
  const newUnitRef = useRef(null);
  const newCatRef = useRef(null);
  const saveBtnRef = useRef(null);
  const searchRef = useRef(null);
  const savingRef = useRef(false);

  const formRef = useRef(form); formRef.current = form;
  const editIdRef = useRef(editId); editIdRef.current = editId;
  const showFormRef = useRef(showForm); showFormRef.current = showForm;
  const showUnitInputRef = useRef(showUnitInput); showUnitInputRef.current = showUnitInput;
  const showCatInputRef = useRef(showCatInput); showCatInputRef.current = showCatInput;

  const notify = (msg, type = "info") => {
    if (typeof showToast === "function") showToast(msg, type);
  };

  // ═══════════ بارگذاری ═══════════
  const fetchMaterials = useCallback(async () => {
    const local = sortByOrder(readJSON(LS_ITEMS, []));
    setMaterials(local);
    try {
      const res = await client.get("/api/raw-materials/suggestions/");
      const d = res.data;
      const apiArr = Array.isArray(d) ? d : d?.suggestions || d?.materials || d?.results || d?.items || [];
      if (Array.isArray(apiArr) && apiArr.length > 0) {
        const merged = [...local];
        for (const item of apiArr) {
          const idx = merged.findIndex(
            (m) => (item.id != null && m.id === item.id) || (m.name === item.name && (m.code || "") === (item.code || ""))
          );
          if (idx >= 0) merged[idx] = { ...merged[idx], ...item };
          else merged.push(item);
        }
        const sorted = sortByOrder(merged);
        setMaterials(sorted);
        writeJSON(LS_ITEMS, sorted);
      }
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchMaterials(); }, [fetchMaterials]);

  const saveOrder = (list) => {
    writeJSON(LS_ORDER, list.map((it) => String(it.id)));
    writeJSON(LS_ITEMS, list);
  };

  // ═══════════ جابجایی با دکمه ▲▼ ═══════════
  const moveItemUp = useCallback((idx) => {
    if (idx <= 0) return;
    setMaterials((prev) => {
      const next = [...prev];
      [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
      saveOrder(next);
      return next;
    });
  }, []);

  const moveItemDown = useCallback((idx) => {
    setMaterials((prev) => {
      if (idx >= prev.length - 1) return prev;
      const next = [...prev];
      [next[idx + 1], next[idx]] = [next[idx], next[idx + 1]];
      saveOrder(next);
      return next;
    });
  }, []);

  // ═══════════ جابجایی دسته‌بندی با ▲▼ ═══════════
  const moveCatUp = useCallback((idx) => {
    if (idx <= 0) return;
    setCategories((prev) => {
      const next = [...prev];
      [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
      writeJSON(LS_CATS, next);
      return next;
    });
  }, []);

  const moveCatDown = useCallback((idx) => {
    setCategories((prev) => {
      if (idx >= prev.length - 1) return prev;
      const next = [...prev];
      [next[idx + 1], next[idx]] = [next[idx], next[idx + 1]];
      writeJSON(LS_CATS, next);
      return next;
    });
  }, []);

  const deleteCat = useCallback((name) => {
    setCategories((prev) => {
      const next = prev.filter((c) => c !== name);
      writeJSON(LS_CATS, next);
      return next;
    });
    notify(`دسته «${name}» حذف شد`, "info");
  }, [notify]);

  // ═══════════ Drag & Drop ═══════════
  const handleDragStart = (idx) => { dragItemIdx.current = idx; setDragActive(idx); };
  const handleDragEnter = (idx) => { dragOverIdx.current = idx; };
  const handleDragOver = (e) => e.preventDefault();
  const handleDragEnd = () => {
    const from = dragItemIdx.current;
    const to = dragOverIdx.current;
    setDragActive(null);
    if (from === null || to === null || from === to) return;
    const next = [...materials];
    const moved = next.splice(from, 1)[0];
    next.splice(to, 0, moved);
    setMaterials(next);
    saveOrder(next);
    dragItemIdx.current = null;
    dragOverIdx.current = null;
    notify("ترتیب تغییر کرد ✅", "info");
  };

  // ═══════════ فوکوس ═══════════
  const focusCode = useCallback(() => setTimeout(() => {
    const el = codeRef.current?.querySelector?.("input") || codeRef.current;
    el?.focus(); el?.select?.();
  }, 150), []);
  const focusName = useCallback(() => setTimeout(() => {
    const el = nameRef.current?.querySelector?.("input") || nameRef.current;
    el?.focus(); el?.select?.();
  }, 50), []);
  const focusUnit = useCallback(() => setTimeout(() => {
    const btn = unitRef.current?.querySelector?.("[role='combobox']") || unitRef.current;
    btn?.focus();
  }, 50), []);
  const focusCat = useCallback(() => setTimeout(() => {
    const btn = catRef.current?.querySelector?.("[role='combobox']") || catRef.current;
    btn?.focus();
  }, 50), []);
  const focusSave = useCallback(() => setTimeout(() => saveBtnRef.current?.focus(), 50), []);
  const focusNewUnit = useCallback(() => setTimeout(() => newUnitRef.current?.focus(), 150), []);
  const focusNewCat = useCallback(() => setTimeout(() => newCatRef.current?.focus(), 150), []);

  // ═══════════ باز/بستن ═══════════
  const handleOpenAdd = useCallback(() => {
    setEditId(null);
    setForm({ code: "", name: "", unit: "kg", category: categories[0] || "" });
    setShowForm(true);
    setShowUnitInput(false);
    setShowCatInput(false);
    focusCode();
  }, [focusCode, categories]);

  const handleOpenEdit = useCallback((m) => {
    setEditId(m.id);
    setForm({ code: m.code || "", name: m.name || "", unit: m.unit || "kg", category: m.category || "" });
    setShowForm(true);
    setShowUnitInput(false);
    setShowCatInput(false);
    focusCode();
  }, [focusCode]);

  const handleCloseForm = useCallback(() => {
    setShowForm(false);
    setEditId(null);
    setForm({ code: "", name: "", unit: "kg", category: "" });
    setShowUnitInput(false);
    setShowCatInput(false);
    searchRef.current?.focus();
  }, []);

  // ═══════════ ذخیره ═══════════
  const doSave = useCallback(async () => {
    const f = formRef.current;
    const currentEditId = editIdRef.current;
    if (!f.name?.trim()) { notify("نام کالا الزامی است", "warning"); focusName(); return; }
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);

    const payload = { name: f.name.trim(), code: (f.code || "").trim(), unit: f.unit || "kg", category: f.category || "" };
    const newItem = { ...payload, id: currentEditId || Date.now() };
    let savedToServer = false;

    try {
      const res = await client.post("/api/raw-materials/save/", payload);
      if (res.data?.id) newItem.id = res.data.id;
      savedToServer = true;
    } catch {}

    setMaterials((prev) => {
      let next;
      if (currentEditId) {
        next = prev.map((m) => (m.id === currentEditId ? { ...m, ...payload, id: currentEditId } : m));
      } else {
        const exists = prev.find((m) => m.name === payload.name && m.code === payload.code);
        if (exists) {
          next = prev.map((m) => (m.id === exists.id ? { ...m, ...payload } : m));
          newItem.id = exists.id;
        } else {
          next = [...prev, newItem];
        }
      }
      writeJSON(LS_ITEMS, next);
      return next;
    });

    notify(currentEditId ? "کالا بروزرسانی شد ✅" : savedToServer ? "کالا اضافه شد ✅" : "کالا اضافه شد (محلی) ✅", "success");
    setEditId(null);
    setForm({ code: "", name: "", unit: "kg", category: "" });
    focusCode();
    savingRef.current = false;
    setSaving(false);
  }, [notify, focusName, focusCode]);

  const handleDelete = useCallback(async (id) => {
    try { await client.post("/api/raw-materials/delete/", { id }); } catch {}
    setMaterials((prev) => {
      const next = prev.filter((m) => m.id !== id);
      writeJSON(LS_ITEMS, next);
      return next;
    });
    notify("کالا حذف شد", "info");
  }, [notify]);

  // ── واحد جدید ──
  const handleAddUnit = useCallback(() => {
    const name = newUnitName.trim();
    if (!name) return;
    const unit = saveCustomUnit(name);
    setAllUnits(getAllUnits());
    setForm((f) => ({ ...f, unit: unit.value }));
    setNewUnitName("");
    setShowUnitInput(false);
    notify(`واحد «${name}» اضافه شد`, "success");
    focusUnit();
  }, [newUnitName, notify, focusUnit]);

  const handleUnitChange = (val) => {
    if (val === "__other__") { setShowUnitInput(true); focusNewUnit(); return; }
    setForm((f) => ({ ...f, unit: val }));
  };

  // ── دسته‌بندی جدید ──
  const handleAddCat = useCallback(() => {
    const name = newCatName.trim();
    if (!name) return;
    setCategories((prev) => {
      if (prev.includes(name)) return prev;
      const next = [...prev, name];
      writeJSON(LS_CATS, next);
      return next;
    });
    setForm((f) => ({ ...f, category: name }));
    setNewCatName("");
    setShowCatInput(false);
    notify(`دسته «${name}» اضافه شد`, "success");
    focusCat();
  }, [newCatName, notify, focusCat]);

  const handleCatChange = (val) => {
    if (val === "__other__") { setShowCatInput(true); focusNewCat(); return; }
    setForm((f) => ({ ...f, category: val }));
  };

  // ═══════════ ناوبری — شامل فیلدهای جدید ═══════════
  const gotoNext = useCallback(() => {
    const active = document.activeElement;

    const codeEl = codeRef.current?.querySelector?.("input") || codeRef.current;
    const nameEl = nameRef.current?.querySelector?.("input") || nameRef.current;
    const unitBtn = unitRef.current?.querySelector?.("[role='combobox']") || unitRef.current;
    const catBtn = catRef.current?.querySelector?.("[role='combobox']") || catRef.current;
    const newUnitEl = newUnitRef.current?.querySelector?.("input") || newUnitRef.current;
    const newCatEl = newCatRef.current?.querySelector?.("input") || newCatRef.current;

    if (active === codeEl) focusName();
    else if (active === nameEl) focusUnit();
    else if (active === unitBtn || unitRef.current?.contains?.(active)) focusCat();
    else if (active === catBtn || catRef.current?.contains?.(active)) {
      if (showUnitInputRef.current) focusNewUnit();
      else if (showCatInputRef.current) focusNewCat();
      else focusSave();
    }
    else if (active === newUnitEl || newUnitRef.current?.contains?.(active)) {
      if (showCatInputRef.current) focusNewCat();
      else focusSave();
    }
    else if (active === newCatEl || newCatRef.current?.contains?.(active)) focusSave();
    else focusCode();
  }, [focusName, focusUnit, focusCat, focusSave, focusCode, focusNewUnit, focusNewCat]);

  const gotoPrev = useCallback(() => {
    const active = document.activeElement;

    const codeEl = codeRef.current?.querySelector?.("input") || codeRef.current;
    const nameEl = nameRef.current?.querySelector?.("input") || nameRef.current;
    const unitBtn = unitRef.current?.querySelector?.("[role='combobox']") || unitRef.current;
    const catBtn = catRef.current?.querySelector?.("[role='combobox']") || catRef.current;
    const newUnitEl = newUnitRef.current?.querySelector?.("input") || newUnitRef.current;
    const newCatEl = newCatRef.current?.querySelector?.("input") || newCatRef.current;

    if (active === nameEl) focusCode();
    else if (active === unitBtn || unitRef.current?.contains?.(active)) focusName();
    else if (active === catBtn || catRef.current?.contains?.(active)) focusUnit();
    else if (active === newUnitEl || newUnitRef.current?.contains?.(active)) focusCat();
    else if (active === newCatEl || newCatRef.current?.contains?.(active)) {
      if (showUnitInputRef.current) focusNewUnit();
      else focusCat();
    }
    else if (saveBtnRef.current?.contains?.(active)) {
      if (showCatInputRef.current) focusNewCat();
      else if (showUnitInputRef.current) focusNewUnit();
      else focusCat();
    }
    else focusCode();
  }, [focusCode, focusName, focusUnit, focusCat, focusNewUnit, focusNewCat]);

  // ═══════════ کیبورد ═══════════
  useEffect(() => {
    const isCtrl = (e, code) => e.ctrlKey && !e.altKey && e.code === code;

    const handler = (e) => {
      const sf = showFormRef.current;
      const su = showUnitInputRef.current;
      const sc = showCatInputRef.current;

      // ── F2: کالای جدید ──
      if (e.key === "F2") { e.preventDefault(); handleOpenAdd(); return; }

      // ── F3: واحد جدید ──
      if (e.key === "F3") {
        e.preventDefault();
        const open = () => { setShowUnitInput(true); focusNewUnit(); };
        if (!sf) { handleOpenAdd(); setTimeout(open, 300); } else open();
        return;
      }

      // ── F4: دسته جدید ──
      if (e.key === "F4") {
        e.preventDefault();
        const open = () => { setShowCatInput(true); focusNewCat(); };
        if (!sf) { handleOpenAdd(); setTimeout(open, 300); } else open();
        return;
      }

      // ── Ctrl+D: ذخیره ──
      if (isCtrl(e, "KeyD") && sf) {
        e.preventDefault();
        if (su) { handleAddUnit(); return; }
        if (sc) { handleAddCat(); return; }
        doSave();
        return;
      }

      // ── Ctrl+A: بعدی (حتی وقتی واحد/دسته جدید بازه!) ──
      if (isCtrl(e, "KeyA") && sf) { e.preventDefault(); gotoNext(); return; }

      // ── Ctrl+Z: قبلی (حتی وقتی واحد/دسته جدید بازه!) ──
      if (isCtrl(e, "KeyZ") && sf) { e.preventDefault(); gotoPrev(); return; }

      // ── Enter ──
      if (e.key === "Enter" && !e.ctrlKey && !e.altKey && sf) {
        if (su) { e.preventDefault(); handleAddUnit(); return; }
        if (sc) { e.preventDefault(); handleAddCat(); return; }

        const target = e.target;
        const codeEl = codeRef.current?.querySelector?.("input") || codeRef.current;
        const nameEl = nameRef.current?.querySelector?.("input") || nameRef.current;
        const unitBtn = unitRef.current?.querySelector?.("[role='combobox']") || unitRef.current;
        const catBtn = catRef.current?.querySelector?.("[role='combobox']") || catRef.current;

        if (
          target === codeEl || target === nameEl ||
          target === unitBtn || target === catBtn ||
          saveBtnRef.current?.contains?.(target)
        ) {
          e.preventDefault();
          gotoNext();
        }
        return;
      }

      // ── Escape ──
      if (e.key === "Escape" && sf) {
        e.preventDefault();
        if (su) { setShowUnitInput(false); focusUnit(); return; }
        if (sc) { setShowCatInput(false); focusCat(); return; }
        handleCloseForm();
        return;
      }

      // ── ↑↓ در لیست اصلی: جابجایی آیتم انتخاب‌شده ──
      if ((e.key === "ArrowUp" || e.key === "ArrowDown") && !sf && document.activeElement === searchRef.current) {
        // اجازه بده جستجو کار کنه
        return;
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [
    handleOpenAdd, doSave, handleAddUnit, handleAddCat,
    gotoNext, gotoPrev, handleCloseForm,
    focusUnit, focusCat, focusNewUnit, focusNewCat,
  ]);

  // ── فیلتر + گروه‌بندی ──
  const filtered = useMemo(() => {
    if (!search.trim()) return materials;
    const q = search.toLowerCase();
    return materials.filter(
      (m) => (m.name || "").toLowerCase().includes(q) || (m.code || "").toLowerCase().includes(q)
    );
  }, [materials, search]);

  const groupedByCat = useMemo(() => {
    const groups = {};
    for (const m of filtered) {
      const cat = m.category || "بدون دسته";
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(m);
    }
    const catOrder = [...categories, "بدون دسته"];
    return catOrder
      .filter((c) => groups[c]?.length)
      .map((c) => ({ category: c, items: groups[c] }));
  }, [filtered, categories]);

  const isRtl = typeof document !== "undefined"
    ? document.documentElement.dir === "rtl" || document.documentElement.lang === "fa"
    : true;

  // ── استایل‌ها ──
  const inputSx = {
    "& .MuiOutlinedInput-root": {
      borderRadius: "10px", bgcolor: C.inputBg, backdropFilter: "blur(8px)",
      fontSize: F(13), color: C.text,
      "& fieldset": { borderColor: C.glassBorder },
      "&:hover fieldset": { borderColor: C.olive + "60" },
      "&.Mui-focused fieldset": { borderColor: C.olive, borderWidth: 1.5 },
      "&.Mui-focused": { boxShadow: `0 0 0 3px ${C.olive}18` },
    },
    "& .MuiInputLabel-root": { fontSize: F(12), color: C.sub },
    "& .MuiInputBase-input": { color: C.text, "&::selection": { bgcolor: C.olive + "30", color: C.text } },
    "& .MuiInputBase-input::placeholder": { color: C.muted, opacity: 1 },
  };

  const btnSx = {
    borderRadius: "10px", fontSize: F(12), fontWeight: 700, textTransform: "none",
    px: 2.5, py: 1, color: "#fff", background: C.btnGrad,
    boxShadow: `0 4px 20px ${C.olive}30`,
    transition: "all 0.25s ease",
    "&:hover": { transform: "translateY(-1px)", boxShadow: `0 6px 28px ${C.olive}40`, filter: "brightness(1.1)" },
    "&:active": { transform: "scale(0.985)" },
  };

  const cancelBtnSx = {
    borderRadius: "10px", fontSize: F(12), fontWeight: 600, textTransform: "none",
    color: C.sub, border: `1px solid ${C.glassBorder}`,
    "&:hover": { bgcolor: C.oliveSubtle },
  };

  // ── دکمه‌های ▲▼ ──
  const arrowBtnSx = {
    minWidth: 24, width: 24, height: 24, p: 0,
    borderRadius: "6px", color: C.sub, bgcolor: "transparent",
    border: `1px solid ${C.glassBorder}`,
    "&:hover": { bgcolor: C.oliveSubtle, color: C.olive },
    "&:disabled": { opacity: 0.3 },
  };

  // ── هدر جدول ──
  const TableHeader = () => (
    <Box sx={{
      display: "flex", alignItems: "center",
      px: { xs: 1.5, sm: 2 }, py: 0.8,
      borderRadius: "10px",
      bgcolor: isDark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.02)",
    }}>
      <Box sx={{ width: 24 }} />
      <Box sx={{ width: 56, display: "flex", gap: 0.3, justifyContent: "center" }} />
      <Typography sx={{ width: 80, fontSize: F(10), fontWeight: 700, color: C.muted }}>کد</Typography>
      <Typography sx={{ flex: 3, fontSize: F(10), fontWeight: 700, color: C.muted }}>نام کالا</Typography>
      <Typography sx={{ flex: 1, fontSize: F(10), fontWeight: 700, color: C.muted, textAlign: "center" }}>واحد</Typography>
      <Typography sx={{ flex: 1, fontSize: F(10), fontWeight: 700, color: C.muted, textAlign: "center" }}>دسته‌بندی</Typography>
      <Box sx={{ minWidth: 100 }} />
    </Box>
  );

  // ── آیتم لیست ──
  const ItemRow = ({ m, idx, draggable = true, canMoveUp = true, canMoveDown = true }) => (
    <Box
      draggable={draggable}
      onDragStart={() => draggable && handleDragStart(idx)}
      onDragEnter={() => draggable && handleDragEnter(idx)}
      onDragOver={handleDragOver}
      onDragEnd={draggable ? handleDragEnd : undefined}
      sx={{
        display: "flex", alignItems: "center",
        px: { xs: 1.5, sm: 2 }, py: { xs: 1, sm: 1.2 },
        borderRadius: "12px",
        bgcolor: dragActive === idx ? C.oliveSubtle : C.glass,
        backdropFilter: "blur(12px)",
        border: `1px solid ${dragActive === idx ? C.olive + "50" : C.glassBorder}`,
        transition: "all 0.2s ease",
        cursor: draggable ? "grab" : "default",
        opacity: dragActive === idx ? 0.6 : 1,
        "&:hover": {
          bgcolor: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.02)",
        },
      }}
    >
      {/* ── دستگیره Drag ── */}
      <Box sx={{ width: 24, display: "flex", justifyContent: "center", color: C.muted }}>
        {draggable && <DragIndicator sx={{ fontSize: 18, cursor: "grab" }} />}
      </Box>

      {/* ── دکمه‌های ▲▼ ── */}
      <Box sx={{ width: 56, display: "flex", gap: 0.3, justifyContent: "center" }}>
        <Button sx={arrowBtnSx} disabled={!canMoveUp} onClick={() => moveItemUp(idx)}>
          <ArrowUpward sx={{ fontSize: 14 }} />
        </Button>
        <Button sx={arrowBtnSx} disabled={!canMoveDown} onClick={() => moveItemDown(idx)}>
          <ArrowDownward sx={{ fontSize: 14 }} />
        </Button>
      </Box>

      {/* ── کد ── */}
      <Box sx={{ width: 80 }}>
        <Chip size="small" label={m.code || "—"}
          sx={{
            height: 24, fontSize: F(11), fontWeight: 700,
            borderRadius: "6px", bgcolor: C.oliveSubtle, color: C.olive, fontFamily: "monospace",
          }} />
      </Box>

      {/* ── نام ── */}
      <Box sx={{ flex: 3, minWidth: 0 }}>
        <Typography sx={{
          fontSize: F(13), fontWeight: 700, color: C.text,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {m.name}
        </Typography>
      </Box>

      {/* ── واحد ── */}
      <Box sx={{ flex: 1, textAlign: "center" }}>
        <Typography sx={{ fontSize: F(12), color: C.sub }}>{getUnitLabel(m.unit)}</Typography>
      </Box>

      {/* ── دسته‌بندی ── */}
      <Box sx={{ flex: 1, textAlign: "center" }}>
        {m.category ? (
          <Chip size="small" label={m.category}
            sx={{
              height: 22, fontSize: F(10), fontWeight: 600, borderRadius: "6px",
              bgcolor: isDark ? "rgba(100,140,255,0.12)" : "rgba(50,90,200,0.1)",
              color: isDark ? "#8AAFFF" : "#2A4AAA",
            }} />
        ) : (
          <Typography sx={{ fontSize: F(11), color: C.muted }}>—</Typography>
        )}
      </Box>

      {/* ── عملیات ── */}
      <Box sx={{ minWidth: 100, display: "flex", gap: 0.5, justifyContent: "center" }}>
        <Box onClick={() => handleOpenEdit(m)}
          sx={{
            display: "flex", flexDirection: "column", alignItems: "center",
            gap: 0.2, px: 0.8, py: 0.4, borderRadius: "8px",
            cursor: "pointer", color: C.olive, "&:hover": { bgcolor: C.oliveSubtle },
          }}>
          <Edit sx={{ fontSize: 16 }} />
          <Typography sx={{ fontSize: F(9), fontWeight: 600 }}>ویرایش</Typography>
        </Box>
        <Box onClick={() => handleDelete(m.id)}
          sx={{
            display: "flex", flexDirection: "column", alignItems: "center",
            gap: 0.2, px: 0.8, py: 0.4, borderRadius: "8px",
            cursor: "pointer", color: C.danger, "&:hover": { bgcolor: C.dangerBg },
          }}>
          <Delete sx={{ fontSize: 16 }} />
          <Typography sx={{ fontSize: F(9), fontWeight: 600 }}>حذف</Typography>
        </Box>
      </Box>
    </Box>
  );

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
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2.5, flexWrap: "wrap", gap: 1.5 }}>
        <Box>
          <Typography sx={{ fontSize: { xs: F(16), sm: F(18) }, fontWeight: 800, color: C.text }}>
            🥜 اجناس
          </Typography>
          <Typography sx={{ fontSize: F(11), color: C.muted, mt: 0.3 }}>
            {materials.length} کالا • {categories.length} دسته‌بندی
          </Typography>
        </Box>
        <Box sx={{ display: "flex", gap: 1 }}>
          <Button onClick={() => setShowCatManager(!showCatManager)} sx={{ ...cancelBtnSx, fontSize: F(11) }}>
            🏷️ مدیریت دسته‌ها
          </Button>
          <Button onClick={handleOpenAdd} sx={btnSx}>➕ کالای جدید (F2)</Button>
        </Box>
      </Box>

      {/* ── نوار ابزار ── */}
      <Box sx={{ display: "flex", gap: 1.5, mb: 2, flexWrap: "wrap", alignItems: "center" }}>
        <TextField
          size="small" placeholder="🔍 جستجو..."
          inputRef={searchRef}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (filtered.length > 0) handleOpenEdit(filtered[0]);
              else handleOpenAdd();
            }
          }}
          sx={{ ...inputSx, width: "100%", maxWidth: 280 }}
        />

        <Box sx={{ display: "flex", borderRadius: "10px", overflow: "hidden", border: `1px solid ${C.glassBorder}` }}>
          {[
            { id: "all", label: "📋 همه" },
            { id: "category", label: "🏷️ دسته‌بندی" },
          ].map((v) => (
            <Button key={v.id} onClick={() => setViewMode(v.id)}
              sx={{
                borderRadius: 0, px: 2, py: 0.8,
                fontSize: F(11), fontWeight: viewMode === v.id ? 700 : 500,
                textTransform: "none",
                color: viewMode === v.id ? "#fff" : C.sub,
                bgcolor: viewMode === v.id ? C.olive : "transparent",
                "&:hover": { bgcolor: viewMode === v.id ? C.olive : C.oliveSubtle },
              }}>
              {v.label}
            </Button>
          ))}
        </Box>

        <Chip size="small"
          label={viewMode === "all" ? `${filtered.length} آیتم` : `${groupedByCat.length} دسته`}
          sx={{ height: 28, fontSize: F(11), fontWeight: 700, borderRadius: "8px", bgcolor: C.oliveSubtle, color: C.olive }} />
      </Box>

      {/* ═══════════ مدیریت دسته‌بندی‌ها (▲▼ + حذف) ═══════════ */}
      {showCatManager && (
        <Box sx={{
          bgcolor: C.glass, backdropFilter: "blur(16px)",
          border: `1px solid ${C.glassBorder}`, borderRadius: "14px",
          p: 2, mb: 2.5,
          animation: "fadeUp 0.25s ease-out",
        }}>
          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1.5 }}>
            <Typography sx={{ fontSize: F(13), fontWeight: 700, color: C.text }}>
              🏷️ مدیریت دسته‌بندی‌ها ({categories.length})
            </Typography>
            <Button onClick={() => setShowCatManager(false)}
              sx={{ ...cancelBtnSx, px: 1.5, py: 0.3, fontSize: F(11) }}>
              ✖ بستن
            </Button>
          </Box>

          <Box sx={{ display: "flex", flexDirection: "column", gap: 0.6 }}>
            {categories.map((cat, idx) => (
              <Box key={cat} sx={{
                display: "flex", alignItems: "center", gap: 1,
                px: 1.5, py: 0.8, borderRadius: "8px",
                bgcolor: isDark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.015)",
                border: `1px solid ${C.glassBorder}`,
              }}>
                <Typography sx={{ fontSize: F(10), color: C.muted, fontWeight: 700, width: 20 }}>
                  {idx + 1}
                </Typography>

                <Chip size="small" label={cat}
                  sx={{
                    height: 24, fontSize: F(11), fontWeight: 700, borderRadius: "6px",
                    bgcolor: isDark ? "rgba(100,140,255,0.12)" : "rgba(50,90,200,0.1)",
                    color: isDark ? "#8AAFFF" : "#2A4AAA",
                  }} />

                <Box sx={{ mr: "auto", display: "flex", gap: 0.3 }}>
                  <Button sx={arrowBtnSx} disabled={idx === 0} onClick={() => moveCatUp(idx)}>
                    <ArrowUpward sx={{ fontSize: 14 }} />
                  </Button>
                  <Button sx={arrowBtnSx} disabled={idx === categories.length - 1} onClick={() => moveCatDown(idx)}>
                    <ArrowDownward sx={{ fontSize: 14 }} />
                  </Button>
                </Box>

                <Button size="small" onClick={() => deleteCat(cat)}
                  sx={{
                    minWidth: 24, width: 24, height: 24, p: 0,
                    borderRadius: "6px", color: C.danger,
                    "&:hover": { bgcolor: C.dangerBg },
                  }}>
                  <Delete sx={{ fontSize: 14 }} />
                </Button>
              </Box>
            ))}
          </Box>

          {/* ── افزودن سریع ── */}
          <Box sx={{ display: "flex", gap: 0.8, mt: 1.5 }}>
            <TextField size="small" placeholder="دسته جدید..." fullWidth
              value={newCatName} onChange={(e) => setNewCatName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAddCat();
                }
              }}
              sx={inputSx} />
            <Button onClick={handleAddCat} sx={{ ...btnSx, px: 2, py: 0.5, fontSize: F(11) }}>
              ➕ افزودن
            </Button>
          </Box>
        </Box>
      )}

      {/* ── فرم ── */}
      {showForm && (
        <Box sx={{
          bgcolor: C.glass, backdropFilter: "blur(16px)",
          border: `1px solid ${C.glassBorder}`, borderRadius: "14px",
          p: { xs: 2, sm: 2.5 }, mb: 2.5,
          animation: "fadeUp 0.25s ease-out",
        }}>
          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1.5 }}>
            <Typography sx={{ fontSize: F(13), fontWeight: 700, color: C.text }}>
              {editId ? "✏️ ویرایش کالا" : "➕ افزودن کالای جدید"}
            </Typography>
            <Button onClick={handleCloseForm} sx={{ ...cancelBtnSx, px: 1.5, py: 0.3, fontSize: F(11) }}>
              ✖ بستن
            </Button>
          </Box>

          <Box sx={{ display: "flex", flexDirection: "row", gap: 1.5, alignItems: "flex-end", flexWrap: "wrap" }}>
            <Box sx={{ width: { xs: "100%", sm: 110 }, flexShrink: 0 }}>
              <TextField size="small" label="کد" fullWidth inputRef={codeRef}
                value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })}
                placeholder="1001" sx={inputSx} />
            </Box>

            <Box sx={{ flex: 1, minWidth: 150 }}>
              <TextField size="small" label="نام کالا *" fullWidth inputRef={nameRef}
                value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} sx={inputSx} />
            </Box>

            {/* واحد */}
            <Box sx={{ width: { xs: "100%", sm: 130 }, flexShrink: 0 }}>
              <Typography sx={{ fontSize: F(11), color: C.sub, mb: 0.5, fontWeight: 600 }}>واحد</Typography>
              <Select size="small" fullWidth inputRef={unitRef}
                value={form.unit} onChange={(e) => handleUnitChange(e.target.value)}
                sx={{ ...inputSx, "& .MuiSelect-select": { fontSize: F(13), py: 1 } }}
                MenuProps={{
                  slotProps: {
                    paper: {
                      sx: {
                        bgcolor: isDark ? "#1e1e30" : "#fff", borderRadius: "12px",
                        border: `1px solid ${C.olive}30`, boxShadow: "0 12px 40px rgba(0,0,0,0.3)",
                        maxHeight: 200, overflowY: "auto",
                        "& .MuiMenuItem-root": {
                          fontSize: F(12), minHeight: 32, py: 0.3, px: 1.5,
                          borderRadius: "8px", mx: 0.5,
                          "&.Mui-selected": { bgcolor: C.oliveSubtle, color: C.olive, fontWeight: 700 },
                          "&:hover": { bgcolor: C.oliveSubtle },
                        },
                      },
                    },
                  },
                  disableScrollLock: true,
                }}>
                {allUnits.map((u) => (
                  <MenuItem key={u.value} value={u.value}>{u.label}</MenuItem>
                ))}
                <MenuItem value="__other__" sx={{ borderTop: `1px dashed ${C.olive}30`, mt: 0.5, pt: 1 }}>
                  <Typography sx={{ fontSize: F(12), fontWeight: 700, color: C.olive }}>✏️ واحد جدید...</Typography>
                </MenuItem>
              </Select>
            </Box>

            {/* دسته‌بندی */}
            <Box sx={{ width: { xs: "100%", sm: 140 }, flexShrink: 0 }}>
              <Typography sx={{ fontSize: F(11), color: C.sub, mb: 0.5, fontWeight: 600 }}>دسته‌بندی</Typography>
              <Select size="small" fullWidth inputRef={catRef}
                value={form.category || ""} onChange={(e) => handleCatChange(e.target.value)}
                sx={{ ...inputSx, "& .MuiSelect-select": { fontSize: F(13), py: 1 } }}
                MenuProps={{
                  slotProps: {
                    paper: {
                      sx: {
                        bgcolor: isDark ? "#1e1e30" : "#fff", borderRadius: "12px",
                        border: `1px solid ${C.olive}30`, boxShadow: "0 12px 40px rgba(0,0,0,0.3)",
                        maxHeight: 200, overflowY: "auto",
                        "& .MuiMenuItem-root": {
                          fontSize: F(12), minHeight: 32, py: 0.3, px: 1.5,
                          borderRadius: "8px", mx: 0.5,
                          "&.Mui-selected": { bgcolor: C.oliveSubtle, color: C.olive, fontWeight: 700 },
                          "&:hover": { bgcolor: C.oliveSubtle },
                        },
                      },
                    },
                  },
                  disableScrollLock: true,
                }}>
                {categories.map((c) => (
                  <MenuItem key={c} value={c}>
                    {c}
                  </MenuItem>
                ))}
                <MenuItem value="__other__" sx={{ borderTop: `1px dashed ${C.olive}30`, mt: 0.5, pt: 1 }}>
                  <Typography sx={{ fontSize: F(12), fontWeight: 700, color: C.olive }}>✏️ دسته جدید...</Typography>
                </MenuItem>
              </Select>
            </Box>

            {/* واحد جدید */}
            {showUnitInput && (
              <Box sx={{ width: { xs: "100%", sm: 160 }, display: "flex", gap: 0.5, alignItems: "flex-end" }}>
                <TextField size="small" label="واحد جدید" fullWidth inputRef={newUnitRef}
                  value={newUnitName} onChange={(e) => setNewUnitName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); handleAddUnit(); } }}
                  sx={inputSx} />
                <Button onClick={handleAddUnit} sx={{ ...btnSx, px: 1.5, py: 1, fontSize: F(11) }}>✓</Button>
              </Box>
            )}

            {/* دسته جدید */}
            {showCatInput && (
              <Box sx={{ width: { xs: "100%", sm: 160 }, display: "flex", gap: 0.5, alignItems: "flex-end" }}>
                <TextField size="small" label="دسته جدید" fullWidth inputRef={newCatRef}
                  value={newCatName} onChange={(e) => setNewCatName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); handleAddCat(); } }}
                  sx={inputSx} />
                <Button onClick={handleAddCat} sx={{ ...btnSx, px: 1.5, py: 1, fontSize: F(11) }}>✓</Button>
              </Box>
            )}

            {/* ذخیره */}
            <Box sx={{ display: "flex", gap: 0.5, pb: 0.1 }}>
              <Button ref={saveBtnRef} onClick={doSave} disabled={saving}
                sx={{ ...btnSx, opacity: saving ? 0.7 : 1, minWidth: 110 }}>
                {saving ? "⏳ ذخیره..." : editId ? "💾 بروزرسانی" : "➕ افزودن"}
              </Button>
              {editId && <Button onClick={handleCloseForm} sx={cancelBtnSx}>انصراف</Button>}
            </Box>
          </Box>
        </Box>
      )}

      {/* ══ راهنمای کیبورد ══ */}
      <Box sx={{
        display: "flex", flexWrap: "wrap", gap: 0.8,
        alignItems: "center", mb: 2.5, px: 2, py: 1.2,
        borderRadius: "12px",
        bgcolor: isDark ? "rgba(107,155,110,0.07)" : "rgba(46,77,48,0.06)",
        border: `1px solid ${C.olive}20`,
      }}>
        <Chip size="small" label="راهنما"
          sx={{
            height: 26, fontSize: F(11), fontWeight: 900,
            borderRadius: "6px", bgcolor: "#FFD600", color: "#1A1A00",
            px: 1, mr: 0.5,
          }} />
        {[
          { key: "Ctrl+D", label: "ذخیره" },
          { key: "Ctrl+A", label: "بعدی" },
          { key: "Ctrl+Z", label: "قبلی" },
          { key: "F2", label: "کالای جدید" },
          { key: "F3", label: "واحد جدید" },
          { key: "F4", label: "دسته جدید" },
          { key: "↑↓", label: "جابجایی لیست" },
          { key: "Enter", label: "بعدی" },
          { key: "Esc", label: "بستن" },
        ].map((item) => (
          <Box key={item.key} sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
            <Chip size="small" label={item.key}
              sx={{
                height: 24, fontSize: F(11), fontWeight: 800,
                borderRadius: "6px", fontFamily: "monospace",
                bgcolor: C.oliveSubtle, color: C.olive,
                border: `1px solid ${C.olive}30`, px: 0.5,
              }} />
            <Typography sx={{ fontSize: F(11), color: C.sub, fontWeight: 600 }}>{item.label}</Typography>
          </Box>
        ))}
      </Box>

      {/* ═══════════ لیست ═══════════ */}
      {filtered.length === 0 ? (
        <Box sx={{ textAlign: "center", py: 6 }}>
          <Typography sx={{ fontSize: 36, mb: 1 }}>🥜</Typography>
          <Typography sx={{ fontSize: F(14), fontWeight: 700, color: C.text }}>
            هنوز کالایی ثبت نشده
          </Typography>
          <Typography sx={{ fontSize: F(12), color: C.sub, mt: 0.5 }}>
            F2 بزنید یا روی «کالای جدید» کلیک کنید
          </Typography>
        </Box>
      ) : viewMode === "all" ? (
        <Box>
          <Typography sx={{ fontSize: F(10), color: C.muted, mb: 1 }}>
            💡 با ▲▼ یا Drag ترتیب را تغییر دهید
          </Typography>
          <TableHeader />
          <Box sx={{ display: "flex", flexDirection: "column", gap: 0.8 }}>
            {filtered.map((m, i) => {
              const realIdx = materials.indexOf(m);
              return (
                <ItemRow
                  key={m.id || `item-${i}`}
                  m={m}
                  idx={realIdx}
                  canMoveUp={realIdx > 0}
                  canMoveDown={realIdx < materials.length - 1}
                />
              );
            })}
          </Box>
        </Box>
      ) : (
        <Box>
          <Typography sx={{ fontSize: F(10), color: C.muted, mb: 1 }}>
            🏷️ نمایش گروهی بر اساس دسته‌بندی
          </Typography>
          <TableHeader />
          {groupedByCat.map((group) => (
            <Box key={group.category} sx={{ mb: 2 }}>
              <Box sx={{
                display: "flex", alignItems: "center", gap: 1,
                px: 2, py: 1, mt: 1, borderRadius: "10px",
                bgcolor: isDark ? "rgba(107,155,110,0.1)" : "rgba(46,77,48,0.08)",
                border: `1px solid ${C.olive}25`,
              }}>
                <Typography sx={{ fontSize: F(13), fontWeight: 800, color: C.olive }}>
                  🏷️ {group.category}
                </Typography>
                <Chip size="small" label={`${group.items.length} کالا`}
                  sx={{ height: 22, fontSize: F(10), fontWeight: 700, borderRadius: "6px", bgcolor: C.olive, color: "#fff" }} />
              </Box>
              <Box sx={{ display: "flex", flexDirection: "column", gap: 0.8, mt: 0.8 }}>
                {group.items.map((m) => (
                  <ItemRow key={m.id} m={m} idx={-1} draggable={false} canMoveUp={false} canMoveDown={false} />
                ))}
              </Box>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}