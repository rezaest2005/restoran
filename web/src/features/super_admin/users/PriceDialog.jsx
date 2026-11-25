import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Box, Button, DialogActions, DialogContent, DialogTitle, Typography } from "@mui/material";
import { ResponsiveDialog } from "@shared/responsive";
import superClient from "@super/api/super_client";
import { PERM_GROUPS } from "@super/common/superConfig";
import { PERIODS } from "@super/common/money";
import MoneyField from "@super/common/MoneyField";

const SECTIONS = Object.keys(PERM_GROUPS).filter((g) => g !== "general");

/** Global price list editor: per section, a price (Toman) for each period. Confirm saves to the server, Cancel discards. */
export default function PriceDialog({ open, prices, onClose, C }) {
  return (
    <ResponsiveDialog
      open={open} onClose={() => onClose(null)} fullWidth maxWidth="md"
      slotProps={{ paper: { sx: { bgcolor: C.glass, border: `1px solid ${C.glassBorder}`, borderRadius: "16px" } } }}
    >
      {/* mounted only while open, so every opening starts from the saved prices */}
      <PriceForm prices={prices} onClose={onClose} C={C} />
    </ResponsiveDialog>
  );
}

function PriceForm({ prices, onClose, C }) {
  const { t, i18n } = useTranslation();
  const fa = i18n.language !== "en";
  const [draft, setDraft] = useState(() => JSON.parse(JSON.stringify(prices || {})));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const setPrice = (s, p) => (v) => setDraft((d) => ({ ...d, [s]: { ...(d[s] || {}), [p]: v } }));

  // one set of four prices that can be copied to every section at once
  const [all, setAll] = useState({});
  const applyAll = () => setDraft((d) => {
    const next = { ...d };
    SECTIONS.forEach((s) => { next[s] = { ...(d[s] || {}), ...Object.fromEntries(PERIODS.map((p) => [p, all[p] || 0])) }; });
    return next;
  });

  const confirm = async () => {
    setSaving(true);
    setError("");
    try {
      const r = await superClient.put("/api/super/section-prices/", { prices: draft });
      onClose(r.data.prices);
    } catch (e) {
      setError(e.response?.data?.error || t("ui_c.super.sub.err_price"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <DialogTitle sx={{ color: C.text, fontWeight: 800, fontSize: 15 }}>{t("ui_c.super.sub.price_title")}</DialogTitle>
      <DialogContent>
        {error && <Alert severity="error" sx={{ mb: 1.5 }}>{error}</Alert>}
        <Box data-testid="price-all" sx={{ border: `1px solid ${C.olive}`, bgcolor: C.oliveSubtle, borderRadius: "12px", p: 1.25, mb: 1.5 }}>
          <Typography sx={{ fontWeight: 800, color: C.text, fontSize: 14 }}>{t("ui_c.super.sub.all_sections")}</Typography>
          <Box sx={{ display: "grid", gap: 1.25, gridTemplateColumns: { xs: "1fr 1fr", md: "repeat(4, 1fr)" }, mb: 1.25 }}>
            {PERIODS.map((p) => (
              <MoneyField
                key={p} size="small" fa={fa} label={t(`ui_c.super.sub.${p}`)}
                value={all[p] || 0} onChange={(v) => setAll((a) => ({ ...a, [p]: v }))}
                sx={{ "& .MuiOutlinedInput-root": { bgcolor: C.inputBg, borderRadius: "10px" } }}
                slotProps={{ htmlInput: { "data-testid": `price-all-${p}` } }}
              />
            ))}
          </Box>
          <Button variant="outlined" onClick={applyAll} data-testid="price-apply-all" sx={{ minHeight: 40, fontWeight: 700 }}>
            {t("ui_c.super.sub.apply_all")}
          </Button>
        </Box>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
          {SECTIONS.map((s) => (
            <Box key={s} data-testid={`price-${s}`} sx={{ border: `1px solid ${C.glassBorder}`, borderRadius: "12px", p: 1.25 }}>
              <Typography sx={{ fontWeight: 800, color: C.text, fontSize: 14, mb: 1 }}>{t(PERM_GROUPS[s].labelKey)}</Typography>
              <Box sx={{ display: "grid", gap: 1.25, gridTemplateColumns: { xs: "1fr 1fr", md: "repeat(4, 1fr)" } }}>
                {PERIODS.map((p) => (
                  <MoneyField
                    key={p} size="small" fa={fa} label={t(`ui_c.super.sub.${p}`)}
                    value={draft[s]?.[p] || 0} onChange={setPrice(s, p)}
                    sx={{ "& .MuiOutlinedInput-root": { bgcolor: C.inputBg, borderRadius: "10px" } }}
                    slotProps={{ htmlInput: { "data-testid": `price-${s}-${p}` } }}
                  />
                ))}
              </Box>
            </Box>
          ))}
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={() => onClose(null)} sx={{ color: C.sub, minHeight: 40 }}>{t("ui_c.super.cancel")}</Button>
        <Button
          onClick={confirm} disabled={saving} data-testid="price-confirm"
          sx={{ bgcolor: C.btnGrad, color: "var(--on-primary)", fontWeight: 700, borderRadius: "10px", px: 3, minHeight: 40 }}
        >
          {t("ui_c.super.save")}
        </Button>
      </DialogActions>
    </>
  );
}
