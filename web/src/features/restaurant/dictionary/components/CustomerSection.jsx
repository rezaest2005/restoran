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

export default function CustomerSection({ C, isDark, showToast }) {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editCustomer, setEditCustomer] = useState(null);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    name: "", phone: "", address: "",
    opening_balance: 0, note: "", is_active: true,
  });

  const notify = useCallback((msg, type = "info") => {
    if (typeof showToast === "function") showToast(msg, type);
  }, [showToast]);

  // ── بارگذاری از localStorage (دوطرفه) ──
  const load = useCallback(() => {
    setLoading(true);
    const local = readJSON("local_customers", []);
    setCustomers(local);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── جستجو ──
  const filtered = useMemo(() => {
    if (!search.trim()) return customers;
    const q = search.toLowerCase();
    return customers.filter(
      (c) =>
        c.name?.toLowerCase().includes(q) ||
        c.phone?.includes(q) ||
        c.address?.toLowerCase().includes(q)
    );
  }, [customers, search]);

  // ── محاسبه بدهی هر مشتری از فاکتورهای فروش ──
  const getCustomerDebt = useCallback((phone, name) => {
    const sales = readJSON("local_sales_invoices", []);
    return sales.reduce((sum, inv) => {
      const invPhone = inv.customer?.mobile || "";
      const invName = `${inv.customer?.first_name || ""} ${inv.customer?.last_name || ""}`.trim();
      if ((phone && invPhone === phone) || (name && invName === name)) {
        return sum + (inv.remaining || 0);
      }
      return sum;
    }, 0);
  }, []);

  // ── آمار فروش هر مشتری ──
  const getCustomerStats = useCallback((phone, name) => {
    const sales = readJSON("local_sales_invoices", []);
    let count = 0, total = 0, debt = 0;
    for (const inv of sales) {
      const invPhone = inv.customer?.mobile || "";
      const invName = `${inv.customer?.first_name || ""} ${inv.customer?.last_name || ""}`.trim();
      if ((phone && invPhone === phone) || (name && invName === name)) {
        count++;
        total += inv.grand_total || 0;
        debt += inv.remaining || 0;
      }
    }
    return { count, total, debt };
  }, []);

  // ── باز کردن فرم ──
  const openCreate = () => {
    setEditCustomer(null);
    setForm({ name: "", phone: "", address: "", opening_balance: 0, note: "", is_active: true });
    setFormOpen(true);
  };

  const openEdit = (c) => {
    setEditCustomer(c);
    setForm({
      name: c.name || "", phone: c.phone || "", address: c.address || "",
      opening_balance: c.opening_balance || 0,
      note: c.note || "", is_active: c.is_active !== false,
    });
    setFormOpen(true);
  };

  // ── ذخیره ──
  const handleSave = useCallback(() => {
    if (!form.name.trim()) {
      notify("نام مشتری الزامی است", "warning");
      return;
    }
    if (saving) return;
    setSaving(true);

    const local = readJSON("local_customers", []);

    if (editCustomer) {
      const idx = local.findIndex((c) => c.id === editCustomer.id);
      const updated = {
        ...local[idx],
        name: form.name.trim(),
        phone: form.phone.trim(),
        address: form.address.trim(),
        opening_balance: parseFloat(form.opening_balance) || 0,
        note: form.note.trim(),
        is_active: form.is_active,
      };
      if (idx >= 0) local[idx] = updated;
      else local.push({ id: editCustomer.id, ...updated });
      writeJSON("local_customers", local);
      notify("مشتری بروزرسانی شد ✅", "success");
    } else {
      const newCustomer = {
        id: Date.now(),
        name: form.name.trim(),
        phone: form.phone.trim(),
        address: form.address.trim(),
        opening_balance: parseFloat(form.opening_balance) || 0,
        total_debt: 0,
        note: form.note.trim(),
        is_active: form.is_active,
        created_at: new Date().toISOString(),
      };
      local.push(newCustomer);
      writeJSON("local_customers", local);
      notify(`مشتری «${newCustomer.name}» ایجاد شد ✅`, "success");
    }

    setFormOpen(false);
    setEditCustomer(null);
    setSaving(false);
    load();
  }, [form, editCustomer, saving, notify, load]);

  // ── حذف ──
  const handleDelete = useCallback((c) => {
    if (!window.confirm(`«${c.name}» حذف شود؟`)) return;
    const local = readJSON("local_customers", []).filter((x) => x.id !== c.id);
    writeJSON("local_customers", local);
    notify(`«${c.name}» حذف شد`, "success");
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
            👥 مشتریان ({customers.length})
          </Typography>
          <Typography sx={{ fontSize: 12, color: C.sub, mt: 0.3 }}>
            مشتریان از فاکتورهای فروش + تعریف دستی — دوطرفه
          </Typography>
        </Box>
        <Button onClick={openCreate} sx={{
          borderRadius: "12px", fontSize: 12, fontWeight: 700, textTransform: "none",
          px: 2.5, py: 1, color: "#fff", background: C.btnGrad,
          boxShadow: `0 4px 20px ${C.olive}30`,
          "&:hover": { transform: "translateY(-1px)" },
        }}>
          ➕ مشتری جدید
        </Button>
      </Box>

      {/* ── جستجو ── */}
      <TextField size="small" placeholder="🔍 جستجو (نام، موبایل، آدرس)..."
        value={search} onChange={(e) => setSearch(e.target.value)}
        sx={{ ...inputSx, width: "100%", maxWidth: 350, mb: 2 }} />

      {/* ── لیست ── */}
      {filtered.length === 0 ? (
        <Box sx={{ textAlign: "center", py: 6 }}>
          <Typography sx={{ fontSize: 36, mb: 1 }}>👥</Typography>
          <Typography sx={{ fontSize: 14, fontWeight: 700, color: C.text }}>
            مشتری‌ای ثبت نشده
          </Typography>
          <Typography sx={{ fontSize: 12, color: C.sub, mt: 0.5 }}>
            از فرم «ثبت فاکتور فروش» مشتری اضافه می‌شود یا دستی بسازید
          </Typography>
        </Box>
      ) : (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 0.8 }}>
          {filtered.map((c, i) => {
            const stats = getCustomerStats(c.phone, c.name);
            const debt = stats.debt || c.total_debt || 0;
            return (
              <Box key={c.id} sx={{
                display: "flex", alignItems: "center", flexWrap: "wrap", gap: 1,
                px: 2, py: 1.5, borderRadius: "12px",
                bgcolor: C.glass, backdropFilter: "blur(12px)",
                border: `1px solid ${debt > 0 ? C.danger + "40" : C.glassBorder}`,
                opacity: 0, animation: `fadeUp 0.35s ease-out ${i * 0.04}s forwards`,
                "&:hover": {
                  bgcolor: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.02)",
                },
              }}>
                {/* اطلاعات */}
                <Box sx={{ flex: 1, minWidth: 160 }}>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
                    <Typography sx={{ fontSize: 13, fontWeight: 700, color: C.text }}>
                      👤 {c.name}
                    </Typography>
                    {debt > 0 && (
                      <Chip size="small" label="بدهکار" sx={{
                        height: 18, fontSize: 9, fontWeight: 600,
                        borderRadius: "5px", bgcolor: C.dangerBg, color: C.danger,
                      }} />
                    )}
                    {!c.is_active && (
                      <Chip size="small" label="غیرفعال" sx={{
                        height: 18, fontSize: 9, fontWeight: 600,
                        borderRadius: "5px", bgcolor: C.muted + "30", color: C.muted,
                      }} />
                    )}
                  </Box>
                  <Box sx={{ display: "flex", gap: 1.5, mt: 0.5, flexWrap: "wrap" }}>
                    {c.phone && (
                      <Typography sx={{ fontSize: 11, color: C.sub, fontFamily: "monospace" }}>
                        📱 {c.phone}
                      </Typography>
                    )}
                    {c.address && (
                      <Typography sx={{ fontSize: 11, color: C.muted }}>
                        📍 {c.address}
                      </Typography>
                    )}
                  </Box>
                  {/* آمار */}
                  <Box sx={{ display: "flex", gap: 1.5, mt: 0.5, flexWrap: "wrap" }}>
                    <Chip size="small" label={`${stats.count} فاکتور`} sx={{
                      height: 18, fontSize: 9, borderRadius: "5px",
                      bgcolor: C.oliveSubtle, color: C.olive,
                    }} />
                    <Chip size="small" label={`فروش: ${stats.total.toLocaleString("en-US")}`} sx={{
                      height: 18, fontSize: 9, borderRadius: "5px",
                      bgcolor: "rgba(46,125,50,0.1)", color: "#2E7D32",
                    }} />
                    {debt > 0 && (
                      <Chip size="small" label={`بدهی: ${debt.toLocaleString("en-US")}`} sx={{
                        height: 18, fontSize: 9, borderRadius: "5px",
                        bgcolor: "rgba(230,81,0,0.1)", color: "#E65100",
                      }} />
                    )}
                  </Box>
                </Box>

                {/* اکشن */}
                <Box sx={{ display: "flex", gap: 0.5, flexShrink: 0 }}>
                  <Box onClick={() => openEdit(c)} sx={{
                    display: "flex", flexDirection: "column", alignItems: "center",
                    gap: 0.3, px: 1, py: 0.5, borderRadius: "8px", cursor: "pointer",
                    color: C.olive, "&:hover": { bgcolor: C.oliveSubtle },
                  }}>
                    <Typography sx={{ fontSize: 14, lineHeight: 1 }}>✏️</Typography>
                    <Typography sx={{ fontSize: 8, fontWeight: 600 }}>ویرایش</Typography>
                  </Box>
                  <Box onClick={() => handleDelete(c)} sx={{
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
          {editCustomer ? `✏️ ویرایش ${editCustomer.name}` : "➕ مشتری جدید"}
        </DialogTitle>
        <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 1.5, pt: "12px !important" }}>
          <TextField size="small" label="نام مشتری *" value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })} sx={inputSx} />
          <TextField size="small" label="شماره موبایل" value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })} sx={inputSx} />
          <TextField size="small" label="آدرس" value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })} sx={inputSx} />
          <TextField size="small" label="بدهی اول دوره" type="number"
            value={form.opening_balance}
            onChange={(e) => setForm({ ...form, opening_balance: e.target.value })} sx={inputSx} />
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
            {saving ? "..." : editCustomer ? "بروزرسانی" : "ایجاد"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}