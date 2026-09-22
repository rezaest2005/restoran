import { useState, useCallback, useMemo, useEffect } from "react";

// ★ بررسی فعال بودن تخفیف (منقضی نشده باشه)
const isDiscountActive = (discount) => {
  if (!discount || !discount.amount || discount.amount <= 0) return false;
  if (!discount.expiresAt) return true;
  return Date.now() < discount.expiresAt;
};

// ★ محاسبه‌ی مقدار تخفیف بر اساس نوعش (مبلغ ثابت یا درصد)
const computeDiscountAmount = (basePrice, discount) => {
  if (!isDiscountActive(discount)) return 0;
  if (discount.type === "percent") {
    return (basePrice * discount.amount) / 100;
  }
  return discount.amount;
};

export default function useCart() {
  const [cart, setCart] = useState([]);
  // ★ ساختار هر مقدار: { type: "fixed" | "percent", amount: number, expiresAt: number|null }
  // ★ کلید "all" یعنی تخفیف روی همه‌ی محصولات، صرف‌نظر از دسته
  const [categoryDiscounts, setCategoryDiscounts] = useState({});

  // ★ هر ۳۰ ثانیه یک‌بار re-render اجباری تا وقتی تخفیفی منقضی شد،
  //   قیمت‌ها خودکار به‌روز بشن حتی بدون اکشن کاربر
  const [, forceTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => forceTick(t => t + 1), 30000);
    return () => clearInterval(id);
  }, []);

  const addToCart = useCallback((item) => {
    setCart(prev => {
      const effectivePrice = item.effective_price ?? (item.price - (item.discount || 0));

      if (item.id && !item.is_manual) {
        const existing = prev.find(c => c.id === item.id);
        if (existing) {
          return prev.map(c => c.id === item.id ? { ...c, qty: c.qty + 1 } : c);
        }
      }
      return [...prev, {
        ...item,
        qty: item.qty || 1,
        cartId: Date.now() + Math.random(),
        effective_price: effectivePrice,
        discount: item.discount || 0,
      }];
    });
  }, []);

  const removeFromCart = useCallback((cartId) => {
    setCart(prev => {
      const existing = prev.find(c => c.cartId === cartId);
      if (existing && existing.qty > 1) {
        return prev.map(c => c.cartId === cartId ? { ...c, qty: c.qty - 1 } : c);
      }
      return prev.filter(c => c.cartId !== cartId);
    });
  }, []);

  const removeOneFromCart = useCallback((foodId) => {
    setCart(prev => {
      const existing = prev.find(c => c.id === foodId && !c.is_manual);
      if (!existing) return prev;
      if (existing.qty > 1) {
        return prev.map(c => c.cartId === existing.cartId ? { ...c, qty: c.qty - 1 } : c);
      }
      return prev.filter(c => c.cartId !== existing.cartId);
    });
  }, []);

  const updateQty = useCallback((cartId, qty) => {
    if (qty <= 0) {
      setCart(prev => prev.filter(c => c.cartId !== cartId));
      return;
    }
    setCart(prev => prev.map(c => c.cartId === cartId ? { ...c, qty } : c));
  }, []);

  const clearCart = useCallback(() => setCart([]), []);

  // ★ ثبت/حذف تخفیف برای یک دسته یا "all"
  const setCategoryDiscount = useCallback((categoryKey, discount) => {
    setCategoryDiscounts(prev => {
      const next = { ...prev };
      if (!discount || !discount.amount || discount.amount <= 0) {
        delete next[categoryKey];
      } else {
        next[categoryKey] = discount;
      }
      return next;
    });
  }, []);

  // ★ رفع باگ اصلی: چون فیلد دسته‌بندی غذا بسته به زبان category_name یا
  //   category_name_en هست (نه category)، هر سه احتمال رو چک می‌کنیم
  const getItemCategoryKeys = (item) => (
    [item.category, item.category_name, item.category_name_en].filter(Boolean)
  );

  // ★ مجموع تخفیف قابل‌اعمال روی یک آیتم: تخفیف خودِ آیتم + تخفیف دسته‌اش + تخفیف "همه"
  const getItemDiscountAmount = useCallback((item) => {
    const base = item.price;
    const itemLevelDiscount = item.discount || 0;

    const catKeys = getItemCategoryKeys(item);
    let catDiscountAmt = 0;
    for (const key of catKeys) {
      const d = categoryDiscounts[key];
      if (isDiscountActive(d)) {
        catDiscountAmt = computeDiscountAmount(base, d);
        break;
      }
    }

    const allDiscount = categoryDiscounts["all"];
    const allDiscountAmt = isDiscountActive(allDiscount)
      ? computeDiscountAmount(base, allDiscount)
      : 0;

    return itemLevelDiscount + catDiscountAmt + allDiscountAmt;
  }, [categoryDiscounts]);

  const getItemEffectivePrice = useCallback((item) => {
    return Math.max(0, item.price - getItemDiscountAmount(item));
  }, [getItemDiscountAmount]);

  const cartTotal = useMemo(() => {
    return cart.reduce((sum, item) => {
      return sum + getItemEffectivePrice(item) * item.qty;
    }, 0);
  }, [cart, getItemEffectivePrice]);

  const cartCount = useMemo(() => cart.reduce((s, c) => s + c.qty, 0), [cart]);

  const toOrderItems = useCallback(() => {
    return cart.map(c => {
      const effectivePrice = getItemEffectivePrice(c);
      if (c.is_manual) {
        return {
          food_id: null,
          item_name: c.name,
          price: effectivePrice,
          quantity: c.qty,
        };
      }
      return {
        food_id: c.id,
        quantity: c.qty,
        price: effectivePrice,
      };
    });
  }, [cart, getItemEffectivePrice]);

  return {
    cart,
    addToCart,
    removeFromCart,
    removeOneFromCart,
    updateQty,
    clearCart,
    cartTotal,
    cartCount,
    toOrderItems,
    categoryDiscounts,
    setCategoryDiscount,
    getItemDiscountAmount,
    getItemEffectivePrice,
  };
}