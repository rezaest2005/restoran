export const SERVICE_TYPES = {
  POS: 'pos',
  INVENTORY: 'inventory',
  BOTH: 'both',
};

export const SECTIONS = {
  POS: {
    title: '💰 صندوق — POS',
    subtitle: 'گزارش کامل فروش و سفارشات',
    color: '#4F46E5',
    icon: '💰',
    serviceType: SERVICE_TYPES.POS,
  },
  INVENTORY: {
    title: '📦 انبار — Inventory',
    subtitle: 'گزارش کامل موجودی و مدیریت کالا',
    color: '#059669',
    icon: '📦',
    serviceType: SERVICE_TYPES.INVENTORY,
  },
  SHARED: {
    title: '📊 گزارش کلی',
    subtitle: 'آخرین فعالیت‌های سیستم',
    color: '#7C3AED',
    icon: '🕐',
    serviceType: SERVICE_TYPES.BOTH,
  },
};