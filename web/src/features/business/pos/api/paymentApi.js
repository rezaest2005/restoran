import client from "../../api/client";

/* ── Config ─────────────────────────── */
export const fetchPaymentConfig = () =>
  client.get("/api/payment/config/").then(r => r.data);

export const savePaymentConfig = (data) =>
  client.post("/api/payment/config/", data).then(r => r.data);

export const deletePaymentConfig = (type, id) =>
  client.post("/api/payment/config/delete/", { type, id }).then(r => r.data);

export const testConnection = (type, id) =>
  client.post("/api/payment/test-connection/", { type, id }).then(r => r.data);

/* ── Card Reader ────────────────────── */
export const cardReaderPay = (terminal_id, amount, order_id) =>
  client.post("/api/payment/card/pay/", { terminal_id, amount, order_id }, { timeout: 130000 })
    .then(r => r.data);

export const cardReaderCancel = (transaction_id) =>
  client.post("/api/payment/card/cancel/", { transaction_id }).then(r => r.data);

/* ── Online Payment ─────────────────── */
export const onlinePaymentCreate = (gateway_id, amount, order_id, description, callback_url) =>
  client.post("/api/payment/online/create/", {
    gateway_id, amount, order_id, description, callback_url,
  }).then(r => r.data);

/* ── Status ─────────────────────────── */
export const checkPaymentStatus = (transaction_id) =>
  client.get("/api/payment/status/", { params: { transaction_id } }).then(r => r.data);

export const fetchTransactions = (method, date) =>
  client.get("/api/payment/transactions/", { params: { method, date } }).then(r => r.data);