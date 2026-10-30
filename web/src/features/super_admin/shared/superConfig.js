// src/features/super_admin/shared/superConfig.js

// ═══════════════════════════════════════
//  نویگیشن
// ═══════════════════════════════════════

export const NAV_SECTIONS = [
  {
    titleKey: "super.nav.management",
    items: [
      { icon: "📊", labelKey: "super.nav.dashboard", path: "/super" },
    ],
  },
  {
    titleKey: "super.nav.restaurant",
    items: [
      { icon: "🏠", labelKey: "super.nav.main_dashboard", path: "/dashboard" },
      { icon: "📖", labelKey: "super.nav.dictionary", path: "/dashboard/dictionary" },
      { icon: "🍽️", labelKey: "super.nav.food_menu", path: "/dashboard/foods" },
      { icon: "💰", labelKey: "super.nav.pos", path: "/dashboard/pos" },
      { icon: "📋", labelKey: "super.nav.orders", path: "/dashboard/orders" },
    ],
  },
  {
    titleKey: "super.nav.warehouse",
    items: [
      { icon: "🧾", labelKey: "super.nav.purchase_invoice", path: "/dashboard/invoices/create" },
      { icon: "🥕", labelKey: "super.nav.raw_materials", path: "/dashboard/raw-materials" },
      { icon: "🥘", labelKey: "super.nav.semi_finished", path: "/dashboard/semi-finished" },
      { icon: "📦", labelKey: "super.nav.ready_materials", path: "/dashboard/ready-materials" },
      { icon: "📝", labelKey: "super.nav.usage_log", path: "/dashboard/usage-log" },
      { icon: "📋", labelKey: "super.nav.recipes", path: "/dashboard/recipes" },
      { icon: "👨‍🍳", labelKey: "super.nav.kitchen", path: "/dashboard/kitchen" },
    ],
  },
  {
    titleKey: "super.nav.customers",
    items: [
      { icon: "🏆", labelKey: "super.nav.loyalty", path: "/dashboard/loyalty" },
      { icon: "👥", labelKey: "super.nav.customer_list", path: "/dashboard/loyalty/customers" },
      { icon: "🎟️", labelKey: "super.nav.coupons", path: "/dashboard/loyalty/coupons" },
      { icon: "🎁", labelKey: "super.nav.rewards", path: "/dashboard/loyalty/rewards" },
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
  { value: "other", labelKey: "سایر (سفارشی)" },
];

// ═══════════════════════════════════════
//  کدهای دسترسی + برچسب‌ها ★ هماهنگ با داشبورد
// ═══════════════════════════════════════

export const ALL_PERM_CODES = [
  // داشبورد
  "home",
  // 📦 انبار
  "inventory_invoice", "inventory_sales", "inventory_warehouse",
  "inventory_receiving", "inventory_purchase_list", "inventory_reports",
  // 📖 تعاریف
  "dictionary", "dictionary_menu", "dictionary_suppliers",
  "dictionary_warehouses", "dictionary_customers",
  "dictionary_managers", "dictionary_recipes",
  // 💰 صندوق
  "pos", "pos_report", "pos_settings", "orders",
];

export const PERM_LABELS = {
  // داشبورد
  home: "داشبورد اصلی",
  // 📦 انبار
  inventory_invoice: "ثبت فاکتور خرید",
  inventory_sales: "ثبت فاکتور فروش",
  inventory_warehouse: "انبار",
  inventory_receiving: "تحویل بار",
  inventory_purchase_list: "لیست خرید",
  inventory_reports: "گزارشات",
  // 📖 تعاریف
  dictionary: "دیکشنری",
  dictionary_menu: "منوی غذا",
  dictionary_suppliers: "تأمین‌کنندگان",
  dictionary_warehouses: "انبارها",
  dictionary_customers: "مشتریان",
  dictionary_managers: "مدیران",
  dictionary_recipes: "رسپی‌ها",
  // 💰 صندوق
  pos: "صندوق فروش",
  pos_report: "گزارش روز صندوق",
  pos_settings: "تنظیمات صندوق",
  orders: "سفارشات",
};

// ═══════════════════════════════════════
//  گروه‌بندی دسترسی‌ها ★ هماهنگ با ۳ بخش داشبورد
// ═══════════════════════════════════════

export const PERM_GROUPS = {
  "🏠 داشبورد": {
    icon: "🏠",
    codes: ["home"],
  },
  "📦 انبار": {
    icon: "📦",
    codes: [
      "inventory_invoice", "inventory_sales", "inventory_warehouse",
      "inventory_receiving", "inventory_purchase_list", "inventory_reports",
    ],
  },
  "📖 تعاریف": {
    icon: "📖",
    codes: [
      "dictionary", "dictionary_menu", "dictionary_suppliers",
      "dictionary_warehouses", "dictionary_customers",
      "dictionary_managers", "dictionary_recipes",
    ],
  },
  "💰 صندوق": {
    icon: "💰",
    codes: ["pos", "pos_report", "pos_settings", "orders"],
  },
};

// ═══════════════════════════════════════
//  پریست دسترسی‌ها per-role ★
// ═══════════════════════════════════════

export const ROLE_PERM_PRESETS = {
  owner: {
    label: "👑 مالک",
    description: "دسترسی کامل",
    perms: [...ALL_PERM_CODES],
  },
  manager: {
    label: "👤 مدیر",
    description: "همه به‌جز مدیریت کاربران",
    perms: [...ALL_PERM_CODES],
  },
  cashier: {
    label: "💰 صندوقدار",
    description: "فقط بخش صندوق + منو",
    perms: [
      "home",
      "pos", "pos_report", "pos_settings", "orders",
      "dictionary_menu",
    ],
  },
  kitchen: {
    label: "🍳 آشپزخانه",
    description: "رسپی + منو + سفارشات",
    perms: [
      "home",
      "dictionary_menu", "dictionary_recipes",
      "orders",
    ],
  },
  warehouse: {
    label: "📦 انباردار",
    description: "فقط بخش انبار + تعاریف",
    perms: [
      "home",
      "inventory_invoice", "inventory_sales", "inventory_warehouse",
      "inventory_receiving", "inventory_purchase_list", "inventory_reports",
      "dictionary", "dictionary_suppliers", "dictionary_warehouses",
    ],
  },
  customer: {
    label: "🧑 مشتری",
    description: "فقط مشاهده منو",
    perms: ["home", "dictionary_menu"],
  },
  other: {
    label: "📝 سایر (سفارشی)",
    description: "نام شغل + دسترسی دلخواه",
    perms: [],
  },
};

// ═══════════════════════════════════════
//  رنگ‌ها
// ═══════════════════════════════════════

export const getSuperColors = (isDark) => ({
  bg: isDark ? "#0B0A0B" : "#E4E8F0",
  bgWarm: isDark
    ? "radial-gradient(ellipse at 25% 15%, rgba(61,90,62,0.07) 0%, transparent 50%), radial-gradient(ellipse at 75% 85%, rgba(120,30,58,0.06) 0%, transparent 50%)"
    : "radial-gradient(ellipse at 15% 10%, rgba(80,100,160,0.1) 0%, transparent 45%), radial-gradient(ellipse at 85% 85%, rgba(120,40,70,0.08) 0%, transparent 40%)",
  glass: isDark ? "#101210" : "#F0F4FC",
  glassBorder: isDark ? "#1F2A1F" : "#D1DAE8",
  olive: isDark ? "#6B9B6E" : "#2E4D30",
  oliveLight: isDark ? "#8BB88E" : "#3D5A3E",
  oliveSubtle: isDark ? "rgba(107,155,110,0.08)" : "rgba(46,77,48,0.08)",
  text: isDark ? "#F0ECE8" : "#1A1A24",
  sub: isDark ? "#8A8588" : "#555568",
  muted: isDark ? "#4A4548" : "#8A8A9E",
  inputBg: isDark ? "#0F0E0F" : "#F6F8FC",
  btnGrad: isDark ? "#3D6B40" : "#2E4D30",
  btnHover: isDark ? "#4A7A4D" : "#3D5A3E",
  danger: isDark ? "#E84057" : "#C83048",
  dangerBg: isDark ? "rgba(232,64,87,0.12)" : "rgba(200,48,72,0.1)",
  success: isDark ? "#6B9B6E" : "#2E4D30",
  successBg: isDark ? "rgba(107,155,110,0.12)" : "rgba(46,77,48,0.1)",
  warning: isDark ? "#D4B76A" : "#A08040",
  warningBg: isDark ? "rgba(212,183,106,0.12)" : "rgba(160,128,64,0.1)",
  info: isDark ? "#5B8FD4" : "#4070B8",
  infoBg: isDark ? "rgba(91,143,212,0.12)" : "rgba(64,112,184,0.1)",
  sidebarBg: isDark ? "#080708" : "#E8ECF4",
  sidebarBorder: isDark ? "#161A16" : "#D1DAE8",
  headerBg: isDark ? "#0A090A" : "#E8ECF4",
  headerBorder: isDark ? "#161A16" : "#D1DAE8",
  tableHeaderBg: isDark ? "#0F110F" : "#EDF1F8",
  tableRowHover: isDark ? "rgba(107,155,110,0.04)" : "rgba(46,77,48,0.04)",
  tableRowSelected: isDark ? "rgba(107,155,110,0.08)" : "rgba(46,77,48,0.08)",
});