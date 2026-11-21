import { Box, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";
import PointOfSale from "@mui/icons-material/PointOfSale";
import ReceiptLong from "@mui/icons-material/ReceiptLong";
import ShoppingCart from "@mui/icons-material/ShoppingCart";
import Inventory2 from "@mui/icons-material/Inventory2";
import LocalShipping from "@mui/icons-material/LocalShipping";
import Stars from "@mui/icons-material/Stars";
import AccountBalance from "@mui/icons-material/AccountBalance";
import Factory from "@mui/icons-material/Factory";
import Group from "@mui/icons-material/Group";
import People from "@mui/icons-material/People";
import History from "@mui/icons-material/History";
import { moduleEnabled, hasTab } from "../access";
import { useAppNavigate } from "./links";
import { useTerms } from "../terms";

/**
 * Quick actions — each needs a module (any-of) AND a permission tab, the same rules as the sidebar.
 * `widget` ties the action to a KPI widget so the business type's widget order also orders the actions.
 */
const ACTIONS = [
  { key: "pos", icon: PointOfSale, mods: ["pos"], tab: "pos", path: "pos", widget: "pos" },
  { key: "sales_invoice", icon: ReceiptLong, mods: ["inventory"], tab: "inventory_sales", path: "inventory", widget: "sales" },
  { key: "purchase", icon: ShoppingCart, mods: ["inventory"], tab: "inventory_invoice", path: "inventory", widget: "inventory" },
  { key: "stock", icon: Inventory2, mods: ["inventory"], tab: "inventory_warehouse", path: "inventory", widget: "inventory" },
  { key: "production", icon: Factory, mods: ["production"], tab: "kitchen", path: "production", widget: "production" },
  { key: "dispatch", icon: LocalShipping, mods: ["delivery"], tab: "delivery_dispatch", path: "delivery", widget: "deliveries" },
  { key: "accounting", icon: AccountBalance, mods: ["accounting"], tab: "accounting", path: "dashboard?tab=accounting", widget: "cash" },
  { key: "club", icon: Stars, mods: ["club"], tab: "club", path: "dashboard?tab=club", widget: "club" },
  { key: "customers", icon: People, mods: ["pos", "inventory", "accounting"], tab: "dictionary_customers", path: "dictionary?tab=customers", widget: "receivables" },
  { key: "users", icon: Group, mods: null, tab: "dictionary_users", path: "dictionary?tab=users" },
  { key: "activity", icon: History, mods: null, tab: "activity", path: "activity" },
];

function availableActions(widgetOrder = [], usedModules = null) {
  const rank = (a) => {
    const i = widgetOrder.indexOf(a.widget);
    return i === -1 ? 99 : i;
  };
  const inUse = (m) => moduleEnabled(m) && (!usedModules || usedModules.includes(m));
  return ACTIONS
    .filter((a) => (!a.mods || a.mods.some(inUse)) && hasTab(a.tab))
    .sort((a, b) => rank(a) - rank(b));
}

export default function QuickActions({ summary, C }) {
  const { t } = useTranslation();
  const term = useTerms();
  const go = useAppNavigate();
  const actions = availableActions(summary?.widgets || [], summary?.modules || null);
  if (!actions.length) return null;
  const words = { products: term("products"), customers: term("customers") };
  return (
    <Box sx={{ mb: 3 }}>
      <Typography component="h2" sx={{ fontSize: 15, fontWeight: 800, color: C.text, mb: 1 }}>{t("ui_dash2.qa_title")}</Typography>
      <Box sx={{ display: "grid", gap: 1, gridTemplateColumns: { xs: "repeat(2, minmax(0, 1fr))", sm: "repeat(3, minmax(0, 1fr))", lg: "repeat(6, minmax(0, 1fr))" } }}>
        {actions.map((a) => {
          const Icon = a.icon;
          return (
            <Box
              key={a.key} component="button" type="button" onClick={() => go(a.path)}
              sx={{
                display: "flex", alignItems: "center", gap: 1, p: 1.25, borderRadius: "14px", cursor: "pointer",
                background: C.glass, border: `1px solid ${C.glassBorder}`, color: C.text, font: "inherit",
                fontSize: 13, fontWeight: 700, textAlign: "start", minWidth: 0,
                "&:hover": { borderColor: C.primary },
                "&:focus-visible": { outline: `2px solid ${C.primary}`, outlineOffset: 2 },
              }}
            >
              <Icon fontSize="small" sx={{ color: C.primary, flexShrink: 0 }} />
              <Box component="span" sx={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {t(`ui_dash2.qa.${a.key}`, words)}
              </Box>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
