import { useEffect, useState } from "react";
import { Box, Typography, TextField, Button, Alert, CircularProgress } from "@mui/material";
import client from "../../api/client";
import { appUrl } from "@shared/basePath";

const unwrap = (r) => r.data?.data ?? r.data;
const readUser = () => { try { return JSON.parse(sessionStorage.getItem("user") || localStorage.getItem("user") || "{}"); } catch { return {}; } };

/**
 * The owner's own address name (slug): https://domain/<slug>/bizsuite_dashboard/login, https://domain/<slug>/bizsuite_driver/1 ...
 * Defaults to the name the platform gave the account; the owner may pick another one (the server checks it).
 */
export default function BusinessAddressCard({ ctx }) {
  const { t, C, S, notify } = ctx;
  const isOwner = ["owner"].includes(readUser().role) || readUser().is_superuser;
  const [current, setCurrent] = useState("");
  const [value, setValue] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    client.get("/api/business/slug/").then((r) => { const s = unwrap(r).slug; setCurrent(s); setValue(s); }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const changed = value.trim().toLowerCase() !== current;
  const preview = value.trim().toLowerCase() || current;

  const save = async () => {
    if (!window.confirm(t("ui_def.address.confirm", { slug: value.trim().toLowerCase() }))) return;
    setSaving(true); setError("");
    try {
      const r = await client.put("/api/business/slug/", { slug: value });
      const slug = unwrap(r).slug;
      // keep the signed-in session pointing at the new address
      const store = sessionStorage.getItem("user") ? sessionStorage : localStorage;
      store.setItem("user", JSON.stringify({ ...readUser(), business_slug: slug }));
      try { localStorage.setItem("tenant_slug", slug); } catch { /* ignore */ }
      notify(t("ui_def.address.saved"));
      window.location.assign(`/${slug}/bizsuite_dashboard/app/dictionary?tab=users`);
    } catch (e) {
      setError(e?.response?.data?.error || t("ui_def.address.save_failed"));
      setSaving(false);
    }
  };

  if (loading) return <CircularProgress size={20} />;
  return (
    <Box sx={{ ...S.card, mb: 2 }}>
      <Typography sx={{ fontWeight: 800, color: C.text, mb: 0.25 }}>{t("ui_def.address.title")}</Typography>
      <Typography sx={{ color: C.sub, fontSize: 13, mb: 1.5 }}>{t("ui_def.address.hint")}</Typography>
      <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", alignItems: "flex-start" }}>
        <TextField
          size="small" label="slug" value={value} disabled={!isOwner || saving} sx={{ ...S.field, minWidth: 240 }}
          onChange={(e) => setValue(e.target.value.replace(/\s/g, ""))} slotProps={{ htmlInput: { dir: "ltr", maxLength: 49 } }}
          helperText={isOwner ? t("ui_def.address.rule") : t("ui_def.address.owner_only")}
        />
        {isOwner && <Button sx={S.btn} disabled={!changed || saving || !value.trim()} onClick={save}>{t("ui_def.address.save")}</Button>}
      </Box>
      {error && <Alert severity="error" sx={{ mt: 1.5 }}>{error}</Alert>}
      <Box dir="ltr" sx={{ mt: 1.5, display: "grid", gap: 0.5, fontFamily: "var(--font-mono)", fontSize: 12.5, color: C.sub }}>
        <span>{appUrl(`/${preview}/bizsuite_dashboard/login`)}</span>
        <span>{appUrl(`/${preview}/bizsuite_driver/1`)}</span>
      </Box>
      <Typography sx={{ color: C.muted, fontSize: 12, mt: 1 }}>{t("ui_def.address.default_note")}</Typography>
    </Box>
  );
}
