import { useTranslation } from "react-i18next";
import { Box, Chip, Typography } from "@mui/material";
import { PERM_GROUPS } from "@super/common/superConfig";
import { PERIODS, formatMoney } from "@super/common/money";

/** The automatic price: total for the chosen period, a small breakdown per section, and the four periods side by side. */
export default function PriceSummary({ quote, prices, period, C }) {
  const { t, i18n } = useTranslation();
  const fa = i18n.language !== "en";
  const money = (n) => `${formatMoney(n, fa)} ${t("ui_c.super.sub.toman")}`;
  return (
    <Box data-testid="price-summary" sx={{ bgcolor: C.oliveSubtle, borderRadius: "12px", p: 1.5, minWidth: 0 }}>
      <Box sx={{ display: "flex", alignItems: "baseline", gap: 1, flexWrap: "wrap" }}>
        <Typography sx={{ fontSize: 13, fontWeight: 800, color: C.olive }}>{t("ui_c.super.sub.price")}</Typography>
        <Typography data-testid="price-total" sx={{ fontSize: 18, fontWeight: 800, color: C.text }}>
          {period ? money(quote.totals[period]) : "—"}
        </Typography>
        {period && <Typography sx={{ fontSize: 12, color: C.sub }}>({t(`ui_c.super.sub.${period}`)})</Typography>}
      </Box>
      {period && quote.sections.length > 0 && (
        <Box sx={{ mt: 0.75 }}>
          {quote.sections.map((s) => (
            <Box key={s} sx={{ display: "flex", justifyContent: "space-between", gap: 1, fontSize: 12.5, color: C.sub }}>
              <span>{t(PERM_GROUPS[s].labelKey)}</span>
              <span>{money(prices?.[s]?.[period] || 0)}</span>
            </Box>
          ))}
        </Box>
      )}
      {quote.sections.length === 0 && <Typography sx={{ fontSize: 12, color: C.sub, mt: 0.5 }}>{t("ui_c.super.sub.price_none")}</Typography>}
      <Typography sx={{ fontSize: 12, color: C.sub, mt: 1, mb: 0.5 }}>{t("ui_c.super.sub.per_period")}</Typography>
      <Box sx={{ display: "flex", gap: 0.75, flexWrap: "wrap" }}>
        {PERIODS.map((p) => (
          <Chip
            key={p} size="small" variant={p === period ? "filled" : "outlined"} color={p === period ? "primary" : "default"}
            label={`${t(`ui_c.super.sub.${p}`)}: ${formatMoney(quote.totals[p], fa)}`}
          />
        ))}
      </Box>
    </Box>
  );
}
