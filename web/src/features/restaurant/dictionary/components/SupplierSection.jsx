import { useState, useEffect, useMemo, useCallback } from "react";
import {
  Box, Typography, Button, TextField, Chip, CircularProgress,
  Dialog, DialogTitle, DialogContent, DialogActions,
} from "@mui/material";

const readJSON = (key, def = []) => {
  try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(def)); }
  catch { return def; }
};
const writeJSON = (key, val) => {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
};

export default function SupplierSection({ C, isDark, showToast }) {
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editSupplier, setEditSupplier] = useState(null);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    name: "", phone: "", address: "",
    company: "", note: "", is_active: true,
  });

  const notify = useCallback((msg, type = "info") => {
    if (typeof showToast === "function") showToast(msg, type);
  }, [showToast]);

  // ── بارگذاری از localStorage ──
  const load = useCallback(() => {
    setLoading(true);
    const local = readJSON("local_suppliers", []);
    setSuppliers(local);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── جستجو ──
  const filtered = useMemo(() => {
    if (!search.trim()) return suppliers;
    const q = search.toLowerCase();
    return suppliers.filter(
      (s) =>
        s.name?.toLowerCase().includes(q) ||
        s.phone?.includes(q) ||
        s.mobile?.includes(q) ||
        s.address?.toLowerCase().includes(q) ||
        s.company?.toLowerCase().includes(q)
    );
  }, [suppliers, search]);

  // ── آمار خرید هر تأمین‌کننده ──
  const getSupplierStats = useCallback((id, name) => {
    const purchases = readJSON("local_purchase_invoices", []);
    let count = 0, total = 0, paid = 0;
    for (const inv of purchases) {
      const matchId = String(inv.supplier_id) === String(id);
      const matchName = inv.supplier_name === name;
      if (matchId || matchName) {
        count++;
        total += inv.grand_total || 0;
        paid += inv.paid_amount || 0;
      }
    }
    return { count, total, paid, debt: total - paid };
  }, []);

  // ── باز کردن فرم ──
  const openCreate = () => {
    setEditSupplier(null);
    setForm({ name: "", phone: "", address: "", company: "", note: "", is_active: true });
    setFormOpen(true);
  };

  const openEdit = (s) => {
    setEditSupplier(s);
    setForm({
      name: s.name || "",
      phone: s.phone || s.mobile || "",
      address: s.address || "",
      company: s.company || "",
      note: s.note || "",
      is_active: s.is_active !== false,
    });
    setFormOpen(true);
  };

  // ── ذخیره ──
  const handleSave = useCallback(() => {
    if (!form.name.trim()) {
      notify("نام تأمین‌کننده الزامی است", "warning");
      return;
    }
    if (saving) return;
    setSaving(true);

    const local = readJSON("local_suppliers", []);

    if (editSupplier) {
      const idx = local.findIndex((s) => s.id === editSupplier.id);
      const updated = {
        ...local[idx],
        name: form.name.trim(),
        phone: form.phone.trim(),
        mobile: form.phone.trim(),
        address: form.address.trim(),
        company: form.company.trim(),
        note: form.note.trim(),
        is_active: form.is_active,
      };
      if (idx >= 0) local[idx] = updated;
      else local.push({ id: editSupplier.id, ...updated });
      writeJSON("local_suppliers", local);
      notify("تأمین‌کننده بروزرسانی شد ✅", "success");
    } else {
      const newSupplier = {
        id: Date.now(),
        name: form.name.trim(),
        phone: form.phone.trim(),
        mobile: form.phone.trim(),
        address: form.address.trim(),
        company: form.company.trim(),
        note: form.note.trim(),
        is_active: form.is_active,
        total_debt: 0,
        created_at: new Date().toISOString(),
      };
      local.push(newSupplier);
      writeJSON("local_suppliers", local);
      notify(`تأمین‌کننده «${newSupplier.name}» ایجاد شد ✅`, "success");
    }

    setFormOpen(false);
    setEditSupplier(null);
    setSaving(false);
    load();
  }, [form, editSupplier, saving, notify, load]);

  // ── حذف ──
  const handleDelete = useCallback((s) => {
    if (!window.confirm(`«${s.name}» حذف شود؟`)) return;
    const local = readJSON("local_suppliers", []).filter((x) => x.id !== s.id);
    writeJSON("local_suppliers", local);
    notify(`«${s.name}» حذف شد`, "success");
    load();
  }, [notify, load]);

  // ── استایل ──
  const inputSx = {
    "& .MuiOutlinedInput-root": {
      borderRadius: "12px", bgcolor: C.inputBg,
      fontSize: 13, fontFamily: "'Vazirmatn', sans-serif", color: C.text,
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
      {/* ── هدر ── */}
      <Box sx={{
        display: "flex", justifyContent: "space-between",
        alignItems: "center", mb: 2.5, flexWrap: "wrap", gap: 1.5,
      }}>
        <Box>
          <Typography sx={{ fontSize: 18, fontWeight: 800, color: C.text }}>
            🏭 تأمین‌کنندگان ({suppliers.length})
          </Typography>
          <Typography sx={{ fontSize: 12, color: C.sub, mt: 0.3 }}>
            تأمین‌کنندگان از فاکتورهای خرید + تعریف دستی — دوطرفه
          </Typography>
        </Box>
        <Button onClick={openCreate} sx={{
          borderRadius: "12px", fontSize: 12, fontWeight: 700, textTransform: "none",
          px: 2.5, py: 1, color: "#fff", background: C.btnGrad,
          boxShadow: `0 4px 20px ${C.olive}30`,
          "&:hover": { transform: "translateY(-1px)" },
        }}>
          ➕ تأمین‌کننده جدید
        </Button>
      </Box>

      {/* ── جستجو ── */}
      <TextField size="small" placeholder="🔍 جستجو (نام، موبایل، شرکت)..."
        value={search} onChange={(e) => setSearch(e.target.value)}
        sx={{ ...inputSx, width: "100%", maxWidth: 350, mb: 2 }} />

      {/* ── لیست ── */}
      {filtered.length === 0 ? (
        <Box sx={{ textAlign: "center", py: 6 }}>
          <Typography sx={{ fontSize: 36, mb: 1 }}>🏭</Typography>
          <Typography sx={{ fontSize: 14, fontWeight: 700, color: C.text }}>
            تأمین‌کننده‌ای ثبت نشده
          </Typography>
          <Typography sx={{ fontSize: 12, color: C.sub, mt: 0.5 }}>
            از فرم «ثبت فاکتور خرید» اضافه می‌شود یا دستی بسازید
          </Typography>
        </Box>
      ) : (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 0.8 }}>
          {filtered.map((s, i) => {
            const stats = getSupplierStats(s.id, s.name);
            return (
              <Box key={s.id} sx={{
                display: "flex", alignItems: "center", flexWrap: "wrap", gap: 1,
                px: 2, py: 1.5, borderRadius: "12px",
                bgcolor: C.glass, backdropFilter: "blur(12px)",
                border: `1px solid ${stats.debt > 0 ? C.danger + "40" : C.glassBorder}`,
                opacity: 0, animation: `fadeUp 0.35s ease-out ${i * 0.04}s forwards`,
                "&:hover": {
                  bgcolor: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.02)",
                },
              }}>
                {/* اطلاعات */}
                <Box sx={{ flex: 1, minWidth: 160 }}>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
                    <Typography sx={{ fontSize: 13, fontWeight: 700, color: C.text }}>
                      🏭 {s.name}
                    </Typography>
                    {s.company && (
                      <Chip size="small" label={s.company} sx={{
                        height: 18, fontSize: 9, fontWeight: 600,
                        borderRadius: "5px", bgcolor: "rgba(21,101,192,0.1)", color: "#1565C0",
                      }} />
                    )}
                    {stats.debt > 0 && (
                      <Chip size="small" label="بدهکار" sx={{
                        height: 18, fontSize: 9, fontWeight: 600,
                        borderRadius: "5px", bgcolor: C.dangerBg, color: C.danger,
                      }} />
                    )}
                    {!s.is_active && (
                      <Chip size="small" label="غیرفعال" sx={{
                        height: 18, fontSize: 9, fontWeight: 600,
                        borderRadius: "5px", bgcolor: C.muted + "30", color: C.muted,
                      }} />
                    )}
                  </Box>
                  <Box sx={{ display: "flex", gap: 1.5, mt: 0.5, flexWrap: "wrap" }}>
                    {(s.phone || s.mobile) && (
                      <Typography sx={{ fontSize: 11, color: C.sub, fontFamily: "monospace" }}>
                        📱 {s.phone || s.mobile}
                      </Typography>
                    )}
                    {s.address && (
                      <Typography sx={{ fontSize: 11, color: C.muted }}>
                        📍 {s.address}
                      </Typography>
                    )}
                  </Box>
                  {/* آمار */}
                  <Box sx={{ display: "flex", gap: 1.5, mt: 0.5, flexWrap: "wrap" }}>
                    <Chip size="small" label={`${stats.count} فاکتور خرید`} sx={{
                      height: 18, fontSize: 9, borderRadius: "5px",
                      bgcolor: C.oliveSubtle, color: C.olive,
                    }} />
                    <Chip size="small" label={`خرید: ${stats.total.toLocaleString("en-US")}`} sx={{
                      height: 18, fontSize: 9, borderRadius: "5px",
                      bgcolor: "rgba(21,101,192,0.1)", color: "#1565C0",
                    }} />
                    <Chip size="small" label={`پرداختی: ${stats.paid.toLocaleString("en-US")}`} sx={{
                      height: 18, fontSize: 9, borderRadius: "5px",
                      bgcolor: "rgba(46,125,50,0.1)", color: "#2E7D32",
                    }} />
                    {stats.debt > 0 && (
                      <Chip size="small" label={`بدهی: ${stats.debt.toLocaleString("en-US")}`} sx={{
                        height: 18, fontSize: 9, borderRadius: "5px",
                        bgcolor: "rgba(230,81,0,0.1)", color: "#E65100",
                      }} />
                    )}
                  </Box>
                </Box>

                {/* اکشن */}
                <Box sx={{ display: "flex", gap: 0.5, flexShrink: 0 }}>
                  <Box onClick={() => openEdit(s)} sx={{
                    display: "flex", flexDirection: "column", alignItems: "center",
                    gap: 0.3, px: 1, py: 0.5, borderRadius: "8px", cursor: "pointer",
                    color: C.olive, "&:hover": { bgcolor: C.oliveSubtle },
                  }}>
                    <Typography sx={{ fontSize: 14, lineHeight: 1 }}>✏️</Typography>
                    <Typography sx={{ fontSize: 8, fontWeight: 600 }}>ویرایش</Typography>
                  </Box>
                  <Box onClick={() => handleDelete(s)} sx={{
                    display: "flex", flexDirection: "column", alignItems: "center",
                    gap: 0.3, px: 1, py: 0.5, borderRadius: "8px", cursor: "pointer",
                    color: C.danger, "&:hover": { bgcolor: C.dangerBg },
                  }}>
                    <Typography sx={{ fontSize: 14, lineHeight: 1 }}>🗑️</Typography>
                    <Typography sx={{ fontSize: 8, fontWeight: 600 }}>حذف</Typography>
                  </Box>
                </Box>
              </Box>
            );
          })}
        </Box>
      )}

      {/* ── دیالوگ ── */}
      <Dialog open={formOpen} onClose={() => setFormOpen(false)}
        maxWidth="xs" fullWidth
        slotProps={{ paper: { sx: { borderRadius: "16px", bgcolor: isDark ? "#1A1A2E" : "#fff", border: `1px solid ${C.glassBorder}` } } }}>
        <DialogTitle sx={{ fontSize: 15, fontWeight: 800, color: C.text }}>
          {editSupplier ? `✏️ ویرایش ${editSupplier.name}` : "➕ تأمین‌کننده جدید"}
        </DialogTitle>
        <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 1.5, pt: "12px !important" }}>
          <TextField size="small" label="نام تأمین‌کننده *" value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })} sx={inputSx} />
          <TextField size="small" label="شرکت" value={form.company}
            onChange={(e) => setForm({ ...form, company: e.target.value })} sx={inputSx} />
          <TextField size="small" label="تلفن" value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })} sx={inputSx} />
          <TextField size="small" label="آدرس" value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })} sx={inputSx} />
          <TextField size="small" label="یادداشت" value={form.note}
            onChange={(e) => setForm({ ...form, note: e.target.value })}
            multiline rows={2} sx={inputSx} />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setFormOpen(false)}
            sx={{ borderRadius: "10px", fontSize: 12, textTransform: "none", color: C.sub }}>
            انصراف
          </Button>
          <Button onClick={handleSave} disabled={saving}
            sx={{
              borderRadius: "10px", fontSize: 12, fontWeight: 700, textTransform: "none",
              px: 2.5, color: "#fff", background: C.btnGrad, opacity: saving ? 0.6 : 1,
            }}>
            {saving ? "..." : editSupplier ? "بروزرسانی" : "ایجاد"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}