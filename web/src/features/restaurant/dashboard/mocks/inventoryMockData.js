export const MOCK_INV_STATS = {
  stockValue: 45800000,
  stockValueChange: -3.2,
  lowStock: 8,
  lowStockChange: 2,
  expiring: 5,
  expiringChange: -1,
  monthlyWaste: 1250000,
  wasteChange: -8.5,
};

export const MOCK_STOCK_LEVEL = [
  { name: "برنج", nameEn: "Rice", current: 250, min: 50, max: 500, unit: "کیلو", unitEn: "kg" },
  { name: "گوشت گوسفندی", nameEn: "Lamb", current: 45, min: 20, max: 100, unit: "کیلو", unitEn: "kg" },
  { name: "روغن", nameEn: "Oil", current: 30, min: 15, max: 80, unit: "لیتر", unitEn: "L" },
  { name: "پیاز", nameEn: "Onion", current: 80, min: 30, max: 150, unit: "کیلو", unitEn: "kg" },
  { name: "گوجه‌فرنگی", nameEn: "Tomato", current: 25, min: 40, max: 120, unit: "کیلو", unitEn: "kg" },
  { name: "جعفری", nameEn: "Parsley", current: 5, min: 10, max: 30, unit: "کیلو", unitEn: "kg" },
  { name: "ماست", nameEn: "Yogurt", current: 60, min: 20, max: 100, unit: "کیلو", unitEn: "kg" },
  { name: "کره", nameEn: "Butter", current: 8, min: 15, max: 50, unit: "کیلو", unitEn: "kg" },
];

export const MOCK_STOCK_FLOW = [
  { day: "شنبه", dayEn: "Sat", inbound: 120, outbound: 95 },
  { day: "یکشنبه", dayEn: "Sun", inbound: 85, outbound: 110 },
  { day: "دوشنبه", dayEn: "Mon", inbound: 150, outbound: 88 },
  { day: "سه‌شنبه", dayEn: "Tue", inbound: 70, outbound: 102 },
  { day: "چهارشنبه", dayEn: "Wed", inbound: 200, outbound: 135 },
  { day: "پنجشنبه", dayEn: "Thu", inbound: 180, outbound: 155 },
  { day: "جمعه", dayEn: "Fri", inbound: 60, outbound: 175 },
];

export const MOCK_WASTE_PIE = [
  { name: "مواد اولیه فاسد", nameEn: "Spoiled Raw", value: 45, color: "#ef4444" },
  { name: "غذای پخته‌شده", nameEn: "Cooked Food", value: 25, color: "#f59e0b" },
  { name: "بسته‌بندی", nameEn: "Packaging", value: 15, color: "#8b5cf6" },
  { name: "سایر", nameEn: "Other", value: 15, color: "#6b7280" },
];

export const MOCK_STOCK_ALERTS = [
  { name: "جعفری", nameEn: "Parsley", level: "critical", current: 5, min: 10, message: "فوری: موجودی کم", messageEn: "Critical: Low Stock" },
  { name: "کره", nameEn: "Butter", level: "critical", current: 8, min: 15, message: "فوری: موجودی کم", messageEn: "Critical: Low Stock" },
  { name: "گوجه‌فرنگی", nameEn: "Tomato", level: "warning", current: 25, min: 40, message: "هشدار: کم شدن موجودی", messageEn: "Warning: Stock Low" },
];

export const MOCK_EXPIRING = [
  { name: "ماست", nameEn: "Yogurt", expiry: "۲ روز", expiryEn: "2 days", quantity: 30, unit: "کیلو", severity: "critical" },
  { name: "کره", nameEn: "Butter", expiry: "۳ روز", expiryEn: "3 days", quantity: 8, unit: "کیلو", severity: "warning" },
  { name: "گوشت", nameEn: "Meat", expiry: "۱ روز", expiryEn: "1 day", quantity: 15, unit: "کیلو", severity: "critical" },
  { name: "سبزی", nameEn: "Herbs", expiry: "۱ روز", expiryEn: "1 day", quantity: 10, unit: "کیلو", severity: "critical" },
  { name: "پنیر", nameEn: "Cheese", expiry: "۵ روز", expiryEn: "5 days", quantity: 12, unit: "کیلو", severity: "ok" },
];

export const MOCK_TOP_USED = [
  { name: "برنج", nameEn: "Rice", used: 450, unit: "کیلو" },
  { name: "گوشت", nameEn: "Meat", used: 320, unit: "کیلو" },
  { name: "روغن", nameEn: "Oil", used: 180, unit: "لیتر" },
  { name: "پیاز", nameEn: "Onion", used: 150, unit: "کیلو" },
  { name: "گوجه‌فرنگی", nameEn: "Tomato", used: 120, unit: "کیلو" },
];

export const MOCK_SLOW_MOVERS = [
  { name: "کله‌پاچه", nameEn: "Head Dish", lastUsed: "۳ روز پیش", lastUsedEn: "3 days ago", quantity: 15, unit: "عدد" },
  { name: "ماهیچه", nameEn: "Shank", lastUsed: "۲ روز پیش", lastUsedEn: "2 days ago", quantity: 20, unit: "کیلو" },
  { name: "حلوا", nameEn: "Halva", lastUsed: "۵ روز پیش", lastUsedEn: "5 days ago", quantity: 30, unit: "کیلو" },
];

export const MOCK_INV_WEEKLY = {
  thisWeekStock: 45800000,
  lastWeekStock: 48200000,
  thisWeekInbound: 865,
  lastWeekInbound: 720,
  thisWeekWaste: 285,
  lastWeekWaste: 310,
  stockChange: -5.0,
  inboundChange: 20.1,
  wasteChange: -8.1,
};