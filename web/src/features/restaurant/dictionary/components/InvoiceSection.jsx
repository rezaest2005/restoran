import { useState, useEffect, useCallback, useRef } from "react";
import {
  Box,
  Typography,
  Button,
  TextField,
  Select,
  MenuItem,
  CircularProgress,
  Chip,
} from "@mui/material";
import { Delete, Search, Edit } from "@mui/icons-material";
import client from "../../api/client";

// ── مشترک: فقط واحد‌ها ──
import {
  getAllUnits,
  saveCustomUnit,
  getUnitLabel,
} from "../../../../shared/common/units";

const F = (size) => Math.round(size * 1.15);

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
  const [form, setForm] = useState({ code: "", name: "", unit: "kg" });

  const codeRef = useRef(null);
  const nameRef = useRef(null);
  const unitRef = useRef(null);
  const newUnitRef = useRef(null);
  const saveBtnRef = useRef(null);
  const searchRef = useRef(null);
  const savingRef = useRef(false);

  const formRef = useRef(form);
  formRef.current = form;
  const editIdRef = useRef(editId);
  editIdRef.current = editId;
  const showFormRef = useRef(showForm);
  showFormRef.current = showForm;
  const showUnitInputRef = useRef(showUnitInput);
  showUnitInputRef.current = showUnitInput;

  const notify = (msg, type = "info") => {
    if (typeof showToast === "function") showToast(msg, type);
  };

  // ── دریافت لیست (با fallback محلی) ──
  const fetchMaterials = useCallback(async () => {
    setLoading(true);
    try {
      const res = await client.get("/api/raw-materials/suggestions/");
      const d = res.data;
      const arr = Array.isArray(d)
        ? d
        : d.suggestions || d.materials || d.results || d.items || [];
      if (Array.isArray(arr) && arr.length > 0) {
        setMaterials(arr);
      } else {
        // ── fallback: از localStorage ──
        const local = JSON.parse(
          localStorage.getItem("local_materials") || "[]",
        );
        setMaterials(local);
      }
    } catch (err) {
      console.warn(
        "[Fetch] API failed, using localStorage:",
        err.response?.status,
      );
      // ── fallback: از localStorage ──
      const local = JSON.parse(localStorage.getItem("local_materials") || "[]");
      setMaterials(local);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMaterials();
  }, [fetchMaterials]);

  // ── ذخیره localStorage ──
  const saveToLocal = (list) => {
    try {
      localStorage.setItem("local_materials", JSON.stringify(list));
    } catch {
      /* ignore */
    }
  };

  // ── فوکوس ──
  const focusCode = useCallback(
    () =>
      setTimeout(() => {
        const el = codeRef.current?.querySelector?.("input") || codeRef.current;
        el?.focus();
        el?.select?.();
      }, 150),
    [],
  );

  const focusName = useCallback(
    () =>
      setTimeout(() => {
        const el = nameRef.current?.querySelector?.("input") || nameRef.current;
        el?.focus();
        el?.select?.();
      }, 50),
    [],
  );

  const focusUnit = useCallback(
    () =>
      setTimeout(() => {
        const btn =
          unitRef.current?.querySelector?.("[role='combobox']") ||
          unitRef.current;
        btn?.focus();
      }, 50),
    [],
  );

  const focusSave = useCallback(
    () =>
      setTimeout(() => {
        saveBtnRef.current?.focus();
      }, 50),
    [],
  );

  // ── باز / بستن ──
  const handleOpenAdd = useCallback(() => {
    setEditId(null);
    setForm({ code: "", name: "", unit: "kg" });
    setShowForm(true);
    setShowUnitInput(false);
    focusCode();
  }, [focusCode]);

  const handleOpenEdit = useCallback(
    (m) => {
      setEditId(m.id);
      setForm({ code: m.code || "", name: m.name || "", unit: m.unit || "kg" });
      setShowForm(true);
      setShowUnitInput(false);
      focusCode();
    },
    [focusCode],
  );

  const handleCloseForm = useCallback(() => {
    setShowForm(false);
    setEditId(null);
    setForm({ code: "", name: "", unit: "kg" });
    setShowUnitInput(false);
    searchRef.current?.focus();
  }, []);

  // ═══════════ ذخیره ═══════════
  const doSave = useCallback(async () => {
    const f = formRef.current;
    const currentEditId = editIdRef.current;

    console.log("[Save] form:", JSON.stringify(f), "editId:", currentEditId);

    if (!f.name || !f.name.trim()) {
      notify("نام کالا الزامی است", "warning");
      focusName();
      return;
    }

    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);

    const payload = {
      name: f.name.trim(),
      code: (f.code || "").trim(),
      unit: f.unit || "kg",
    };

    // ── آیتم جدید ──
    const newItem = {
      ...payload,
      id: currentEditId || Date.now(),
    };

    let savedToServer = false;

    try {
      console.log("[Save] 📤 sending:", JSON.stringify(payload));
      const res = await client.post("/api/raw-materials/save/", payload);
      console.log(
        "[Save] ✅ status:",
        res.status,
        "data:",
        JSON.stringify(res.data),
      );

      if (res.data?.id) newItem.id = res.data.id;
      savedToServer = true;
    } catch (err) {
      console.warn(
        "[Save] ⚠️ API failed:",
        err.response?.status,
        "— saving locally",
      );
    }

    // ── همیشه به لیست اضافه کن (حتی اگه API خطا بده) ──
    setMaterials((prev) => {
      let next;
      if (currentEditId) {
        next = prev.map((m) =>
          m.id === currentEditId ? { ...m, ...payload, id: currentEditId } : m,
        );
      } else {
        // ── جلوگیری از تکرار ──
        const exists = prev.find(
          (m) => m.name === payload.name && m.code === payload.code,
        );
        if (exists) {
          next = prev.map((m) =>
            m.id === exists.id ? { ...m, ...payload } : m,
          );
          newItem.id = exists.id;
        } else {
          next = [...prev, newItem];
        }
      }
      saveToLocal(next);
      return next;
    });

    notify(
      currentEditId
        ? "کالا بروزرسانی شد ✅"
        : savedToServer
          ? "کالا اضافه شد ✅"
          : "کالا اضافه شد (محلی) ✅",
      "success",
    );

    setEditId(null);
    setForm({ code: "", name: "", unit: "kg" });
    focusCode();

    savingRef.current = false;
    setSaving(false);
  }, [notify, focusName, focusCode]);

  const handleDelete = useCallback(
    async (id) => {
      try {
        await client.post("/api/raw-materials/delete/", { id });
      } catch {
        // ignore API error
      }
      setMaterials((prev) => {
        const next = prev.filter((m) => m.id !== id);
        saveToLocal(next);
        return next;
      });
      notify("کالا حذف شد", "info");
    },
    [notify],
  );

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
    if (val === "__other__") {
      setShowUnitInput(true);
      setTimeout(() => newUnitRef.current?.focus(), 150);
      return;
    }
    setForm((f) => ({ ...f, unit: val }));
  };

  // ── ناوبری ──
  const gotoNext = useCallback(() => {
    const codeInput =
      codeRef.current?.querySelector?.("input") || codeRef.current;
    const nameInput =
      nameRef.current?.querySelector?.("input") || nameRef.current;
    const unitBtn =
      unitRef.current?.querySelector?.("[role='combobox']") || unitRef.current;
    const active = document.activeElement;

    if (active === codeInput) focusName();
    else if (active === nameInput) focusUnit();
    else if (active === unitBtn || unitRef.current?.contains?.(active))
      focusSave();
    else focusCode();
  }, [focusName, focusUnit, focusSave, focusCode]);

  const gotoPrev = useCallback(() => {
    const nameInput =
      nameRef.current?.querySelector?.("input") || nameRef.current;
    const unitBtn =
      unitRef.current?.querySelector?.("[role='combobox']") || unitRef.current;
    const active = document.activeElement;

    if (active === nameInput) focusCode();
    else if (active === unitBtn || unitRef.current?.contains?.(active))
      focusName();
    else if (
      saveBtnRef.current?.contains?.(active) ||
      active === saveBtnRef.current
    )
      focusUnit();
    else focusName();
  }, [focusCode, focusName, focusUnit]);

  // ═══════════ کیبورد ═══════════
  useEffect(() => {
    const isCtrl = (e, code) => e.ctrlKey && !e.altKey && e.code === code;

    const handler = (e) => {
      const sf = showFormRef.current;
      const su = showUnitInputRef.current;

      if (e.key === "F2") {
        e.preventDefault();
        handleOpenAdd();
        return;
      }

      if (e.key === "F3") {
        e.preventDefault();
        const openUnitInput = () => {
          setShowUnitInput(true);
          setTimeout(() => newUnitRef.current?.focus(), 150);
        };
        if (!sf) {
          handleOpenAdd();
          setTimeout(openUnitInput, 300);
        } else {
          openUnitInput();
        }
        return;
      }

      if (isCtrl(e, "KeyS") && sf) {
        e.preventDefault();
        doSave();
        return;
      }

      if (isCtrl(e, "KeyD") && sf) {
        e.preventDefault();
        doSave();
        return;
      }

      if (isCtrl(e, "KeyA") && sf && !su) {
        e.preventDefault();
        gotoNext();
        return;
      }

      if (isCtrl(e, "KeyZ") && sf && !su) {
        e.preventDefault();
        gotoPrev();
        return;
      }

      if (e.key === "Enter" && !e.ctrlKey && !e.altKey && sf) {
        if (su) {
          e.preventDefault();
          handleAddUnit();
          return;
        }
        const target = e.target;
        const codeInput =
          codeRef.current?.querySelector?.("input") || codeRef.current;
        const nameInput =
          nameRef.current?.querySelector?.("input") || nameRef.current;
        const unitBtn =
          unitRef.current?.querySelector?.("[role='combobox']") ||
          unitRef.current;

        if (
          target === codeInput ||
          target === nameInput ||
          target === unitBtn ||
          saveBtnRef.current?.contains?.(target)
        ) {
          e.preventDefault();
          gotoNext();
        }
        return;
      }

      if (e.key === "Escape" && sf) {
        e.preventDefault();
        if (su) {
          setShowUnitInput(false);
          focusUnit();
        } else {
          handleCloseForm();
        }
        return;
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [
    handleOpenAdd,
    doSave,
    handleAddUnit,
    gotoNext,
    gotoPrev,
    handleCloseForm,
    focusUnit,
  ]);

  const filtered = materials.filter(
    (m) =>
      !search ||
      (m.name || "").includes(search) ||
      (m.code || "").includes(search),
  );

  const isRtl =
    typeof document !== "undefined"
      ? document.documentElement.dir === "rtl" ||
        document.documentElement.lang === "fa"
      : true;

  // ── استایل‌ها ──
  const inputSx = {
    "& .MuiOutlinedInput-root": {
      borderRadius: "10px",
      bgcolor: C.inputBg,
      backdropFilter: "blur(8px)",
      fontSize: F(13),
      color: C.text,
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
    borderRadius: "10px",
    fontSize: F(12),
    fontWeight: 700,
    textTransform: "none",
    px: 2.5,
    py: 1,
    color: "#fff",
    background: C.btnGrad,
    boxShadow: `0 4px 20px ${C.olive}30`,
    transition: "all 0.25s ease",
    "&:hover": {
      transform: "translateY(-1px)",
      boxShadow: `0 6px 28px ${C.olive}40`,
      filter: "brightness(1.1)",
    },
    "&:active": { transform: "scale(0.985)" },
  };

  const cancelBtnSx = {
    borderRadius: "10px",
    fontSize: F(12),
    fontWeight: 600,
    textTransform: "none",
    color: C.sub,
    border: `1px solid ${C.glassBorder}`,
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
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          mb: 2.5,
          flexWrap: "wrap",
          gap: 1.5,
        }}
      >
        <Box>
          <Typography
            sx={{
              fontSize: { xs: F(16), sm: F(18) },
              fontWeight: 800,
              color: C.text,
            }}
          >
            🥜 اجناس
          </Typography>
          <Typography sx={{ fontSize: F(11), color: C.muted, mt: 0.3 }}>
            {materials.length} کالا ثبت شده
          </Typography>
        </Box>
        <Button onClick={handleOpenAdd} sx={btnSx}>
          ➕ کالای جدید (F2)
        </Button>
      </Box>

      {/* ── جستجو ── */}
      <TextField
        size="small"
        placeholder="🔍 جستجو با نام یا کد کالا..."
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
        sx={{ ...inputSx, width: "100%", maxWidth: 360, mb: 2 }}
      />

      {/* ── فرم ── */}
      {showForm && (
        <Box
          sx={{
            bgcolor: C.glass,
            backdropFilter: "blur(16px)",
            border: `1px solid ${C.glassBorder}`,
            borderRadius: "14px",
            p: { xs: 2, sm: 2.5 },
            mb: 2.5,
            animation: "fadeUp 0.25s ease-out",
            overflow: "visible",
          }}
        >
          <Box
            sx={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              mb: 1.5,
            }}
          >
            <Typography
              sx={{ fontSize: F(13), fontWeight: 700, color: C.text }}
            >
              {editId ? "✏️ ویرایش کالا" : "➕ افزودن کالای جدید"}
            </Typography>
            <Button
              onClick={handleCloseForm}
              sx={{ ...cancelBtnSx, px: 1.5, py: 0.3, fontSize: F(11) }}
            >
              ✖ بستن
            </Button>
          </Box>

          <Box
            sx={{
              display: "flex",
              flexDirection: "row",
              gap: 1.5,
              alignItems: "flex-end",
              flexWrap: "wrap",
            }}
          >
            <Box sx={{ width: { xs: "100%", sm: 140 }, flexShrink: 0 }}>
              <TextField
                size="small"
                label="کد کالا"
                fullWidth
                inputRef={codeRef}
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
                placeholder="مثال: 1001"
                sx={inputSx}
              />
            </Box>

            <Box sx={{ flex: 1, minWidth: 180 }}>
              <TextField
                size="small"
                label="نام کالا *"
                fullWidth
                inputRef={nameRef}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                sx={inputSx}
              />
            </Box>

            {/* واحد */}
            <Box sx={{ width: { xs: "100%", sm: 160 }, flexShrink: 0 }}>
              <Typography
                sx={{ fontSize: F(11), color: C.sub, mb: 0.5, fontWeight: 600 }}
              >
                واحد
              </Typography>
              <Select
                size="small"
                fullWidth
                inputRef={unitRef}
                value={form.unit}
                onChange={(e) => handleUnitChange(e.target.value)}
                sx={{
                  ...inputSx,
                  "& .MuiSelect-select": { fontSize: F(13), py: 1 },
                }}
                MenuProps={{
                  slotProps: {
                    paper: {
                      sx: {
                        bgcolor: isDark ? "#1e1e30" : "#fff",
                        borderRadius: "12px",
                        border: `1px solid ${C.olive}30`,
                        boxShadow: "0 12px 40px rgba(0,0,0,0.3)",
                        maxHeight: 180,
                        overflowY: "auto",
                        direction: isRtl ? "rtl" : "ltr",
                        "& .MuiList-root": {
                          direction: isRtl ? "rtl" : "ltr",
                        },
                        "& .MuiMenuItem-root": {
                          direction: isRtl ? "rtl" : "ltr",
                          display: "flex",
                          justifyContent: isRtl ? "flex-end" : "flex-start",
                          textAlign: isRtl ? "right" : "left",
                          fontSize: F(12),
                          minHeight: 32,
                          py: 0.3,
                          px: 1.5,
                          borderRadius: "8px",
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
                  MenuListProps: {
                    sx: {
                      maxHeight: 180,
                      overflowY: "auto",
                      py: 0.5,
                      direction: isRtl ? "rtl" : "ltr",
                    },
                  },
                  anchorOrigin: { vertical: "bottom", horizontal: "left" },
                  transformOrigin: { vertical: "top", horizontal: "left" },
                  disableScrollLock: true,
                }}
              >
                {allUnits.map((u) => (
                  <MenuItem key={u.value} value={u.value}>
                    {u.label}
                  </MenuItem>
                ))}
                <MenuItem
                  value="__other__"
                  sx={{
                    borderTop: `1px dashed ${C.olive}30`,
                    mt: 0.5,
                    pt: 1,
                    justifyContent: isRtl ? "flex-end" : "flex-start",
                  }}
                >
                  <Typography
                    sx={{
                      fontSize: F(12),
                      fontWeight: 700,
                      color: C.olive,
                      textAlign: isRtl ? "right" : "left",
                    }}
                  >
                    ✏️ سایر (واحد جدید...)
                  </Typography>
                </MenuItem>
              </Select>
            </Box>

            {showUnitInput && (
              <Box
                sx={{
                  width: { xs: "100%", sm: 180 },
                  flexShrink: 0,
                  display: "flex",
                  gap: 0.5,
                  alignItems: "flex-end",
                }}
              >
                <TextField
                  size="small"
                  label="واحد جدید"
                  fullWidth
                  inputRef={newUnitRef}
                  value={newUnitName}
                  onChange={(e) => setNewUnitName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      e.stopPropagation();
                      handleAddUnit();
                    }
                  }}
                  sx={inputSx}
                />
                <Button
                  onClick={handleAddUnit}
                  sx={{ ...btnSx, px: 1.5, py: 1, fontSize: F(11) }}
                >
                  ✓
                </Button>
              </Box>
            )}

            {/* ── دکمه ذخیره (همیشه فعال) ── */}
            <Box sx={{ display: "flex", gap: 0.5, pb: 0.1 }}>
              <Button
                ref={saveBtnRef}
                onClick={doSave}
                disabled={saving}
                sx={{
                  ...btnSx,
                  opacity: saving ? 0.7 : 1,
                  minWidth: 110,
                }}
              >
                {saving ? "⏳ ذخیره..." : editId ? "💾 بروزرسانی" : "➕ افزودن"}
              </Button>
              {editId && (
                <Button onClick={handleCloseForm} sx={cancelBtnSx}>
                  انصراف
                </Button>
              )}
            </Box>
          </Box>
        </Box>
      )}

      {/* ══ راهنمای کیبورد ══ */}
      <Box
        sx={{
          display: "flex",
          flexWrap: "wrap",
          gap: 0.8,
          alignItems: "center",
          mb: 2.5,
          px: 2,
          py: 1.2,
          borderRadius: "12px",
          bgcolor: isDark ? "rgba(107,155,110,0.07)" : "rgba(46,77,48,0.06)",
          border: `1px solid ${C.olive}20`,
        }}
      >
        <Chip
          size="small"
          label="راهنما"
          sx={{
            height: 26,
            fontSize: F(11),
            fontWeight: 900,
            borderRadius: "6px",
            bgcolor: "#FFD600",
            color: "#1A1A00",
            px: 1,
            mr: 0.5,
            "&:hover": { bgcolor: "#FFD600" },
          }}
        />
        {[
          { key: "Ctrl+A", label: "بعدی" },
          { key: "Ctrl+Z", label: "قبلی" },
          { key: "Ctrl+S", label: "ذخیره" },
          { key: "Ctrl+D", label: "افزودن" },
          { key: "F2", label: "کالای جدید" },
          { key: "F3", label: "واحد جدید" },
          { key: "Enter", label: "بعدی" },
          { key: "Esc", label: "بستن" },
          { key: "↑↓", label: "انتخاب واحد" },
        ].map((item) => (
          <Box
            key={item.key}
            sx={{ display: "flex", alignItems: "center", gap: 0.5 }}
          >
            <Chip
              size="small"
              label={item.key}
              sx={{
                height: 24,
                fontSize: F(11),
                fontWeight: 800,
                borderRadius: "6px",
                fontFamily: "monospace",
                bgcolor: C.oliveSubtle,
                color: C.olive,
                border: `1px solid ${C.olive}30`,
                px: 0.5,
              }}
            />
            <Typography sx={{ fontSize: F(11), color: C.sub, fontWeight: 600 }}>
              {item.label}
            </Typography>
          </Box>
        ))}
      </Box>

      {/* ── لیست ── */}
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
      ) : (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 0.8 }}>
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              px: { xs: 1.5, sm: 2 },
              py: { xs: 0.8, sm: 1 },
              borderRadius: "10px",
              bgcolor: isDark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.02)",
            }}
          >
            <Typography
              sx={{
                width: 90,
                fontSize: F(10),
                fontWeight: 700,
                color: C.muted,
                letterSpacing: "0.05em",
              }}
            >
              کد
            </Typography>
            <Typography
              sx={{
                flex: 3,
                fontSize: F(10),
                fontWeight: 700,
                color: C.muted,
                letterSpacing: "0.05em",
              }}
            >
              نام کالا
            </Typography>
            <Typography
              sx={{
                flex: 1,
                fontSize: F(10),
                fontWeight: 700,
                color: C.muted,
                letterSpacing: "0.05em",
                textAlign: "center",
              }}
            >
              واحد
            </Typography>
            <Box sx={{ minWidth: 100 }} />
          </Box>

          {filtered.map((m, i) => (
            <Box
              key={m.id}
              sx={{
                display: "flex",
                alignItems: "center",
                px: { xs: 1.5, sm: 2 },
                py: { xs: 1, sm: 1.2 },
                borderRadius: "12px",
                bgcolor: C.glass,
                backdropFilter: "blur(12px)",
                border: `1px solid ${C.glassBorder}`,
                transition: "all 0.2s ease",
                opacity: 0,
                animation: `fadeUp 0.35s ease-out ${i * 0.04}s forwards`,
                "&:hover": {
                  bgcolor: isDark
                    ? "rgba(255,255,255,0.04)"
                    : "rgba(0,0,0,0.02)",
                  transform: "translateX(-2px)",
                },
              }}
            >
              <Box sx={{ width: 90 }}>
                <Chip
                  size="small"
                  label={m.code || "—"}
                  sx={{
                    height: 24,
                    fontSize: F(11),
                    fontWeight: 700,
                    borderRadius: "6px",
                    bgcolor: C.oliveSubtle,
                    color: C.olive,
                    fontFamily: "monospace",
                  }}
                />
              </Box>
              <Box sx={{ flex: 3, minWidth: 0 }}>
                <Typography
                  sx={{
                    fontSize: F(13),
                    fontWeight: 700,
                    color: C.text,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {m.name}
                </Typography>
              </Box>
              <Box sx={{ flex: 1, textAlign: "center" }}>
                <Typography sx={{ fontSize: F(12), color: C.sub }}>
                  {getUnitLabel(m.unit)}
                </Typography>
              </Box>
              <Box
                sx={{
                  minWidth: 100,
                  display: "flex",
                  gap: 0.5,
                  justifyContent: "center",
                }}
              >
                <Box
                  onClick={() => handleOpenEdit(m)}
                  sx={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 0.2,
                    px: 0.8,
                    py: 0.4,
                    borderRadius: "8px",
                    cursor: "pointer",
                    color: C.olive,
                    "&:hover": { bgcolor: C.oliveSubtle },
                  }}
                >
                  <Edit sx={{ fontSize: 16 }} />
                  <Typography sx={{ fontSize: F(9), fontWeight: 600 }}>
                    ویرایش
                  </Typography>
                </Box>
                <Box
                  onClick={() => handleDelete(m.id)}
                  sx={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 0.2,
                    px: 0.8,
                    py: 0.4,
                    borderRadius: "8px",
                    cursor: "pointer",
                    color: C.danger,
                    "&:hover": { bgcolor: C.dangerBg },
                  }}
                >
                  <Delete sx={{ fontSize: 16 }} />
                  <Typography sx={{ fontSize: F(9), fontWeight: 600 }}>
                    حذف
                  </Typography>
                </Box>
              </Box>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}
