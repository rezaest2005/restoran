// src/features/restaurant/pos/services/paymentService.js

/* ── آداپتورهای پرداخت ── */

// آداپتور شبیه‌ساز (پیش‌فرض — بدون دستگاه واقعی)
const mockAdapter = {
  name: "mock",
  async sendRequest(amount, method) {
    await new Promise(r => setTimeout(r, 1500));
    return { success: true, refCode: "MOCK-" + Date.now(), method };
  },
  async checkStatus(refCode) {
    return { refCode, status: "paid" };
  },
};

// آداپتور دستگاه POS محلی (TCP/Serial)
// وقتی دستگاه خریدی فقط این رو فعال کن
const localPosAdapter = {
  name: "local_pos",
  config: {
    ip: "192.168.1.100",   // IP دستگاه POS
    port: 8080,            // پورت پیش‌فرض — بسته به برند فرق داره
    timeout: 30000,
  },

  async sendRequest(amount, method) {
    // اتصال واقعی به دستگاه POS از طریق سرور بک‌اند
    const res = await fetch("/api/payment/pos/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: amount * 10, // ریال
        method,
        pos_ip: this.config.ip,
        pos_port: this.config.port,
        timeout: this.config.timeout,
      }),
    });
    if (!res.ok) throw new Error("خطا در اتصال به دستگاه POS");
    const data = await res.json();
    return { success: data.success, refCode: data.trace_no, method };
  },

  async checkStatus(refCode) {
    const res = await fetch(`/api/payment/pos/status/${refCode}`);
    return res.json();
  },
};

// آداپتور درگاه آنلاین (مثال: زرین‌پال، SEP، به‌پرداخت)
const onlineGatewayAdapter = {
  name: "online",
  config: {
    gateway: "sep",        // sep | zarinpal | behpardakht | idpay
    callbackUrl: "https://yourdomain.com/payment/callback",
    merchantId: "",        // مرچنت‌کد از درگاه
  },

  async sendRequest(amount, _method) {
    const res = await fetch("/api/payment/gateway/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        amount,
        gateway: this.config.gateway,
        callback_url: this.config.callbackUrl,
        merchant_id: this.config.merchantId,
      }),
    });
    if (!res.ok) throw new Error("خطا در اتصال به درگاه");
    const data = await res.json();
    if (data.payment_url) {
      window.open(data.payment_url, "_blank");
    }
    return { success: !!data.payment_url, refCode: data.authority, method: "online", pending: true };
  },

  async checkStatus(refCode) {
    const res = await fetch(`/api/payment/gateway/verify?authority=${refCode}`);
    return res.json();
  },
};

/* ── مپ روش پرداخت به آداپتور ── */
const adapters = {
  cash: mockAdapter,               // نقدی → همیشه موفق (فقط ثبت)
  card: mockAdapter,               // کارتخوان → اینجا mock هست، وقتی دستگاه خریدی: localPosAdapter
  online: onlineGatewayAdapter,    // آنلاین → درگاه
};

/* ── API اصلی ── */
export async function processPayment(method, amount) {
  const adapter = adapters[method];
  if (!adapter) throw new Error("روش پرداخت نامعتبر");

  try {
    const result = await adapter.sendRequest(amount, method);
    return result;
  } catch (err) {
    throw new Error(`پرداخت ناموفق: ${err.message}`);
  }
}

export async function verifyPayment(method, refCode) {
  const adapter = adapters[method];
  if (!adapter) return null;
  return adapter.checkStatus(refCode);
}

/* ── تنظیمات — فقط این بخش رو وقتی دستگاه خریدی عوض کن ── */
export function configurePayment(options) {
  if (options.pos_ip) localPosAdapter.config.ip = options.pos_ip;
  if (options.pos_port) localPosAdapter.config.port = options.pos_port;
  if (options.pos_timeout) localPosAdapter.config.timeout = options.pos_timeout;
  if (options.gateway) onlineGatewayAdapter.config.gateway = options.gateway;
  if (options.merchant_id) onlineGatewayAdapter.config.merchantId = options.merchant_id;
  if (options.callback_url) onlineGatewayAdapter.config.callbackUrl = options.callback_url;

  // وقتی دستگاه POS خریدی، این خط رو فعال کن:
  // adapters.card = localPosAdapter;
}