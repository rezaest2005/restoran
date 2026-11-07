import client from "../api/client";

/* ─── Catalog (products shared by every terminal) ─── */

export const fetchProducts = (signal) =>
  client
    .get("/api/catalog/products/", { params: { active: 1, page_size: 1000 }, signal })
    .then((r) => r.data?.data || []);

export const fetchCategories = (signal) =>
  client.get("/api/catalog/categories/", { signal }).then((r) => r.data?.data || []);

export const updateProduct = (id, data) =>
  client.put(`/api/catalog/products/${id}/`, data).then((r) => r.data?.data);

export const uploadProductImage = (id, file) => {
  const fd = new FormData();
  fd.append("image", file);
  return client.put(`/api/catalog/products/${id}/`, fd, { headers: { "Content-Type": "multipart/form-data" } }).then((r) => r.data?.data);
};

export const lookupBarcode = (code) =>
  client.get(`/api/pos/barcode/${encodeURIComponent(code)}/`).then((r) => r.data?.data);

/* ─── Orders ─────────────────────────── */

export const createOrder = (data) =>
  client.post("/api/pos/create-order/", data).then((r) => r.data);

export const fetchDailyReport = (date) =>
  client.get("/api/pos/daily-report/", { params: date ? { date } : {} }).then((r) => r.data);

export const fetchDailyOrders = (date, signal) =>
  client.get("/api/pos/daily-orders/", { params: date ? { date } : {}, signal }).then((r) => r.data);

export const fetchDaySummary = (date, signal) =>
  client.get("/api/pos/day-summary/", { params: date ? { date } : {}, signal }).then((r) => r.data);

/* ─── Incoming (QR / online) orders ──── */

export const fetchIncomingOrders = (status = "pending", signal) =>
  client.get("/api/pos/online-orders/", { params: { status }, signal }).then((r) => r.data);

export const setOrderStatus = (id, status) =>
  client.post(`/api/orders/${id}/status/`, { status }).then((r) => r.data);

export const rejectOnlineOrder = (id) =>
  client.post(`/api/pos/online-orders/${id}/reject/`).then((r) => r.data);
