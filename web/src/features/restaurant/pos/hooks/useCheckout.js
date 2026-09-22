import { useState, useCallback } from "react";
import { createOrder } from "../api";

export default function useCheckout() {
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [lastOrder, setLastOrder] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const openCheckout = useCallback(() => {
    setLastOrder(null);
    setError(null);
    setCheckoutOpen(true);
  }, []);

  const closeCheckout = useCallback(() => {
    setCheckoutOpen(false);
    setLastOrder(null);
    setError(null);
  }, []);

  const submitOrder = useCallback(async ({
    items,
    customerName,
    phone,
    tableId,
    orderType,
    paymentMethod,
  }) => {
    try {
      setSubmitting(true);
      setError(null);

      const payload = {
        items,
        customer_name: customerName || "مشتری",
        phone: phone || "",
        table_id: tableId || null,
        source: "pos",
        payment_method: paymentMethod,
      };

      if (orderType === "delivery") {
        payload.source = "pos";
      }

      const res = await createOrder(payload);

      if (res.success) {
        setLastOrder(res);
        // ★ دیالوگ رو نبند — CheckoutDialog خودش فاز رو مدیریت میکنه
        return res;
      } else {
        setError(res.error || "خطا در ثبت سفارش");
        return null;
      }
    } catch (err) {
      const msg = err.response?.data?.error || err.message || "خطا در اتصال";
      setError(msg);
      return null;
    } finally {
      setSubmitting(false);
    }
  }, []);

  return {
    checkoutOpen,
    lastOrder,
    submitting,
    error,
    openCheckout,
    closeCheckout,
    submitOrder,
    setError,
  };
}