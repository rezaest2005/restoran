import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  Box, Typography, Button, TextField, Chip, CircularProgress,
} from "@mui/material";
import { Delete, Edit, Warehouse } from "@mui/icons-material";
import {
  fetchWarehouses,
  saveWarehouse,
  deleteWarehouse,
} from "../api";

const F = (size) => Math.round(size * 1.15);
const LS_KEY = "local_warehouses";

// ── انبار مرکزی پیش‌فرض ──
const MOTHER_WAREHOUSE = {
  id: "mother",
  name: "انبار مرکزی",
  warehouse_type: "main",
  is_mother: true,
};

const readLocal = () => {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) || "[]");
  } catch {
    return [];
  }
};

const writeLocal = (list) => {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
};

export default function WarehouseSection({ C, isDark, showToast }) {
  const [subWarehouses, setSubWarehouses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [editId, setEditId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");

  const nameRef = useRef(null);
  const saveBtnRef = useRef(null);
  const searchRef = useRef(null);
  const savingRef = useRef(false);

  const nameRefState = useRef(name);
  nameRefState.current = name;
  const editIdRef = useRef(editId);
  editIdRef.current = editId;
  const showFormRef = useRef(showForm);
  showFormRef.current = showForm;

  const notify = (msg, type = "info") => {
    if (typeof showToast === "function") showToast(msg, type);
  };

  // ── بارگذاری ──
  const load = useCallback(async () => {
    setLoading(true);
    const local = readLocal();

    try {
      const data = await fetchWarehouses();
      const arr = Array.isArray(data) ? data : data?.warehouses || [];
      const subs = arr.filter((w) => !w.is_mother);
      if (subs.length > 0) {
        setSubWarehouses(subs);
      } else {
        setSubWarehouses(local);
      }
    } catch {
      setSubWarehouses(local);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const focusName = useCallback(() => setTimeout(() => {
    const el = nameRef.current?.querySelector?.("input") || nameRef.current;
    el?.focus(); el?.select?.();
  }, 100), []);

  const openCreate = useCallback(() => {
    setEditId(null);
    setName("");
    setShowForm(true);
    focusName();
  }, [focusName]);

  const openEdit = useCallback((w) => {
    setEditId(w.id);
    setName(w.name || "");
    setShowForm(true);
    focusName();
  }, [focusName]);

  const closeForm = useCallback(() => {
    setShowForm(false);
    setEditId(null);
    setName("");
    searchRef.current?.focus();
  }, []);

  // ── ذخیره زیرمجموعه ──
  const handleSave = useCallback(async () => {
    const n = nameRefState.current.trim();
    if (!n) {
      notify("نام انبار الزامی است", "warning");
      focusName();
      return;
    }
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);

    const payload = {
      id: editIdRef.current || Date.now(),
      name: n,
      parent: MOTHER_WAREHOUSE.id,
      warehouse_type: "sub",
      description: "",
      is_mother: false,
    };

    let savedToServer = false;
    try {
      const res = await saveWarehouse(payload);
      const newId = res?.id || res?.warehouse?.id;
      if (newId) payload.id = newId;
      savedToServer = true;
    } catch {
      // fallback محلی
    }

    setSubWarehouses((prev) => {
      let next;
      if (editIdRef.current) {
        next = prev.map((w) =>
          w.id === editIdRef.current ? { ...w, name: n, id: editIdRef.current } : w
        );
      } else {
        const exists = prev.find((w) => w.name === n);
        if (exists) {
          next = prev.map((w) => (w.id === exists.id ? { ...w, name: n } : w));
        } else {
          next = [...prev, payload];
        }
      }
      writeLocal(next);
      return next;
    });

    notify(
      editIdRef.current
        ? "انبار بروزرسانی شد ✅"
        : savedToServer
          ? "زیرمجموعه اضافه شد ✅"
          : "زیرمجموعه اضافه شد (محلی) ✅",
      "success"
    );

    setEditId(null);
    setName("");
    focusName();
    savingRef.current = false;
    setSaving(false);
  }, [notify, focusName]);

  const handleDelete = useCallback(async (w) => {
    try {
      await deleteWarehouse({ id: w.id });
    } catch {
      // ignore
    }
    setSubWarehouses((prev) => {
      const next = prev.filter((x) => x.id !== w.id);
      writeLocal(next);
      return next;
    });
    notify(`«${w.name}» حذف شد`, "info");
  }, [notify]);

  // ═══════════ کیبورد ═══════════
  useEffect(() => {
    const handler = (e) => {
      const sf = showFormRef.current;

      if (e.key === "F2") {
        e.preventDefault();
        openCreate();
        return;
      }
      if (e.ctrlKey && !e.altKey && e.code === "KeyD" && sf) {
        e.preventDefault();
        handleSave();
        return;
      }
      if (e.key === "Enter" && !e.ctrlKey && !e.altKey && sf) {
        e.preventDefault();
        handleSave();
        return;
      }
      if (e.key === "Escape" && sf) {
        e.preventDefault();
        closeForm();
        return;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [openCreate, handleSave, closeForm]);

  const filtered = useMemo(() => {
    if (!search.trim()) return subWarehouses;
    const q = search.toLowerCase();
    return subWarehouses.filter((w) => w.name?.toLowerCase().includes(q));
  }, [subWarehouses, search]);

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
    "& .MuiInputBase-input": {
      color: C.text,
      "&::selection": { bgcolor: C.olive + "30", color: C.text },
    },
    "& .MuiInputBase-input::placeholder": { color: C.muted, opacity: 1 },
  };

  const btnSx = {
    borderRadius: "10px", fontSize: F(12), fontWeight: 700, textTransform: "none",
    px: 2.5, py: 1, color: "#fff", background: C.btnGrad,
    boxShadow: `0 4px 20px ${C.olive}30`,
    transition: "all 0.25s ease",
    "&:hover": { transform: "translateY(-1px)", boxShadow: `0 6px 28px ${C.olive}40` },
    "&:active": { transform: "scale(0.985)" },
  };

  const cancelBtnSx = {
    borderRadius: "10px", fontSize: F(12), fontWeight: 600, textTransform: "none",
    color: C.sub, border: `1px solid ${C.glassBorder}`,
    "&:hover": { bgcolor: C.oliveSubtle },
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
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2.5, flexWrap: "wrap", gap: 1.5 }}>
        <Box>
          <Typography sx={{ fontSize: { xs: F(16), sm: F(18) }, fontWeight: 800, color: C.text }}>
            📦 انبارها
          </Typography>
          <Typography sx={{ fontSize: F(11), color: C.muted, mt: 0.3 }}>
            ۱ انبار مرکزی + {subWarehouses.length} زیرمجموعه
          </Typography>
        </Box>
        <Button onClick={openCreate} sx={btnSx}>
          ➕ انبار جدید (F2)
        </Button>
      </Box>

      {/* ── جستجو ── */}
      <TextField
        size="small"
        placeholder="🔍 جستجو انبار..."
        inputRef={searchRef}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            if (filtered.length > 0) openEdit(filtered[0]);
            else openCreate();
          }
        }}
        sx={{ ...inputSx, width: "100%", maxWidth: 300, mb: 2 }}
      />

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
              {editId ? "✏️ ویرایش انبار" : "➕ افزودن زیرمجموعه به انبار مرکزی"}
            </Typography>
            <Button onClick={closeForm} sx={{ ...cancelBtnSx, px: 1.5, py: 0.3, fontSize: F(11) }}>
              ✖ بستن
            </Button>
          </Box>

          <Box sx={{ display: "flex", gap: 1.5, alignItems: "flex-end", flexWrap: "wrap" }}>
            <Box sx={{ flex: 1, minWidth: 200 }}>
              <TextField
                size="small" label="نام انبار *" fullWidth
                inputRef={nameRef}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="مثال: انبار سبزیجات"
                sx={inputSx}
              />
            </Box>

            <Box sx={{ display: "flex", gap: 0.5, pb: 0.1 }}>
              <Button
                ref={saveBtnRef}
                onClick={handleSave}
                disabled={saving}
                sx={{ ...btnSx, minWidth: 110 }}
              >
                {saving ? "⏳ ذخیره..." : editId ? "💾 بروزرسانی" : "➕ افزودن"}
              </Button>
              {editId && (
                <Button onClick={closeForm} sx={cancelBtnSx}>انصراف</Button>
              )}
            </Box>
          </Box>
        </Box>
      )}

      {/* ══ راهنمای کیبورد ══ */}
      <Box sx={{
        display: "flex", flexWrap: "wrap", gap: 0.8,
        alignItems: "center", mb: 2.5,
        px: 2, py: 1.2,
        borderRadius: "12px",
        bgcolor: isDark ? "rgba(107,155,110,0.07)" : "rgba(46,77,48,0.06)",
        border: `1px solid ${C.olive}20`,
      }}>
        <Chip size="small" label="راهنما"
          sx={{
            height: 26, fontSize: F(11), fontWeight: 900,
            borderRadius: "6px", bgcolor: "#FFD600", color: "#1A1A00",
            px: 1, mr: 0.5, "&:hover": { bgcolor: "#FFD600" },
          }} />
        {[
          { key: "F2", label: "انبار جدید" },
          { key: "Ctrl+D", label: "افزودن" },
          { key: "Enter", label: "ذخیره" },
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
            <Typography sx={{ fontSize: F(11), color: C.sub, fontWeight: 600 }}>
              {item.label}
            </Typography>
          </Box>
        ))}
      </Box>

      {/* ══ 🏛️ انبار مرکزی (همیشه ثابت) ══ */}
      <Box sx={{
        display: "flex", alignItems: "center",
        px: { xs: 1.5, sm: 2 }, py: 1.5,
        borderRadius: "12px",
        bgcolor: C.oliveSubtle,
        border: `2px solid ${C.olive}50`,
        mb: 1.5,
        boxShadow: `0 2px 12px ${C.olive}15`,
      }}>
        <Warehouse sx={{ fontSize: 28, color: C.olive, ml: 1 }} />
        <Box sx={{ flex: 1 }}>
          <Typography sx={{ fontSize: F(15), fontWeight: 800, color: C.olive }}>
            {MOTHER_WAREHOUSE.name}
          </Typography>
          <Typography sx={{ fontSize: F(11), color: C.sub, mt: 0.2 }}>
            انبار اصلی — همه زیرمجموعه‌ها اینجا جمع میشن
          </Typography>
        </Box>
        <Chip size="small" label="مرکزی"
          sx={{
            height: 24, fontSize: F(11), fontWeight: 800,
            borderRadius: "8px", bgcolor: C.olive, color: "#fff",
            px: 1,
          }} />
      </Box>

      {/* ══ زیرمجموعه‌ها ══ */}
      {filtered.length === 0 ? (
        <Box sx={{ textAlign: "center", py: 5 }}>
          <Typography sx={{ fontSize: 32, mb: 1 }}>📂</Typography>
          <Typography sx={{ fontSize: F(14), fontWeight: 700, color: C.text }}>
            هنوز زیرمجموعه‌ای اضافه نشده
          </Typography>
          <Typography sx={{ fontSize: F(12), color: C.sub, mt: 0.5 }}>
            F2 بزنید تا زیرمجموعه اضافه کنید
          </Typography>
        </Box>
      ) : (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 0.8, pr: { sm: 3 } }}>
          {filtered.map((w, i) => (
            <Box key={w.id} sx={{
              display: "flex", alignItems: "center",
              px: { xs: 1.5, sm: 2 }, py: { xs: 1, sm: 1.2 },
              borderRadius: "12px",
              bgcolor: C.glass, backdropFilter: "blur(12px)",
              border: `1px solid ${C.glassBorder}`,
              transition: "all 0.2s ease",
              opacity: 0,
              animation: `fadeUp 0.35s ease-out ${i * 0.04}s forwards`,
              "&:hover": {
                bgcolor: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.02)",
                transform: "translateX(-2px)",
              },
            }}>
              {/* ── خط اتصال به مرکزی ── */}
              <Box sx={{
                display: { xs: "none", sm: "flex" },
                alignItems: "center", mr: 1.5,
              }}>
                <Box sx={{
                  width: 2, height: 20, bgcolor: C.olive + "30",
                  borderRadius: 1,
                }} />
                <Box sx={{
                  width: 8, height: 8, borderRadius: "50%",
                  bgcolor: C.olive + "50", mr: 0.5,
                }} />
              </Box>

              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography sx={{ fontSize: F(13), fontWeight: 700, color: C.text }}>
                  {w.name}
                </Typography>
                <Typography sx={{ fontSize: F(10), color: C.muted, mt: 0.2 }}>
                  زیرمجموعه انبار مرکزی
                </Typography>
              </Box>

              <Box sx={{ minWidth: 100, display: "flex", gap: 0.5, justifyContent: "center" }}>
                <Box onClick={() => openEdit(w)}
                  sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 0.2, px: 0.8, py: 0.4, borderRadius: "8px", cursor: "pointer", color: C.olive, "&:hover": { bgcolor: C.oliveSubtle } }}>
                  <Edit sx={{ fontSize: 16 }} />
                  <Typography sx={{ fontSize: F(9), fontWeight: 600 }}>ویرایش</Typography>
                </Box>
                <Box onClick={() => handleDelete(w)}
                  sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 0.2, px: 0.8, py: 0.4, borderRadius: "8px", cursor: "pointer", color: C.danger, "&:hover": { bgcolor: C.dangerBg } }}>
                  <Delete sx={{ fontSize: 16 }} />
                  <Typography sx={{ fontSize: F(9), fontWeight: 600 }}>حذف</Typography>
                </Box>
              </Box>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}