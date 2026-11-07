import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Autocomplete, Box, TextField, Typography } from "@mui/material";
import StorefrontEditor from "./StorefrontEditor";

const LAST_KEY = "super_sf_business";

const readLast = () => {
  try { return Number(sessionStorage.getItem(LAST_KEY)) || null; } catch { return null; }
};

/** Super admin: choose a business, then design its storefront. */
export default function StorefrontPanel({ tenants }) {
  const { t } = useTranslation();
  const businesses = useMemo(() => tenants.filter((x) => x.business_id), [tenants]);
  const [bid, setBid] = useState(readLast);

  const selected = businesses.find((b) => b.business_id === bid) || null;

  useEffect(() => {
    try { if (bid) sessionStorage.setItem(LAST_KEY, String(bid)); } catch { /* ignore */ }
  }, [bid]);

  return (
    <Box>
      <Autocomplete
        size="small" sx={{ maxWidth: 420, mb: 2 }}
        options={businesses} value={selected}
        getOptionLabel={(b) => `${b.name} (${b.slug})`}
        isOptionEqualToValue={(a, b) => a.business_id === b.business_id}
        noOptionsText={t("ui_sfa.no_business")}
        onChange={(_, v) => setBid(v ? v.business_id : null)}
        renderInput={(params) => <TextField {...params} label={t("ui_sfa.pick_business")} />}
      />
      {!selected && <Alert severity="info">{t("ui_sfa.pick_hint")}</Alert>}
      {selected && (
        <>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            {t("ui_sfa.designing_for", { name: selected.name })} — {t("ui_sfa.give_address")}
          </Typography>
          <StorefrontEditor key={selected.business_id} businessId={selected.business_id} />
        </>
      )}
    </Box>
  );
}
