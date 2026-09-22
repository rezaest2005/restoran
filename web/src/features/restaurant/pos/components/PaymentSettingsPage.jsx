import { useState } from "react";
import {
  Box, Typography, Tabs, Tab, TextField, Button, Switch,
  FormControlLabel, Select, MenuItem, IconButton, Chip,
  CircularProgress, Alert,
} from "@mui/material";
import {
  Add, Delete, Wifi, CreditCard, Language, Save,
} from "@mui/icons-material";

/* ── رنگ‌ها ─────────────────────────── */
const C = {
  bg: "#0B0A0B",
  glass: "rgba(16,18,16,0.6)",
  glassBorder: "rgba(107,155,110,0.1)",
  olive: "#6B9B6E",
  gold: "#D4B76A",
  burgundy: "#A84060",
  text: "#F0ECE8",
  sub: "#8A8588",
  muted: "#4A4548",
  danger: "#E84057",
};

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
    id: null, name: "کارت‌خوان", ip_address: "",
    port: 8080, protocol: "http", terminal_id: "",
    merchant_id: "", api_path: "/api/v1/pay", is_active: true,
  });
  const [tmEdit, setTmEdit] = useState(false);

  const resetTm = () => {
    setTmForm({
      id: null, name: "کارت‌خوان", ip_address: "",
      port: 8080, protocol: "http", terminal_id: "",
      merchant_id: "", api_path: "/api/v1/pay", is_active: true,
    });
    setTmEdit(false);
  };

  const editTm = (t) => {
    setTmForm({ ...t });
    setTmEdit(true);
  };

  const saveTm = async () => {
    if (!tmForm.ip_address.trim()) return;
    await onSave({ ...tmForm, type: "terminal" });
    resetTm();
  };

  /* ── Gateway labels ───────────────── */
  const gwLabel = (t) => ({
    zarinpal: "زرین‌پال", saman: "سامان",
    parsian: "پارسیان", mellat: "ملت", custom: "سفارشی",
  }[t] || t);

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
        ⚙️ {isRtl ? "تنظیمات پرداخت" : "Payment Settings"}
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
          label={isRtl ? "کارت‌خوان" : "Card Reader"} />
        <Tab icon={<Language sx={{ fontSize: 18 }} />} iconPosition="start"
          label={isRtl ? "درگاه آنلاین" : "Online Gateway"} />
      </Tabs>

      {/* ═══ تب کارت‌خوان ═══ */}
      {tab === 0 && (
        <Box>
          {terminals.map(t => (
            <Box key={t.id} sx={{
              ...cardSx,
              display: "flex", alignItems: "center", gap: 2,
              flexWrap: "wrap",
            }}>
              <Box sx={{ flex: 1, minWidth: 200 }}>
                <Typography sx={{ fontWeight: 800, fontSize: 15, color: C.text }}>
                  {t.name}
                </Typography>
                <Typography sx={{ fontSize: 12, color: C.sub, direction: "ltr", mt: 0.3 }}>
                  {t.protocol}://{t.ip_address}:{t.port}{t.api_path}
                </Typography>
                <Box sx={{ display: "flex", gap: 0.5, mt: 0.5 }}>
                  <Chip size="small" label={t.is_active ? "فعال" : "غیرفعال"}
                    sx={{
                      fontSize: 10, height: 20,
                      bgcolor: t.is_active ? `${C.olive}15` : `${C.danger}15`,
                      color: t.is_active ? C.olive : C.danger,
                    }} />
                  {t.terminal_id && (
                    <Chip size="small" label={`TID: ${t.terminal_id}`}
                      sx={{ fontSize: 10, height: 20, bgcolor: `${C.gold}15`, color: C.gold }} />
                  )}
                </Box>
              </Box>

              <IconButton
                onClick={() => onTest("terminal", t.id)}
                disabled={testing === t.id}
                sx={{
                  color: testing === t.id ? C.muted : C.olive,
                  border: `1px solid ${C.olive}20`, borderRadius: "10px",
                }}
              >
                {testing === t.id
                  ? <CircularProgress size={18} sx={{ color: C.olive }} />
                  : <Wifi sx={{ fontSize: 18 }} />}
              </IconButton>

              <Button size="small" onClick={() => editTm(t)} sx={{
                ...btnSx, color: C.olive, border: `1px solid ${C.olive}20`,
                px: 1.5, minWidth: 0,
              }}>
                {isRtl ? "ویرایش" : "Edit"}
              </Button>

              <IconButton onClick={() => onDelete("terminal", t.id)} sx={{
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
              {tmEdit ? (isRtl ? "ویرایش دستگاه" : "Edit Terminal") : (isRtl ? "افزودن دستگاه" : "Add Terminal")}
            </Typography>

            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 1.5 }}>
              <TextField label={isRtl ? "نام دستگاه" : "Name"} size="small"
                value={tmForm.name}
                onChange={e => setTmForm(f => ({ ...f, name: e.target.value }))}
                sx={inputSx} />
              <TextField label={isRtl ? "آدرس IP" : "IP Address"} size="small"
                value={tmForm.ip_address}
                onChange={e => setTmForm(f => ({ ...f, ip_address: e.target.value }))}
                placeholder="192.168.1.100" sx={inputSx} />
              <TextField label={isRtl ? "پورت" : "Port"} size="small" type="number"
                value={tmForm.port}
                onChange={e => setTmForm(f => ({ ...f, port: parseInt(e.target.value) || 8080 }))}
                sx={inputSx} />
              <Select size="small" value={tmForm.protocol}
                onChange={e => setTmForm(f => ({ ...f, protocol: e.target.value }))}
                sx={{ ...inputSx, "& .MuiSelect-select": { py: "8px" } }}>
                <MenuItem value="http">HTTP</MenuItem>
                <MenuItem value="https">HTTPS</MenuItem>
              </Select>
              <TextField label={isRtl ? "شناسه ترمینال" : "Terminal ID"} size="small"
                value={tmForm.terminal_id}
                onChange={e => setTmForm(f => ({ ...f, terminal_id: e.target.value }))}
                sx={inputSx} />
              <TextField label={isRtl ? "شناسه پذیرنده" : "Merchant ID"} size="small"
                value={tmForm.merchant_id}
                onChange={e => setTmForm(f => ({ ...f, merchant_id: e.target.value }))}
                sx={inputSx} />
              <TextField label={isRtl ? "مسیر API" : "API Path"} size="small"
                value={tmForm.api_path}
                onChange={e => setTmForm(f => ({ ...f, api_path: e.target.value }))}
                sx={{ ...inputSx, gridColumn: { sm: "1 / -1" } }} />
            </Box>

            <FormControlLabel
              control={<Switch checked={tmForm.is_active} size="small"
                onChange={e => setTmForm(f => ({ ...f, is_active: e.target.checked }))}
                sx={{ "& .MuiSwitch-switchBase.Mui-checked": { color: C.olive } }} />}
              label={<Typography sx={{ fontSize: 13, fontFamily: "'Vazirmatn', sans-serif" }}>
                {isRtl ? "فعال" : "Active"}
              </Typography>}
              sx={{ mt: 1.5 }}
            />

            <Box sx={{ display: "flex", gap: 1, mt: 2 }}>
              <Button onClick={saveTm} disabled={saving || !tmForm.ip_address} sx={{
                ...btnSx, bgcolor: C.olive, color: "#fff", px: 3,
                "&:hover": { bgcolor: C.olive, opacity: 0.85 },
              }}>
                <Save sx={{ fontSize: 16, mr: 0.5 }} />
                {saving ? "..." : (isRtl ? "ذخیره" : "Save")}
              </Button>
              {tmEdit && (
                <Button onClick={resetTm} sx={{
                  ...btnSx, color: C.sub, border: `1px solid ${C.glassBorder}`,
                }}>
                  {isRtl ? "انصراف" : "Cancel"}
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
                  مرچنت: {g.merchant_id}
                </Typography>
                <Box sx={{ display: "flex", gap: 0.5, mt: 0.5 }}>
                  <Chip size="small" label={g.is_active ? "فعال" : "غیرفعال"}
                    sx={{
                      fontSize: 10, height: 20,
                      bgcolor: g.is_active ? `${C.olive}15` : `${C.danger}15`,
                      color: g.is_active ? C.olive : C.danger,
                    }} />
                  <Chip size="small" label={g.is_sandbox ? "تست" : "واقعی"}
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
                {isRtl ? "ویرایش" : "Edit"}
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
              {gwEdit ? (isRtl ? "ویرایش درگاه" : "Edit Gateway") : (isRtl ? "افزودن درگاه" : "Add Gateway")}
            </Typography>

            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 1.5 }}>
              <Select size="small" value={gwForm.gateway_type}
                onChange={e => setGwForm(f => ({ ...f, gateway_type: e.target.value }))}
                sx={{ ...inputSx, "& .MuiSelect-select": { py: "8px" } }}>
                <MenuItem value="zarinpal">زرین‌پال</MenuItem>
                <MenuItem value="saman">سامان</MenuItem>
                <MenuItem value="parsian">پارسیان</MenuItem>
                <MenuItem value="mellat">ملت</MenuItem>
                <MenuItem value="custom">سفارشی</MenuItem>
              </Select>
              <TextField label={isRtl ? "عنوان" : "Title"} size="small"
                value={gwForm.title}
                onChange={e => setGwForm(f => ({ ...f, title: e.target.value }))}
                sx={inputSx} />
              <TextField label={isRtl ? "مرچنت آیدی" : "Merchant ID"} size="small"
                value={gwForm.merchant_id}
                onChange={e => setGwForm(f => ({ ...f, merchant_id: e.target.value }))}
                sx={inputSx} />
              <TextField label={isRtl ? "کلید API" : "API Key"} size="small"
                value={gwForm.api_key}
                onChange={e => setGwForm(f => ({ ...f, api_key: e.target.value }))}
                sx={inputSx} />
              <TextField label={isRtl ? "آدرس بازگشت (callback)" : "Callback URL"} size="small"
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
                  {isRtl ? "فعال" : "Active"}
                </Typography>}
              />
              <FormControlLabel
                control={<Switch checked={gwForm.is_sandbox} size="small"
                  onChange={e => setGwForm(f => ({ ...f, is_sandbox: e.target.checked }))}
                  sx={{ "& .MuiSwitch-switchBase.Mui-checked": { color: C.gold } }} />}
                label={<Typography sx={{ fontSize: 13, fontFamily: "'Vazirmatn', sans-serif" }}>
                  {isRtl ? "حالت تست (Sandbox)" : "Sandbox"}
                </Typography>}
              />
            </Box>

            <Box sx={{ display: "flex", gap: 1, mt: 2 }}>
              <Button onClick={saveGw} disabled={saving || !gwForm.merchant_id} sx={{
                ...btnSx, bgcolor: C.gold, color: "#000", px: 3,
                "&:hover": { bgcolor: C.gold, opacity: 0.85 },
              }}>
                <Save sx={{ fontSize: 16, mr: 0.5 }} />
                {saving ? "..." : (isRtl ? "ذخیره" : "Save")}
              </Button>
              {gwEdit && (
                <Button onClick={resetGw} sx={{
                  ...btnSx, color: C.sub, border: `1px solid ${C.glassBorder}`,
                }}>
                  {isRtl ? "انصراف" : "Cancel"}
                </Button>
              )}
            </Box>
          </Box>
        </Box>
      )}
    </Box>
  );
}