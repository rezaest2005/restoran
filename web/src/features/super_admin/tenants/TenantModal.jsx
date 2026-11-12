// web/src/features/super_admin/tenants/TenantModal.jsx
import { useState, useEffect } from "react";
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, Typography, Box, TextField, Alert,
} from "@mui/material";
import superClient from "@super/api/super_client";
import { useRegisteredShortcuts, dialogBindings } from "@shared/common/shortcutKit";

const fieldSx = {
  "& .MuiOutlinedInput-root": { borderRadius: "12px", fontSize: 13 },
  "& .MuiInputLabel-root": { fontSize: 12 },
};

export default function TenantModal({ open, onClose, editData, onSave, C, t }) {
  const editId = editData?.id || null;

  const [form, setForm] = useState({
    name: "",
    slug: "",
    owner_username: "",
    owner_password: "",
    owner_name: "",
    phone: "",
    address: "",
    start_date: "",
    end_date: "",
  });

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");          // ★ جدید
  const [fieldErrors, setFieldErrors] = useState({});     // ★ جدید

  useEffect(() => {
    if (open) {
      setErrorMsg("");                                    // ★ ریست خطا
      setFieldErrors({});                                 // ★ ریست خطا
      if (editData) {
        setForm({
          name: editData.name || "",
          slug: editData.slug || "",
          owner_username: editData.owner_username || "",
          owner_password: "",
          owner_name: editData.owner_name || "",
          phone: editData.phone || "",
          address: editData.address || "",
          start_date: editData.start_date || "",
          end_date: editData.end_date || "",
        });
      } else {
        setForm({
          name: "", slug: "", owner_username: "", owner_password: "",
          owner_name: "", phone: "", address: "",
          start_date: "", end_date: "",
        });
      }
    }
  }, [open, editData]);

  const set = (key) => (e) => {
    setForm((f) => ({ ...f, [key]: e.target.value }));
    // ★ پاک کردن خطای فیلد وقتی کاربر تایپ میکنه
    setFieldErrors((p) => {
      if (!p[key]) return p;
      const n = { ...p };
      delete n[key];
      return n;
    });
  };

  // ── ★ اعتبارسنجی قبل از ارسال ──
  const validate = () => {
    const errors = {};

    if (!form.name.trim()) errors.name = t("ui_c.super.tenant.err_name");
    if (!editId) {
      if (!form.slug.trim()) errors.slug = t("ui_c.super.tenant.err_slug");
      if (!form.owner_username.trim()) errors.owner_username = t("ui_c.super.tenant.err_owner_username");
      if (!form.owner_password || form.owner_password.length < 4)
        errors.owner_password = t("ui_c.super.tenant.err_owner_password");
    }
    if (form.slug && !/^[a-z0-9-]+$/.test(form.slug))
      errors.slug = t("ui_c.super.tenant.err_slug_format");

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // ── ذخیره ──
  const handleSave = async () => {
    setErrorMsg("");

    if (!validate()) return;

    setLoading(true);
    try {
      // ★ پاکسازی payload — فقط فیلدهای مورد نیاز بک‌اند
      const payload = {
        name: form.name.trim(),
        phone: form.phone.trim(),
        address: form.address.trim(),
        start_date: form.start_date || null,
        end_date: form.end_date || null,
      };

      if (!editId) {
        payload.slug = form.slug.trim();
        payload.owner_username = form.owner_username.trim();
        payload.owner_password = form.owner_password;
        payload.owner_name = form.owner_name.trim();
      } else {
        payload.owner_name = form.owner_name.trim();
        // رمز فقط اگه پر شده باشه
        if (form.owner_password && form.owner_password.length >= 4) {
          payload.owner_password = form.owner_password;
        }
      }

      if (editId) {
        await superClient.put(`/api/super/tenants/${editId}/`, payload);
      } else {
        await superClient.post(`/api/super/tenants/`, payload);
      }

      if (onSave) onSave();
      onClose();
    } catch (err) {
      console.error("Save tenant error:", err);

      // ★ نمایش خطای بک‌اند به کاربر
      const data = err?.response?.data;
      if (data) {
        // اگه خطاها فیلدی باشن
        if (typeof data === "object" && !data.error && !data.detail) {
          const fe = {};
          let general = "";
          Object.entries(data).forEach(([key, val]) => {
            const msg = Array.isArray(val) ? val.join(t("ui_c.super.list_sep")) : String(val);
            if (["name", "slug", "owner_username", "owner_password", "phone"].includes(key)) {
              fe[key] = msg;
            } else {
              general += (general ? " | " : "") + `${key}: ${msg}`;
            }
          });
          setFieldErrors(fe);
          setErrorMsg(general || t("ui_c.super.tenant.err_check_fields"));
        } else {
          setErrorMsg(data.error || data.detail || JSON.stringify(data));
        }
      } else {
        setErrorMsg(t("ui_c.super.tenant.err_server"));
      }
    } finally {
      setLoading(false);
    }
  };

  // میان‌برها: Ctrl+D و Enter = ذخیره، Escape = بستن
  useRegisteredShortcuts(dialogBindings(t, { onConfirm: handleSave, onClose }), { enabled: open });

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth
      slotProps={{
        paper: {
          sx: {
            bgcolor: C.glass, border: `1px solid ${C.glassBorder}`,
            borderRadius: "20px",
          },
        },
      }}
    >
      {/* ═══ هدر ═══ */}
      <DialogTitle sx={{
        color: C.text, fontWeight: 800, fontSize: 17,
        borderBottom: `1px solid ${C.glassBorder}`,
      }}>
        {editId ? t("ui_c.super.tenant.title_edit") : t("ui_c.super.tenant.title_new")}
      </DialogTitle>

      <DialogContent sx={{ pt: 2.5 }}>
        {/* ★ نمایش خطای کلی */}
        {errorMsg && (
          <Alert severity="error" sx={{ mb: 2, borderRadius: "12px", fontSize: 12, fontWeight: 600 }}
            onClose={() => setErrorMsg("")}>
            {errorMsg}
          </Alert>
        )}

        {/* ═══ اطلاعات اصلی ═══ */}
        <Typography sx={{ fontSize: 14, fontWeight: 800, color: C.text, mb: 1.5 }}>
          {t("ui_c.super.tenant.section_main")}
        </Typography>
        <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2 }}>
          <TextField
            label={t("ui_c.super.tenant.f_name")}
            value={form.name}
            onChange={set("name")}
            error={!!fieldErrors.name}
            helperText={fieldErrors.name}
            sx={fieldSx}
          />
          <TextField
            label={t("ui_c.super.tenant.f_slug")}
            value={form.slug}
            onChange={set("slug")}
            disabled={!!editId}
            error={!!fieldErrors.slug}
            helperText={fieldErrors.slug || t("ui_c.super.tenant.slug_hint")}
            sx={fieldSx}
          />
          <TextField
            label={t("ui_c.super.tenant.f_owner_username")}
            value={form.owner_username}
            onChange={set("owner_username")}
            disabled={!!editId}
            error={!!fieldErrors.owner_username}
            helperText={fieldErrors.owner_username}
            sx={fieldSx}
          />
          <TextField
            label={editId ? t("ui_c.super.tenant.f_new_password") : t("ui_c.super.tenant.f_password")}
            type="password"
            value={form.owner_password}
            onChange={set("owner_password")}
            error={!!fieldErrors.owner_password}
            helperText={fieldErrors.owner_password || (editId ? t("ui_c.super.tenant.pw_keep") : t("ui_c.super.tenant.pw_min"))}
            sx={fieldSx}
          />
          <TextField label={t("ui_c.super.tenant.f_owner_name")} value={form.owner_name} onChange={set("owner_name")} sx={fieldSx} />
          <TextField
            label={t("ui_c.super.tenant.f_phone")}
            value={form.phone}
            onChange={set("phone")}
            error={!!fieldErrors.phone}
            helperText={fieldErrors.phone}
            sx={fieldSx}
          />
          <TextField label={t("ui_c.super.tenant.f_address")} value={form.address} onChange={set("address")} multiline rows={2}
            sx={{ ...fieldSx, gridColumn: "1 / -1" }} />
        </Box>

        {/* ═══ تاریخ اشتراک ═══ */}
        <Box sx={{ bgcolor: C.oliveSubtle, borderRadius: "14px", p: 2, mt: 2.5 }}>
          <Typography sx={{ fontSize: 13, fontWeight: 800, color: C.olive, mb: 1.5 }}>
            {t("ui_c.super.tenant.section_dates")}
          </Typography>
          <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
            <Box sx={{ flex: "1 1 200px" }}>
              <Typography sx={{ fontSize: 11, fontWeight: 600, color: C.sub, mb: 0.5 }}>
                {t("ui_c.super.tenant.start")}
              </Typography>
              <input type="date" value={form.start_date} onChange={set("start_date")}
                style={{
                  width: "100%", padding: "10px 12px", borderRadius: "12px",
                  border: `1px solid ${C.glassBorder}`, backgroundColor: C.inputBg,
                  fontSize: "13px", fontFamily: "'Vazirmatn', sans-serif",
                  color: C.text, outline: "none", direction: "ltr", boxSizing: "border-box",
                }}
              />
            </Box>
            <Box sx={{ flex: "1 1 200px" }}>
              <Typography sx={{ fontSize: 11, fontWeight: 600, color: C.sub, mb: 0.5 }}>
                {t("ui_c.super.tenant.end")}
              </Typography>
              <input type="date" value={form.end_date} onChange={set("end_date")}
                style={{
                  width: "100%", padding: "10px 12px", borderRadius: "12px",
                  border: `1px solid ${C.glassBorder}`, backgroundColor: C.inputBg,
                  fontSize: "13px", fontFamily: "'Vazirmatn', sans-serif",
                  color: C.text, outline: "none", direction: "ltr", boxSizing: "border-box",
                }}
              />
            </Box>
          </Box>
        </Box>

      </DialogContent>

      {/* ═══ دکمه‌ها ═══ */}
      <DialogActions sx={{
        px: 3, pb: 2.5, pt: 1.5,
        borderTop: `1px solid ${C.glassBorder}`,
      }}>
        <Button onClick={onClose} sx={{ color: C.sub, textTransform: "none", fontSize: 13 }}>
          {t("ui_c.super.cancel")}
        </Button>
        <Button onClick={handleSave} disabled={loading}
          sx={{
            bgcolor: C.btnGrad, color: "var(--on-primary)",
            fontWeight: 700, textTransform: "none",
            borderRadius: "12px", px: 4, fontSize: 13,
          }}>
          {loading ? "..." : editId ? t("ui_c.super.tenant.save_changes") : t("ui_c.super.tenant.create")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}