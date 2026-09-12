import { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useLang } from "@shared/contexts/LangContext";
import {
  Box, Typography, Button, TextField, Chip, IconButton,
  InputAdornment, CircularProgress, Tooltip,
} from "@mui/material";
import { fetchFoods, createFood, updateFood, deleteFood } from "../api";
import MenuForm from "./MenuForm";

export default function MenuSection({ C, isRtl, isDark, showToast }) {
  const { t } = useTranslation();
  const { lang } = useLang();
  const [foods, setFoods] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState("__all__");
  const [formOpen, setFormOpen] = useState(false);
  const [editItem, setEditItem] = useState(null);

  const displayName = (item) => lang === "en" && item.name_en ? item.name_en : item.name;
  const displayCategory = (item) => lang === "en" && item.category_name_en ? item.category_name_en : item.category_name;


  const load = async () => {
    setLoading(true);
    try {
      const data = await fetchFoods();
      setFoods(data);
    } catch (err) {
      console.error("Fetch foods error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const categories = useMemo(() => {
    const cats = new Set();
    foods.forEach(f => {
      const catName = displayCategory(f);
      if (catName) cats.add(catName);
    });
    return [...cats].sort();
  }, [foods, lang]);

  const filtered = useMemo(() => {
    let list = foods;
    if (filterCat !== "__all__") list = list.filter(f => displayCategory(f) === filterCat);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(f =>
        displayName(f).toLowerCase().includes(q) ||
        displayCategory(f).toLowerCase().includes(q)
      );
    }
    return list;
  }, [foods, filterCat, search, lang]);

  const handleSave = async (data) => {
    try {
      if (data.id) {
        await updateFood(data.id, data);
        showToast(t("dict.food_updated"), "success");
      } else {
        await createFood(data);
        showToast(t("dict.food_created"), "success");
      }
      setFormOpen(false);
      setEditItem(null);
      load();
    } catch (err) {
      const msg = err.response?.data?.error || err.message;
      showToast(msg, "error");
    }
  };

  const handleDelete = async (item) => {
    if (!window.confirm(t("dict.confirm_delete_food"))) return;
    try {
      await deleteFood(item.id);
      showToast(t("dict.food_deleted"), "success");
      load();
    } catch (err) {
      const msg = err.response?.data?.error || err.message;
      showToast(msg, "error");
    }
  };

  const inputSx = {
    "& .MuiOutlinedInput-root": {
      borderRadius: "12px",
      bgcolor: C.inputBg,
      backdropFilter: "blur(8px)",
      fontSize: 13,
      fontFamily: "'Vazirmatn', 'Plus Jakarta Sans', sans-serif",
      color: C.text,
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

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
        <CircularProgress sx={{ color: C.olive }} size={36} />
      </Box>
    );
  }

  return (
    <Box>
      <Box sx={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        mb: 2.5, flexWrap: "wrap", gap: 1.5,
      }}>
        <Box>
          <Typography sx={{ fontSize: { xs: 16, sm: 18 }, fontWeight: 800, color: C.text }}>
            🍽️ {t("dict.menu_tab")}
          </Typography>
          <Typography sx={{ fontSize: 12, color: C.sub, mt: 0.3 }}>
            {t("dict.menu_subtitle")}
          </Typography>
        </Box>
        <Button
          onClick={() => { setEditItem(null); setFormOpen(true); }}
          sx={{
            borderRadius: "12px", fontSize: 12, fontWeight: 700,
            textTransform: "none", px: 2.5, py: 1, color: "#fff",
            background: C.btnGrad,
            boxShadow: `0 4px 20px ${C.olive}30`,
            transition: "all 0.25s ease",
            "&:hover": { transform: "translateY(-1px)", boxShadow: `0 6px 28px ${C.olive}40` },
            "&:active": { transform: "scale(0.985)" },
          }}
        >
          ➕ {t("dict.add_food")}
        </Button>
      </Box>

      <Box sx={{ display: "flex", gap: 1.5, mb: 2, flexWrap: "wrap" }}>
        <TextField
          size="small"
          placeholder={t("dict.search_food")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          sx={{ ...inputSx, flex: 1, minWidth: { xs: "100%", sm: 200 } }}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <Typography sx={{ fontSize: 14, color: C.muted }}>🔍</Typography>
                </InputAdornment>
              ),
            },
          }}
        />
        <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap", alignItems: "center" }}>
          <Chip
            label={t("dict.all_categories")}
            size="small"
            onClick={() => setFilterCat("__all__")}
            sx={{
              fontSize: 11, fontWeight: 600, borderRadius: "8px",
              bgcolor: filterCat === "__all__" ? C.oliveSubtle : "transparent",
              color: filterCat === "__all__" ? C.olive : C.sub,
              border: `1px solid ${filterCat === "__all__" ? C.olive + "40" : C.glassBorder}`,
              cursor: "pointer", transition: "all 0.2s ease",
              "&:hover": { bgcolor: C.oliveSubtle },
            }}
          />
          {categories.map(cat => (
            <Chip
              key={cat}
              label={cat}
              size="small"
              onClick={() => setFilterCat(cat)}
              sx={{
                fontSize: 11, fontWeight: 600, borderRadius: "8px",
                bgcolor: filterCat === cat ? C.oliveSubtle : "transparent",
                color: filterCat === cat ? C.olive : C.sub,
                border: `1px solid ${filterCat === cat ? C.olive + "40" : C.glassBorder}`,
                cursor: "pointer", transition: "all 0.2s ease",
                "&:hover": { bgcolor: C.oliveSubtle },
              }}
            />
          ))}
        </Box>
      </Box>

      {filtered.length === 0 ? (
        <Box sx={{ textAlign: "center", py: 6 }}>
          <Typography sx={{ fontSize: 36, mb: 1 }}>🍽️</Typography>
          <Typography sx={{ fontSize: 14, fontWeight: 700, color: C.text, mb: 0.5 }}>
            {t("dict.no_foods")}
          </Typography>
          <Typography sx={{ fontSize: 12, color: C.sub }}>
            {t("dict.no_foods_sub")}
          </Typography>
        </Box>
      ) : (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 0.8 }}>

          <Box sx={{
            display: "flex", alignItems: "center",
            px: { xs: 1.5, sm: 2 }, py: { xs: 0.8, sm: 1 },
            borderRadius: "10px",
            bgcolor: isDark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.02)",
          }}>
            <Typography sx={{
              flex: 1, fontSize: { xs: 10, sm: 10 }, fontWeight: 700,
              color: C.muted, letterSpacing: "0.05em", textTransform: "uppercase",
            }}>
              {t("dict.food_name")}
            </Typography>
            <Typography sx={{
              fontSize: { xs: 10, sm: 10 }, fontWeight: 700,
              color: C.muted, letterSpacing: "0.05em", textTransform: "uppercase",
              textAlign: "center",
              minWidth: { xs: 80, sm: 120 },
              display: { xs: "block", sm: "block" },
            }}>
              {t("dict.category")}
            </Typography>
            <Box sx={{ minWidth: { xs: 56, sm: 70 } }} />
          </Box>

          {filtered.map((food, i) => (
            <Box key={food.id} sx={{
              display: "flex", alignItems: "center",
              px: { xs: 1.5, sm: 2 }, py: { xs: 1, sm: 1.5 },
              borderRadius: "12px",
              bgcolor: C.glass, backdropFilter: "blur(12px)",
              border: `1px solid ${C.glassBorder}`,
              transition: "all 0.2s ease",
              opacity: 0, animation: `fadeUp 0.35s ease-out ${i * 0.04}s forwards`,
              "&:hover": { bgcolor: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.02)", transform: "translateX(2px)" },
            }}>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography sx={{
                  fontSize: { xs: 12, sm: 13 }, fontWeight: 700, color: C.text,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {displayName(food)}
                </Typography>
              </Box>
              <Box sx={{
                minWidth: { xs: 80, sm: 120 },
                textAlign: "center",
              }}>
                {displayCategory(food) ? (
                  <Chip size="small" label={displayCategory(food)} sx={{
                    height: { xs: 20, sm: 22 },
                    fontSize: { xs: 9, sm: 10 },
                    fontWeight: 600, borderRadius: "6px",
                    bgcolor: C.oliveSubtle, color: C.olive,
                    maxWidth: 100,
                  }} />
                ) : (
                  <Typography sx={{ fontSize: { xs: 10, sm: 11 }, color: C.muted }}>-</Typography>
                )}
              </Box>
              <Box sx={{
                display: "flex", gap: 0.3,
                minWidth: { xs: 56, sm: 70 },
                justifyContent: "center",
              }}>
                <Tooltip title={t("dict.edit")}>
                  <IconButton size="small" onClick={() => { setEditItem(food); setFormOpen(true); }} sx={{ color: C.olive, "&:hover": { bgcolor: C.oliveSubtle } }}>
                    <Typography sx={{ fontSize: { xs: 13, sm: 14 } }}>✏️</Typography>
                  </IconButton>
                </Tooltip>
                <Tooltip title={t("dict.delete")}>
                  <IconButton size="small" onClick={() => handleDelete(food)} sx={{ color: C.danger, "&:hover": { bgcolor: C.dangerBg } }}>
                    <Typography sx={{ fontSize: { xs: 13, sm: 14 } }}>🗑️</Typography>
                  </IconButton>
                </Tooltip>
              </Box>
            </Box>
          ))}
        </Box>
      )}

      <MenuForm
        open={formOpen}
        onClose={() => { setFormOpen(false); setEditItem(null); }}
        onSave={handleSave}
        editItem={editItem}
        categories={categories}
        C={C}
        isRtl={isRtl}
        isDark={isDark}
      />
    </Box>
  );
}


