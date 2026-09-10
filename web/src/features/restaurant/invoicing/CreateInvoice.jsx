import { useState, useEffect, useMemo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  Box, Typography, Button, IconButton, TextField, Select, MenuItem,
  FormControl, InputLabel, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Chip, Switch, Dialog,
  DialogTitle, DialogContent, DialogActions, Snackbar, Alert,
  InputAdornment, CircularProgress, Divider, Autocomplete, Popover,
} from "@mui/material";
import {
  Visibility, VisibilityOff, Person, Lock, Language,
  DarkMode, LightMode, Search, Add, Delete, Close, CalendarToday,
  Preview, Save, Category,
} from "@mui/icons-material";
import { useThemeMode } from "../contexts/ThemeContext";
import { useLang } from "../contexts/LangContext";
import superClient from "../api/super_client"; // یا axios

const animations = `
  @keyframes orb1 { 0%, 100% { transform: translate(0, 0) scale(1); } 25% { transform: translate(60px, -80px) scale(1.1); } 50% { transform: translate(-20px, -40px) scale(0.95); } 75% { transform: translate(-50px, 50px) scale(1.05); } }
  @keyframes float { 0%, 100% { transform: translateY(0px); } 50% { transform: translateY(-6px); } }
  @keyframes shimmer { 0% { background-position: -200% center; } 100% { background-position: 200% center; } }
  @keyframes breathe { 0%, 100% { opacity: 0.3; transform: scale(1); } 50% { opacity: 0.6; transform: scale(1.02); } }
  @keyframes fadeUp { from { opacity: 0; transform: translateY(20px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
`;

export default function CreateInvoice() {
  const { mode, toggleTheme } = useThemeMode();
  const { isRtl, toggleLang, lang } = useLang();
  const { t } = useTranslation();
  const isDark = mode === "dark";

  const [mounted, setMounted] = useState(false);
  const [toast, setToast] = useState({ open: false, message: "", type: "info" });
  
  // States for form
  const [supplier, setSupplier] = useState(null);
  const [suppliersList, setSuppliersList] = useState([]);
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [description, setDescription] = useState("");
  
  // States for items
  const [invoiceItems, setInvoiceItems] = useState([]);
  const [dictItems, setDictItems] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  
  // Modals
  const [previewOpen, setPreviewOpen] = useState(false);
  const [supplierModalOpen, setSupplierModalOpen] = useState(false);
  
  // New Supplier Form
  const [newSupplier, setNewSupplier] = useState({ name: "", phone: "", contact: "", address: "" });

  useEffect(() => {
    const tmr = setTimeout(() => setMounted(true), 80);
    return () => clearTimeout(tmr);
  }, []);

  // Fetch Suppliers & Dictionary Items
  useEffect(() => {
    const fetchData = async () => {
      try {
        // شبیه‌سازی دریافت از API
        // const { data: sups } = await superClient.get("/api/suppliers/");
        // setSuppliersList(sups);
        setSuppliersList([
          { id: 1, name: "شرکت پخش البرز", phone: "021-12345678" },
          { id: 2, name: "تأمین‌کننده جنوب", phone: "071-98765432" },
        ]);

        // const { data: dict } = await superClient.get("/api/dictionary/raw-materials/");
        // setDictItems(dict.items);
        setDictItems([
          { id: 1, name: "گوشت چرخ‌کرده", unit: "kg", category: "پروتئینی", price: 120000 },
          { id: 2, name: "پنیر موزارلا", unit: "kg", category: "لبنیات", price: 180000 },
          { id: 3, name: "روغن مایع", unit: "l", category: "روغن و چربی", price: 45000 },
          { id: 4, name: "رب گوجه‌فرنگی", unit: "kg", category: "کنسرو", price: 60000 },
        ]);
      } catch (err) {
        showToast("خطا در بارگذاری اطلاعات", "error");
      }
    };
    fetchData();
  }, []);

  const C = useMemo(() => ({
    bg: isDark ? "#0B0A0B" : "#E4E8F0",
    glass: isDark ? "rgba(16,18,16,0.6)" : "rgba(240,244,252,0.7)",
    glassBorder: isDark ? "rgba(107,155,110,0.1)" : "rgba(80,100,140,0.15)",
    glassShimmer: isDark ? "linear-gradient(90deg, transparent 0%, rgba(107,155,110,0.05) 20%, rgba(168,64,96,0.06) 40%, rgba(212,183,106,0.07) 60%, rgba(107,155,110,0.04) 80%, transparent 100%)" : "linear-gradient(90deg, transparent 0%, rgba(80,100,160,0.06) 20%, rgba(120,40,70,0.05) 40%, rgba(196,162,101,0.06) 60%, rgba(61,90,62,0.04) 80%, transparent 100%)",
    olive: isDark ? "#6B9B6E" : "#2E4D30",
    oliveSubtle: isDark ? "rgba(107,155,110,0.08)" : "rgba(46,77,48,0.08)",
    burgundy: isDark ? "#A84060" : "#7A2845",
    gold: isDark ? "#D4B76A" : "#A08040",
    text: isDark ? "#F0ECE8" : "#1A1A24",
    sub: isDark ? "#8A8588" : "#555568",
    muted: isDark ? "#4A4548" : "#8A8A9E",
    inputBg: isDark ? "rgba(11,10,11,0.5)" : "rgba(240,244,252,0.85)",
    btnGrad: isDark ? "linear-gradient(135deg, #3D6B40 0%, #5A8A5D 35%, #6B9B6E 70%, #4A7A4D 100%)" : "linear-gradient(135deg, #1E3A20 0%, #2E4D30 35%, #3D5A3E 70%, #2E4D30 100%)",
    danger: isDark ? "#E84057" : "#C83048",
    dangerBg: isDark ? "rgba(232,64,87,0.12)" : "rgba(200,48,72,0.1)",
    cardShadow: isDark ? "0 8px 60px rgba(0,0,0,0.5), 0 0 80px rgba(107,155,110,0.04), 0 0 120px rgba(168,64,96,0.03)" : "0 8px 60px rgba(0,0,0,0.1), 0 0 60px rgba(74,106,148,0.08), 0 0 100px rgba(46,77,48,0.04)",
    orb1: isDark ? "rgba(107,155,110,0.09)" : "rgba(74,106,148,0.12)",
    orb2: isDark ? "rgba(168,64,96,0.07)" : "rgba(122,40,69,0.1)",
  }), [isDark]);

  const glassCardSx = {
    bgcolor: C.glass, backdropFilter: "blur(28px)", WebkitBackdropFilter: "blur(28px)",
    border: `1px solid ${C.glassBorder}`, borderRadius: "20px",
    boxShadow: C.cardShadow, position: "relative", overflow: "hidden",
    "&::before": { content: '""', position: "absolute", top: 0, left: 0, right: 0, height: 1, background: C.glassShimmer, backgroundSize: "200% 100%", animation: "shimmer 10s linear infinite", pointerEvents: "none" }
  };

  const inputSx = {
    "& .MuiOutlinedInput-root": {
      borderRadius: "12px", fontFamily: "'Vazirmatn', sans-serif", bgcolor: C.inputBg,
      "& fieldset": { borderColor: C.glassBorder, borderWidth: 1 },
      "&:hover fieldset": { borderColor: C.olive },
      "&.Mui-focused fieldset": { borderColor: C.olive, borderWidth: 1.5 },
    },
    "& .MuiInputLabel-root": { fontFamily: "'Vazirmatn', sans-serif", fontSize: 13, color: C.sub, "&.Mui-focused": { color: C.olive } },
  };

  const showToast = (message, type = "success") => setToast({ open: true, message, type });

  const filteredDictItems = dictItems.filter(item => 
    item.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const addItemToInvoice = (item) => {
    setInvoiceItems(prev => [
      ...prev,
      { ...item, tempId: Date.now(), quantity: 1, unit_price: item.price || 0, total: (item.price || 0) * 1 }
    ]);
    showToast(`«${item.name}» اضافه شد`, "success");
  };

  const addManualRow = () => {
    setInvoiceItems(prev => [
      ...prev,
      { id: null, tempId: Date.now(), name: "", unit: "unit", category: "", quantity: 0, unit_price: 0, total: 0 }
    ]);
  };

  const updateItem = (tempId, field, value) => {
    setInvoiceItems(prev => prev.map(it => {
      if (it.tempId === tempId) {
        const updated = { ...it, [field]: value };
        if (field === "quantity" || field === "unit_price") {
          updated.total = (parseFloat(updated.quantity) || 0) * (parseFloat(updated.unit_price) || 0);
        }
        return updated;
      }
      return it;
    }));
  };

  const removeItem = (tempId) => {
    setInvoiceItems(prev => prev.filter(it => it.tempId !== tempId));
  };

  const totalSum = invoiceItems.reduce((sum, item) => sum + (item.total || 0), 0);

  const handleSaveSupplier = async () => {
    if (!newSupplier.name) return showToast("نام تأمین‌کننده الزامی است", "error");
    try {
      // const { data } = await superClient.post("/api/suppliers/save/", newSupplier);
      const created = { id: Date.now(), ...newSupplier };
      setSuppliersList(prev => [...prev, created]);
      setSupplier(created);
      setSupplierModalOpen(false);
      setNewSupplier({ name: "", phone: "", contact: "", address: "" });
      showToast("تأمین‌کننده ثبت شد", "success");
    } catch {
      showToast("خطا در ثبت تأمین‌کننده", "error");
    }
  };

  return (
    <Box dir={isRtl ? "rtl" : "ltr"} sx={{ position: "relative", fontFamily: "'Vazirmatn', sans-serif", minHeight: "100vh", color: C.text, opacity: mounted ? 1 : 0, transition: "opacity 0.5s ease" }}>
      <style>{animations}</style>

      {/* Header */}
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" sx={{ fontWeight: 800, color: C.text, mb: 1, display: "flex", alignItems: "center", gap: 1.5 }}>
          <span style={{ fontSize: 28 }}>🧾</span> ثبت فاکتور خرید
        </Typography>
        <Typography sx={{ color: C.sub, fontSize: 14 }}>فاکتور خرید مواد اولیه رستوران را به‌راحتی وارد کنید</Typography>
      </Box>

      {/* Form Card */}
      <Box sx={{ ...glassCardSx, p: { xs: 2, md: 4 }, mb: 3 }}>
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 3 }}>
          {/* Supplier Autocomplete */}
          <Box>
            <Typography sx={{ fontSize: 12, fontWeight: 600, color: C.sub, mb: 1 }}>نام تأمین‌کننده *</Typography>
            <Autocomplete
              options={suppliersList}
              getOptionLabel={(option) => option.name || ""}
              value={supplier}
              onChange={(e, val) => setSupplier(val)}
              renderInput={(params) => (
                <Box sx={{ position: "relative" }}>
                  <TextField 
                    {...params} 
                    placeholder="تایپ کنید یا انتخاب کنید..." 
                    sx={inputSx} 
                    InputProps={{ ...params.InputProps, endAdornment: (
                      <InputAdornment position="end">
                        <IconButton size="small" onClick={() => setSupplierModalOpen(true)} sx={{ color: C.olive, bgcolor: C.oliveSubtle, borderRadius: "8px", p: 0.5 }}>
                          <Add fontSize="small" />
                        </IconButton>
                        {params.InputProps.endAdornment}
                      </InputAdornment>
                    )}}
                  />
                </Box>
              )}
            />
          </Box>

          {/* Invoice Number */}
          <Box>
            <Typography sx={{ fontSize: 12, fontWeight: 600, color: C.sub, mb: 1 }}>شماره فاکتور</Typography>
            <TextField 
              fullWidth 
              value={invoiceNumber} 
              onChange={(e) => setInvoiceNumber(e.target.value)} 
              placeholder="اختیاری" 
              sx={inputSx} 
            />
          </Box>

          {/* Date */}
          <Box>
            <Typography sx={{ fontSize: 12, fontWeight: 600, color: C.sub, mb: 1 }}>تاریخ *</Typography>
            <TextField
              fullWidth
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              sx={inputSx}
              InputProps={{
                startAdornment: <InputAdornment position="start"><CalendarToday sx={{ color: C.olive, fontSize: 18 }} /></InputAdornment>
              }}
            />
          </Box>

          {/* Description */}
          <Box>
            <Typography sx={{ fontSize: 12, fontWeight: 600, color: C.sub, mb: 1 }}>توضیحات</Typography>
            <TextField 
              fullWidth 
              value={description} 
              onChange={(e) => setDescription(e.target.value)} 
              placeholder="یادداشت یا توضیح اضافی" 
              sx={inputSx} 
            />
          </Box>
        </Box>
      </Box>

      {/* Dictionary Items Section */}
      <Box sx={{ ...glassCardSx, p: { xs: 2, md: 3 }, mb: 3 }}>
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
          <Typography variant="h6" sx={{ fontWeight: 700, color: C.text }}>🔍 اقلام انبار (برای افزودن کلیک کنید)</Typography>
          <TextField 
            size="small" 
            placeholder="جستجوی سریع..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            sx={{ ...inputSx, maxWidth: 250 }}
          />
        </Box>
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr", md: "1fr 1fr 1fr" }, gap: 2 }}>
          {filteredDictItems.map(item => (
            <Box 
              key={item.id} 
              onClick={() => addItemToInvoice(item)}
              sx={{ 
                p: 2, borderRadius: "12px", cursor: "pointer", 
                bgcolor: C.oliveSubtle, border: `1px solid ${C.glassBorder}`,
                transition: "all 0.2s ease",
                "&:hover": { transform: "translateY(-2px)", borderColor: C.olive, boxShadow: `0 4px 12px ${C.olive}33` }
              }}
            >
              <Typography sx={{ fontWeight: 700, fontSize: 13, mb: 0.5 }}>{item.name}</Typography>
              <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
                <Chip label={item.category} size="small" sx={{ height: 20, fontSize: 10, bgcolor: C.burgundy + "22", color: C.burgundy }} />
                <Typography sx={{ fontSize: 11, color: C.muted }}>{item.unit}</Typography>
              </Box>
            </Box>
          ))}
        </Box>
      </Box>

      {/* Invoice Table */}
      <Box sx={{ ...glassCardSx, p: { xs: 2, md: 3 }, mb: 3 }}>
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
          <Typography variant="h6" sx={{ fontWeight: 700, color: C.text }}>📋 اقلام فاکتور</Typography>
          <Button onClick={addManualRow} sx={{ bgcolor: C.oliveSubtle, color: C.olive, "&:hover": { bgcolor: C.oliveSubtle } }}>
            <Add /> افزودن ردیف دستی
          </Button>
        </Box>

        {invoiceItems.length === 0 ? (
          <Box sx={{ textAlign: "center", py: 5, color: C.muted }}>
            <Typography>هنوز کالایی اضافه نشده — از لیست بالا انتخاب کنید یا دکمه «افزودن ردیف دستی» بزنید</Typography>
          </Box>
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ borderBottom: `1px solid ${C.glassBorder}` }}>
                  <TableCell sx={{ color: C.sub, fontWeight: 700 }}>#</TableCell>
                  <TableCell sx={{ color: C.sub, fontWeight: 700 }}>نام کالا</TableCell>
                  <TableCell sx={{ color: C.sub, fontWeight: 700 }}>مقدار</TableCell>
                  <TableCell sx={{ color: C.sub, fontWeight: 700 }}>واحد</TableCell>
                  <TableCell sx={{ color: C.sub, fontWeight: 700 }}>قیمت واحد</TableCell>
                  <TableCell sx={{ color: C.sub, fontWeight: 700 }}>قیمت کل</TableCell>
                  <TableCell></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {invoiceItems.map((item, idx) => (
                  <TableRow key={item.tempId} sx={{ borderBottom: `1px solid ${C.glassBorder}` }}>
                    <TableCell sx={{ color: C.muted }}>{idx + 1}</TableCell>
                    <TableCell>
                      <TextField 
                        variant="standard" 
                        value={item.name} 
                        onChange={(e) => updateItem(item.tempId, "name", e.target.value)} 
                        sx={{ "& .MuiInput-root": { color: C.text, fontSize: 13 } }}
                      />
                    </TableCell>
                    <TableCell>
                      <TextField 
                        variant="standard" 
                        type="number" 
                        value={item.quantity} 
                        onChange={(e) => updateItem(item.tempId, "quantity", e.target.value)} 
                        sx={{ "& .MuiInput-root": { color: C.text, fontSize: 13 }, width: 70 }}
                      />
                    </TableCell>
                    <TableCell>
                      <Select 
                        variant="standard" 
                        value={item.unit} 
                        onChange={(e) => updateItem(item.tempId, "unit", e.target.value)} 
                        sx={{ "& .MuiInput-root": { color: C.text, fontSize: 13 } }}
                      >
                        <MenuItem value="kg">کیلوگرم</MenuItem>
                        <MenuItem value="g">گرم</MenuItem>
                        <MenuItem value="l">لیتر</MenuItem>
                        <MenuItem value="unit">عدد</MenuItem>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <TextField 
                        variant="standard" 
                        type="number" 
                        value={item.unit_price} 
                        onChange={(e) => updateItem(item.tempId, "unit_price", e.target.value)} 
                        sx={{ "& .MuiInput-root": { color: C.text, fontSize: 13 }, width: 100 }}
                      />
                    </TableCell>
                    <TableCell sx={{ fontWeight: 700, color: C.olive }}>
                      {item.total.toLocaleString()} ت
                    </TableCell>
                    <TableCell>
                      <IconButton size="small" onClick={() => removeItem(item.tempId)} sx={{ color: C.danger }}>
                        <Delete fontSize="small" />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Box>

      {/* Summary & Actions */}
      <Box sx={{ ...glassCardSx, p: 3, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 2 }}>
        <Box sx={{ display: "flex", gap: 3 }}>
          <Box>
            <Typography sx={{ fontSize: 11, color: C.muted }}>تعداد اقلام</Typography>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>{invoiceItems.length}</Typography>
          </Box>
          <Box>
            <Typography sx={{ fontSize: 11, color: C.muted }}>جمع کل فاکتور</Typography>
            <Typography variant="h6" sx={{ fontWeight: 800, color: C.olive }}>{totalSum.toLocaleString()} تومان</Typography>
          </Box>
        </Box>
        <Box sx={{ display: "flex", gap: 2 }}>
          <Button onClick={() => setPreviewOpen(true)} sx={{ bgcolor: C.glass, color: C.text, border: `1px solid ${C.glassBorder}` }}>
            <Preview /> پیش‌نمایش
          </Button>
          <Button sx={{ bgcolor: C.danger, color: "#fff", "&:hover": { bgcolor: C.danger } }} onClick={() => setInvoiceItems([])}>
            پاک کردن
          </Button>
          <Button sx={{ bgcolor: C.btnGrad, color: "#fff", boxShadow: `0 4px 14px ${C.olive}55` }}>
            <Save /> ثبت فاکتور
          </Button>
        </Box>
      </Box>

      {/* Preview Modal */}
      <Dialog open={previewOpen} onClose={() => setPreviewOpen(false)} maxWidth="md" fullWidth>
        <Box sx={{ bgcolor: C.glass, backdropFilter: "blur(28px)", p: 3, border: `1px solid ${C.glassBorder}` }}>
          <Typography variant="h5" sx={{ fontWeight: 800, color: C.text, mb: 3 }}>بررسی و تأیید فاکتور</Typography>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ color: C.sub }}>نام کالا</TableCell>
                  <TableCell sx={{ color: C.sub }}>مقدار</TableCell>
                  <TableCell sx={{ color: C.sub }}>قیمت کل</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {invoiceItems.map(item => (
                  <TableRow key={item.tempId}>
                    <TableCell sx={{ color: C.text }}>{item.name}</TableCell>
                    <TableCell sx={{ color: C.text }}>{item.quantity} {item.unit}</TableCell>
                    <TableCell sx={{ color: C.olive, fontWeight: 700 }}>{item.total.toLocaleString()} ت</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          <Box sx={{ display: "flex", justifyContent: "space-between", mt: 3 }}>
            <Button onClick={() => setPreviewOpen(false)} sx={{ color: C.sub }}>بازگشت</Button>
            <Button sx={{ bgcolor: C.btnGrad, color: "#fff" }}>تأیید و ثبت نهایی</Button>
          </Box>
        </Box>
      </Dialog>

      {/* Supplier Modal */}
      <Dialog open={supplierModalOpen} onClose={() => setSupplierModalOpen(false)}>
        <Box sx={{ bgcolor: C.glass, backdropFilter: "blur(28px)", p: 3, border: `1px solid ${C.glassBorder}`, minWidth: 400 }}>
          <Typography variant="h6" sx={{ fontWeight: 700, color: C.text, mb: 2 }}>افزودن تأمین‌کننده جدید</Typography>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <TextField label="نام شرکت" fullWidth sx={inputSx} value={newSupplier.name} onChange={(e) => setNewSupplier({...newSupplier, name: e.target.value})} />
            <TextField label="تلفن" fullWidth sx={inputSx} value={newSupplier.phone} onChange={(e) => setNewSupplier({...newSupplier, phone: e.target.value})} />
            <TextField label="آدرس" fullWidth sx={inputSx} value={newSupplier.address} onChange={(e) => setNewSupplier({...newSupplier, address: e.target.value})} />
            <Box sx={{ display: "flex", gap: 2, mt: 1 }}>
              <Button onClick={() => setSupplierModalOpen(false)} sx={{ flex: 1, bgcolor: C.muted + "22", color: C.text }}>انصراف</Button>
              <Button onClick={handleSaveSupplier} sx={{ flex: 1, bgcolor: C.btnGrad, color: "#fff" }}>ذخیره</Button>
            </Box>
          </Box>
        </Box>
      </Dialog>

      <Snackbar open={toast.open} autoHideDuration={3000} onClose={() => setToast({ ...toast, open: false })} anchorOrigin={{ vertical: "top", horizontal: "center" }}>
        <Alert severity={toast.type} sx={{ bgcolor: C.glass, backdropFilter: "blur(16px)", color: C.text, border: `1px solid ${C.olive}`, borderRadius: "12px", fontFamily: "'Vazirmatn', sans-serif" }}>{toast.message}</Alert>
      </Snackbar>
    </Box>
  );
}