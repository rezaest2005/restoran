import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  Box, Typography, TextField, Button, IconButton,
  InputAdornment, CircularProgress, Fade, Backdrop, Chip,
} from "@mui/material";
import { autoTranslate } from "../api";

export default function MenuForm({ open, onClose, onSave, editItem, categories = [], C, isRtl, isDark }) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [nameEn, setNameEn] = useState("");
  const [categoryName, setCategoryName] = useState("");
  const [categoryNameEn, setCategoryNameEn] = useState("");
  const [translating, setTranslating] = useState(false);
  const [translatingCat, setTranslatingCat] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      if (editItem) {
        setName(editItem.name || "");
        setNameEn(editItem.name_en || "");
        setCategoryName(editItem.category_name || "");
        setCategoryNameEn(editItem.category_name_en || "");
      } else {
        setName("");
        setNameEn("");
        setCategoryName("");
        setCategoryNameEn("");
      }
      setTranslating(false);
      setTranslatingCat(false);
      setSaving(false);
    }
  }, [open, editItem]);

  // ── Auto-translate: Food name ──
  const handleAutoTranslate = async () => {
    if (!name.trim()) return;
    setTranslating(true);
    const result = await autoTranslate(name);
    if (result) setNameEn(result);
    setTranslating(false);
  };

  const handleNameBlur = async () => {
    if (name.trim() && !nameEn.trim()) {
      setTranslating(true);
      const result = await autoTranslate(name);
      if (result) setNameEn(result);
      setTranslating(false);
    }
  };

  // ── Auto-translate: Category name ──
  const handleCategoryAutoTranslate = async () => {
    if (!categoryName.trim()) return;
    setTranslatingCat(true);
    const result = await autoTranslate(categoryName);
    if (result) setCategoryNameEn(result);
    setTranslatingCat(false);
  };

  const handleCategoryBlur = async () => {
    if (categoryName.trim() && !categoryNameEn.trim()) {
      setTranslatingCat(true);
      const result = await autoTranslate(categoryName);
      if (result) setCategoryNameEn(result);
      setTranslatingCat(false);
    }
  };

  // ── Save ──
  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    await onSave({
      id: editItem?.id,
      name: name.trim(),
      name_en: nameEn.trim(),
      category_name: categoryName.trim(),
      category_name_en: categoryNameEn.trim(),
    });
    setSaving(false);
  };

  const bg = isDark ? "#1a1a1a" : "#ffffff";
  const textPrimary = isDark ? "#f0ece4" : "#1a1a1a";
  const textSub = isDark ? "#a8a29e" : "#6b7280";
  const textMuted = isDark ? "#78716c" : "#9ca3af";
  const borderColor = isDark ? "#333333" : "#e5e7eb";
  const inputBg = isDark ? "#252525" : "#f9fafb";
  const olive = "#6b8e23";
  const oliveBg = isDark ? "rgba(107,142,35,0.12)" : "rgba(107,142,35,0.08)";

  const inputSx = {
    "& .MuiOutlinedInput-root": {
      borderRadius: "14px", bgcolor: inputBg, fontSize: 14,
      fontFamily: "'Vazirmatn', 'Plus Jakarta Sans', sans-serif",
      color: textPrimary, transition: "all 0.25s ease",
      "& fieldset": { borderColor: borderColor },
      "&:hover fieldset": { borderColor: olive + "60" },
      "&.Mui-focused fieldset": { borderColor: olive, borderWidth: 2 },
      "&.Mui-focused": { boxShadow: "0 0 0 4px " + olive + "15" },
    },
    "& .MuiInputLabel-root": { fontSize: 13, color: textSub, fontFamily: "'Vazirmatn'" },
    "& .MuiInputLabel-root.Mui-focused": { color: olive, fontWeight: 600 },
    "& .MuiInputBase-input": { color: textPrimary, py: 1.5 },
    "& .MuiInputBase-input::placeholder": { color: textMuted, opacity: 1 },
  };

  if (!open) return null;

  return (
    <Backdrop open={open} sx={{ zIndex: 1300, bgcolor: "rgba(0,0,0,0.5)" }} onClick={onClose}>
      <Fade in={open} timeout={300}>
        <Box
          onClick={(e) => e.stopPropagation()}
          dir={isRtl ? "rtl" : "ltr"}
          sx={{
            position: "absolute", top: "50%", left: "50%",
            transform: "translate(-50%, -50%)",
            width: { xs: "92%", sm: 440 }, maxHeight: "90vh", overflowY: "auto",
            bgcolor: bg, border: "1.5px solid " + borderColor, borderRadius: "24px",
            boxShadow: isDark ? "0 24px 80px rgba(0,0,0,0.6)" : "0 24px 80px rgba(0,0,0,0.15)",
            fontFamily: "'Vazirmatn', 'Plus Jakarta Sans', sans-serif", outline: "none",
            "&::-webkit-scrollbar": { width: 4 },
            "&::-webkit-scrollbar-thumb": { bgcolor: textMuted, borderRadius: 2 },
          }}
        >
          {/* Header */}
          <Box sx={{ position: "sticky", top: 0, zIndex: 2, px: 3, pt: 3, pb: 2, bgcolor: bg, borderBottom: "1px solid " + borderColor }}>
            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <Box>
                <Typography sx={{ fontSize: 18, fontWeight: 900, color: textPrimary }}>
                  {editItem ? "✏️" : "➕"} {editItem ? t("dict.edit_food") : t("dict.add_food")}
                </Typography>
                <Typography sx={{ fontSize: 12, color: textSub, mt: 0.3 }}>
                  {editItem ? "ویرایش اطلاعات غذا" : "اطلاعات غذای جدید را وارد کنید"}
                </Typography>
              </Box>
              <IconButton onClick={onClose} sx={{ color: textSub, bgcolor: oliveBg, borderRadius: "12px", width: 36, height: 36, "&:hover": { bgcolor: olive + "20", color: olive } }}>
                <Typography sx={{ fontSize: 16, lineHeight: 1 }}>{"✕"}</Typography>
              </IconButton>
            </Box>
          </Box>

          {/* Form */}
          <Box sx={{ px: 3, pt: 3, pb: 2, display: "flex", flexDirection: "column", gap: 2.5 }}>

            {/* Food Name (Farsi) — auto-translates to English on blur */}
            <Box>
              <Typography sx={{ fontSize: 12, fontWeight: 700, color: textSub, mb: 0.8, textTransform: "uppercase" }}>
                {t("dict.food_name")}
              </Typography>
              <TextField
                value={name} onChange={(e) => setName(e.target.value)} onBlur={handleNameBlur}
                fullWidth autoFocus placeholder="مثلاً: پیتزا مارگاریتا"
                sx={inputSx}
                slotProps={{ input: { endAdornment: (
                  <InputAdornment position="end">
                    {translating ? <CircularProgress size={18} sx={{ color: olive }} /> : (
                      <IconButton size="small" onClick={handleAutoTranslate} disabled={!name.trim()} sx={{ color: olive, "&:hover": { bgcolor: oliveBg } }}>
                        <Typography sx={{ fontSize: 14 }}>🌐</Typography>
                      </IconButton>
                    )}
                  </InputAdornment>
                )}}}
              />
            </Box>

            {/* Food Name (English) */}
            <Box>
              <Typography sx={{ fontSize: 12, fontWeight: 700, color: textSub, mb: 0.8, textTransform: "uppercase" }}>
                {t("dict.food_name_en")}
              </Typography>
              <TextField
                value={nameEn} onChange={(e) => setNameEn(e.target.value)}
                fullWidth placeholder="e.g. Margherita Pizza" sx={inputSx}
                slotProps={{ input: { startAdornment: <InputAdornment position="start"><Typography sx={{ fontSize: 12, color: textMuted, fontWeight: 600 }}>EN</Typography></InputAdornment> }}}
              />
            </Box>

            {/* Category (Farsi) — auto-translates to English on blur */}
            <Box>
              <Typography sx={{ fontSize: 12, fontWeight: 700, color: textSub, mb: 0.8, textTransform: "uppercase" }}>
                📁 {t("dict.category")}
              </Typography>
              <TextField
                fullWidth value={categoryName}
                onChange={(e) => setCategoryName(e.target.value)}
                onBlur={handleCategoryBlur}
                placeholder="تایپ یا انتخاب دسته‌بندی..."
                sx={inputSx}
                slotProps={{ input: { endAdornment: (
                  <InputAdornment position="end">
                    {translatingCat ? <CircularProgress size={18} sx={{ color: olive }} /> : (
                      <IconButton size="small" onClick={handleCategoryAutoTranslate} disabled={!categoryName.trim()} sx={{ color: olive, "&:hover": { bgcolor: oliveBg } }}>
                        <Typography sx={{ fontSize: 14 }}>🌐</Typography>
                      </IconButton>
                    )}
                  </InputAdornment>
                )}}}
              />
              {categories.length > 0 && (
                <Box sx={{ display: "flex", gap: 0.8, mt: 1.5, flexWrap: "wrap" }}>
                  {categories.map(cat => (
                    <Chip
                      key={cat} label={cat} size="small"
                      onClick={() => setCategoryName(cat)}
                      sx={{
                        fontSize: 13, fontWeight: 700, borderRadius: "10px",
                        height: 36, cursor: "pointer", px: 1.5,
                        bgcolor: categoryName === cat ? oliveBg : "transparent",
                        color: categoryName === cat ? olive : textSub,
                        border: "1px solid " + (categoryName === cat ? olive + "50" : borderColor),
                        transition: "all 0.15s ease",
                        "&:hover": { bgcolor: oliveBg, color: olive },
                      }}
                    />
                  ))}
                </Box>
              )}
            </Box>

            {/* Category (English) */}
            <Box>
              <Typography sx={{ fontSize: 12, fontWeight: 700, color: textSub, mb: 0.8, textTransform: "uppercase" }}>
                📁 {t("dict.category")} (EN)
              </Typography>
              <TextField
                fullWidth value={categoryNameEn}
                onChange={(e) => setCategoryNameEn(e.target.value)}
                placeholder="e.g. Pizza"
                sx={inputSx}
                slotProps={{ input: { startAdornment: <InputAdornment position="start"><Typography sx={{ fontSize: 12, color: textMuted, fontWeight: 600 }}>EN</Typography></InputAdornment> }}}
              />
            </Box>

          </Box>

          {/* Buttons */}
          <Box sx={{ px: 3, pb: 3, pt: 1, display: "flex", gap: 1.5, flexDirection: isRtl ? "row-reverse" : "row" }}>
            <Button onClick={onClose} fullWidth sx={{ borderRadius: "14px", fontSize: 14, fontWeight: 600, color: textSub, textTransform: "none", py: 1.3, border: "1.5px solid " + borderColor, "&:hover": { bgcolor: oliveBg } }}>
              {t("dict.cancel")}
            </Button>
            <Button onClick={handleSave} disabled={!name.trim() || saving} fullWidth sx={{ borderRadius: "14px", fontSize: 14, fontWeight: 700, textTransform: "none", py: 1.3, color: "#fff", background: "linear-gradient(135deg, " + olive + ", #556b2f)", boxShadow: "0 6px 24px " + olive + "30", "&:hover": { transform: "translateY(-2px)" }, "&.Mui-disabled": { bgcolor: textMuted, color: textSub } }}>
              {saving ? <CircularProgress size={20} sx={{ color: "#fff" }} /> : t("dict.btn_save")}
            </Button>
          </Box>
        </Box>
      </Fade>
    </Backdrop>
  );
}