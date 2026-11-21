import { Alert, Box, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";
import { useAppNavigate } from "./links";

const SEVERITY = { error: "error", warning: "warning", info: "info" };
const LINKS = {
  low_stock: "inventory",
  unpaid_invoices: "inventory",
  late_deliveries: "delivery",
  failed_deliveries: "delivery",
  negative_cash: "dashboard?tab=accounting",
};

function message(a, t, fmt) {
  switch (a.key) {
    case "subscription":
      return a.days_left > 0 ? t("ui_dash2.alert.subscription", { days: fmt(a.days_left) }) : t("ui_dash2.alert.subscription_today");
    case "low_stock":
      return t("ui_dash2.alert.low_stock", { count: fmt(a.count), items: (a.items || []).join("، ") });
    case "unpaid_invoices": {
      const base = t("ui_dash2.alert.unpaid_invoices", { count: fmt(a.count), total: fmt(a.total) });
      return a.overdue ? `${base} · ${t("ui_dash2.alert.unpaid_overdue", { overdue: fmt(a.overdue) })}` : base;
    }
    case "late_deliveries":
      return t("ui_dash2.alert.late_deliveries", { count: fmt(a.count) });
    case "failed_deliveries":
      return t("ui_dash2.alert.failed_deliveries", { count: fmt(a.count) });
    case "negative_cash":
      return t("ui_dash2.alert.negative_cash", { total: fmt(a.total) });
    default:
      return null;
  }
}

/** Alerts from the summary (only for modules the business has; unknown keys are skipped). */
export default function AlertsPanel({ alerts, C, fmt }) {
  const { t } = useTranslation();
  const go = useAppNavigate();
  const items = (alerts || []).map((a) => ({ a, text: message(a, t, fmt) })).filter((x) => x.text);
  if (!items.length) return null;
  return (
    <Box sx={{ mb: 3 }} aria-live="polite">
      <Typography component="h2" sx={{ fontSize: 15, fontWeight: 800, color: C.text, mb: 1 }}>{t("ui_dash2.alerts_title")}</Typography>
      <Box sx={{ display: "grid", gap: 1, gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" } }}>
        {items.map(({ a, text }) => (
          <Alert
            key={a.key} severity={SEVERITY[a.level] || "info"} variant="outlined"
            onClick={LINKS[a.key] ? () => go(LINKS[a.key]) : undefined}
            sx={{ borderRadius: 2, cursor: LINKS[a.key] ? "pointer" : "default", bgcolor: C.glass, alignItems: "center" }}
          >
            {text}
          </Alert>
        ))}
      </Box>
    </Box>
  );
}
