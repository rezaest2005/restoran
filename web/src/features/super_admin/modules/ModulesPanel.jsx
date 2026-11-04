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
  const planRef = useRef(null);

  const nameOf = useCallback((m) => (fa ? m.name_fa : m.name_en), [fa]);
  const byCode = useMemo(() => Object.fromEntries(catalog.map((m) => [m.code, m])), [catalog]);

  useEffect(() => {
    Promise.all([superClient.get("/api/super/modules/"), superClient.get("/api/super/plans/")])
      .then(([m, p]) => { setCatalog(unwrap(m)); setPlans(unwrap(p)); })
      .catch(() => {});
  }, []);

  const adopt = useCallback((s) => {
    setState(s);
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
      const r = await superClient.put(`/api/super/businesses/${bid}/modules/`, { modules: rows, auto_requires: auto });
      adopt(unwrap(r));
      setMsg({ type: "success", text: t("ui_k.mod.saved") });
    } catch (e) {
      setMsg({ type: "error", text: describe(e) });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bid, rows, auto, adopt, t, byCode]);

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
                  <TextField size="small" type="number" defaultValue={m.price_monthly} inputProps={{ min: 0, dir: "ltr" }}
                    sx={{ width: 140 }} onBlur={(e) => Number(e.target.value) !== m.price_monthly && savePrice(m.code, e.target.value)} />
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
                        <Switch checked={!!r.is_enabled} onChange={(e) => setRow(m.code, { is_enabled: e.target.checked })}
                          inputProps={{ "aria-label": m.code }} />
                      </TableCell>
                      <TableCell sx={cell}>
                        <TextField size="small" type="datetime-local" value={toLocalInput(r.starts_at)} inputProps={{ dir: "ltr" }}
                          onChange={(e) => setRow(m.code, { starts_at: fromLocalInput(e.target.value) })} />
                      </TableCell>
                      <TableCell sx={cell}>
                        <TextField size="small" type="datetime-local" value={toLocalInput(r.expires_at)} inputProps={{ dir: "ltr" }}
                          onChange={(e) => setRow(m.code, { expires_at: fromLocalInput(e.target.value) })} />
                      </TableCell>
                      <TableCell sx={cell}>
                        <TextField size="small" type="number" value={r.price_override ?? ""} inputProps={{ min: 0, dir: "ltr" }} sx={{ width: 130 }}
                          onChange={(e) => setRow(m.code, { price_override: e.target.value === "" ? null : Number(e.target.value) })} />
                      </TableCell>
                      <TableCell sx={cell}>{m.price.toLocaleString()}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
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
