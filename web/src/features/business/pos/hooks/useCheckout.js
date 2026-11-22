import { useState, useCallback } from "react";
import client from "../../api/client"; // استفاده مستقیم از کلاینت

export default function useCheckout() {
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [lastOrder, setLastOrder] = useState(null);
  const [pendingOrder, setPendingOrder] = useState(null); // created but UNPAID (card terminal in progress)
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const openCheckout = useCallback(() => {
    setLastOrder(null);
    setPendingOrder(null);
    setError(null);
    setCheckoutOpen(true);
  }, []);

  const closeCheckout = useCallback(() => {
    setCheckoutOpen(false);
    setLastOrder(null);
    setPendingOrder(null);
    setError(null);
  }, []);

  const submitOrder = useCallback(async ({
    items,
    customerName,
    phone,
    tableId,
    orderType,
    paymentMethod,
    delivery,
    deferPayment,
  }) => {
    try {
      setSubmitting(true);
      setError(null);

      // ★ مپ کردن دقیق آیتم‌ها به فرمتی که بک‌اند (pos.py) انتظار دارد
      const apiItems = items.map(item => ({
        // سبد با toOrderItems() می‌آید ({food_id, quantity, price})؛ شکل قدیمی سبد ({id, qty}) هم پذیرفته می‌شود
        id: item.food_id ?? item.id,
        food_id: item.food_id ?? item.id, // بک‌اند هر دو را چک می‌کند
        item_name: item.item_name,
        quantity: item.quantity || item.qty || 1, // بک‌اند quantity می‌خواهد
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
        ...(deferPayment ? { defer_payment: true } : {}),
        order_type: orderType || "",
        ...(orderType === "delivery" && delivery ? {
          delivery_address: (delivery.address || "").trim(),
          driver_id: delivery.driverId || null,
          cod: !!delivery.cod,
        } : {}),
      };

      // ★ ارسال درخواست به EndPoint ثبت سفارش
      // (مطمئن شوید این آدرس با آدرس ثبت شده در urls.py شما یکی باشد)
      const res = await client.post("/api/pos/create-order/", payload);
      const data = res.data;

      if (data.success && data.awaiting_payment) {
        // card terminal: the order exists but is unpaid; the dialog now drives the terminal
        const pending = { ...data, driver_id: delivery?.driverId || null };
        setPendingOrder(pending);
        return pending;
      }
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

  const markPaid = useCallback((order) => {
    setPendingOrder(null);
    setLastOrder(order);
  }, []);

  return {
    checkoutOpen,
    lastOrder,
    pendingOrder,
    markPaid,
    submitting,
    error,
    openCheckout,
    closeCheckout,
    submitOrder,
    setError,
  };
}