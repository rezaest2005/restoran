import { useTranslation } from "react-i18next";
import { Box, Button, Chip, Typography } from "@mui/material";
import { PERIODS, formatMoney } from "@super/common/money";

/**
 * «قیمت نهایی»: one line that is ALWAYS visible (no period has to be picked first).
 *   «قیمت نهایی (ماهانه): ۱۲۰٬۰۰۰ تومان» + four small chips that only flip the DISPLAYED period (the subscription is untouched).
 * `permanent` (the admin picked «دائمی») shows «دائمی» instead of an amount. An empty price list shows
 * «قیمتی ثبت نشده» with a link-style button that opens the price editor.
 */
export default function PriceSummary({ quote, prices, period, onPeriod, permanent, onChangePrice, C, testId = "price-summary" }) {
  const { t, i18n } = useTranslation();
  const fa = i18n.language !== "en";
  const hasPrices = Object.values(prices || {}).some((per) => Object.values(per || {}).some((v) => v > 0));

  return (
    <Box
      data-testid={testId}
      sx={{ display: "flex", alignItems: "center", columnGap: 1.5, rowGap: 0.75, flexWrap: "wrap", minWidth: 0 }}
    >
      {permanent ? (
        <Typography data-testid="price-total" sx={{ fontSize: 14, fontWeight: 800, color: C.text }}>
          <Box component="span" sx={{ color: C.olive }}>{t("ui_c.super.sub.final_price")}: </Box>
          {t("ui_c.super.sub.unlimited")}
        </Typography>
      ) : !hasPrices ? (
        <>
          <Typography data-testid="price-total" sx={{ fontSize: 14, fontWeight: 800, color: C.text }}>
            <Box component="span" sx={{ color: C.olive }}>{t("ui_c.super.sub.final_price")}: </Box>
            {t("ui_c.super.sub.price_not_set")}
          </Typography>
          {onChangePrice && (
            <Button size="small" variant="text" onClick={onChangePrice} data-testid="price-set-link"
              sx={{ minHeight: 32, px: 0.5, fontWeight: 700, textDecoration: "underline", textTransform: "none" }}>
              {t("ui_c.super.sub.change_price")}
            </Button>
          )}
        </>
      ) : (
        <Typography data-testid="price-total" sx={{ fontSize: 14, fontWeight: 800, color: C.text, minWidth: 0 }}>
          <Box component="span" sx={{ color: C.olive }}>
            {`${t("ui_c.super.sub.final_price")} (${t(`ui_c.super.sub.${period}`)}): `}
          </Box>
          <Box component="span" sx={{ fontSize: 17 }}>
            {`${formatMoney(quote.totals[period], fa)} ${t("ui_c.super.sub.toman")}`}
          </Box>
        </Typography>
      )}
      {!permanent && (
        <Box role="group" aria-label={t("ui_c.super.sub.view_period")} sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
          {PERIODS.map((p) => (
            <Chip
              key={p} size="small" clickable label={t(`ui_c.super.sub.${p}`)} data-testid={`view-${p}`}
              color={p === period ? "primary" : "default"} variant={p === period ? "filled" : "outlined"}
              aria-pressed={p === period}
              onClick={() => onPeriod(p)}
              sx={{ fontWeight: 700, height: 28 }}
            />
          ))}
        </Box>
      )}
    </Box>
  );
}
