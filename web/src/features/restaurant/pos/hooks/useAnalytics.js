import { useMemo } from "react";

const CHART_COLORS = [
  "#6B9B6E",  // سبز
  "#D4B76A",  // طلایی
  "#A84060",  // بورگاندی
  "#5B8DB8",  // آبی
  "#C87850",  // نارنجی
  "#8B6AAE",  // بنفش
  "#4A9B8E",  // سبزآبی
  "#B8868B",  // صورتی
];

const PAYMENT_COLORS = {
  cash: "#6B9B6E",
  card: "#5B8DB8",
  online: "#D4B76A",
};

const SOURCE_COLORS = {
  pos: "#6B9B6E",
  online: "#D4B76A",
};

export default function useAnalytics(orders = []) {
  return useMemo(() => {
    if (!orders.length) return {
      topItems: [], paymentBreakdown: [], sourceBreakdown: [],
      timeDistribution: [], topCustomers: [],
      chartColors: CHART_COLORS,
      paymentColors: PAYMENT_COLORS,
      sourceColors: SOURCE_COLORS,
    };

    const topItems = (() => {
      const map = {};
      orders.forEach(o => (o.items || []).forEach(i => {
        const key = i.name || i.food_name;
        if (!map[key]) map[key] = {
          name: key,
          name_en: i.name_en || "",
          quantity: 0,
          revenue: 0,
        };
        map[key].quantity += i.quantity || 0;
        map[key].revenue += i.line_total || (i.price || 0) * (i.quantity || 0);
      }));
      return Object.values(map).sort((a, b) => b.quantity - a.quantity).slice(0, 5);
    })();

    const paymentBreakdown = (() => {
      const map = {};
      orders.forEach(o => {
        const m = o.payment_method || "نامشخص";
        if (!map[m]) map[m] = { name: m, count: 0, revenue: 0 };
        map[m].count++;
        map[m].revenue += o.total_price || 0;
      });
      return Object.values(map).sort((a, b) => b.count - a.count);
    })();

    const sourceBreakdown = (() => {
      const map = {};
      orders.forEach(o => {
        const s = o.source || "pos";
        if (!map[s]) map[s] = { name: s, count: 0, revenue: 0 };
        map[s].count++;
        map[s].revenue += o.total_price || 0;
      });
      return Object.values(map).sort((a, b) => b.count - a.count);
    })();

    const timeDistribution = (() => {
      const slots = [
        { key: "morning",   labelFa: "صبح",      labelEn: "Morning",   start: 6,  end: 11 },
        { key: "lunch",     labelFa: "ظهر",      labelEn: "Lunch",     start: 11, end: 14 },
        { key: "afternoon", labelFa: "بعدازظهر", labelEn: "Afternoon", start: 14, end: 17 },
        { key: "evening",   labelFa: "عصر",      labelEn: "Evening",   start: 17, end: 21 },
        { key: "night",     labelFa: "شب",       labelEn: "Night",     start: 21, end: 24 },
      ].map(s => ({ ...s, count: 0, revenue: 0 }));

      orders.forEach(o => {
        const str = String(o.created_at || "");
        let h = -1;
        if (str.includes("T")) {
          const m = str.match(/T(\d{2})/);
          if (m) h = parseInt(m[1], 10);
        } else if (str.includes(":")) {
          const parts = str.split(" ");
          const t = parts.find(p => p.includes(":"));
          if (t) {
            const m = t.match(/(\d{2}):/);
            if (m) h = parseInt(m[1], 10);
          }
        }
        if (h < 0) return;
        const slot = slots.find(s => h >= s.start && h < s.end);
        if (slot) { slot.count++; slot.revenue += o.total_price || 0; }
      });
      return slots;
    })();

    const topCustomers = (() => {
      const map = {};
      orders.forEach(o => {
        const n = o.customer_name;
        if (!n || n.trim() === "") return;
        const phone = o.phone || o.customer_phone || "";
        const key = phone ? `${n}__${phone}` : n;
        if (!map[key]) map[key] = {
          name: n,
          name_en: o.customer_name_en || "",
          phone,
          count: 0,
          revenue: 0,
        };
        map[key].count++;
        map[key].revenue += o.total_price || 0;
        if (!map[key].phone && phone) map[key].phone = phone;
      });
      return Object.values(map).sort((a, b) => b.revenue - a.revenue).slice(0, 5);
    })();

    return {
      topItems, paymentBreakdown, sourceBreakdown,
      timeDistribution, topCustomers,
      chartColors: CHART_COLORS,
      paymentColors: PAYMENT_COLORS,
      sourceColors: SOURCE_COLORS,
    };
  }, [orders]);
}