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

export const ALL_PERM_CODES = [
  // داشبورد
  "home",
  // انبار
  "inventory_invoice", "inventory_sales", "inventory_warehouse",
  "inventory_receiving", "inventory_purchase_list", "inventory_reports",
  // تعاریف
  "dictionary", "dictionary_menu", "dictionary_suppliers",
  "dictionary_warehouses", "dictionary_customers",
  "dictionary_managers", "dictionary_recipes",
  // صندوق
  "pos", "pos_report", "pos_settings", "orders",
];

export const PERM_LABELS = {
  // داشبورد
  home: "ui_c.super.perm.home",
  // انبار
  inventory_invoice: "ui_c.super.perm.inventory_invoice",
  inventory_sales: "ui_c.super.perm.inventory_sales",
  inventory_warehouse: "ui_c.super.perm.inventory_warehouse",
  inventory_receiving: "ui_c.super.perm.inventory_receiving",
  inventory_purchase_list: "ui_c.super.perm.inventory_purchase_list",
  inventory_reports: "ui_c.super.perm.inventory_reports",
  // تعاریف
  dictionary: "ui_c.super.perm.dictionary",
  dictionary_menu: "ui_c.super.perm.dictionary_menu",
  dictionary_suppliers: "ui_c.super.perm.dictionary_suppliers",
  dictionary_warehouses: "ui_c.super.perm.dictionary_warehouses",
  dictionary_customers: "ui_c.super.perm.dictionary_customers",
  dictionary_managers: "ui_c.super.perm.dictionary_managers",
  dictionary_recipes: "ui_c.super.perm.dictionary_recipes",
  // صندوق
  pos: "ui_c.super.perm.pos",
  pos_report: "ui_c.super.perm.pos_report",
  pos_settings: "ui_c.super.perm.pos_settings",
  orders: "ui_c.super.perm.orders",
};

// ═══════════════════════════════════════
//  گروه‌بندی دسترسی‌ها ★ هماهنگ با ۳ بخش داشبورد
// ═══════════════════════════════════════

export const PERM_GROUPS = {
  home: {
    labelKey: "ui_c.super.group.home",
    icon: "home",
    codes: ["home"],
  },
  inventory: {
    labelKey: "ui_c.super.group.inventory",
    icon: "inventory",
    codes: [
      "inventory_invoice", "inventory_sales", "inventory_warehouse",
      "inventory_receiving", "inventory_purchase_list", "inventory_reports",
    ],
  },
  dictionary: {
    labelKey: "ui_c.super.group.dictionary",
    icon: "menubook",
    codes: [
      "dictionary", "dictionary_menu", "dictionary_suppliers",
      "dictionary_warehouses", "dictionary_customers",
      "dictionary_managers", "dictionary_recipes",
    ],
  },
  pos: {
    labelKey: "ui_c.super.group.pos",
    icon: "pos",
    codes: ["pos", "pos_report", "pos_settings", "orders"],
  },
};

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
      "pos", "pos_report", "pos_settings", "orders",
      "dictionary_menu",
    ],
  },
  kitchen: {
    labelKey: "ui_c.super.preset.kitchen.label",
    descKey: "ui_c.super.preset.kitchen.desc",
    perms: [
      "home",
      "dictionary_menu", "dictionary_recipes",
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
      "dictionary", "dictionary_suppliers", "dictionary_warehouses",
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