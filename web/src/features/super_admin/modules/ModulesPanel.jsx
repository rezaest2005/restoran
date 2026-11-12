import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Alert, Box, Button, Checkbox, Chip, FormControlLabel, MenuItem, Switch, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, TextField, Typography,
} from "@mui/material";
import superClient from "@super/api/super_client";
import { useRegisteredShortcuts } from "@shared/common/shortcutKit";
import KbdHint from "@business/pos/common/KbdHint";

const toLocalInput = (iso) => (iso ? iso.slice(0, 16) : "");
const fromLocalInput = (v) => (v ? new Date(v).toISOString() : null);
const unwrap = (r) => r.data?.data ?? r.data;

export default function ModulesPanel({ tenants, C }) {
  const { t, i18n } = useTranslation();
  const fa = i18n.language !== "en";
  const businesses = useMemo(() => tenants.filter((x) => x.business_id), [tenants]);
  const [catalog, setCatalog] = useState([]);
  const [plans, setPlans] = useState([]);
  const [bid, setBid] = useState(null);
  const [state, setState] = useState(null);
  const [rows, setRows] = useState({});
  const [auto, setAuto] = useState(false);
  const [plan, setPlan] = useState("");
  const [msg, setMsg] = useState(null);
  const [features, setFeatures] = useState([]);
  const [disabled, setDisabled] = useState([]);
  const planRef = useRef(null);

  const nameOf = useCallback((m) => (fa ? m.name_fa : m.name_en), [fa]);
  const byCode = useMemo(() => Object.fromEntries(catalog.map((m) => [m.code, m])), [catalog]);

  useEffect(() => {
    Promise.all([superClient.get("/api/super/modules/"), superClient.get("/api/super/plans/"), superClient.get("/api/super/features/")])
      .then(([m, p, f]) => { setCatalog(unwrap(m)); setPlans(unwrap(p)); setFeatures(unwrap(f)); })
      .catch(() => {});
  }, []);

  const adopt = useCallback((s) => {
    setState(s);
    setDisabled(s.disabled_features || []);
    setRows(Object.fromEntries(s.modules.map((m) => [m.code, {
      is_enabled: m.is_enabled, starts_at: m.starts_at, expires_at: m.expires_at, price_override: m.price_override,
    }])));
  }, []);

  useEffect(() => {
    if (bid == null && businesses.length) setBid(businesses[0].business_id);
  }, [businesses, bid]);

  useEffect(() => {
    if (bid == null) return;
    superClient.get(`/api/super/businesses/${bid}/modules/`).then((r) => { adopt(unwrap(r)); setMsg(null); }).catch(() => {});
  }, [bid, adopt]);

  const describe = (err) => {
    const e = err.response?.data?.errors || {};
    const list = (o) => Object.entries(o).map(([k, v]) => `${byCode[k] ? nameOf(byCode[k]) : k} → ${v.map((c) => (byCode[c] ? nameOf(byCode[c]) : c)).join(", ")}`).join("; ");
    if (e.missing_requires) return t("ui_k.mod.err_missing", { list: list(e.missing_requires) });
    if (e.dependents) return t("ui_k.mod.err_dependents", { list: list(e.dependents) });
    return err.response?.data?.error || t("ui_k.error");
  };

  const save = useCallback(async () => {
    if (bid == null) return;
    try {
      const r = await superClient.put(`/api/super/businesses/${bid}/modules/`, { modules: rows, auto_requires: auto, disabled_features: disabled });
      adopt(unwrap(r));
      setMsg({ type: "success", text: t("ui_k.mod.saved") });
    } catch (e) {
      setMsg({ type: "error", text: describe(e) });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bid, rows, auto, disabled, adopt, t, byCode]);

  const applyPlan = async () => {
    if (!plan || bid == null) return;
    try {
      const r = await superClient.post(`/api/super/businesses/${bid}/plan/`, { plan });
      adopt(unwrap(r));
      setMsg({ type: "success", text: t("ui_k.mod.saved") });
    } catch (e) {
      setMsg({ type: "error", text: describe(e) });
    }
  };

  const savePrice = async (code, value) => {
    const n = Number(value);
    if (!Number.isInteger(n) || n < 0) return;
    try {
      await superClient.post("/api/super/modules/", { code, price_monthly: n });
      setCatalog((c) => c.map((m) => (m.code === code ? { ...m, price_monthly: n } : m)));
      setMsg({ type: "success", text: t("ui_k.mod.price_saved") });
    } catch (e) {
      setMsg({ type: "error", text: describe(e) });
    }
  };

  const step = (d) => {
    const i = businesses.findIndex((b) => b.business_id === bid);
    const nxt = businesses[Math.min(businesses.length - 1, Math.max(0, i + d))];
    if (nxt) setBid(nxt.business_id);
  };
  useRegisteredShortcuts([
    { combo: "Ctrl+D", label: t("ui_k.mod.sc_save"), handler: save },
    { combo: "Ctrl+A", label: t("ui_k.mod.sc_next"), handler: () => step(1) },
    { combo: "Ctrl+Z", label: t("ui_k.mod.sc_prev"), handler: () => step(-1) },
    { combo: "F2", label: t("ui_k.mod.sc_plan"), handler: () => planRef.current?.focus() },
  ]);

  const toggleFeature = (key, on) =>
    setDisabled((d) => (on ? d.filter((k) => k !== key) : [...new Set([...d, key])]));
  const setGroup = (keys, on) =>
    setDisabled((d) => (on ? d.filter((k) => !keys.includes(k)) : [...new Set([...d, ...keys])]));
  // features grouped under their module ("core" = always-available definitions)
  const featureGroups = useMemo(() => {
    const out = {};
    features.forEach((f) => { (out[f.module || "core"] ||= []).push(f); });
    return out;
  }, [features]);

  const setRow = (code, patch) => setRows((r) => ({ ...r, [code]: { ...r[code], ...patch } }));
  const cell = { color: C.text, borderColor: C.glassBorder };

  return (
    <Box>
      <Typography sx={{ fontWeight: 800, fontSize: 18, color: C.text, mb: 2 }}>{t("ui_k.mod.title")}</Typography>
      {msg && <Alert severity={msg.type} sx={{ mb: 2 }} onClose={() => setMsg(null)}>{msg.text}</Alert>}

      <Typography sx={{ fontWeight: 700, color: C.text, mb: 1 }}>{t("ui_k.mod.catalogue")}</Typography>
      <TableContainer sx={{ mb: 3, border: `1px solid ${C.glassBorder}`, borderRadius: "12px" }}>
        <Table size="small">
          <TableHead><TableRow>
            {["code", "name", "price", "requires"].map((k) => <TableCell key={k} sx={{ ...cell, fontWeight: 700 }}>{t(`ui_k.mod.${k}`)}</TableCell>)}
          </TableRow></TableHead>
          <TableBody>
            {catalog.map((m) => (
              <TableRow key={m.code}>
                <TableCell sx={cell}><code>{m.code}</code></TableCell>
                <TableCell sx={cell}>{nameOf(m)}</TableCell>
                <TableCell sx={cell}>
                  <TextField size="small" type="number" defaultValue={m.price_monthly}
                    sx={{ width: 140 }} onBlur={(e) => Number(e.target.value) !== m.price_monthly && savePrice(m.code, e.target.value)} slotProps={{ htmlInput: { min: 0, dir: "ltr" } }} />
                </TableCell>
                <TableCell sx={cell}>{m.requires.length ? m.requires.map((c) => <Chip key={c} size="small" label={byCode[c] ? nameOf(byCode[c]) : c} sx={{ mx: 0.25 }} />) : t("ui_k.mod.none")}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", alignItems: "center", mb: 2 }}>
        <TextField select size="small" label={t("ui_k.mod.business")} value={bid ?? ""} onChange={(e) => setBid(e.target.value)} sx={{ minWidth: 240 }}>
          {businesses.map((b) => <MenuItem key={b.business_id} value={b.business_id}>{b.name} ({b.slug})</MenuItem>)}
        </TextField>
        <TextField select size="small" label={t("ui_k.mod.plan")} value={plan} onChange={(e) => setPlan(e.target.value)} sx={{ minWidth: 200 }}
          inputRef={planRef}>
          {plans.map((p) => <MenuItem key={p.code} value={p.code}>{fa ? p.name_fa : p.name_en} - {p.price_monthly.toLocaleString()}</MenuItem>)}
        </TextField>
        <Button variant="outlined" disabled={!plan} onClick={applyPlan}>{t("ui_k.mod.apply_plan")}</Button>
      </Box>

      {state && (
        <>
          {!state.managed && <Alert severity="info" sx={{ mb: 2 }}>{t("ui_k.mod.unmanaged")}</Alert>}
          <TableContainer sx={{ border: `1px solid ${C.glassBorder}`, borderRadius: "12px", mb: 2 }}>
            <Table size="small">
              <TableHead><TableRow>
                {["name", "enabled", "starts", "expires", "override", "effective"].map((k) => <TableCell key={k} sx={{ ...cell, fontWeight: 700 }}>{t(`ui_k.mod.${k}`)}</TableCell>)}
              </TableRow></TableHead>
              <TableBody>
                {state.modules.map((m) => {
                  const r = rows[m.code] || {};
                  return (
                    <TableRow key={m.code}>
                      <TableCell sx={cell}>
                        {byCode[m.code] ? nameOf(byCode[m.code]) : m.code}{" "}
                        <Chip size="small" color={m.is_live ? "success" : "default"} label={m.is_live ? t("ui_k.mod.live") : t("ui_k.mod.expired")} />
                      </TableCell>
                      <TableCell sx={cell}>
                        <Switch checked={!!r.is_enabled} onChange={(e) => setRow(m.code, { is_enabled: e.target.checked })} slotProps={{ input: { "aria-label": m.code } }} />
                      </TableCell>
                      <TableCell sx={cell}>
                        <TextField size="small" type="datetime-local" value={toLocalInput(r.starts_at)}
                          onChange={(e) => setRow(m.code, { starts_at: fromLocalInput(e.target.value) })} slotProps={{ htmlInput: { dir: "ltr" } }} />
                      </TableCell>
                      <TableCell sx={cell}>
                        <TextField size="small" type="datetime-local" value={toLocalInput(r.expires_at)}
                          onChange={(e) => setRow(m.code, { expires_at: fromLocalInput(e.target.value) })} slotProps={{ htmlInput: { dir: "ltr" } }} />
                      </TableCell>
                      <TableCell sx={cell}>
                        <TextField size="small" type="number" value={r.price_override ?? ""} sx={{ width: 130 }}
                          onChange={(e) => setRow(m.code, { price_override: e.target.value === "" ? null : Number(e.target.value) })} slotProps={{ htmlInput: { min: 0, dir: "ltr" } }} />
                      </TableCell>
                      <TableCell sx={cell}>{m.price.toLocaleString()}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
          <Typography sx={{ fontWeight: 700, color: C.text, mb: 0.5 }}>{t("ui_k.mod.features_title")}</Typography>
          <Typography sx={{ color: C.sub, fontSize: 13, mb: 1.5 }}>{t("ui_k.mod.features_hint")}</Typography>
          <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: { xs: "1fr", md: "repeat(2, 1fr)" }, mb: 3 }}>
            {Object.entries(featureGroups).map(([mod, list]) => {
              const live = mod === "core" || state.modules.find((m) => m.code === mod)?.is_live;
              const keys = list.filter((f) => !f.locked).map((f) => f.key);
              return (
                <Box key={mod} sx={{ border: `1px solid ${C.glassBorder}`, borderRadius: "12px", p: 1.5, opacity: live ? 1 : 0.55 }}>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.5, flexWrap: "wrap" }}>
                    <Typography sx={{ fontWeight: 700, color: C.text }}>
                      {mod === "core" ? t("ui_k.mod.core") : (byCode[mod] ? nameOf(byCode[mod]) : mod)}
                    </Typography>
                    {!live && <Chip size="small" label={t("ui_k.mod.not_sold")} />}
                    <Box sx={{ marginInlineStart: "auto", display: "flex", gap: 0.5 }}>
                      <Button size="small" onClick={() => setGroup(keys, true)}>{t("ui_k.mod.all_on")}</Button>
                      <Button size="small" onClick={() => setGroup(keys, false)}>{t("ui_k.mod.all_off")}</Button>
                    </Box>
                  </Box>
                  {list.map((f) => (
                    <Box key={f.key} sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <Typography sx={{ color: C.text, fontSize: 14 }}>
                        {nameOf(f)} {f.locked && <Chip size="small" label={t("ui_k.mod.locked")} sx={{ ml: 0.5 }} />}
                      </Typography>
                      <Switch size="small" checked={f.locked || !disabled.includes(f.key)} disabled={f.locked}
                        onChange={(e) => toggleFeature(f.key, e.target.checked)}
                        slotProps={{ input: { "aria-label": f.key } }} />
                    </Box>
                  ))}
                </Box>
              );
            })}
          </Box>
          <Box sx={{ display: "flex", gap: 2, alignItems: "center", flexWrap: "wrap" }}>
            <FormControlLabel control={<Checkbox checked={auto} onChange={(e) => setAuto(e.target.checked)} />} label={t("ui_k.mod.auto_requires")} sx={{ color: C.text }} />
            <Button variant="contained" onClick={save}>{t("ui_k.mod.save")} <KbdHint>Ctrl+D</KbdHint></Button>
            <Typography sx={{ fontWeight: 800, color: C.text, marginInlineStart: "auto" }}>
              {t("ui_k.mod.total")}: {state.total_monthly.toLocaleString()}
            </Typography>
          </Box>
        </>
      )}
    </Box>
  );
}
