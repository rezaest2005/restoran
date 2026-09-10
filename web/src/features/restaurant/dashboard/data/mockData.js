export const MOCK_STATS = {
  sales: 24_500_000, salesChange: 12.5,
  orders: 142, ordersChange: 8.3,
  avgOrderValue: 172_535,
  customers: 89, newCustomers: 12,
  avgTime: 18, avgTimeChange: -5.2,
  stockAlerts: 6,
};

export const MOCK_SALES_TREND = [
  { name: "شنبه", nameEn: "Sat", sales: 1_200_000, orders: 45 },
  { name: "یکشنبه", nameEn: "Sun", sales: 1_500_000, orders: 52 },
  { name: "دوشنبه", nameEn: "Mon", sales: 1_100_000, orders: 38 },
  { name: "سه‌شنبه", nameEn: "Tue", sales: 1_800_000, orders: 65 },
  { name: "چهارشنبه", nameEn: "Wed", sales: 2_100_000, orders: 72 },
  { name: "پنجشنبه", nameEn: "Thu", sales: 2_500_000, orders: 85 },
  { name: "جمعه", nameEn: "Fri", sales: 900_000, orders: 25 },
];

export const MOCK_MONTHLY_TREND = [
  { name: "هفته ۱", nameEn: "W1", sales: 8_500_000, orders: 320 },
  { name: "هفته ۲", nameEn: "W2", sales: 9_200_000, orders: 350 },
  { name: "هفته ۳", nameEn: "W3", sales: 7_800_000, orders: 290 },
  { name: "هفته ۴", nameEn: "W4", sales: 10_500_000, orders: 410 },
];

export const MOCK_HOURLY = [
  { hour: "۸", hourEn: "8", orders: 5 },
  { hour: "۹", hourEn: "9", orders: 12 },
  { hour: "۱۰", hourEn: "10", orders: 18 },
  { hour: "۱۱", hourEn: "11", orders: 28 },
  { hour: "۱۲", hourEn: "12", orders: 52 },
  { hour: "۱۳", hourEn: "13", orders: 45 },
  { hour: "۱۴", hourEn: "14", orders: 32 },
  { hour: "۱۵", hourEn: "15", orders: 15 },
  { hour: "۱۶", hourEn: "16", orders: 10 },
  { hour: "۱۷", hourEn: "17", orders: 18 },
  { hour: "۱۸", hourEn: "18", orders: 38 },
  { hour: "۱۹", hourEn: "19", orders: 48 },
  { hour: "۲۰", hourEn: "20", orders: 55 },
  { hour: "۲۱", hourEn: "21", orders: 42 },
  { hour: "۲۲", hourEn: "22", orders: 18 },
];

export const MOCK_CATEGORIES = [
  { name: "غذای اصلی", nameEn: "Main", value: 4000, color: "#ff6b35" },
  { name: "پیش‌غذا", nameEn: "Starter", value: 1500, color: "#3b82f6" },
  { name: "نوشیدنی", nameEn: "Drinks", value: 2000, color: "#10b981" },
  { name: "دسر", nameEn: "Dessert", value: 1000, color: "#8b5cf6" },
];

export const MOCK_TOP_ITEMS = [
  { id: 1, name: "پیتزا پپرونی", nameEn: "Pepperoni Pizza", qty: 45, total: 5_400_000, pct: 18 },
  { id: 2, name: "برگر مخصوص", nameEn: "Special Burger", qty: 38, total: 4_180_000, pct: 15 },
  { id: 3, name: "پاستا آلفردو", nameEn: "Alfredo Pasta", qty: 22, total: 2_860_000, pct: 10 },
  { id: 4, name: "جوجه کباب", nameEn: "Chicken Kebab", qty: 20, total: 2_400_000, pct: 9 },
  { id: 5, name: "سالاد سزار", nameEn: "Caesar Salad", qty: 18, total: 1_260_000, pct: 7 },
  { id: 6, name: "کباب کوبیده", nameEn: "Koobideh", qty: 16, total: 1_920_000, pct: 6 },
  { id: 7, name: "ساندویچ رپ", nameEn: "Wrap Sandwich", qty: 14, total: 980_000, pct: 5 },
  { id: 8, name: "سوپ قارچ", nameEn: "Mushroom Soup", qty: 12, total: 600_000, pct: 4 },
  { id: 9, name: "فرایز مخصوص", nameEn: "Special Fries", qty: 11, total: 440_000, pct: 3 },
  { id: 10, name: "نوشابه", nameEn: "Soda", qty: 10, total: 200_000, pct: 2 },
];

export const MOCK_LOW_ITEMS = [
  { id: 1, name: "سالاد فصل", nameEn: "Season Salad", qty: 1, total: 70_000 },
  { id: 2, name: "دلمه برگ مو", nameEn: "Dolmeh", qty: 2, total: 160_000 },
  { id: 3, name: "آش رشته", nameEn: "Ash Reshteh", qty: 2, total: 120_000 },
  { id: 4, name: "کوکو سبزی", nameEn: "Kuku Sabzi", qty: 3, total: 180_000 },
  { id: 5, name: "ماهی سالمون", nameEn: "Salmon", qty: 3, total: 540_000 },
];

export const MOCK_ORDER_STATUS = [
  { label: "در انتظار", labelEn: "Pending", count: 8, color: "#f59e0b", icon: "⏳" },
  { label: "در حال آماده‌سازی", labelEn: "Preparing", count: 12, color: "#3b82f6", icon: "👨‍🍳" },
  { label: "آماده تحویل", labelEn: "Ready", count: 5, color: "#10b981", icon: "✅" },
  { label: "تحویل شده", labelEn: "Delivered", count: 117, color: "#6B9B6E", icon: "📦" },
];

export const MOCK_ACTIVITIES = [
  { dot: "orange", text: "سفارش #1045 — پیتزا پپرونی × ۲", textEn: "Order #1045 — Pepperoni Pizza × 2", time: "۱ دقیقه پیش", timeEn: "1m ago" },
  { dot: "blue", text: "سفارش #1044 در حال آماده‌سازی", textEn: "Order #1044 — Preparing", time: "۳ دقیقه پیش", timeEn: "3m ago" },
  { dot: "green", text: "سفارش #1043 تحویل شد", textEn: "Order #1043 — Delivered", time: "۸ دقیقه پیش", timeEn: "8m ago" },
  { dot: "orange", text: "سفارش #1042 — برگر مخصوص", textEn: "Order #1042 — Special Burger", time: "۱۲ دقیقه پیش", timeEn: "12m ago" },
  { dot: "green", text: "سفارش #1041 تحویل شد", textEn: "Order #1041 — Delivered", time: "۱۸ دقیقه پیش", timeEn: "18m ago" },
];

export const MOCK_STOCK_ALERTS = [
  { name: "گوشت چرخ‌کرده", nameEn: "Ground Meat", current: 2, min: 5, unit: "کیلو", unitEn: "kg" },
  { name: "پنیر پیتزا", nameEn: "Pizza Cheese", current: 3, min: 8, unit: "کیلو", unitEn: "kg" },
  { name: "قارچ", nameEn: "Mushroom", current: 1, min: 4, unit: "کیلو", unitEn: "kg" },
  { name: "سس گوجه", nameEn: "Tomato Sauce", current: 2, min: 6, unit: "بطری", unitEn: "btl" },
  { name: "روغن زیتون", nameEn: "Olive Oil", current: 1, min: 3, unit: "لیتر", unitEn: "L" },
  { name: "نان پیتزا", nameEn: "Pizza Dough", current: 5, min: 10, unit: "عدد", unitEn: "pcs" },
];

export const MOCK_WEEKLY_COMPARE = {
  thisWeek: { sales: 11_200_000, orders: 382, avg: 293_194 },
  lastWeek: { sales: 9_800_000, orders: 345, avg: 284_058 },
};