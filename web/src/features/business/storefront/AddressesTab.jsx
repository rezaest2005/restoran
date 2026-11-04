import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Box, Button, Stack, TextField, Typography } from "@mui/material";
import KbdHint from "@business/pos/common/KbdHint";
import { saveMine, errMsg } from "./api";

function AddrRow({ label, value }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const full = value.startsWith("/") ? window.location.origin + value : value;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(full);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard unavailable */ }
  };
  return (
    <Stack direction="row" spacing={1} alignItems="center">
      <TextField size="small" fullWidth label={label} value={full} InputProps={{ readOnly: true }} inputProps={{ dir: "ltr" }} />
      <Button onClick={copy} variant="outlined" sx={{ whiteSpace: "nowrap" }}>
        {copied ? t("ui_k.addr.copied") : t("ui_k.addr.copy")}
      </Button>
    </Stack>
  );
}

function currentRole() {
  try {
    const raw = sessionStorage.getItem("user") || localStorage.getItem("user");
    return JSON.parse(raw || "{}")?.role || "";
  } catch {
    return "";
  }
}

export default function AddressesTab({ addresses, onReload, onToast }) {
  const { t } = useTranslation();
  const isOwner = currentRole() === "owner";
  const [domain, setDomain] = useState(addresses.custom_domain || "");
  const [err, setErr] = useState("");

  const saveDomain = async () => {
    setErr("");
    try {
      await saveMine({ custom_domain: domain.trim() });
      onToast(t("ui_k.addr.domain_saved"), "success");
      onReload();
    } catch (e) {
      setErr(errMsg(e, t("ui_k.error")));
    }
  };

  return (
    <Stack spacing={2.5} sx={{ maxWidth: 640 }}>
      <AddrRow label={t("ui_k.addr.public_url")} value={addresses.public_url} />
      <AddrRow label={t("ui_k.addr.dashboard_url")} value={addresses.dashboard_url} />
      <AddrRow label={t("ui_k.addr.qr_order_url")} value={addresses.qr_order_url} />
      <Box>
        <TextField size="small" fullWidth label={t("ui_k.addr.custom_domain")} value={domain} disabled={!isOwner}
          inputProps={{ dir: "ltr" }} placeholder="shop.example.com" onChange={(e) => setDomain(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && isOwner) { e.preventDefault(); saveDomain(); } }}
          helperText={isOwner ? t("ui_k.addr.custom_domain_hint") : t("ui_k.addr.owner_only")} />
        {err && <Alert severity="error" sx={{ mt: 1 }}>{err}</Alert>}
        {isOwner && (
          <Button sx={{ mt: 1 }} variant="contained" onClick={saveDomain}>
            {t("ui_k.addr.save_domain")} <KbdHint>Enter</KbdHint>
          </Button>
        )}
      </Box>
      {addresses.custom_domain_url && <AddrRow label={t("ui_k.addr.custom_domain")} value={addresses.custom_domain_url} />}
      <Typography variant="caption" color="text.secondary">{t("ui_k.addr.slug")}: {addresses.public_url.split("/s/")[1]}</Typography>
    </Stack>
  );
}
