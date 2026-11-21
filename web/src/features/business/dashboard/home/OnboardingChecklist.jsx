import { Box, Button, LinearProgress, Typography } from "@mui/material";
import CheckCircle from "@mui/icons-material/CheckCircle";
import RadioButtonUnchecked from "@mui/icons-material/RadioButtonUnchecked";
import { useTranslation } from "react-i18next";
import { useAppNavigate } from "./links";
import { useTerms } from "../terms";

// where each step is done ("wizard" opens the setup dialog)
const STEP_LINKS = {
  business_type: "wizard",
  profile: "wizard",
  logo: "dictionary?tab=users",
  staff: "dictionary?tab=users",
  products: "pos",
  items: "dictionary?tab=items",
  warehouse: "dictionary?tab=warehouses",
  customers: "dictionary?tab=customers",
  chart: "dashboard?tab=accounting",
  formula: "dictionary?tab=formulas",
  fleet: "delivery",
  club: "dashboard?tab=club",
};

/** Getting-started checklist (idea: Odoo onboarding banners / ERPNext setup checklist; steps come from the server). */
export default function OnboardingChecklist({ steps, C, canHide, onHide, onOpenWizard }) {
  const { t } = useTranslation();
  const term = useTerms();
  const go = useAppNavigate();
  if (!Array.isArray(steps) || !steps.length) return null;
  const done = steps.filter((s) => s.done).length;
  if (done === steps.length) return null;
  const words = { product: term("product"), customer: term("customer"), formula: term("formula") };

  return (
    <Box sx={{ mb: 3, p: { xs: 2, md: 2.5 }, borderRadius: "18px", background: C.glass, border: `1px solid ${C.glassBorder}` }}>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1, flexWrap: "wrap", mb: 1 }}>
        <Typography component="h2" sx={{ fontSize: 15, fontWeight: 800, color: C.text }}>{t("ui_dash2.checklist_title")}</Typography>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Typography sx={{ fontSize: 12, color: C.sub }}>
            {t("ui_dash2.checklist_progress", { done, total: steps.length })}
          </Typography>
          {canHide && <Button size="small" onClick={onHide} sx={{ textTransform: "none" }}>{t("ui_dash2.checklist_hide")}</Button>}
        </Box>
      </Box>
      <LinearProgress variant="determinate" value={(done * 100) / steps.length} sx={{ mb: 1.5, height: 6, borderRadius: 3 }} />
      <Box component="ul" sx={{ listStyle: "none", m: 0, p: 0, display: "grid", gap: 0.5, gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" } }}>
        {steps.map((s) => {
          const link = STEP_LINKS[s.key];
          const open = () => (link === "wizard" ? onOpenWizard?.() : link && go(link));
          return (
            <Box component="li" key={s.key}>
              <Button
                fullWidth onClick={open} disabled={s.done}
                startIcon={s.done ? <CheckCircle sx={{ color: "var(--success)" }} /> : <RadioButtonUnchecked />}
                sx={{
                  justifyContent: "flex-start", textTransform: "none", color: C.text, fontWeight: 600, py: 0.75,
                  textDecoration: s.done ? "line-through" : "none", "&.Mui-disabled": { color: C.muted },
                }}
              >
                {t(`ui_dash2.step.${s.key}`, words)}
              </Button>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
