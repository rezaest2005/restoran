import client from "../api/client";

const unwrap = (r) => r.data?.data ?? r.data;

export const errMsg = (e, fallback = "") =>
  e?.response?.data?.error ||
  e?.response?.data?.message ||
  e?.response?.data?.detail ||
  e?.message ||
  fallback;

/* Formulas */
export const fetchMaterials = () =>
  client.get("/api/production/materials/").then(unwrap);
export const fetchFormulas = () => client.get("/api/formulas/").then(unwrap);
export const fetchFormula = (id) => client.get(`/api/formulas/${id}/`).then(unwrap);
export const createFormula = (body) => client.post("/api/formulas/", body).then(unwrap);
export const updateFormula = (id, body) => client.put(`/api/formulas/${id}/`, body).then(unwrap);
export const deleteFormula = (id) => client.delete(`/api/formulas/${id}/`).then((r) => r.data);

/* Production orders */
export const fetchOrders = (status) =>
  client.get("/api/production/orders/", { params: status ? { status } : {} }).then(unwrap);
export const fetchOrder = (id) => client.get(`/api/production/orders/${id}/`).then(unwrap);
export const createOrder = (body) => client.post("/api/production/orders/", body).then(unwrap);
export const startOrder = (id) => client.post(`/api/production/orders/${id}/start/`, {}).then(unwrap);
export const completeOrder = (id, produced_quantity) =>
  client.post(`/api/production/orders/${id}/complete/`, { produced_quantity }).then(unwrap);
export const cancelOrder = (id) => client.post(`/api/production/orders/${id}/cancel/`, {}).then(unwrap);
