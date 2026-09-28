import { useState, useEffect, useMemo } from "react";
import {
  Box, Typography, Button, TextField, Chip, CircularProgress,
  Dialog, DialogTitle, DialogContent, DialogActions,
} from "@mui/material";
import {
  fetchSuppliers,
  saveSupplier,
  deleteSupplier,
} from "../api";

export default function SupplierSection({ C, isDark, showToast }) {
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editSupplier, setEditSupplier] = useState(null);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    name: "",
    phone: "",
    address: "",
    contact_person: "",
    description: "",
  });

  const notify = (msg, type = "info") => {
    if (typeof showToast === "function") showToast(msg, type);
  };

  const load = async () => {
    setLoading(true);
    try {
      const data = await fetchSuppliers();
      setSuppliers(Array.isArray(data) ? data : data.suppliers || []);
    } catch (err) {
      console.error("Fetch suppliers error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return suppliers;
    const q = search.toLowerCase();
    return suppliers.filter(s =>
      s.name?.toLowerCase().includes(q) ||
      s.phone?.includes(q) ||
      s.contact_person?.toLowerCase().includes(q)
    );
  }, [suppliers, search]);

  const openCreate = () => {
    setEditSupplier(null);
    setForm({ name: "", phone: "", address: "", contact_person: "", description: "" });
    setFormOpen(true);
  };

  const openEdit = (s) => {
    setEditSupplier(s);
    setForm({
      name: s.name || "",
      phone: s.phone || "",
      address: s.address || "",
      contact_person: s.contact_person || "",
      description: s.description || "",
    });
    setFormOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      notify("نام شرکت الزامی است", "warning");
      return;
    }
    if (saving) return;
    setSaving(true);
    try {
      const payload = {
        id: editSupplier?.id,
        name: form.name.trim(),
        phone: form.phone.trim(),
        address: form.address.trim(),
        contact_person: form.contact_person.trim(),
        description: form.description.trim(),
      };
      const res = await saveSupplier(payload);
      notify(res.msg || "ذخیره شد", "success");
      setFormOpen(false);
      setEditSupplier(null);
      load();
    } catch (err) {
      notify(err.response?.data?.error || err.message || "خطا", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (s) => {
    if (!window.confirm(`«${s.name}» حذف شود؟`)) return;
    try {
      await deleteSupplier({ id: s.id });
      notify(`«${s.name}» حذف شد`, "success");
      load();
    } catch (err) {
      notify(err.response?.data?.error || err.message || "خطا", "error");
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

  const dialogPaperSx = {
    borderRadius: "16px",
    bgcolor: isDark ? "#1A1A2E" : "#fff",
    border: `1px solid ${C.glassBorder}`,
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
      {/* هدر */}
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2.5, flexWrap: "wrap", gap: 1.5 }}>
        <Box>
          <Typography sx={{ fontSize: { xs: 16, sm: 18 }, fontWeight: 800, color: C.text }}>
            🏭 تأمین‌کنندگان
          </Typography>
          <Typography sx={{ fontSize: 12, color: C.sub, mt: 0.3 }}>
            تعریف و مدیریت شرکت‌های تأمین‌کننده
          </Typography>
        </Box>
        <Button
          onClick={openCreate}
          sx={{
            borderRadius: "12px", fontSize: 12, fontWeight: 700, textTransform: "none",
            px: 2.5, py: 1, color: "#fff", background: C.btnGrad,
            boxShadow: `0 4px 20px ${C.olive}30`,
            "&:hover": { transform: "translateY(-1px)", boxShadow: `0 6px 28px ${C.olive}40` },
          }}
        >
          ➕ تأمین‌کننده جدید
        </Button>
      </Box>

      {/* جستجو */}
      <TextField
        size="small"
        placeholder="جستجو تأمین‌کننده..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        sx={{ ...inputSx, width: "100%", maxWidth: 300, mb: 2 }}
      />

      {/* لیست */}
      {filtered.length === 0 ? (
        <Box sx={{ textAlign: "center", py: 6 }}>
          <Typography sx={{ fontSize: 36, mb: 1 }}>🏭</Typography>
          <Typography sx={{ fontSize: 14, fontWeight: 700, color: C.text }}>
            هنوز تأمین‌کننده‌ای ثبت نشده
          </Typography>
          <Typography sx={{ fontSize: 12, color: C.sub, mt: 0.5 }}>
            برای شروع، تأمین‌کننده جدید اضافه کنید
          </Typography>
        </Box>
      ) : (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 0.8 }}>
          {filtered.map((s, i) => (
            <Box
              key={s.id}
              sx={{
                display: "flex", alignItems: "center", flexWrap: "wrap", gap: 1,
                px: { xs: 1.5, sm: 2 }, py: { xs: 1, sm: 1.5 },
                borderRadius: "12px", bgcolor: C.glass, backdropFilter: "blur(12px)",
                border: `1px solid ${C.glassBorder}`,
                transition: "all 0.2s ease",
                opacity: 0,
                animation: `fadeUp 0.35s ease-out ${i * 0.04}s forwards`,
                "&:hover": { bgcolor: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.02)" },
              }}
            >
              <Box sx={{ flex: 1, minWidth: 140 }}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
                  <Typography sx={{ fontSize: 13, fontWeight: 700, color: C.text }}>
                    {s.name}
                  </Typography>
                  {s.contact_person && (
                    <Chip size="small" label={s.contact_person} sx={{
                      height: 18, fontSize: 9, fontWeight: 600,
                      borderRadius: "5px", bgcolor: C.oliveSubtle, color: C.olive,
                    }} />
                  )}
                </Box>
                <Box sx={{ display: "flex", gap: 1, mt: 0.5 }}>
                  {s.phone && (
                    <Typography sx={{ fontSize: 11, color: C.sub }}>
                      📞 {s.phone}
                    </Typography>
                  )}
                  {s.address && (
                    <Typography sx={{ fontSize: 11, color: C.muted }}>
                      📍 {s.address}
                    </Typography>
                  )}
                </Box>
              </Box>

              <Box sx={{ display: "flex", gap: 0.5, flexShrink: 0 }}>
                <Box
                  onClick={() => openEdit(s)}
                  sx={{
                    display: "flex", flexDirection: "column", alignItems: "center",
                    gap: 0.3, px: 1, py: 0.5, borderRadius: "8px", cursor: "pointer",
                    color: C.olive, transition: "all 0.2s ease",
                    "&:hover": { bgcolor: C.oliveSubtle },
                  }}
                >
                  <Typography sx={{ fontSize: 14, lineHeight: 1 }}>✏️</Typography>
                  <Typography sx={{ fontSize: 8, fontWeight: 600 }}>ویرایش</Typography>
                </Box>
                <Box
                  onClick={() => handleDelete(s)}
                  sx={{
                    display: "flex", flexDirection: "column", alignItems: "center",
                    gap: 0.3, px: 1, py: 0.5, borderRadius: "8px", cursor: "pointer",
                    color: C.danger, transition: "all 0.2s ease",
                    "&:hover": { bgcolor: C.dangerBg },
                  }}
                >
                  <Typography sx={{ fontSize: 14, lineHeight: 1 }}>🗑️</Typography>
                  <Typography sx={{ fontSize: 8, fontWeight: 600 }}>حذف</Typography>
                </Box>
              </Box>
            </Box>
          ))}
        </Box>
      )}

      {/* دیالوگ ایجاد/ویرایش */}
      <Dialog
        open={formOpen}
        onClose={() => setFormOpen(false)}
        maxWidth="xs"
        fullWidth
        slotProps={{ paper: { sx: dialogPaperSx } }}
      >
        <DialogTitle sx={{ fontSize: 15, fontWeight: 800, color: C.text }}>
          {editSupplier ? `✏️ ویرایش ${editSupplier.name}` : "➕ تأمین‌کننده جدید"}
        </DialogTitle>
        <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 1.5, pt: "12px !important" }}>
          <TextField
            size="small" label="نام شرکت *"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            sx={inputSx}
          />
          <TextField
            size="small" label="تلفن"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            sx={inputSx}
          />
          <TextField
            size="small" label="آدرس"
            value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
            sx={inputSx}
          />
          <TextField
            size="small" label="مسئول فروش"
            value={form.contact_person}
            onChange={(e) => setForm({ ...form, contact_person: e.target.value })}
            sx={inputSx}
          />
          <TextField
            size="small" label="توضیحات"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            multiline rows={2}
            sx={inputSx}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button
            onClick={() => setFormOpen(false)}
            sx={{ borderRadius: "10px", fontSize: 12, textTransform: "none", color: C.sub }}
          >
            انصراف
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving}
            sx={{
              borderRadius: "10px", fontSize: 12, fontWeight: 700, textTransform: "none",
              px: 2.5, color: "#fff", background: C.btnGrad, opacity: saving ? 0.6 : 1,
            }}
          >
            {saving ? "..." : editSupplier ? "بروزرسانی" : "ایجاد"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}