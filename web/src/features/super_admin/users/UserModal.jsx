import { useState, useEffect, useMemo, useRef } from "react";
import { ResponsiveDialog, formGrid } from "@shared/responsive";
import { useTranslation } from "react-i18next";
import {
  DialogTitle, DialogContent, DialogActions, Button, TextField, Box, IconButton, Typography, Alert, Tabs, Tab,
  Checkbox, FormControlLabel, CircularProgress,
} from "@mui/material";
import superClient from "@super/api/super_client";
import EditablePassword from "@super/common/EditablePassword";
import { PERM_GROUPS, PERM_LABELS, ALL_PERM_CODES, LOCKED_PERMS } from "@super/common/superConfig";
import { quoteFor, PERIODS } from "@super/common/money";
import SubscriptionSection from "./SubscriptionSection";
import PriceSummary from "./PriceSummary";
import PriceDialog from "./PriceDialog";
import { useRegisteredShortcuts, dialogBindings } from "@shared/common/shortcutKit";

const EMPTY = {
  username: "", password: "", first_name: "", last_name: "", phone_number: "",
};

function errorText(err, fallback) {
  const d = err?.response?.data;
  return (d && typeof d === "object" && (d.error || d.detail)) || fallback;
}

/**
 * Customer form. Everything made here is a customer (the person who bought the account = the business owner);
 * saving a new one creates the user, tenant and business in one step on the server.
 *   tab «Info»: login + personal data + subscription (one of four periods; start from now or extend) + price
 *   tab «Access»: the dashboard sections and tabs the customer bought (ticking a section ticks all its tabs)
 */
export default function UserModal({ open, editId, initialTab = 0, focusSub = false, onClose, C }) {
  const { t } = useTranslation();
  const [tab, setTab] = useState(0);
  const [saveError, setSaveError] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [access, setAccess] = useState([...ALL_PERM_CODES]);
  // Access is only sent when the admin touched it, so a new account keeps the defaults of a plain tenant
  const [accessDirty, setAccessDirty] = useState(false);
  // subscription: the period picked in this form (null = leave as is), how to apply it, and the state as loaded
  const [period, setPeriod] = useState(null);
  const [mode, setMode] = useState("set");
  const [current, setCurrent] = useState(null);
  // the period whose price is DISPLAYED (flipping it never changes the subscription); null = follow the subscription
  const [viewPeriod, setViewPeriod] = useState(null);
  // the global price list (Toman per section and period) and its editor
  const [prices, setPrices] = useState({});
  const [priceOpen, setPriceOpen] = useState(false);
  const subRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    setTab(initialTab);
    setSaveError("");
    setAccessDirty(false);
    setPeriod(null);
    setViewPeriod(null);
    setCurrent(null);
    setMode("set");
    superClient.get("/api/super/section-prices/").then((r) => setPrices(r.data.prices || {})).catch(() => {});
    if (!editId) {
      setForm(EMPTY);
      setAccess([...ALL_PERM_CODES]);
      return undefined;
    }
    let alive = true;
    setLoading(true);
    superClient.get(`/api/super/users/${editId}/`).then((res) => {
      if (!alive) return;
      const d = res.data;
      setForm({
        username: d.username || "",
        password: "",
        first_name: d.first_name || "",
        last_name: d.last_name || "",
        phone_number: d.phone_number || "",
      });
      setCurrent(d.subscription || null);
      setMode(d.subscription && !d.subscription.unlimited && !d.subscription.expired ? "extend" : "set");
      setAccess((d.access || []).filter((c) => ALL_PERM_CODES.includes(c)));
    }).catch((err) => {
      if (alive) setSaveError(errorText(err, t("ui_c.super.login.unknown_error")));
    }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editId, initialTab]);

  // «اشتراک» from the Operations menu: scroll the subscription section into view once the form has loaded
  useEffect(() => {
    if (open && focusSub && !loading && tab === 0) subRef.current?.scrollIntoView({ block: "center" });
  }, [open, focusSub, loading, tab]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const changeAccess = (fn) => { setAccess(fn); setAccessDirty(true); };

  const toggleTab = (code) => changeAccess((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]));
  const toggleGroup = (codes) => changeAccess((prev) => {
    const free = codes.filter((c) => !LOCKED_PERMS.includes(c));
    const allOn = free.every((c) => prev.includes(c));
    return allOn ? prev.filter((c) => !free.includes(c)) : [...new Set([...prev, ...free])];
  });
  const setAll = (on) => changeAccess(() => (on ? [...ALL_PERM_CODES] : [...LOCKED_PERMS]));

  const ticked = useMemo(() => new Set([...access, ...LOCKED_PERMS]), [access]);
  const quote = useMemo(() => quoteFor(PERM_GROUPS, ticked, LOCKED_PERMS, prices), [ticked, prices]);
  // the final price is always shown: the flipped period, else the picked one, else the customer's own period, else monthly
  const shownPeriod = viewPeriod
    || (PERIODS.includes(period) ? period : (PERIODS.includes(current?.plan) ? current.plan : "monthly"));
  const pickPeriod = (p) => { setPeriod(p); setViewPeriod(null); };
  const priceLine = (testId) => (
    <PriceSummary
      quote={quote} prices={prices} period={shownPeriod} onPeriod={setViewPeriod} permanent={period === "unlimited"}
      onChangePrice={() => setPriceOpen(true)} C={C} testId={testId}
    />
  );
  const revealPassword = async () => {
    const res = await superClient.get(`/api/super/users/${editId}/password/`);
    return res.data?.password ?? null;
  };

  const handleSave = async () => {
    if (saving || loading) return;
    setSaveError("");
    if (!editId) {
      if (!form.username.trim()) { setTab(0); setSaveError(t("ui_c.super.cust.err_username")); return; }
      if (form.password.length < 4) { setTab(0); setSaveError(t("ui_c.super.cust.err_password")); return; }
    }
    const payload = {
      first_name: form.first_name,
      last_name: form.last_name,
      phone_number: form.phone_number,
    };
    if (period) payload.subscription = { plan: period, mode: editId ? mode : "set" };
    if (!editId) payload.username = form.username.trim();
    if (form.password) payload.password = form.password;
    if (accessDirty) payload.access = access;
    setSaving(true);
    try {
      if (editId) await superClient.put(`/api/super/users/${editId}/`, payload);
      else await superClient.post("/api/super/users/create/", payload);
      onClose(true);
    } catch (err) {
      console.error("Save user error:", err);
      setSaveError(errorText(err, t("ui_c.super.login.unknown_error")));
    } finally {
      setSaving(false);
    }
  };

  // میان‌برها: Ctrl+D = ذخیره، Escape = بستن
  useRegisteredShortcuts(dialogBindings(t, { onConfirm: handleSave, onClose: () => onClose(false) }), { enabled: open });

  const fieldSx = { "& .MuiOutlinedInput-root": { bgcolor: C.inputBg, borderRadius: "10px" } };

  return (
    <ResponsiveDialog
      open={open}
      onClose={() => onClose(false)}
      fullWidth
      maxWidth="sm"
      slotProps={{ paper: { sx: { bgcolor: C.glass, border: `1px solid ${C.glassBorder}`, borderRadius: "16px" } } }}
    >
      <DialogTitle sx={{ color: C.text, fontWeight: 800, fontSize: 15, paddingInlineEnd: 7, pb: 1 }}>
        {editId ? t("ui_c.super.user.title_edit") : t("ui_c.super.user.title_new")}
        <IconButton
          onClick={() => onClose(false)}
          aria-label={t("ui_resp.close")}
          sx={{ position: "absolute", insetInlineEnd: 8, top: 8, color: C.sub, minWidth: 40, minHeight: 40 }}
        >
          ×
        </IconButton>
      </DialogTitle>
      <Tabs
        value={tab}
        onChange={(_, v) => setTab(v)}
        variant="fullWidth"
        sx={{ borderBottom: `1px solid ${C.glassBorder}`, "& .MuiTab-root": { minHeight: 44, fontWeight: 700, fontSize: 13 } }}
      >
        <Tab label={t("ui_c.super.cust.tab_info")} data-testid="tab-info" />
        <Tab label={t("ui_c.super.cust.tab_access")} data-testid="tab-access" />
      </Tabs>

      <DialogContent>
        {saveError && <Alert severity="error" sx={{ mb: 1.5 }}>{String(saveError)}</Alert>}
        {loading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}><CircularProgress size={28} /></Box>
        ) : tab === 0 ? (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 1 }}>
            <TextField
              size="small" label={t("ui_c.super.user.username")} value={form.username} onChange={set("username")}
              disabled={!!editId} sx={fieldSx}
              slotProps={{ htmlInput: { dir: "ltr", style: { textAlign: "start" }, autoComplete: "off" } }}
            />
            <EditablePassword
              key={editId || "new"} canEdit={!!editId} size="small" label={t("ui_c.super.user.password")}
              value={form.password} onChange={(v) => setForm((f) => ({ ...f, password: v }))} sx={fieldSx}
              onReveal={editId ? revealPassword : undefined}
            />
            <Box sx={formGrid(2, "sm", 2)}>
              <TextField size="small" label={t("ui_c.super.user.first_name")} value={form.first_name} onChange={set("first_name")} sx={fieldSx} />
              <TextField size="small" label={t("ui_c.super.user.last_name")} value={form.last_name} onChange={set("last_name")} sx={fieldSx} />
            </Box>
            <TextField
              size="small" label={t("ui_c.super.user.phone")} value={form.phone_number} onChange={set("phone_number")} sx={fieldSx}
              slotProps={{ htmlInput: { dir: "ltr", style: { textAlign: "start" }, inputMode: "tel" } }}
            />
            <Box ref={subRef}>
            <SubscriptionSection current={current} isNew={!editId} period={period} setPeriod={pickPeriod} mode={mode} setMode={setMode} C={C} />
            </Box>
            {priceLine("price-summary")}
          </Box>
        ) : (
          <Box sx={{ mt: 1 }}>
            <Box sx={{ position: "sticky", top: -20, zIndex: 3, bgcolor: C.glass, mx: -1, px: 1, pt: 2.5, pb: 1, mb: 1.5, borderBottom: `1px solid ${C.glassBorder}` }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap", mb: 1 }}>
              <Typography dir="ltr" sx={{ fontSize: 12.5, color: C.sub, flex: "1 1 60px", minWidth: 0, textAlign: "start" }}>
                {ticked.size}/{ALL_PERM_CODES.length}
              </Typography>
              <Button size="small" onClick={() => setAll(true)} sx={{ minHeight: 40 }}>{t("ui_c.super.cust.all")}</Button>
              <Button size="small" onClick={() => setAll(false)} sx={{ minHeight: 40 }}>{t("ui_c.super.cust.none")}</Button>
              <Button size="small" variant="outlined" onClick={() => setPriceOpen(true)} data-testid="change-price" sx={{ minHeight: 40, fontWeight: 700 }}>
                {t("ui_c.super.sub.change_price")}
              </Button>
            </Box>
            {priceLine("price-summary-access")}
            </Box>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
              {Object.entries(PERM_GROUPS).map(([gid, g]) => {
                const free = g.codes.filter((c) => !LOCKED_PERMS.includes(c));
                const on = free.filter((c) => ticked.has(c)).length;
                return (
                  <Box key={gid} data-testid={`section-${gid}`} sx={{ border: `1px solid ${C.glassBorder}`, borderRadius: "12px", p: 1.25 }}>
                    <FormControlLabel
                      sx={{ m: 0, minHeight: 40, "& .MuiFormControlLabel-label": { fontWeight: 800, color: C.text, fontSize: 14 } }}
                      label={t(g.labelKey)}
                      control={(
                        <Checkbox
                          checked={free.length === 0 || on === free.length}
                          indeterminate={on > 0 && on < free.length}
                          disabled={free.length === 0}
                          onChange={() => toggleGroup(g.codes)}
                          slotProps={{ input: { "aria-label": t(g.labelKey), "data-group": gid } }}
                        />
                      )}
                    />
                    <Box sx={{ ...formGrid(2, "sm", 0), paddingInlineStart: { xs: 2, sm: 3 } }}>
                      {g.codes.map((code) => (
                        <FormControlLabel
                          key={code}
                          sx={{ m: 0, minHeight: 40, "& .MuiFormControlLabel-label": { fontSize: 13, color: C.sub, overflowWrap: "anywhere" } }}
                          label={t(PERM_LABELS[code])}
                          control={(
                            <Checkbox
                              size="small"
                              checked={ticked.has(code)}
                              disabled={LOCKED_PERMS.includes(code)}
                              onChange={() => toggleTab(code)}
                              slotProps={{ input: { "aria-label": t(PERM_LABELS[code]), "data-code": code } }}
                            />
                          )}
                        />
                      ))}
                    </Box>
                  </Box>
                );
              })}
            </Box>
          </Box>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2, pt: 1 }}>
        <Button onClick={() => onClose(false)} sx={{ color: C.sub, textTransform: "none", borderRadius: "10px", fontSize: 12, minHeight: 40 }}>
          {t("ui_c.super.cancel")}
        </Button>
        <Button
          onClick={handleSave}
          disabled={saving || loading}
          sx={{ bgcolor: C.btnGrad, color: "var(--on-primary)", textTransform: "none", fontWeight: 700, borderRadius: "10px", px: 3, fontSize: 12, minHeight: 40 }}
        >
          {t("ui_c.super.save")}
        </Button>
      </DialogActions>
      <PriceDialog open={priceOpen} prices={prices} C={C} onClose={(saved) => { setPriceOpen(false); if (saved) setPrices(saved); }} />
    </ResponsiveDialog>
  );
}
