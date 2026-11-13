import { useState, useEffect, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Box, Typography, Chip, TextField, MenuItem, Button, Alert, CircularProgress } from "@mui/material";
import { useThemeMode } from "@shared/contexts/ThemeContext";
import { useLang } from "@shared/contexts/LangContext";
import { buildColors } from "@shared/palette";
import { useStyles } from "@business/accounting/common";
import client from "../api/client";

const unwrap = (r) => r.data?.data ?? r.data;
const clean = (p) => Object.fromEntries(Object.entries(p).filter(([, v]) => v !== "" && v != null));
const fmt = (iso, lang) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString(lang === "fa" ? "fa-IR" : "en-GB", { dateStyle: "short", timeStyle: "medium" });
};

export default function ActivityPage() {
  const { t } = useTranslation();
  const { mode } = useThemeMode();
  const { isRtl, lang } = useLang();
  const C = useMemo(() => buildColors(mode === "dark"), [mode]);
  const S = useStyles(C);
  const [meta, setMeta] = useState({ categories: [], people: [], drivers: [] });
  const [f, setF] = useState({ category: "", actor_id: "", driver_id: "", q: "", from: "", to: "" });
  const [rows, setRows] = useState([]);
  const [more, setMore] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(null);

  const load = useCallback((before) => {
    setBusy(true);
    setError("");
    client.get("/api/activity/", { params: clean({ ...f, before_id: before }) }).then(unwrap).then((d) => {
      setRows((r) => (before ? [...r, ...d.results] : d.results));
      setMore(d.has_more ? d.next_before_id : null);
    }).catch(() => setError(t("ui_act.load_failed"))).finally(() => setBusy(false));
  }, [f, t]);

  useEffect(() => { client.get("/api/activity/meta/").then(unwrap).then(setMeta).catch(() => {}); }, []);
  useEffect(() => { const h = setTimeout(() => load(null), 250); return () => clearTimeout(h); }, [load]);

  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  return (
    <Box dir={isRtl ? "rtl" : "ltr"} sx={{ p: { xs: 1, sm: 2 }, maxWidth: 1100, mx: "auto" }}>
      <Typography sx={{ color: C.text, fontWeight: 800, fontSize: { xs: 18, sm: 22 } }}>{t("ui_act.title")}</Typography>
      <Typography sx={{ color: C.sub, fontSize: 13, mb: 2 }}>{t("ui_act.subtitle")}</Typography>

      <Box sx={{ display: "flex", gap: 0.75, flexWrap: "wrap", mb: 1.5 }}>
        <Chip label={t("ui_act.all")} onClick={() => setF((s) => ({ ...s, category: "" }))} color={f.category ? "default" : "primary"} />
        {meta.categories.map((c) => (
          <Chip key={c.key} label={c.label} onClick={() => setF((s) => ({ ...s, category: c.key }))} color={f.category === c.key ? "primary" : "default"} />
        ))}
      </Box>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr", md: "repeat(5, 1fr)" }, gap: 1, mb: 2 }}>
        <TextField size="small" label={t("ui_act.search")} value={f.q} onChange={set("q")} sx={{ ...S.field, gridColumn: { xs: "1 / -1", md: "auto" } }} />
        <TextField size="small" select label={t("ui_act.person")} value={f.actor_id} onChange={set("actor_id")} sx={S.field}>
          <MenuItem value="">{t("ui_act.all")}</MenuItem>
          {meta.people.filter((p) => p.id).map((p) => <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>)}
        </TextField>
        <TextField size="small" select label={t("ui_act.courier")} value={f.driver_id} onChange={set("driver_id")} sx={S.field}>
          <MenuItem value="">{t("ui_act.all")}</MenuItem>
          {meta.drivers.map((d) => <MenuItem key={d.id} value={d.id}>{d.number ? `${d.number} — ` : ""}{d.name}</MenuItem>)}
        </TextField>
        <TextField size="small" type="date" label={t("ui_act.from")} value={f.from} onChange={set("from")} sx={S.field} InputLabelProps={{ shrink: true }} />
        <TextField size="small" type="date" label={t("ui_act.to")} value={f.to} onChange={set("to")} sx={S.field} InputLabelProps={{ shrink: true }} />
      </Box>

      {error && <Alert severity="error" sx={{ mb: 1 }}>{error}</Alert>}
      {!busy && !rows.length && !error && <Alert severity="info">{t("ui_act.empty")}</Alert>}

      <Box sx={{ display: "grid", gap: 0.75 }}>
        {rows.map((r) => (
          <Box key={r.id} onClick={() => setOpen(open === r.id ? null : r.id)}
            sx={{ bgcolor: C.surface, border: `1px solid ${C.divider}`, borderRadius: 2, p: 1.25, cursor: "pointer" }}>
            <Box sx={{ display: "flex", justifyContent: "space-between", gap: 1, flexWrap: "wrap" }}>
              <Typography sx={{ color: C.text, fontSize: 14, fontWeight: 600 }}>{r.summary}</Typography>
              <Typography sx={{ color: C.muted, fontSize: 12 }}>{fmt(r.at, lang)}</Typography>
            </Box>
            <Typography sx={{ color: C.sub, fontSize: 12 }}>
              {r.actor || t("ui_act.system")}{r.actor_role ? ` (${r.actor_role})` : ""} · {r.action}
            </Typography>
            {open === r.id && (
              <Box component="pre" dir="ltr" sx={{ m: 0, mt: 1, p: 1, bgcolor: C.inputBg, borderRadius: 1, fontSize: 11, color: C.sub, overflow: "auto", whiteSpace: "pre-wrap" }}>
                {JSON.stringify({ ...r.details, ip: r.ip || undefined }, null, 2)}
              </Box>
            )}
          </Box>
        ))}
      </Box>
      <Box sx={{ textAlign: "center", mt: 2 }}>
        {busy && <CircularProgress size={22} />}
        {more && !busy && <Button sx={S.ghost} variant="outlined" onClick={() => load(more)}>{t("ui_act.more")}</Button>}
      </Box>
    </Box>
  );
}
