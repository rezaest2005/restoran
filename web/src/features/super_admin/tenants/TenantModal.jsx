import { useState, useEffect } from "react";
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, TextField, Box, IconButton, Typography, Alert,
} from "@mui/material";
import { useTranslation } from "react-i18next";
import { useLang } from "@shared/contexts/LangContext";
import superClient from "@super/api/super_client";

export default function TenantModal({ open, editId, onClose, C }) {
  const { t } = useTranslation();
  const { isRtl } = useLang();

  const emptyForm = {
    name: "", slug: "", owner_username: "", owner_password: "",
    owner_name: "", phone: "", address: "",
    start_date: "", end_date: "",
  };

  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  /* ── reset / load ── */
  useEffect(() => {
    if (!open) return;
    setError("");

    if (editId) {
      setLoading(true);
      superClient.get(`/api/super/tenants/${editId}/`)
        .then(res => {
          const d = res.data;
          setForm({
            name: d.name || "",
            slug: d.slug || "",
            owner_username: "",
            owner_password: "",
            owner_name: d.owner_name || "",
            phone: d.phone || "",
            address: d.address || "",
            start_date: d.start_date || "",
            end_date: d.end_date || "",
          });
        })
        .catch(() => setError(t("super.error.generic")))
        .finally(() => setLoading(false));
    } else {
      setForm(emptyForm);
    }
  }, [open, editId]);

  /* ── save ── */
  const handleSave = async () => {
    if (!form.name.trim()) { setError(t("super.error.name_required")); return; }
    if (!editId && !form.slug.trim()) { setError(t("super.error.slug_required")); return; }
    if (!editId && !form.owner_username.trim()) { setError(t("super.error.owner_username_required")); return; }
    if (!editId && !form.owner_password) { setError(t("super.error.password_required")); return; }

    setLoading(true);
    setError("");
    try {
      if (editId) {
        const payload = { ...form };
        if (!payload.owner_password) delete payload.owner_password;
        await superClient.put(`/api/super/tenants/${editId}/`, payload);
      } else {
        await superClient.post("/api/super/tenants/", form);
      }
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || t("super.error.generic"));
    } finally {
      setLoading(false);
    }
  };

  /* ── update field ── */
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  /* ── input style ── */
  const fieldSx = {
    "& .MuiOutlinedInput-root": {
      borderRadius: "12px", fontFamily: "'Vazirmatn', sans-serif",
      bgcolor: C.inputBg, fontSize: 13,
      "& fieldset": { borderColor: C.glassBorder, borderWidth: 1 },
      "&:hover fieldset": { borderColor: C.olive },
      "&.Mui-focused fieldset": { borderColor: C.olive, borderWidth: 1.5 },
    },
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="sm"
      dir={isRtl ? "rtl" : "ltr"}
      slotProps={{
        paper: {
          sx: {
            bgcolor: C.glass,
            border: `1px solid ${C.glassBorder}`,
            borderRadius: 3,
          },
        },
      }}
    >
      <DialogTitle
  sx={{
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 2,
    pb: 1,
    position: "relative",
  }}
>
  <Typography sx={{ fontWeight: 800, color: C.text, fontSize: 16 }}>
    {editId ? t("super.tenants.edit") : t("super.tenants.new")}
  </Typography>
  <IconButton
    onClick={onClose}
    sx={{
      color: C.sub,
      borderRadius: "10px",
      width: 32,
      height: 32,
      flexShrink: 0,
      "&:hover": { bgcolor: C.dangerBg },
    }}
  >
    ×
  </IconButton>
</DialogTitle>

      <DialogContent>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 1 }}>

          {/* error */}
          {error && (
            <Alert severity="error" onClose={() => setError("")}
              sx={{ borderRadius: "12px", fontSize: 13 }}>
              {error}
            </Alert>
          )}

          {/* فیلدهای اصلی */}
          <TextField label={t("super.tenants.field.name")} value={form.name} onChange={set("name")} sx={fieldSx} />
          <TextField label={t("super.tenants.field.slug")} value={form.slug} onChange={set("slug")} disabled={!!editId} sx={fieldSx} />
          <TextField label={t("super.tenants.field.owner_username")} value={form.owner_username} onChange={set("owner_username")} disabled={!!editId} sx={fieldSx} />
          <TextField label={t("super.tenants.field.password")} type="password" value={form.owner_password} onChange={set("owner_password")}
            placeholder={editId ? t("super.tenants.password_no_change") : ""} sx={fieldSx} />
          <TextField label={t("super.tenants.field.owner_name")} value={form.owner_name} onChange={set("owner_name")} sx={fieldSx} />
          <TextField label={t("super.tenants.field.phone")} value={form.phone} onChange={set("phone")} sx={fieldSx} />
          <TextField label={t("super.tenants.field.address")} value={form.address} onChange={set("address")} multiline rows={2} sx={fieldSx} />

{/* تاریخ اشتراک */}
<Box sx={{ bgcolor: C.oliveSubtle, borderRadius: "14px", p: 2, mt: 1 }}>
  <Typography sx={{ fontSize: 12, fontWeight: 700, color: C.olive, mb: 1.5 }}>
    📋 {t("super.tenants.field.subscription_title")}
  </Typography>
  <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
    <Box sx={{ flex: "1 1 200px", minWidth: 160 }}>
      <Typography sx={{ fontSize: 11, fontWeight: 600, color: C.sub, mb: 0.5 }}>
        {t("super.tenants.field.start_date")}
      </Typography>
      <input
        type="date"
        value={form.start_date}
        onChange={set("start_date")}
        autoComplete="off"
        style={{
          width: "100%",
          padding: "10px 12px",
          borderRadius: "12px",
          border: `1px solid ${C.glassBorder}`,
          backgroundColor: C.inputBg,
          fontSize: "13px",
          fontFamily: "'Vazirmatn', sans-serif",
          color: C.text,
          outline: "none",
          direction: "ltr",
          boxSizing: "border-box",
        }}
      />
    </Box>
    <Box sx={{ flex: "1 1 200px", minWidth: 160 }}>
      <Typography sx={{ fontSize: 11, fontWeight: 600, color: C.sub, mb: 0.5 }}>
        {t("super.tenants.field.end_date")}
      </Typography>
      <input
        type="date"
        value={form.end_date}
        onChange={set("end_date")}
        autoComplete="off"
        style={{
          width: "100%",
          padding: "10px 12px",
          borderRadius: "12px",
          border: `1px solid ${C.glassBorder}`,
          backgroundColor: C.inputBg,
          fontSize: "13px",
          fontFamily: "'Vazirmatn', sans-serif",
          color: C.text,
          outline: "none",
          direction: "ltr",
          boxSizing: "border-box",
        }}
      />
    </Box>
  </Box>
</Box>

        </Box>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose} sx={{ color: C.sub }}>
          {t("super.action.cancel")}
        </Button>
        <Button onClick={handleSave} disabled={loading} sx={{ bgcolor: C.btnGrad, color: "#fff" }}>
          {loading ? "..." : t("super.action.save")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}