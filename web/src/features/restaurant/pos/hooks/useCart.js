import { useState, useCallback, useMemo } from "react";

export default function useCart() {
  const [cart, setCart] = useState([]);
  const [categoryDiscounts, setCategoryDiscounts] = useState({});

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

  // تخفیف دسته‌بندی
  const setCategoryDiscount = useCallback((categoryName, amount) => {
    setCategoryDiscounts(prev => {
      const next = { ...prev };
      if (amount <= 0) {
        delete next[categoryName];
      } else {
        next[categoryName] = amount;
      }
      return next;
    });
  }, []);

  // محاسبه قیمت نهایی هر آیتم (با تخفیف آیتم + تخفیف دسته)
  const cartTotal = useMemo(() => {
    return cart.reduce((sum, item) => {
      const catDiscount = categoryDiscounts[item.category] || 0;
      const itemDiscount = item.discount || 0;
      const totalDiscount = itemDiscount + catDiscount;
      const effective = Math.max(0, item.price - totalDiscount);
      return sum + effective * item.qty;
    }, 0);
  }, [cart, categoryDiscounts]);

  const cartCount = useMemo(() => cart.reduce((s, c) => s + c.qty, 0), [cart]);

  const toOrderItems = useCallback(() => {
    return cart.map(c => {
      const catDiscount = categoryDiscounts[c.category] || 0;
      const totalDiscount = (c.discount || 0) + catDiscount;
      const effectivePrice = Math.max(0, c.price - totalDiscount);

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
  }, [cart, categoryDiscounts]);

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
  };
}