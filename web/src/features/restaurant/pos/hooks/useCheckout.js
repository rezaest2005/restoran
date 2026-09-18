import { useState, useCallback } from "react";
import { createOrder } from "../api";

export default function useCheckout() {
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [lastOrder, setLastOrder] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const openCheckout = useCallback(() => setCheckoutOpen(true), []);
  const closeCheckout = useCallback(() => setCheckoutOpen(false), []);
  const closeReceipt = useCallback(() => {
    setReceiptOpen(false);
    setLastOrder(null);
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

      // حالت سفارش
      if (orderType === "delivery") {
        payload.source = "pos"; // ولی داخل order ذخیره میشه
      }

      const res = await createOrder(payload);

      if (res.success) {
        setLastOrder(res);
        setCheckoutOpen(false);
        setReceiptOpen(true);
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
    receiptOpen,
    lastOrder,
    submitting,
    error,
    openCheckout,
    closeCheckout,
    closeReceipt,
    submitOrder,
    setError,
  };
}