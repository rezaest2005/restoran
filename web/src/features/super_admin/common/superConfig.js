import { buildColors } from "@shared/palette";
// src/features/super_admin/common/superConfig.js

// ═══════════════════════════════════════
//  نویگیشن
// ═══════════════════════════════════════

export const NAV_SECTIONS = [
  {
    titleKey: "super.nav.management",
    items: [
      { icon: "dashboard", labelKey: "super.nav.dashboard", path: "/bizsuite_admin" },
      { icon: "website", labelKey: "ui_sfa.nav", path: "/bizsuite_admin/app?tab=storefront" },
      { icon: "support", labelKey: "ui_sup.nav", path: "/bizsuite_admin/app?tab=support", badge: "support" },
    ],
  },
  {
    titleKey: "super.nav.business",
    items: [
      { icon: "home", labelKey: "super.nav.main_dashboard", path: "/dashboard" },
      { icon: "menubook", labelKey: "super.nav.dictionary", path: "/dashboard/dictionary" },
      { icon: "food", labelKey: "super.nav.food_menu", path: "/dashboard/foods" },
      { icon: "pos", labelKey: "super.nav.pos", path: "/dashboard/pos" },
      { icon: "list", labelKey: "super.nav.orders", path: "/dashboard/orders" },
    ],
  },
  {
    titleKey: "super.nav.warehouse",
    items: [
      { icon: "receipt", labelKey: "super.nav.purchase_invoice", path: "/dashboard/invoices/create" },
      { icon: "inventory", labelKey: "super.nav.raw_materials", path: "/dashboard/raw-materials" },
      { icon: "inventory", labelKey: "super.nav.semi_finished", path: "/dashboard/semi-finished" },
      { icon: "inventory", labelKey: "super.nav.ready_materials", path: "/dashboard/ready-materials" },
      { icon: "doc", labelKey: "super.nav.usage_log", path: "/dashboard/usage-log" },
      { icon: "list", labelKey: "super.nav.recipes", path: "/dashboard/recipes" },
      { icon: "kitchen", labelKey: "super.nav.kitchen", path: "/dashboard/kitchen" },
    ],
  },
  {
    titleKey: "super.nav.customers",
    items: [
      { icon: "club", labelKey: "super.nav.loyalty", path: "/dashboard/loyalty" },
      { icon: "users", labelKey: "super.nav.customer_list", path: "/dashboard/loyalty/customers" },
      { icon: "coupon", labelKey: "super.nav.coupons", path: "/dashboard/loyalty/coupons" },
      { icon: "gift", labelKey: "super.nav.rewards", path: "/dashboard/loyalty/rewards" },
    ],
  },
];

// ═══════════════════════════════════════
//  نقش‌ها
// ═══════════════════════════════════════

export const ROLE_OPTIONS = [
  { value: "owner", labelKey: "super.role.owner" },
  { value: "manager", labelKey: "super.role.manager" },
  { value: "cashier", labelKey: "super.role.cashier" },
  { value: "kitchen", labelKey: "super.role.kitchen" },
  { value: "warehouse", labelKey: "super.role.warehouse" },
  { value: "customer", labelKey: "super.role.customer" },
  { value: "other", labelKey: "ui_c.super.role_other" },
];

// ═══════════════════════════════════════
//  کدهای دسترسی + برچسب‌ها ★ هماهنگ با داشبورد
// ═══════════════════════════════════════

// Tab keys: exactly the server's feature keys (bizsuite/features.py FEATURES). The server rejects unknown keys.
export const PERM_GROUPS = {
  general: { labelKey: "ui_def.users.groups.general", codes: ["home", "activity"] },
  pos: { labelKey: "ui_def.users.groups.pos", codes: ["pos", "pos_report", "pos_settings", "orders"] },
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

export const ALL_PERM_CODES = Object.values(PERM_GROUPS).flatMap((g) => g.codes);

export const PERM_LABELS = Object.fromEntries(
  ALL_PERM_CODES.map((k) => [k, ["kitchen", "recipes"].includes(k) ? `ui_dh.tabs.${k}` : `ui_def.users.tabs.${k}`]),
);

// ═══════════════════════════════════════
//  پریست دسترسی‌ها per-role ★
// ═══════════════════════════════════════

export const ROLE_PERM_PRESETS = {
  owner: {
    labelKey: "ui_c.super.preset.owner.label",
    descKey: "ui_c.super.preset.owner.desc",
    perms: [...ALL_PERM_CODES],
  },
  manager: {
    labelKey: "ui_c.super.preset.manager.label",
    descKey: "ui_c.super.preset.manager.desc",
    perms: [...ALL_PERM_CODES],
  },
  cashier: {
    labelKey: "ui_c.super.preset.cashier.label",
    descKey: "ui_c.super.preset.cashier.desc",
    perms: [
      "home",
      "pos", "pos_report", "orders",
      "dictionary_menu", "dictionary_customers",
    ],
  },
  kitchen: {
    labelKey: "ui_c.super.preset.kitchen.label",
    descKey: "ui_c.super.preset.kitchen.desc",
    perms: [
      "home",
      "kitchen", "recipes", "dictionary_recipe",
      "orders",
    ],
  },
  warehouse: {
    labelKey: "ui_c.super.preset.warehouse.label",
    descKey: "ui_c.super.preset.warehouse.desc",
    perms: [
      "home",
      "inventory_invoice", "inventory_sales", "inventory_warehouse",
      "inventory_receiving", "inventory_purchase_list", "inventory_reports",
      "dictionary_items", "dictionary_suppliers", "dictionary_warehouses",
    ],
  },
  customer: {
    labelKey: "ui_c.super.preset.customer.label",
    descKey: "ui_c.super.preset.customer.desc",
    perms: ["home", "dictionary_menu"],
  },
  other: {
    labelKey: "ui_c.super.preset.other.label",
    descKey: "ui_c.super.preset.other.desc",
    perms: [],
  },
};

// ═══════════════════════════════════════
//  رنگ‌ها
// ═══════════════════════════════════════

export const getSuperColors = (isDark) => buildColors(isDark);