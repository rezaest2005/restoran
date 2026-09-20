import client from "../api/client";

/* ─── POS Settings ──────────────────── */

export const fetchPosSettings = () =>
  client.get("/api/pos/settings/").then(r => r.data);

export const updatePosSettings = (data) =>
  client.post("/api/pos/settings/", data).then(r => r.data);

/* ─── Foods & Categories (for dictionary mode) ─── */

export const fetchFoods = () =>
  client.get("/api/dictionary/food-menu/").then(r => r.data.items || []);

export const fetchCategories = () =>
  client.get("/api/dictionary/list/").then(r => r.data.categories || []);

/* ─── Orders ─────────────────────────── */

export const createOrder = (data) =>
  client.post("/api/pos/create-order/", data).then(r => r.data);

export const fetchDailyReport = (date) =>
  client.get("/api/pos/daily-report/", { params: date ? { date } : {} }).then(r => r.data);

/* ─── Day Close ──────────────────────── */

export const fetchCloseSummary = () =>
  client.get("/api/pos/close-summary/").then(r => r.data);

export const closeDay = () =>
  client.post("/api/pos/close-day/").then(r => r.data);

export const fetchCloseHistory = (limit = 30) =>
  client.get("/api/pos/close-history/", { params: { limit } }).then(r => r.data);

export const fetchDailyOrders = (date) =>
  client.get("/api/pos/daily-orders/", { params: date ? { date } : {} }).then(r => r.data);