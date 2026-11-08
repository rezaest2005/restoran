export const SERVICE_TYPES = {
  POS: 'pos',
  INVENTORY: 'inventory',
  BOTH: 'both',
};

export const SECTIONS = {
  POS: {
    title: '💰 صندوق — POS',
    subtitle: 'گزارش کامل فروش و سفارشات',
    color: 'var(--info)',
    icon: '💰',
    serviceType: SERVICE_TYPES.POS,
  },
  INVENTORY: {
    title: '📦 انبار — Inventory',
    subtitle: 'گزارش کامل موجودی و مدیریت کالا',
    color: 'var(--success)',
    icon: '📦',
    serviceType: SERVICE_TYPES.INVENTORY,
  },
  SHARED: {
    title: '📊 گزارش کلی',
    subtitle: 'آخرین فعالیت‌های سیستم',
    color: 'var(--chart-4)',
    icon: '🕐',
    serviceType: SERVICE_TYPES.BOTH,
  },
};