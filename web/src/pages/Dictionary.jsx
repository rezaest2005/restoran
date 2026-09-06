import { useState, useEffect, useMemo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  Box, Typography, Button, IconButton, TextField, Select, MenuItem,
  FormControl, InputLabel, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Chip, Switch, Popover,
  Checkbox, FormControlLabel, CircularProgress, Divider, InputAdornment
} from "@mui/material";
import {
  Add, Delete, Edit, Search, Colorize, Check, Close, Book, ArrowDropDown
} from "@mui/icons-material";
import { useThemeMode } from "../contexts/ThemeContext";
import { useLang } from "../contexts/LangContext";

const animations = `
  @keyframes orb1 { 0%, 100% { transform: translate(0, 0) scale(1); } 25% { transform: translate(60px, -80px) scale(1.1); } 50% { transform: translate(-20px, -40px) scale(0.95); } 75% { transform: translate(-50px, 50px) scale(1.05); } }
  @keyframes float { 0%, 100% { transform: translateY(0px); } 50% { transform: translateY(-6px); } }
  @keyframes shimmer { 0% { background-position: -200% center; } 100% { background-position: 200% center; } }
  @keyframes fadeUp { from { opacity: 0; transform: translateY(20px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
`;

const PRESETS = [
  { slug: '__raw_material__', name: 'مواد اولیه', icon: '📦', color: '#10b981', cat: 'raw_material' },
  { slug: '__ready_material__', name: 'مواد آماده', icon: '🛍️', color: '#f59e0b', cat: 'ready_material' },
  { slug: '__food_menu__', name: 'غذا و منو', icon: '🍽️', color: '#3b82f6', cat: 'food' },
];

const UNIT_OPTIONS = [
  { value: 'kg', label: 'کیلوگرم' }, { value: 'g', label: 'گرم' },
  { value: 'l', label: 'لیتر' }, { value: 'ml', label: 'میلی‌لیتر' },
  { value: 'unit', label: 'عدد' }, { value: 'bunch', label: 'دسته' },
  { value: 'pack', label: 'بسته' }, { value: 'custom', label: 'سایر...' }
];

const ICONS = ['📦', '🛍️', '🍽️', '🥤', '☕', '💧', '❄️', '🔥', '⚡', '🍃', '🌸', '🌳', '🎨', '🖌️', '⚙️', '🛠️', '🔨', '🚚', '🛒', '🏪', '👜', '🏷️', '🍖', '🥚', '🍎', '🧺', '💾', '🗂️', '🎁', '⭐', '❤️', '🎵', '📷'];

export default function Dictionary() {
  const { mode } = useThemeMode();
  const { isRtl } = useLang();
  const { t } = useTranslation();
  const isDark = mode === "dark";

  const [mounted, setMounted] = useState(false);
  const [groups, setGroups] = useState([]);
  const [allItems, setAllItems] = useState([]);
  const [currentSlug, setCurrentSlug] = useState(PRESETS[0].slug);
  const [searchQuery, setSearchQuery] = useState("");
  const [dictCats, setDictCats] = useState({}); // { slug: { key: label } }
  const [activeCat, setActiveCat] = useState('all');
  
  // Item Form State
  const [itemName, setItemName] = useState("");
  const [itemUnit, setItemUnit] = useState("");
  const [customUnit, setCustomUnit] = useState("");
  const [selectedCat, setSelectedCat] = useState("");
  const [itemDesc, setItemDesc] = useState("");
  const [editingId, setEditingId] = useState(null);

  // Group Form State
  const [grpFormOpen, setGrpFormOpen] = useState(false);
  const [grpName, setGrpName] = useState("");
  const [grpIcon, setGrpIcon] = useState("📦");
  const [grpColor, setGrpColor] = useState("#6b7280");
  const [grpUsage, setGrpUsage] = useState({ recipes: true, warehouse: true, invoice: true, kitchen: true, pos: true });

  // Popovers
  const [iconAnchor, setIconAnchor] = useState(null);
  const [catAnchor, setCatAnchor] = useState(null);
  const [newCatName, setNewCatName] = useState("");

  useEffect(() => {
    const tmr = setTimeout(() => setMounted(true), 80);
    return () => clearTimeout(tmr);
  }, []);

  // Fetch Data
  useEffect(() => {
    // شبیه‌سازی API
    // const fetchGroups = await superClient.get("/api/dictionary/groups/");
    setGroups([
      { id: 1, slug: 'custom_1', name: 'بسته‌بندی', icon: '📦', color: '#8b5cf6', usage_recipes: false, usage_warehouse: true, usage_invoice: true, usage_kitchen: false, usage_pos: false }
    ]);

    // const fetchItems = await superClient.get("/api/dictionary/list/");
    setAllItems([
      { id: 1, name: "گوشت چرخ‌کرده", unit: "kg", category: "raw_material", dict_category: "cat_1", description: "" },
      { id: 2, name: "پنیر موزارلا", unit: "kg", category: "raw_material", dict_category: "cat_2", description: "وارداتی" },
      { id: 3, name: "پاستا", unit: "pack", category: "ready_material", dict_category: "", description: "" },
      { id: 4, name: "پیتزا مارگاریتا", unit: "", category: "food", dict_category: "cat_1", description: "" },
    ]);

    const savedCats = localStorage.getItem('kt_dict_cats_v8');
    if (savedCats) setDictCats(JSON.parse(savedCats).cats || {});
  }, []);

  const C = useMemo(() => ({
    bg: isDark ? "#0B0A0B" : "#E4E8F0",
    glass: isDark ? "rgba(16,18,16,0.6)" : "rgba(240,244,252,0.7)",
    glassBorder: isDark ? "rgba(107,155,110,0.1)" : "rgba(80,100,140,0.15)",
    glassShimmer: isDark ? "linear-gradient(90deg, transparent 0%, rgba(107,155,110,0.05) 20%, rgba(168,64,96,0.06) 40%, rgba(212,183,106,0.07) 60%, rgba(107,155,110,0.04) 80%, transparent 100%)" : "linear-gradient(90deg, transparent 0%, rgba(80,100,160,0.06) 20%, rgba(120,40,70,0.05) 40%, rgba(196,162,101,0.06) 60%, rgba(61,90,62,0.04) 80%, transparent 100%)",
    olive: isDark ? "#6B9B6E" : "#2E4D30",
    oliveSubtle: isDark ? "rgba(107,155,110,0.08)" : "rgba(46,77,48,0.08)",
    text: isDark ? "#F0ECE8" : "#1A1A24",
    sub: isDark ? "#8A8588" : "#555568",
    muted: isDark ? "#4A4548" : "#8A8A9E",
    inputBg: isDark ? "rgba(11,10,11,0.5)" : "rgba(240,244,252,0.85)",
    btnGrad: isDark ? "linear-gradient(135deg, #3D6B40 0%, #5A8A5D 35%, #6B9B6E 70%, #4A7A4D 100%)" : "linear-gradient(135deg, #1E3A20 0%, #2E4D30 35%, #3D5A3E 70%, #2E4D30 100%)",
    danger: isDark ? "#E84057" : "#C83048",
    cardShadow: isDark ? "0 8px 60px rgba(0,0,0,0.5), 0 0 80px rgba(107,155,110,0.04)" : "0 8px 60px rgba(0,0,0,0.1), 0 0 60px rgba(74,106,148,0.08)",
  }), [isDark]);

  const glassCardSx = {
    bgcolor: C.glass, backdropFilter: "blur(28px)", WebkitBackdropFilter: "blur(28px)",
    border: `1px solid ${C.glassBorder}`, borderRadius: "20px",
    boxShadow: C.cardShadow, position: "relative", overflow: "visible",
    "&::before": { content: '""', position: "absolute", top: 0, left: 0, right: 0, height: 1, background: C.glassShimmer, backgroundSize: "200% 100%", animation: "shimmer 10s linear infinite", pointerEvents: "none", borderRadius: "20px 20px 0 0" }
  };

  const inputSx = {
    "& .MuiOutlinedInput-root": {
      borderRadius: "12px", fontFamily: "'Vazirmatn', sans-serif", bgcolor: C.inputBg, fontSize: 13,
      "& fieldset": { borderColor: C.glassBorder, borderWidth: 1 },
      "&:hover fieldset": { borderColor: C.olive },
      "&.Mui-focused fieldset": { borderColor: C.olive, borderWidth: 1.5 },
    },
    "& .MuiInputLabel-root": { fontFamily: "'Vazirmatn', sans-serif", fontSize: 12, color: C.sub, "&.Mui-focused": { color: C.olive } },
  };

  const currentPreset = PRESETS.find(p => p.slug === currentSlug);
  const currentGroup = groups.find(g => g.slug === currentSlug);
  const isFood = currentSlug === '__food_menu__';
  const hasUnit = !isFood;

  const activeItems = useMemo(() => {
    let items = [];
    if (currentPreset) {
      if (currentPreset.cat === 'food') items = allItems.filter(it => it.category === 'food');
      else items = allItems.filter(it => it.category === currentPreset.cat);
    } else if (currentGroup) {
      items = allItems.filter(it => it.category === currentGroup.slug);
    }

    if (activeCat !== 'all') items = items.filter(it => it.dict_category === activeCat);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      items = items.filter(it => it.name.toLowerCase().includes(q) || (it.description || '').toLowerCase().includes(q));
    }
    return items;
  }, [allItems, currentSlug, currentGroup, currentPreset, activeCat, searchQuery]);

  const currentCats = dictCats[currentSlug] || {};
  const catKeys = Object.keys(currentCats);

  const handleSaveItem = () => {
    if (!itemName) return;
    // API Call logic here...
    
    const newItem = { id: Date.now(), name: itemName, category: currentPreset?.cat || currentSlug, dict_category: selectedCat, description: itemDesc, unit: hasUnit ? (itemUnit === 'custom' ? customUnit : itemUnit) : '' };
    setAllItems(prev => [...prev, newItem]);
    
    setItemName(""); setItemDesc(""); setItemUnit(""); setSelectedCat(""); setCustomUnit("");
  };

  const handleAddCat = () => {
    if (!newCatName) return;
    const key = `cat_${Date.now()}`;
    setDictCats(prev => {
      const updated = { ...prev, [currentSlug]: { ...(prev[currentSlug] || {}), [key]: newCatName } };
      localStorage.setItem('kt_dict_cats_v8', JSON.stringify({ cats: updated }));
      return updated;
    });
    setNewCatName("");
  };

  const activeTabInfo = currentPreset || currentGroup || {};

  return (
    <Box dir={isRtl ? "rtl" : "ltr"} sx={{ position: "relative", fontFamily: "'Vazirmatn', sans-serif", minHeight: "100vh", color: C.text, opacity: mounted ? 1 : 0, transition: "opacity 0.5s ease" }}>
      <style>{animations}</style>

      {/* Header */}
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" sx={{ fontWeight: 800, color: C.text, mb: 1, display: "flex", alignItems: "center", gap: 1.5 }}>
          <span style={{ fontSize: 28 }}>📖</span> {t("dict.title")}
        </Typography>
        <Typography sx={{ color: C.sub, fontSize: 14 }}>{t("dict.subtitle")}</Typography>
      </Box>

      {/* Stats / Tabs */}
      <Box sx={{ display: "flex", gap: 2, mb: 3, flexWrap: "wrap" }}>
        {PRESETS.map(p => {
          const count = allItems.filter(it => it.category === p.cat).length;
          const isActive = currentSlug === p.slug;
          return (
            <Box key={p.slug} onClick={() => { setCurrentSlug(p.slug); setActiveCat('all'); }} sx={{ ...glassCardSx, p: 2, cursor: "pointer", minWidth: 150, borderColor: isActive ? p.color : C.glassBorder, "&:hover": { transform: "translateY(-2px)" } }}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                <Box sx={{ width: 36, height: 36, borderRadius: "10px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, background: `${p.color}22`, color: p.color }}>{p.icon}</Box>
                <Box>
                  <Typography sx={{ fontWeight: 700, fontSize: 14 }}>{p.name}</Typography>
                  <Typography sx={{ fontSize: 11, color: C.muted }}>{count} آیتم</Typography>
                </Box>
              </Box>
            </Box>
          );
        })}
        
        {groups.map(g => {
          const count = allItems.filter(it => it.category === g.slug).length;
          const isActive = currentSlug === g.slug;
          return (
            <Box key={g.slug} onClick={() => { setCurrentSlug(g.slug); setActiveCat('all'); }} sx={{ ...glassCardSx, p: 2, cursor: "pointer", minWidth: 150, borderColor: isActive ? g.color : C.glassBorder }}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                <Box sx={{ width: 36, height: 36, borderRadius: "10px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, background: `${g.color}22`, color: g.color }}>{g.icon}</Box>
                <Box>
                  <Typography sx={{ fontWeight: 700, fontSize: 14 }}>{g.name}</Typography>
                  <Typography sx={{ fontSize: 11, color: C.muted }}>{count} آیتم</Typography>
                </Box>
              </Box>
            </Box>
          );
        })}

        <Box onClick={() => setGrpFormOpen(true)} sx={{ ...glassCardSx, p: 2, cursor: "pointer", minWidth: 150, display: "flex", alignItems: "center", justifyContent: "center", borderStyle: "dashed" }}>
          <Add sx={{ color: C.olive }} />
          <Typography sx={{ fontWeight: 600, fontSize: 13, color: C.olive, mr: 1 }}>{t("dict.new_tab")}</Typography>
        </Box>
      </Box>

      {/* Main Panel */}
      <Box sx={{ ...glassCardSx, p: { xs: 2, md: 3 } }}>
        {/* Panel Header */}
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
            <Box sx={{ width: 10, height: 10, borderRadius: "50%", bgcolor: activeTabInfo.color || C.olive }} />
            <Typography variant="h6" sx={{ fontWeight: 700 }}>{activeTabInfo.name}</Typography>
          </Box>
          <TextField 
            size="small" 
            placeholder={t("dict.search")} 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            sx={{ ...inputSx, maxWidth: 250 }}
            InputProps={{ endAdornment: <InputAdornment position="end"><Search sx={{ fontSize: 16, color: C.muted }} /></InputAdornment> }}
          />
        </Box>

        {/* Subcategory Bar */}
        <Box sx={{ display: "flex", gap: 1, mb: 3, flexWrap: "wrap", alignItems: "center" }}>
          <Chip 
            label="همه" 
            color="primary" 
            variant={activeCat === 'all' ? 'filled' : 'outlined'}
            onClick={() => setActiveCat('all')}
            sx={{ bgcolor: activeCat === 'all' ? C.olive : 'transparent', color: activeCat === 'all' ? '#fff' : C.sub, borderColor: C.glassBorder }}
          />
          {catKeys.map(key => (
            <Chip 
              key={key} 
              label={currentCats[key]} 
              variant={activeCat === key ? 'filled' : 'outlined'}
              onClick={() => setActiveCat(key)}
              sx={{ bgcolor: activeCat === key ? C.olive : 'transparent', color: activeCat === key ? '#fff' : C.sub, borderColor: C.glassBorder }}
            />
          ))}
          <Chip 
            icon={<Add sx={{ fontSize: 16 }} />} 
            label={t("dict.add_subcategory")} 
            onClick={(e) => setCatAnchor(e.currentTarget)} 
            sx={{ bgcolor: 'transparent', color: C.olive, borderColor: C.olive, borderStyle: 'dashed' }} 
            variant="outlined"
          />
        </Box>

        {/* Item Form */}
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: hasUnit ? "2fr 1fr 1fr 1fr auto" : "2fr 1fr auto" }, gap: 2, mb: 3, p: 2, bgcolor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)', borderRadius: "12px" }}>
          <TextField label={t("dict.item_name")} value={itemName} onChange={(e) => setItemName(e.target.value)} sx={inputSx} size="small" />
          
          {hasUnit && (
            <FormControl size="small" sx={inputSx}>
              <InputLabel>{t("dict.unit")}</InputLabel>
              <Select value={itemUnit} onChange={(e) => setItemUnit(e.target.value)} label={t("dict.unit")}>
                {UNIT_OPTIONS.map(u => <MenuItem key={u.value} value={u.value}>{u.label}</MenuItem>)}
              </Select>
            </FormControl>
          )}
          
          <FormControl size="small" sx={inputSx}>
            <InputLabel>{t("dict.subcategory")}</InputLabel>
            <Select value={selectedCat} onChange={(e) => setSelectedCat(e.target.value)} label={t("dict.subcategory")}>
              <MenuItem value="">—</MenuItem>
              {catKeys.map(k => <MenuItem key={k} value={k}>{currentCats[k]}</MenuItem>)}
            </Select>
          </FormControl>
          
          {!isFood && (
            <TextField label={t("dict.description")} value={itemDesc} onChange={(e) => setItemDesc(e.target.value)} sx={inputSx} size="small" />
          )}
          
          <Button onClick={handleSaveItem} sx={{ bgcolor: C.btnGrad, color: "#fff", height: "40px", whiteSpace: "nowrap" }}>
            <Add /> {t("dict.add")}
          </Button>
        </Box>

        {/* Table */}
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ borderBottom: `1px solid ${C.glassBorder}` }}>
                <TableCell sx={{ color: C.sub, fontWeight: 700 }}>#</TableCell>
                <TableCell sx={{ color: C.sub, fontWeight: 700 }}>{t("dict.item_name")}</TableCell>
                {hasUnit && <TableCell sx={{ color: C.sub, fontWeight: 700 }}>{t("dict.unit")}</TableCell>}
                <TableCell sx={{ color: C.sub, fontWeight: 700 }}>{t("dict.subcategory")}</TableCell>
                {!isFood && <TableCell sx={{ color: C.sub, fontWeight: 700 }}>{t("dict.description")}</TableCell>}
                <TableCell align="right" sx={{ color: C.sub, fontWeight: 700 }}>{t("dict.actions")}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {activeItems.map((item, idx) => (
                <TableRow key={item.id} sx={{ borderBottom: `1px solid ${C.glassBorder}` }}>
                  <TableCell sx={{ color: C.muted }}>{idx + 1}</TableCell>
                  <TableCell sx={{ fontWeight: 600, color: C.text }}>{item.name}</TableCell>
                  {hasUnit && <TableCell sx={{ color: C.text }}>{item.unit}</TableCell>}
                  <TableCell>
                    {item.dict_category ? (
                      <Chip label={currentCats[item.dict_category] || '—'} size="small" sx={{ bgcolor: C.oliveSubtle, color: C.olive, fontSize: 11 }} />
                    ) : '—'}
                  </TableCell>
                  {!isFood && <TableCell sx={{ color: C.sub, fontSize: 13 }}>{item.description || '—'}</TableCell>}
                  <TableCell align="right">
                    <IconButton size="small" sx={{ color: C.olive }}><Edit fontSize="small" /></IconButton>
                    <IconButton size="small" sx={{ color: C.danger }}><Delete fontSize="small" /></IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {activeItems.length === 0 && (
            <Box sx={{ textAlign: "center", py: 5, color: C.muted }}>
              <Typography variant="body2">{t("dict.empty_items")}</Typography>
            </Box>
          )}
        </TableContainer>
      </Box>

      {/* Popovers & Modals */}
      
      {/* Subcategory Add Popover */}
      <Popover
        open={Boolean(catAnchor)}
        anchorEl={catAnchor}
        onClose={() => setCatAnchor(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
      >
        <Box sx={{ p: 2, display: "flex", gap: 1, bgcolor: C.glass }}>
          <TextField size="small" value={newCatName} onChange={(e) => setNewCatName(e.target.value)} placeholder="نام زیردسته..." sx={inputSx} autoFocus />
          <Button variant="contained" onClick={handleAddCat} sx={{ bgcolor: C.olive }}><Check /></Button>
        </Box>
      </Popover>

      {/* Group Form Modal */}
      {grpFormOpen && (
        <Box sx={{ position: "fixed", inset: 0, bgcolor: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)", zIndex: 1300, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setGrpFormOpen(false)}>
          <Box sx={{ ...glassCardSx, p: 4, width: 500, maxWidth: "90%" }} onClick={(e) => e.stopPropagation()}>
            <Typography variant="h6" sx={{ fontWeight: 700, mb: 3 }}>{t("dict.new_tab")}</Typography>
            
            <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2, mb: 2 }}>
              <TextField label={t("dict.tab_name")} value={grpName} onChange={(e) => setGrpName(e.target.value)} sx={inputSx} size="small" />
              <Box>
                <Typography sx={{ fontSize: 12, color: C.sub, mb: 0.5 }}>{t("dict.icon")}</Typography>
                <Button onClick={(e) => setIconAnchor(e.currentTarget)} variant="outlined" sx={{ ...inputSx, justifyContent: "space-between", height: "40px", color: C.text, borderColor: C.glassBorder }}>
                  <span style={{ fontSize: 18 }}>{grpIcon}</span>
                  <ArrowDropDown />
                </Button>
              </Box>
            </Box>
            
            <Box sx={{ mb: 3 }}>
              <Typography sx={{ fontSize: 12, color: C.sub, mb: 0.5 }}>{t("dict.color")}</Typography>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <input type="color" value={grpColor} onChange={(e) => setGrpColor(e.target.value)} style={{ width: 40, height: 40, border: "none", background: "transparent", cursor: "pointer" }} />
                <TextField value={grpColor} onChange={(e) => setGrpColor(e.target.value)} sx={inputSx} size="small" />
              </Box>
            </Box>

            <Typography sx={{ fontSize: 10, fontWeight: 800, color: C.muted, textTransform: "uppercase", mb: 1 }}>کجا قابل استفاده باشه؟</Typography>
            <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", mb: 3 }}>
              {Object.keys(grpUsage).map(key => (
                <FormControlLabel
                  key={key}
                  control={<Checkbox checked={grpUsage[key]} onChange={(e) => setGrpUsage({...grpUsage, [key]: e.target.checked})} sx={{ color: C.olive, '&.Mui-checked': { color: C.olive } }} />}
                  label={t(`dict.usage_${key}`)}
                  sx={{ color: C.text }}
                />
              ))}
            </Box>

            <Box sx={{ display: "flex", gap: 2, justifyContent: "flex-end" }}>
              <Button onClick={() => setGrpFormOpen(false)} sx={{ color: C.sub }}>{t("dict.cancel")}</Button>
              <Button sx={{ bgcolor: C.btnGrad, color: "#fff" }}>{t("dict.create_tab")}</Button>
            </Box>
          </Box>
        </Box>
      )}

      {/* Icon Picker Popover */}
      <Popover
        open={Boolean(iconAnchor)}
        anchorEl={iconAnchor}
        onClose={() => setIconAnchor(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
      >
        <Box sx={{ p: 2, width: 280, maxHeight: 300, overflowY: "auto", bgcolor: C.glass }}>
          <Box sx={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 1 }}>
            {ICONS.map(icon => (
              <IconButton key={icon} onClick={() => { setGrpIcon(icon); setIconAnchor(null); }} sx={{ fontSize: 20, color: C.text, bgcolor: grpIcon === icon ? C.oliveSubtle : 'transparent' }}>
                {icon}
              </IconButton>
            ))}
          </Box>
        </Box>
      </Popover>

    </Box>
  );
}