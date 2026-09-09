import { useState, useEffect } from "react";
import {
  Box, Typography, Button, TextField, Switch,
  CircularProgress, Chip, IconButton, Alert, Tooltip,
} from "@mui/material";
import { Close, Save } from "@mui/icons-material";
import superClient from "../../api/super_client";

const formatPrice = (val) => {
  const num = typeof val === "string" ? parseInt(val.replace(/,/g, ""), 10) : val;
  if (!num && num !== 0) return "";
  return num.toLocaleString("en-US");
};

const parsePrice = (str) => parseInt(String(str).replace(/,/g, ""), 10) || 0;

export default function ServicesPanel({ tenantId, tenantName, services, loading, onSave, C, t }) {
  const [localServices, setLocalServices] = useState([]);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState({ open: false, type: "", msg: "" });
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (services && services.length) {
      setLocalServices(services.map(s => ({ ...s })));
      setVisible(true);
    }
  }, [services, tenantId]);

  const current = localServices;

  const update = (id, field, value) => {
    setLocalServices(prev =>
      prev.map(s => s.service_id === id ? { ...s, [field]: value } : s)
    );
  };

    /* ★ save با superClient */
  const handleSave = async () => {
    setSaving(true);
    setToast({ open: false, type: "", msg: "" });
    try {
      const { data } = await superClient.post(
        `/api/super/tenants/${tenantId}/services/`,
        {
          services: current.map(svc => ({
            service_id: svc.service_id,
            is_enabled: svc.is_enabled,
            price: svc.price,
            start_date: svc.start_date || null,
            end_date: svc.end_date || null,
          })),
        },
      );
      setToast({ open: true, type: "success", msg: data.msg || "ذخیره شد" });
      if (onSave) onSave();
    } catch {
      setToast({ open: true, type: "error", msg: "خطا در ذخیره" });
    } finally {
      setSaving(false);
    }
  };

  if (!tenantId || !visible) return null;

  return (
    <Box sx={{
      mt: 2, overflow: "hidden",
      bgcolor: C.glass, backdropFilter: "blur(28px)",
      border: `1px solid ${C.glassBorder}`, borderRadius: "20px",
      boxShadow: "0 4px 20px rgba(0,0,0,0.05)",
    }}>
      {/* header */}
      <Box sx={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        px: 2.5, py: 2,
        borderBottom: `1px solid ${C.glassBorder}`,
        background: `linear-gradient(135deg, ${C.olive}08, ${C.olive}15)`,
      }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
          <Box sx={{
            width: 38, height: 38, borderRadius: "10px",
            display: "flex", alignItems: "center", justifyContent: "center",
            bgcolor: C.oliveSubtle, color: C.olive, fontSize: 18,
          }}>⚙️</Box>
          <Box>
            <Typography sx={{ fontWeight: 800, color: C.text, fontSize: 15 }}>
              {t("super.services.title")}
            </Typography>
            <Typography sx={{ fontSize: 11, color: C.muted, fontWeight: 500 }}>
              {tenantName}
            </Typography>
          </Box>
        </Box>
        <IconButton onClick={() => setVisible(false)} sx={{
          color: C.sub, borderRadius: "10px", width: 32, height: 32,
          "&:hover": { bgcolor: C.dangerBg, color: C.danger },
        }}>
          <Close fontSize="small" />
        </IconButton>
      </Box>

      {/* body */}
      <Box sx={{ p: 2.5 }}>
        {loading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
            <CircularProgress size={28} sx={{ color: C.olive }} />
          </Box>
        ) : (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
            {current.map((svc, i) => {
              const enabled = svc.is_enabled;
              return (
                <Box key={svc.service_id} sx={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  p: 2, borderRadius: "14px",
                  border: `1px solid ${enabled ? C.olive + "44" : C.glassBorder}`,
                  bgcolor: enabled ? `${C.olive}08` : "transparent",
                  transition: "all 0.2s ease",
                  opacity: 0, animation: `fadeUp 0.4s ease-out ${i * 0.05}s forwards`,
                  "&:hover": { borderColor: C.olive + "66" },
                  flexWrap: { xs: "wrap", md: "nowrap" },
                  gap: { xs: 1.5, md: 2 },
                }}>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, minWidth: 0, flex: 1 }}>
                    <Box sx={{
                      width: 36, height: 36, borderRadius: "10px",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 18, flexShrink: 0,
                      bgcolor: enabled ? C.oliveSubtle : C.glassBorder,
                      filter: enabled ? "none" : "grayscale(1)",
                      opacity: enabled ? 1 : 0.5,
                    }}>
                      {svc.icon || "📦"}
                    </Box>
                    <Box sx={{ minWidth: 0 }}>
                      <Typography sx={{ fontSize: 13, fontWeight: 700, color: C.text, opacity: enabled ? 1 : 0.5 }}>
                        {svc.label}
                      </Typography>
                      <Typography sx={{ fontSize: 10, color: C.muted, fontFamily: "monospace" }}>
                        {svc.code}
                      </Typography>
                    </Box>
                  </Box>

                  <Box sx={{ display: "flex", alignItems: "center", gap: { xs: 1, md: 2 }, flexShrink: 0 }}>
                    <TextField
                      size="small"
                      value={formatPrice(svc.price)}
                      onChange={(e) => update(svc.service_id, "price", parsePrice(e.target.value))}
                      disabled={!enabled}
                      sx={{
                        width: { xs: 100, md: 120 },
                        "& .MuiOutlinedInput-root": {
                          borderRadius: "10px", bgcolor: enabled ? C.inputBg : "transparent",
                          fontSize: 13, fontFamily: "'Vazirmatn', sans-serif",
                          "& fieldset": { borderColor: C.glassBorder },
                          "&:hover fieldset": { borderColor: C.olive },
                          "&.Mui-focused fieldset": { borderColor: C.olive },
                        },
                        "& input": { textAlign: "center", direction: "ltr", py: 0.8 },
                      }}
                    />
                    <Tooltip title={enabled ? t("super.badge.active") : t("super.badge.inactive")} arrow>
                      <Switch
                        checked={enabled}
                        onChange={(e) => update(svc.service_id, "is_enabled", e.target.checked)}
                        size="small"
                        sx={{
                          "& .MuiSwitch-switchBase.Mui-checked": { color: C.olive },
                          "& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track": { bgcolor: C.olive },
                        }}
                      />
                    </Tooltip>
                    <Chip size="small" label={enabled ? "ON" : "OFF"} sx={{
                      fontSize: 9, fontWeight: 700, height: 20,
                      bgcolor: enabled ? C.successBg : C.glassBorder,
                      color: enabled ? C.success : C.muted, borderRadius: "6px",
                      display: { xs: "none", sm: "flex" },
                    }} />
                  </Box>
                </Box>
              );
            })}
          </Box>
        )}

        {toast.open && (
          <Alert severity={toast.type} onClose={() => setToast({ ...toast, open: false })}
            sx={{ mt: 2, borderRadius: "12px", fontSize: 13 }}>
            {toast.msg}
          </Alert>
        )}

        {!loading && current.length > 0 && (
          <Box sx={{ mt: 2.5, display: "flex", justifyContent: "flex-end" }}>
            <Button onClick={handleSave} disabled={saving}
              startIcon={saving ? <CircularProgress size={16} sx={{ color: "#fff" }} /> : <Save />}
              sx={{
                bgcolor: C.btnGrad, color: "#fff", fontWeight: 700, textTransform: "none",
                borderRadius: "12px", px: 3, py: 1, fontSize: 13,
                boxShadow: `0 4px 14px ${C.olive}33`,
                "&:hover": { opacity: 0.9, transform: "translateY(-1px)" },
              }}>
              {t("super.services.save")}
            </Button>
          </Box>
        )}
      </Box>
    </Box>
  );
}

if (typeof document !== "undefined" && !document.getElementById("services-fadeup")) {
  const s = document.createElement("style");
  s.id = "services-fadeup";
  s.textContent = `@keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}`;
  document.head.appendChild(s);
}