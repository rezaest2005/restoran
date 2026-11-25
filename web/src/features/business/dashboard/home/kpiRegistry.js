import PointOfSale from "@mui/icons-material/PointOfSale";
import TrendingUp from "@mui/icons-material/TrendingUp";
import RequestQuote from "@mui/icons-material/RequestQuote";
import AccountBalanceWallet from "@mui/icons-material/AccountBalanceWallet";
import LocalShipping from "@mui/icons-material/LocalShipping";
import Stars from "@mui/icons-material/Stars";
import Inventory2 from "@mui/icons-material/Inventory2";
import Factory from "@mui/icons-material/Factory";

/**
 * Declarative KPI widget library (pattern adapted from InvenTree's dashboard widget library, MIT — see
 * THIRD_PARTY_NOTICES.md): each widget names the payload block it needs; a widget whose block is absent
 * (module not bought / tab not granted) is never rendered, so no empty or restaurant-only card can appear.
 * Order comes from the server (`summary.widgets`, chosen by the business type preset).
 */
export const KPI_WIDGETS = [
  {
    key: "sales", block: "sales", icon: TrendingUp, color: "var(--primary)",
    value: (d) => d.sales.today,
    sub: (d, t, f) => t("ui_dash2.w.sales_sub", { count: f(d.sales.today_count) }),
    path: (d) => (d.pos ? "pos" : "inventory"),
  },
  {
    key: "pos", block: "pos", icon: PointOfSale, color: "var(--info)",
    value: (d) => d.pos.today_sales,
    sub: (d, t, f) => t("ui_dash2.w.pos_sub", { count: f(d.pos.today_count), open: f(d.pos.open_orders) }),
    path: () => "pos",
  },
  {
    key: "receivables", block: "receivables", icon: RequestQuote, color: "var(--warning)",
    value: (d) => d.receivables.total,
    sub: (d, t, f) => (d.receivables.source === "ledger" ? "" : t("ui_dash2.w.receivables_sub_inv", { count: f(d.receivables.unpaid_count) })),
    path: (d) => (d.accounting ? "dashboard?tab=accounting" : "inventory"),
  },
  {
    key: "cash", block: "accounting", icon: AccountBalanceWallet, color: "var(--success)",
    value: (d) => d.accounting.cash + d.accounting.bank,
    sub: (d, t, f) => t("ui_dash2.w.cash_sub", { cash: f(d.accounting.cash), bank: f(d.accounting.bank) }),
    path: () => "dashboard?tab=accounting",
  },
  {
    key: "deliveries", block: "deliveries", icon: LocalShipping, color: "var(--chart-4)",
    value: (d) => d.deliveries.trips_active,
    sub: (d, t, f) => t("ui_dash2.w.deliveries_sub", { done: f(d.deliveries.delivered_today), pending: f(d.deliveries.pending_stops) }),
    path: () => "delivery",
  },
  {
    key: "club", block: "club", icon: Stars, color: "var(--accent, var(--warning))",
    value: (d) => d.club.members,
    sub: (d, t, f) => t("ui_dash2.w.club_sub", { new: f(d.club.new_this_month) }),
    path: () => "dashboard?tab=club",
  },
  {
    key: "inventory", block: "inventory", icon: Inventory2, color: "var(--success)",
    value: (d) => d.inventory.stock_value,
    sub: (d, t, f) => t("ui_dash2.w.inventory_sub", { low: f(d.inventory.low_stock_count) }),
    path: () => "inventory",
  },
  {
    key: "production", block: "production", icon: Factory, color: "var(--danger)",
    value: (d) => d.production.in_progress,
    sub: (d, t, f) => t("ui_dash2.w.production_sub", { planned: f(d.production.planned), done: f(d.production.completed_today) }),
    path: () => "production",
  },
];

const BY_KEY = Object.fromEntries(KPI_WIDGETS.map((w) => [w.key, w]));

/** Widgets to draw, in server order, only when their data block is present. */
export function visibleWidgets(summary) {
  const data = summary?.data || {};
  const order = Array.isArray(summary?.widgets) && summary.widgets.length ? summary.widgets : KPI_WIDGETS.map((w) => w.key);
  return order.map((k) => BY_KEY[k]).filter((w) => w && data[w.block]);
}
