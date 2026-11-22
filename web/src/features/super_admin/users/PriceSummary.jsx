import { useTranslation } from "react-i18next";
import { Box, Typography } from "@mui/material";
import { formatMoney } from "@super/common/money";

/** One line under the subscription buttons: the automatic price for the chosen period. Hidden until a period is chosen. */
export default function PriceSummary({ quote, period, C }) {
  const { t, i18n } = useTranslation();
  const fa = i18n.language !== "en";
  if (!period) return null;
  return (
    <Box data-testid="price-summary" sx={{ display: "flex", alignItems: "baseline", gap: 1, flexWrap: "wrap", minWidth: 0 }}>
      <Typography sx={{ fontSize: 13, fontWeight: 800, color: C.olive }}>{t("ui_c.super.sub.price")}</Typography>
      <Typography data-testid="price-total" sx={{ fontSize: 17, fontWeight: 800, color: C.text }}>
        {`${formatMoney(quote.totals[period], fa)} ${t("ui_c.super.sub.toman")}`}
      </Typography>
      <Typography sx={{ fontSize: 12, color: C.sub }}>({t(`ui_c.super.sub.${period}`)})</Typography>
    </Box>
  );
}
