import { useMemo } from "react";
import { Box, Typography, IconButton, Button, CircularProgress, Alert } from "@mui/material";
import { ChevronLeft, ChevronRight, Refresh, Print, Today } from "@mui/icons-material";
import { useTranslation } from "react-i18next";
import useShortcuts from "@shared/common/useShortcuts";
import { formatMoney, toPersianDigits } from "../common";
import useDaySummary from "../hooks/useDaySummary";
import { buildDaySummaryHtml, printHtml } from "../services/daySummaryPrint";
import { readBusinessName } from "../services/printService";

const FONT = "'Vazirmatn', sans-serif";

function Kpi({ label, value, unit, color, C }) {
  return (
    <Box sx={{
      flex: "1 1 150px", minWidth: 0, p: 1.5, borderRadius: "14px",
      border: `1px solid ${C.glassBorder}`, bgcolor: C.surface,
    }}>
      <Typography sx={{ fontSize: 12, color: C.sub, fontFamily: FONT }}>{label}</Typography>
      <Typography sx={{ fontSize: 20, fontWeight: 900, color, fontFamily: FONT, wordBreak: "break-word" }}>
        {value}
        {unit && (
          <Typography component="span" sx={{ fontSize: 11, color: C.muted, mx: 0.5, fontFamily: FONT }}>{unit}</Typography>
        )}
      </Typography>
    </Box>
  );
}

function Section({ title, C, children }) {
  return (
    <Box sx={{ p: 1.5, borderRadius: "14px", border: `1px solid ${C.glassBorder}`, bgcolor: C.surface, minWidth: 0 }}>
      <Typography sx={{ fontSize: 14, fontWeight: 800, mb: 1, color: C.text, fontFamily: FONT }}>{title}</Typography>
      {children}
    </Box>
  );
}

function TopList({ rows, field, isRtl, lang, C, money }) {
  const max = Math.max(1, ...rows.map((r) => r[field]));
  const num = (v) => (money ? formatMoney(v) : String(v));
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 0.8 }}>
      {rows.map((r, i) => (
        <Box key={`${r.food_id}-${i}`}>
          <Box sx={{ display: "flex", justifyContent: "space-between", gap: 1 }}>
            <Typography sx={{ fontSize: 13, color: C.text, fontFamily: FONT, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {i + 1}. {lang === "en" && r.name_en ? r.name_en : r.name}
            </Typography>
            <Typography sx={{ fontSize: 13, fontWeight: 800, color: C.primary, fontFamily: FONT, direction: "ltr", flexShrink: 0 }}>
              {isRtl ? toPersianDigits(num(r[field])) : num(r[field])}
            </Typography>
          </Box>
          <Box sx={{ height: 5, borderRadius: 3, bgcolor: C.primarySubtle }}>
            <Box sx={{ height: 5, borderRadius: 3, bgcolor: C.primary, width: `${(r[field] / max) * 100}%` }} />
          </Box>
        </Box>
      ))}
    </Box>
  );
}

/** End-of-day summary (from /api/pos/day-summary/) with a print button. */
export default function DaySummary({ date, isToday, onPrevDay, onNextDay, onGoToday, C, isRtl, lang }) {
  const { t } = useTranslation();
  const { summary: s, loading, error, reload } = useDaySummary(date);
  const dn = (v) => (isRtl ? toPersianDigits(formatMoney(v)) : formatMoney(v));

  useShortcuts([
    { combo: "Ctrl+Z", label: t("shortcuts.prev"), handler: () => onPrevDay?.() },
    { combo: "Ctrl+A", label: t("shortcuts.next"), handler: () => (isToday ? false : onNextDay?.()) },
  ]);

  const labels = useMemo(() => ({
    title: t("ui_pos2.summary.title"), date: t("ui_pos2.summary.date"),
    totalSales: t("ui_pos2.summary.total_sales"), orders: t("ui_pos2.summary.orders"),
    cancelled: t("ui_pos2.summary.cancelled"), average: t("ui_pos2.summary.average"),
    byMethod: t("ui_pos2.summary.by_method"),
    methods: { cash: t("ui_pos2.summary.cash"), card: t("ui_pos2.summary.card"), online: t("ui_pos2.summary.online") },
    topQty: t("ui_pos2.summary.top_qty"), topRevenue: t("ui_pos2.summary.top_revenue"),
    hourly: t("ui_pos2.summary.hourly"), product: t("ui_pos2.summary.product"),
    qty: t("ui_pos2.summary.qty"), revenue: t("ui_pos2.summary.revenue"),
    count: t("ui_pos2.summary.count"), hour: t("ui_pos2.summary.hour"),
    currency: t("ui_c.pos.toman"),
  }), [t]);

  const handlePrint = () => {
    if (!s) return;
    printHtml(buildDaySummaryHtml(s, labels, { isRtl, lang, businessName: readBusinessName() }));
  };

  const maxHour = Math.max(1, ...(s?.hourly || []).map((h) => h.count));
  const methodLabel = (m) => labels.methods[m] || m;
  const Prev = isRtl ? ChevronRight : ChevronLeft;
  const Next = isRtl ? ChevronLeft : ChevronRight;

  return (
    <Box dir={isRtl ? "rtl" : "ltr"} sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, flexWrap: "wrap" }}>
        <Typography sx={{ fontWeight: 800, fontSize: 16, color: C.text, fontFamily: FONT, flex: "1 1 auto" }}>
          {t("ui_pos2.summary.title")}
        </Typography>
        <IconButton size="small" onClick={onPrevDay} aria-label={t("shortcuts.prev")} sx={{ color: C.sub }}><Prev /></IconButton>
        <Typography sx={{ fontSize: 13, fontWeight: 700, color: C.text, fontFamily: FONT, direction: "ltr", minWidth: 86, textAlign: "center" }}>
          {date}
        </Typography>
        <IconButton size="small" onClick={onNextDay} disabled={isToday} aria-label={t("shortcuts.next")} sx={{ color: C.sub }}><Next /></IconButton>
        {!isToday && (
          <IconButton size="small" onClick={onGoToday} aria-label={t("ui_pos2.summary.today")} sx={{ color: C.primary }}><Today /></IconButton>
        )}
        <IconButton size="small" onClick={reload} aria-label={t("ui_pos2.summary.refresh")} sx={{ color: C.sub }}><Refresh /></IconButton>
        <Button
          size="small" variant="outlined" startIcon={<Print />} onClick={handlePrint} disabled={!s}
          sx={{ fontFamily: FONT, borderColor: C.glassBorder, color: C.primary }}
        >
          {t("ui_pos2.summary.print")}
        </Button>
      </Box>

      {loading && !s && (
        <Box sx={{ display: "flex", justifyContent: "center", py: 5 }}><CircularProgress sx={{ color: C.primary }} /></Box>
      )}
      {error && !s && <Alert severity="error">{t("ui_pos2.summary.load_error")}</Alert>}

      {s && (
        <>
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
            <Kpi C={C} color={C.success} label={t("ui_pos2.summary.total_sales")} value={dn(s.total_sales)} unit={t("ui_c.pos.toman")} />
            <Kpi C={C} color={C.primary} label={t("ui_pos2.summary.orders")} value={dn(s.order_count)} />
            <Kpi C={C} color={C.danger} label={t("ui_pos2.summary.cancelled")} value={dn(s.cancelled_count)} />
            <Kpi C={C} color={C.accent} label={t("ui_pos2.summary.average")} value={dn(s.average_ticket)} unit={t("ui_c.pos.toman")} />
          </Box>

          <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" } }}>
            <Section C={C} title={t("ui_pos2.summary.by_method")}>
              {s.payment_methods.map((m) => (
                <Box key={m.method} sx={{ display: "flex", justifyContent: "space-between", gap: 1, py: 0.6, borderBottom: `1px dashed ${C.divider}` }}>
                  <Typography sx={{ fontSize: 13, color: C.text, fontFamily: FONT }}>
                    {methodLabel(m.method)} ({dn(m.count)})
                  </Typography>
                  <Typography sx={{ fontSize: 13, fontWeight: 800, color: C.text, fontFamily: FONT, direction: "ltr" }}>
                    {dn(m.total)}
                  </Typography>
                </Box>
              ))}
            </Section>

            <Section C={C} title={t("ui_pos2.summary.hourly")}>
              <Box sx={{ display: "flex", alignItems: "flex-end", gap: "3px", height: 110, direction: "ltr" }}>
                {s.hourly.map((h) => (
                  <Box key={h.hour} title={`${h.hour}:00 — ${h.count}`} sx={{ flex: 1, display: "flex", alignItems: "flex-end", height: "100%" }}>
                    <Box sx={{
                      width: "100%", minHeight: h.count ? 3 : 1,
                      height: `${(h.count / maxHour) * 100}%`,
                      bgcolor: h.count ? C.primary : C.divider, borderRadius: "3px 3px 0 0",
                    }} />
                  </Box>
                ))}
              </Box>
              <Box sx={{ display: "flex", justifyContent: "space-between", direction: "ltr", mt: 0.5 }}>
                {[0, 6, 12, 18, 23].map((h) => (
                  <Typography key={h} sx={{ fontSize: 10, color: C.muted, fontFamily: FONT }}>{h}</Typography>
                ))}
              </Box>
            </Section>

            <Section C={C} title={t("ui_pos2.summary.top_qty")}>
              {s.top_by_quantity.length
                ? <TopList rows={s.top_by_quantity} field="qty" isRtl={isRtl} lang={lang} C={C} />
                : <Typography sx={{ color: C.muted, fontSize: 13, fontFamily: FONT }}>{t("ui_pos2.summary.empty")}</Typography>}
            </Section>
            <Section C={C} title={t("ui_pos2.summary.top_revenue")}>
              {s.top_by_revenue.length
                ? <TopList rows={s.top_by_revenue} field="revenue" isRtl={isRtl} lang={lang} C={C} money />
                : <Typography sx={{ color: C.muted, fontSize: 13, fontFamily: FONT }}>{t("ui_pos2.summary.empty")}</Typography>}
            </Section>
          </Box>
        </>
      )}
    </Box>
  );
}
