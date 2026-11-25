import { buildColors } from "@shared/palette";
// src/features/super_admin/common/superConfig.js

// ═══════════════════════════════════════
//  نویگیشن
// ═══════════════════════════════════════

export const NAV_SECTIONS = [
  {
    items: [
      { icon: "dashboard", labelKey: "super.nav.dashboard", path: "/bizsuite_admin" },
    ],
  },
  {
    items: [
      { icon: "club", labelKey: "super.nav.loyalty", path: "/dashboard/loyalty" },
      { icon: "users", labelKey: "super.nav.customer_list", path: "/dashboard/loyalty/customers" },
      { icon: "coupon", labelKey: "super.nav.coupons", path: "/dashboard/loyalty/coupons" },
      { icon: "gift", labelKey: "super.nav.rewards", path: "/dashboard/loyalty/rewards" },
    ],
  },
];

// ═══════════════════════════════════════
//  کدهای دسترسی + برچسب‌ها ★ هماهنگ با داشبورد
// ═══════════════════════════════════════

// cashier ACTION permissions (server: features.POS_ACTION_KEYS); they live in the POS section next to its tabs
export const POS_ACTIONS = [
  "pos_discount", "pos_price_edit", "pos_cancel_order", "pos_pay_cash", "pos_pay_card", "pos_past_days", "pos_close_day",
];

// Tab keys: exactly the server's feature keys (bizsuite/features.py FEATURES). The server rejects unknown keys.
export const PERM_GROUPS = {
  general: { labelKey: "ui_def.users.groups.general", codes: ["home"] },
  pos: { labelKey: "ui_def.users.groups.pos", codes: ["pos", "pos_report", "pos_settings", "orders", ...POS_ACTIONS] },
  inventory: {
    labelKey: "ui_def.users.groups.inventory",
    codes: [
      "inventory_invoice", "inventory_sales", "inventory_warehouse",
      "inventory_receiving", "inventory_purchase_list", "inventory_reports",
    ],
  },
  production: { labelKey: "ui_def.users.groups.production", codes: ["kitchen", "recipes", "dictionary_recipe"] },
  definitions: {
    labelKey: "ui_def.users.groups.definitions",
    codes: [
      "dictionary_menu", "dictionary_items", "dictionary_suppliers", "dictionary_warehouses",
      "dictionary_customers", "dictionary_users",
    ],
  },
  transport: {
    labelKey: "ui_dh.groups.transport",
    codes: ["delivery_dispatch", "delivery_shipments", "delivery_fleet", "delivery_cash", "delivery_history"],
  },
  more: { labelKey: "ui_dh.groups.more", codes: ["club", "accounting", "feedback"] },
};

// tabs every account has (the server keeps them on): shown ticked and locked
export const LOCKED_PERMS = ["home", "dictionary_users"];

export const ALL_PERM_CODES = Object.values(PERM_GROUPS).flatMap((g) => g.codes);

export const PERM_LABELS = Object.fromEntries(
  ALL_PERM_CODES.map((k) => [k, ["kitchen", "recipes"].includes(k) ? `ui_dh.tabs.${k}` : `ui_def.users.tabs.${k}`]),
);

// ═══════════════════════════════════════
//  رنگ‌ها
// ═══════════════════════════════════════

export const getSuperColors = (isDark) => buildColors(isDark);