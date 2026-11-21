import client from "../api/client";

const unwrap = (r) => r.data?.data ?? r.data;

export const errMsg = (e, fallback = "") =>
  e?.response?.data?.error ||
  e?.response?.data?.message ||
  e?.response?.data?.detail ||
  e?.message ||
  fallback;

/* Formulas — read-only here; they are defined in Definitions (dictionary/) */
export const fetchFormulas = () => client.get("/api/formulas/").then(unwrap);
export const fetchFormula = (id) => client.get(`/api/formulas/${id}/`).then(unwrap);

/* Production orders */
export const fetchOrders = (status) =>
  client.get("/api/production/orders/", { params: status ? { status } : {} }).then(unwrap);
export const fetchOrder = (id) => client.get(`/api/production/orders/${id}/`).then(unwrap);
export const createOrder = (body) => client.post("/api/production/orders/", body).then(unwrap);
export const startOrder = (id) => client.post(`/api/production/orders/${id}/start/`, {}).then(unwrap);
export const completeOrder = (id, produced_quantity, extra = {}) =>
  client.post(`/api/production/orders/${id}/complete/`, { produced_quantity, ...extra }).then(unwrap);
export const cancelOrder = (id) => client.post(`/api/production/orders/${id}/cancel/`, {}).then(unwrap);

/* Job cards (production line stages of one order) */
export const startStep = (orderId, stepId) =>
  client.post(`/api/production/orders/${orderId}/steps/${stepId}/start/`, {}).then(unwrap);
export const completeStep = (orderId, stepId, body) =>
  client.post(`/api/production/orders/${orderId}/steps/${stepId}/complete/`, body || {}).then(unwrap);
export const skipStep = (orderId, stepId) =>
  client.post(`/api/production/orders/${orderId}/steps/${stepId}/skip/`, {}).then(unwrap);

/* "How many do I want?" planner */
export const runPlan = (body) => client.post("/api/production/plan/", body).then(unwrap);
