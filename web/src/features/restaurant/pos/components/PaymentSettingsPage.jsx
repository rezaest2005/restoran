import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Box, Typography, Tabs, Tab, TextField, Button, Switch,
  FormControlLabel, Select, MenuItem, IconButton, Chip,
  CircularProgress, Alert,
} from "@mui/material";
import {
  Add, Delete, Wifi, CreditCard, Language, Save,
} from "@mui/icons-material";
import { buildColors } from "@shared/palette";

/* ── رنگ‌ها ─────────────────────────── */
// این صفحه فعلاً فقط تیره است؛ به isDark وصل شود
const C = buildColors(true);

const cardSx = {
  bgcolor: C.glass, border: `1px solid ${C.glassBorder}`,
  borderRadius: "16px", p: 2.5, mb: 2,
};

const inputSx = {
  "& .MuiOutlinedInput-root": {
    borderRadius: "10px", bgcolor: "rgba(107,155,110,0.05)",
    fontFamily: "'Vazirmatn', sans-serif", fontSize: 13,
    "& fieldset": { borderColor: C.glassBorder },
    "&:hover fieldset": { borderColor: `${C.olive}50` },
    "&.Mui-focused fieldset": { borderColor: C.olive },
  },
  "& label": { fontFamily: "'Vazirmatn', sans-serif", fontSize: 13 },
  "& input": { color: C.text },
};

const btnSx = {
  borderRadius: "10px", py: 1, fontWeight: 700,
  fontFamily: "'Vazirmatn', sans-serif", fontSize: 13,
};

/* ══════════════════════════════════════ */
export default function PaymentSettingsPage({
  gateways, terminals, loading, saving, testing, testResult,
  onSave, onDelete, onTest, isRtl,
}) {
  const { t } = useTranslation();
  const [tab, setTab] = useState(0);

  /* ── Gateway form ─────────────────── */
  const [gwForm, setGwForm] = useState({
    id: null, gateway_type: "zarinpal", title: "",
    merchant_id: "", api_key: "", callback_url: "",
    is_active: true, is_sandbox: true,
  });
  const [gwEdit, setGwEdit] = useState(false);

  const resetGw = () => {
    setGwForm({
      id: null, gateway_type: "zarinpal", title: "",
      merchant_id: "", api_key: "", callback_url: "",
      is_active: true, is_sandbox: true,
    });
    setGwEdit(false);
  };

  const editGw = (g) => {
    setGwForm({ ...g });
    setGwEdit(true);
  };

  const saveGw = async () => {
    if (!gwForm.merchant_id.trim()) return;
    await onSave({ ...gwForm, type: "gateway" });
    resetGw();
  };

  /* ── Terminal form ────────────────── */
  const [tmForm, setTmForm] = useState({
    id: null, name: t("ui_c.pos.pay.default_terminal"), ip_address: "",
    port: 8080, protocol: "http", terminal_id: "",
    merchant_id: "", api_path: "/api/v1/pay", is_active: true,
  });
  const [tmEdit, setTmEdit] = useState(false);

  const resetTm = () => {
    setTmForm({
      id: null, name: t("ui_c.pos.pay.default_terminal"), ip_address: "",
      port: 8080, protocol: "http", terminal_id: "",
      merchant_id: "", api_path: "/api/v1/pay", is_active: true,
    });
    setTmEdit(false);
  };

  const editTm = (row) => {
    setTmForm({ ...row });
    setTmEdit(true);
  };

  const saveTm = async () => {
    if (!tmForm.ip_address.trim()) return;
    await onSave({ ...tmForm, type: "terminal" });
    resetTm();
  };

  /* ── Gateway labels ───────────────── */
  const gwLabel = (type) => ({
    zarinpal: t("ui_c.pos.pay.gw_zarinpal"), saman: t("ui_c.pos.pay.gw_saman"),
    parsian: t("ui_c.pos.pay.gw_parsian"), mellat: t("ui_c.pos.pay.gw_mellat"), custom: t("ui_c.pos.pay.gw_custom"),
  }[type] || type);

  if (loading) return (
    <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
      <CircularProgress sx={{ color: C.olive }} />
    </Box>
  );

  return (
    <Box>
      <Typography sx={{
        fontWeight: 900, fontSize: 22, mb: 2, color: C.text,
        fontFamily: "'Vazirmatn', sans-serif",
        display: "flex", alignItems: "center", gap: 1,
      }}>
        ⚙️ {t("ui_c.pos_pay.payment_settings")}
      </Typography>

      <Tabs
        value={tab} onChange={(_, v) => setTab(v)}
        sx={{
          mb: 2.5,
          "& .MuiTab-root": {
            fontFamily: "'Vazirmatn', sans-serif", fontWeight: 700,
            fontSize: 14, color: C.muted, minHeight: 42,
          },
          "& .Mui-selected": { color: `${C.olive} !important` },
          "& .MuiTabs-indicator": { bgcolor: C.olive, height: 3, borderRadius: 2 },
        }}
      >
        <Tab icon={<CreditCard sx={{ fontSize: 18 }} />} iconPosition="start"
          label={t("ui_c.pos_pay.card_reader")} />
        <Tab icon={<Language sx={{ fontSize: 18 }} />} iconPosition="start"
          label={t("ui_c.pos_pay.online_gateway")} />
      </Tabs>

      {/* ═══ تب کارت‌خوان ═══ */}
      {tab === 0 && (
        <Box>
          {terminals.map(tm => (
            <Box key={tm.id} sx={{
              ...cardSx,
              display: "flex", alignItems: "center", gap: 2,
              flexWrap: "wrap",
            }}>
              <Box sx={{ flex: 1, minWidth: 200 }}>
                <Typography sx={{ fontWeight: 800, fontSize: 15, color: C.text }}>
                  {tm.name}
                </Typography>
                <Typography sx={{ fontSize: 12, color: C.sub, direction: "ltr", mt: 0.3 }}>
                  {tm.protocol}://{tm.ip_address}:{tm.port}{tm.api_path}
                </Typography>
                <Box sx={{ display: "flex", gap: 0.5, mt: 0.5 }}>
                  <Chip size="small" label={tm.is_active ? t("ui_c.pos.pay.active") : t("ui_c.pos.pay.inactive")}
                    sx={{
                      fontSize: 10, height: 20,
                      bgcolor: tm.is_active ? `${C.olive}15` : `${C.danger}15`,
                      color: tm.is_active ? C.olive : C.danger,
                    }} />
                  {tm.terminal_id && (
                    <Chip size="small" label={`TID: ${tm.terminal_id}`}
                      sx={{ fontSize: 10, height: 20, bgcolor: `${C.gold}15`, color: C.gold }} />
                  )}
                </Box>
              </Box>

              <IconButton
                onClick={() => onTest("terminal", tm.id)}
                disabled={testing === tm.id}
                sx={{
                  color: testing === tm.id ? C.muted : C.olive,
                  border: `1px solid ${C.olive}20`, borderRadius: "10px",
                }}
              >
                {testing === tm.id
                  ? <CircularProgress size={18} sx={{ color: C.olive }} />
                  : <Wifi sx={{ fontSize: 18 }} />}
              </IconButton>

              <Button size="small" onClick={() => editTm(tm)} sx={{
                ...btnSx, color: C.olive, border: `1px solid ${C.olive}20`,
                px: 1.5, minWidth: 0,
              }}>
                {t("ui_c.pos_pay.edit")}
              </Button>

              <IconButton onClick={() => onDelete("terminal", tm.id)} sx={{
                color: C.danger, borderRadius: "10px",
                border: `1px solid ${C.danger}15`,
              }}>
                <Delete sx={{ fontSize: 17 }} />
              </IconButton>
            </Box>
          ))}

          {testResult && tab === 0 && (
            <Alert severity={testResult.ok ? "success" : "error"} sx={{
              mb: 2, borderRadius: "12px", bgcolor: C.glass,
              border: `1px solid ${testResult.ok ? C.olive : C.danger}30`,
              color: C.text, fontFamily: "'Vazirmatn', sans-serif",
            }}>
              {testResult.message}
            </Alert>
          )}

          <Box sx={{ ...cardSx, border: `1px solid ${C.olive}20` }}>
            <Typography sx={{
              fontWeight: 800, fontSize: 14, mb: 1.5, color: C.text,
              fontFamily: "'Vazirmatn', sans-serif",
            }}>
              {tmEdit ? (t("ui_c.pos_pay.edit_terminal")) : (t("ui_c.pos_pay.add_terminal"))}
            </Typography>

            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 1.5 }}>
              <TextField label={t("ui_c.pos_pay.name")} size="small"
                value={tmForm.name}
                onChange={e => setTmForm(f => ({ ...f, name: e.target.value }))}
                sx={inputSx} />
              <TextField label={t("ui_c.pos_pay.ip_address")} size="small"
                value={tmForm.ip_address}
                onChange={e => setTmForm(f => ({ ...f, ip_address: e.target.value }))}
                placeholder="192.168.1.100" sx={inputSx} />
              <TextField label={t("ui_c.pos_pay.port")} size="small" type="number"
                value={tmForm.port}
                onChange={e => setTmForm(f => ({ ...f, port: parseInt(e.target.value) || 8080 }))}
                sx={inputSx} />
              <Select size="small" value={tmForm.protocol}
                onChange={e => setTmForm(f => ({ ...f, protocol: e.target.value }))}
                sx={{ ...inputSx, "& .MuiSelect-select": { py: "8px" } }}>
                <MenuItem value="http">HTTP</MenuItem>
                <MenuItem value="https">HTTPS</MenuItem>
              </Select>
              <TextField label={t("ui_c.pos_pay.terminal_id")} size="small"
                value={tmForm.terminal_id}
                onChange={e => setTmForm(f => ({ ...f, terminal_id: e.target.value }))}
                sx={inputSx} />
              <TextField label={t("ui_c.pos_pay.merchant_id")} size="small"
                value={tmForm.merchant_id}
                onChange={e => setTmForm(f => ({ ...f, merchant_id: e.target.value }))}
                sx={inputSx} />
              <TextField label={t("ui_c.pos_pay.api_path")} size="small"
                value={tmForm.api_path}
                onChange={e => setTmForm(f => ({ ...f, api_path: e.target.value }))}
                sx={{ ...inputSx, gridColumn: { sm: "1 / -1" } }} />
            </Box>

            <FormControlLabel
              control={<Switch checked={tmForm.is_active} size="small"
                onChange={e => setTmForm(f => ({ ...f, is_active: e.target.checked }))}
                sx={{ "& .MuiSwitch-switchBase.Mui-checked": { color: C.olive } }} />}
              label={<Typography sx={{ fontSize: 13, fontFamily: "'Vazirmatn', sans-serif" }}>
                {t("ui_c.pos_pay.active")}
              </Typography>}
              sx={{ mt: 1.5 }}
            />

            <Box sx={{ display: "flex", gap: 1, mt: 2 }}>
              <Button onClick={saveTm} disabled={saving || !tmForm.ip_address} sx={{
                ...btnSx, bgcolor: C.olive, color: "#fff", px: 3,
                "&:hover": { bgcolor: C.olive, opacity: 0.85 },
              }}>
                <Save sx={{ fontSize: 16, mr: 0.5 }} />
                {saving ? "..." : (t("ui_c.pos_pay.save"))}
              </Button>
              {tmEdit && (
                <Button onClick={resetTm} sx={{
                  ...btnSx, color: C.sub, border: `1px solid ${C.glassBorder}`,
                }}>
                  {t("ui_c.pos_pay.cancel")}
                </Button>
              )}
            </Box>
          </Box>
        </Box>
      )}

      {/* ═══ تب درگاه آنلاین ═══ */}
      {tab === 1 && (
        <Box>
          {gateways.map(g => (
            <Box key={g.id} sx={{
              ...cardSx,
              display: "flex", alignItems: "center", gap: 2,
              flexWrap: "wrap",
            }}>
              <Box sx={{ flex: 1, minWidth: 200 }}>
                <Typography sx={{ fontWeight: 800, fontSize: 15, color: C.text }}>
                  {g.title || gwLabel(g.gateway_type)}
                </Typography>
                <Typography sx={{ fontSize: 12, color: C.sub, mt: 0.3 }}>
                  {t("ui_c.pos.pay.merchant_label", { id: g.merchant_id })}
                </Typography>
                <Box sx={{ display: "flex", gap: 0.5, mt: 0.5 }}>
                  <Chip size="small" label={g.is_active ? t("ui_c.pos.pay.active") : t("ui_c.pos.pay.inactive")}
                    sx={{
                      fontSize: 10, height: 20,
                      bgcolor: g.is_active ? `${C.olive}15` : `${C.danger}15`,
                      color: g.is_active ? C.olive : C.danger,
                    }} />
                  <Chip size="small" label={g.is_sandbox ? t("ui_c.pos.pay.test_mode") : t("ui_c.pos.pay.live_mode")}
                    sx={{
                      fontSize: 10, height: 20,
                      bgcolor: g.is_sandbox ? `${C.gold}15` : `${C.olive}15`,
                      color: g.is_sandbox ? C.gold : C.olive,
                    }} />
                </Box>
              </Box>

              <IconButton
                onClick={() => onTest("gateway", g.id)}
                disabled={testing === g.id}
                sx={{
                  color: testing === g.id ? C.muted : C.olive,
                  border: `1px solid ${C.olive}20`, borderRadius: "10px",
                }}
              >
                {testing === g.id
                  ? <CircularProgress size={18} sx={{ color: C.olive }} />
                  : <Wifi sx={{ fontSize: 18 }} />}
              </IconButton>

              <Button size="small" onClick={() => editGw(g)} sx={{
                ...btnSx, color: C.olive, border: `1px solid ${C.olive}20`,
                px: 1.5, minWidth: 0,
              }}>
                {t("ui_c.pos_pay.edit")}
              </Button>

              <IconButton onClick={() => onDelete("gateway", g.id)} sx={{
                color: C.danger, borderRadius: "10px",
                border: `1px solid ${C.danger}15`,
              }}>
                <Delete sx={{ fontSize: 17 }} />
              </IconButton>
            </Box>
          ))}

          {testResult && tab === 1 && (
            <Alert severity={testResult.ok ? "success" : "error"} sx={{
              mb: 2, borderRadius: "12px", bgcolor: C.glass,
              border: `1px solid ${testResult.ok ? C.olive : C.danger}30`,
              color: C.text, fontFamily: "'Vazirmatn', sans-serif",
            }}>
              {testResult.message}
            </Alert>
          )}

          <Box sx={{ ...cardSx, border: `1px solid ${C.gold}20` }}>
            <Typography sx={{
              fontWeight: 800, fontSize: 14, mb: 1.5, color: C.text,
              fontFamily: "'Vazirmatn', sans-serif",
            }}>
              {gwEdit ? (t("ui_c.pos_pay.edit_gateway")) : (t("ui_c.pos_pay.add_gateway"))}
            </Typography>

            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 1.5 }}>
              <Select size="small" value={gwForm.gateway_type}
                onChange={e => setGwForm(f => ({ ...f, gateway_type: e.target.value }))}
                sx={{ ...inputSx, "& .MuiSelect-select": { py: "8px" } }}>
                <MenuItem value="zarinpal">{t("ui_c.pos.pay.gw_zarinpal")}</MenuItem>
                <MenuItem value="saman">{t("ui_c.pos.pay.gw_saman")}</MenuItem>
                <MenuItem value="parsian">{t("ui_c.pos.pay.gw_parsian")}</MenuItem>
                <MenuItem value="mellat">{t("ui_c.pos.pay.gw_mellat")}</MenuItem>
                <MenuItem value="custom">{t("ui_c.pos.pay.gw_custom")}</MenuItem>
              </Select>
              <TextField label={t("ui_c.pos_pay.title")} size="small"
                value={gwForm.title}
                onChange={e => setGwForm(f => ({ ...f, title: e.target.value }))}
                sx={inputSx} />
              <TextField label={t("ui_c.pos_pay.merchant_id_2")} size="small"
                value={gwForm.merchant_id}
                onChange={e => setGwForm(f => ({ ...f, merchant_id: e.target.value }))}
                sx={inputSx} />
              <TextField label={t("ui_c.pos_pay.api_key")} size="small"
                value={gwForm.api_key}
                onChange={e => setGwForm(f => ({ ...f, api_key: e.target.value }))}
                sx={inputSx} />
              <TextField label={t("ui_c.pos_pay.callback_url")} size="small"
                value={gwForm.callback_url}
                onChange={e => setGwForm(f => ({ ...f, callback_url: e.target.value }))}
                placeholder="https://yoursite.com/api/payment/online/callback/"
                sx={{ ...inputSx, gridColumn: { sm: "1 / -1" } }} />
            </Box>

            <Box sx={{ display: "flex", gap: 2, mt: 1.5 }}>
              <FormControlLabel
                control={<Switch checked={gwForm.is_active} size="small"
                  onChange={e => setGwForm(f => ({ ...f, is_active: e.target.checked }))}
                  sx={{ "& .MuiSwitch-switchBase.Mui-checked": { color: C.olive } }} />}
                label={<Typography sx={{ fontSize: 13, fontFamily: "'Vazirmatn', sans-serif" }}>
                  {t("ui_c.pos_pay.active")}
                </Typography>}
              />
              <FormControlLabel
                control={<Switch checked={gwForm.is_sandbox} size="small"
                  onChange={e => setGwForm(f => ({ ...f, is_sandbox: e.target.checked }))}
                  sx={{ "& .MuiSwitch-switchBase.Mui-checked": { color: C.gold } }} />}
                label={<Typography sx={{ fontSize: 13, fontFamily: "'Vazirmatn', sans-serif" }}>
                  {t("ui_c.pos_pay.sandbox")}
                </Typography>}
              />
            </Box>

            <Box sx={{ display: "flex", gap: 1, mt: 2 }}>
              <Button onClick={saveGw} disabled={saving || !gwForm.merchant_id} sx={{
                ...btnSx, bgcolor: C.gold, color: "#000", px: 3,
                "&:hover": { bgcolor: C.gold, opacity: 0.85 },
              }}>
                <Save sx={{ fontSize: 16, mr: 0.5 }} />
                {saving ? "..." : (t("ui_c.pos_pay.save"))}
              </Button>
              {gwEdit && (
                <Button onClick={resetGw} sx={{
                  ...btnSx, color: C.sub, border: `1px solid ${C.glassBorder}`,
                }}>
                  {t("ui_c.pos_pay.cancel")}
                </Button>
              )}
            </Box>
          </Box>
        </Box>
      )}
    </Box>
  );
}