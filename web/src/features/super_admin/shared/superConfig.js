// src/theme/superConfig.js
export const NAV_SECTIONS = [
  { titleKey: "super.nav.management", items: [{ icon: "📊", labelKey: "super.nav.dashboard", path: "/super" }] },
  { titleKey: "super.nav.restaurant", items: [
    { icon: "🏠", labelKey: "super.nav.main_dashboard", path: "/dashboard" },
    { icon: "📖", labelKey: "super.nav.dictionary", path: "/dashboard/dictionary" },
    { icon: "🍽️", labelKey: "super.nav.food_menu", path: "/dashboard/foods" },
    { icon: "💰", labelKey: "super.nav.pos", path: "/dashboard/pos" },
    { icon: "📋", labelKey: "super.nav.orders", path: "/dashboard/orders" },
  ]},
  { titleKey: "super.nav.warehouse", items: [
    { icon: "🧾", labelKey: "super.nav.purchase_invoice", path: "/dashboard/invoices/create" },
    { icon: "🥕", labelKey: "super.nav.raw_materials", path: "/dashboard/raw-materials" },
    { icon: "🥘", labelKey: "super.nav.semi_finished", path: "/dashboard/semi-finished" },
    { icon: "📦", labelKey: "super.nav.ready_materials", path: "/dashboard/ready-materials" },
    { icon: "📝", labelKey: "super.nav.usage_log", path: "/dashboard/usage-log" },
    { icon: "📋", labelKey: "super.nav.recipes", path: "/dashboard/recipes" },
    { icon: "👨‍🍳", labelKey: "super.nav.kitchen", path: "/dashboard/kitchen" },
  ]},
  { titleKey: "super.nav.customers", items: [
    { icon: "🏆", labelKey: "super.nav.loyalty", path: "/dashboard/loyalty" },
    { icon: "👥", labelKey: "super.nav.customer_list", path: "/dashboard/loyalty/customers" },
    { icon: "🎟️", labelKey: "super.nav.coupons", path: "/dashboard/loyalty/coupons" },
    { icon: "🎁", labelKey: "super.nav.rewards", path: "/dashboard/loyalty/rewards" },
  ]},
];

export const ROLE_OPTIONS = [
  { value: "owner", labelKey: "super.role.owner" }, { value: "manager", labelKey: "super.role.manager" },
  { value: "cashier", labelKey: "super.role.cashier" }, { value: "kitchen", labelKey: "super.role.kitchen" },
  { value: "warehouse", labelKey: "super.role.warehouse" }, { value: "customer", labelKey: "super.role.customer" },
];

export const ALL_PERM_CODES = [
  'home', 'dictionary', 'foods', 'pos', 'orders', 'invoices',
  'raw_materials', 'semi_finished', 'ready_materials', 'usage_log',
  'recipes', 'kitchen', 'loyalty', 'loyalty_customers', 'loyalty_coupons',
  'loyalty_rewards', 'loyalty_notifications', 'loyalty_register', 'users',
  'warehouse', 'ready', 'reports'
];

export const PERM_LABELS = {
  home: 'داشبورد', dictionary: 'دیکشنری', foods: 'غذا و منو', pos: 'صندوق فروش',
  orders: 'سفارشات', invoices: 'فاکتورها', raw_materials: 'مواد اولیه',
  semi_finished: 'نیمه‌آماده', ready_materials: 'مواد آماده', usage_log: 'لاگ مصرف',
  recipes: 'رسپی‌ها', kitchen: 'آشپزخانه', loyalty: 'باشگاه مشتریان',
  loyalty_customers: 'مشتریان', loyalty_coupons: 'کوپن‌ها', loyalty_rewards: 'جوایز',
  loyalty_notifications: 'اعلان‌ها', loyalty_register: 'ثبت‌نام', users: 'مدیریت کاربران',
  warehouse: 'انبار', ready: 'آماده', reports: 'گزارشات'
};

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