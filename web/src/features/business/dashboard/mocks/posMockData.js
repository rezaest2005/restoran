export const MOCK_POS_STATS = {
  sales: 2450000,
  salesChange: 12.5,
  orders: 87,
  ordersChange: 8.3,
  avgOrderValue: 28160,
  avgTime: 24,
  avgTimeChange: -5.2,
  customers: 142,
  newCustomers: 18,
  profit: 1680000,
  profitChange: 15.7,
};

export const MOCK_SALES_TREND = [
  { name: "شنبه", nameEn: "Sat", sales: 1800000, orders: 62 },
  { name: "یکشنبه", nameEn: "Sun", sales: 2100000, orders: 71 },
  { name: "دوشنبه", nameEn: "Mon", sales: 1950000, orders: 68 },
  { name: "سه‌شنبه", nameEn: "Tue", sales: 2300000, orders: 79 },
  { name: "چهارشنبه", nameEn: "Wed", sales: 2650000, orders: 91 },
  { name: "پنجشنبه", nameEn: "Thu", sales: 3100000, orders: 105 },
  { name: "جمعه", nameEn: "Fri", sales: 2800000, orders: 96 },
];

export const MOCK_MONTHLY_TREND = [
  { name: "ژانویه", nameEn: "Jan", sales: 58000000, orders: 1820 },
  { name: "فوریه", nameEn: "Feb", sales: 62000000, orders: 1950 },
  { name: "مارس", nameEn: "Mar", sales: 71000000, orders: 2180 },
  { name: "آوریل", nameEn: "Apr", sales: 65000000, orders: 2010 },
  { name: "مه", nameEn: "May", sales: 78000000, orders: 2340 },
  { name: "ژوئن", nameEn: "Jun", sales: 82000000, orders: 2480 },
];

export const MOCK_HOURLY = [
  { hour: "۱۰", hourEn: "10", orders: 5 },
  { hour: "۱۱", hourEn: "11", orders: 8 },
  { hour: "۱۲", hourEn: "12", orders: 15 },
  { hour: "۱۳", hourEn: "13", orders: 22 },
  { hour: "۱۴", hourEn: "14", orders: 18 },
  { hour: "۱۵", hourEn: "15", orders: 10 },
  { hour: "۱۶", hourEn: "16", orders: 7 },
  { hour: "۱۷", hourEn: "17", orders: 12 },
  { hour: "۱۸", hourEn: "18", orders: 19 },
  { hour: "۱۹", hourEn: "19", orders: 28 },
  { hour: "۲۰", hourEn: "20", orders: 35 },
  { hour: "۲۱", hourEn: "21", orders: 42 },
  { hour: "۲۲", hourEn: "22", orders: 38 },
  { hour: "۲۳", hourEn: "23", orders: 20 },
];

export const MOCK_CATEGORIES = [
  { name: "غذای اصلی", nameEn: "Main Dish", value: 35, color: "#ff6b35" },
  { name: "پیش‌غذا", nameEn: "Appetizer", value: 20, color: "#3b82f6" },
  { name: "نوشیدنی", nameEn: "Drinks", value: 18, color: "#10b981" },
  { name: "دسر", nameEn: "Dessert", value: 15, color: "#8b5cf6" },
  { name: "سالاد", nameEn: "Salad", value: 8, color: "#f59e0b" },
  { name: "سایر", nameEn: "Other", value: 4, color: "#6b7280" },
];

export const MOCK_TOP_ITEMS = [
  { name: "چلو کباب", nameEn: "Chelo Kabab", sales: 45, revenue: 5850000 },
  { name: "فست‌فود ویژه", nameEn: "Special Fastfood", sales: 38, revenue: 4560000 },
  { name: "پیتزا مخصوص", nameEn: "Special Pizza", sales: 32, revenue: 3840000 },
  { name: "قورمه‌سبزی", nameEn: "Ghormeh Sabzi", sales: 28, revenue: 2800000 },
  { name: "سالاد سزار", nameEn: "Caesar Salad", sales: 25, revenue: 1750000 },
];

export const MOCK_LOW_ITEMS = [
  { name: "خوراک کله‌پاچه", nameEn: "Head Dish", sales: 2, revenue: 80000 },
  { name: "آش رشته", nameEn: "Ash Reshteh", sales: 3, revenue: 90000 },
  { name: "پلو ماهیچه", nameEn: "Mahiche Polo", sales: 5, revenue: 250000 },
];

export const MOCK_ORDER_STATUS = [
  { name: "تکمیل شده", nameEn: "Completed", count: 68, color: "#10b981" },
  { name: "در حال آماده‌سازی", nameEn: "Preparing", count: 12, color: "#f59e0b" },
  { name: "در حال ارسال", nameEn: "Delivering", count: 5, color: "#3b82f6" },
  { name: "لغو شده", nameEn: "Cancelled", count: 2, color: "#ef4444" },
];

export const MOCK_WEEKLY_COMPARE = {
  thisWeek: 16700000,
  lastWeek: 14200000,
  change: 17.6,
};