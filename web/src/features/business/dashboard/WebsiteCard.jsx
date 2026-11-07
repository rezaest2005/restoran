import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Box, Button, TextField, Typography } from "@mui/material";
import { useThemeMode } from "@shared/contexts/ThemeContext";
import { buildColors } from "@shared/palette";
import client from "../api/client";
import { moduleEnabled } from "./access";

function AddrRow({ label, value, C }) {
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
    <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: { xs: "wrap", sm: "nowrap" } }}>
      <TextField size="small" fullWidth label={label} value={full}
        slotProps={{ input: { readOnly: true }, htmlInput: { dir: "ltr" } }}
        sx={{
          "& .MuiInputBase-root": { bgcolor: C.inputBg, color: C.text },
          "& .MuiInputLabel-root": { color: C.sub },
          "& .MuiOutlinedInput-notchedOutline": { borderColor: C.glassBorder },
        }} />
      <Button variant="outlined" onClick={copy}
        sx={{ whiteSpace: "nowrap", minHeight: 40, color: C.primary, borderColor: C.glassBorder, textTransform: "none" }}>
        {copied ? t("ui_hub.site.copied") : t("ui_hub.site.copy")}
      </Button>
    </Box>
  );
}

/** Read-only card with the published website / QR menu addresses. Hidden unless published. */
export default function WebsiteCard() {
  const { t } = useTranslation();
  const { mode } = useThemeMode();
  const C = useMemo(() => buildColors(mode === "dark"), [mode]);
  const [info, setInfo] = useState(null);

  useEffect(() => {
    if (!moduleEnabled("storefront")) return undefined;
    let alive = true;
    client.get("/api/storefront/mine/summary/")
      .then((r) => { if (alive) setInfo(r.data?.data ?? r.data); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  if (!info || !info.is_published || !info.public_url) return null;

  return (
    <Box sx={{
      mb: 3, p: { xs: 1.5, sm: 2 }, bgcolor: C.glass, border: `1px solid ${C.glassBorder}`,
      borderRadius: 3, boxShadow: C.cardShadow,
    }}>
      <Typography sx={{ color: C.text, fontWeight: 800, fontSize: 15, mb: 1.5 }}>🌐 {t("ui_hub.site.title")}</Typography>
      <Box sx={{ display: "flex", flexDirection: "column", gap: 1.25 }}>
        <AddrRow label={t("ui_hub.site.public_url")} value={info.public_url} C={C} />
        {info.qr_menu_url && <AddrRow label={t("ui_hub.site.qr_url")} value={info.qr_menu_url} C={C} />}
      </Box>
    </Box>
  );
}
