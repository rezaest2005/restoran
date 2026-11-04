import { useState, useCallback } from "react";
import client from "../../api/client"; // استفاده مستقیم از کلاینت

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

      // ★ مپ کردن دقیق آیتم‌ها به فرمتی که بک‌اند (pos.py) انتظار دارد
      const apiItems = items.map(item => ({
        id: item.id,
        food_id: item.id, // بک‌اند هر دو را چک می‌کند
        quantity: item.qty || item.quantity || 1, // بک‌اند quantity می‌خواهد
        price: item.effective_price || item.price || 0,
        is_manual: item.is_manual || false,
        is_ready: item.is_ready || false,
      }));

      const payload = {
        items: apiItems,
        customer_name: customerName || "مشتری",
        phone: phone || "",
        table_id: tableId || null,
        source: "pos",
        payment_method: paymentMethod,
      };

      // ★ ارسال درخواست به EndPoint ثبت سفارش
      // (مطمئن شوید این آدرس با آدرس ثبت شده در urls.py شما یکی باشد)
      const res = await client.post("/api/pos/create-order/", payload);
      const data = res.data;

      if (data.success) {
        setLastOrder(data);
        return data;
      } else {
        setError(data.error || "خطا در ثبت سفارش");
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