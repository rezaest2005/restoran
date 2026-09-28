import client from "../api/client";

/* ═══════════════════════════════════════
   انبارها (Warehouses)
═══════════════════════════════════════ */

export const fetchWarehouses = () =>
  client.get("/api/inventory/warehouses/").then(r => r.data);

export const saveWarehouse = (data) =>
  client.post("/api/inventory/warehouses/save/", data).then(r => r.data);

export const deleteWarehouse = (data) =>
  client.post("/api/inventory/warehouses/delete/", data).then(r => r.data);

/* ═══════════════════════════════════════
   موجودی (Stock)
═══════════════════════════════════════ */

export const fetchStock = (params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return client.get(`/api/inventory/stock/?${qs}`).then(r => r.data);
};

export const updateMinimumStock = (data) =>
  client.post("/api/inventory/stock/minimum-update/", data).then(r => r.data);

/* ═══════════════════════════════════════
   انتقال (Transfer)
═══════════════════════════════════════ */

export const createTransfer = (data) =>
  client.post("/api/inventory/transfer/create/", data).then(r => r.data);

export const fetchTransfers = (params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return client.get(`/api/inventory/transfer/list/?${qs}`).then(r => r.data);
};

export const fetchTransferDetail = (id) =>
  client.get(`/api/inventory/transfer/detail/?id=${id}`).then(r => r.data);

/* ═══════════════════════════════════════
   تحویل بار / ورود کالا (Receiving)
═══════════════════════════════════════ */

export const createReceiving = (data) =>
  client.post("/api/inventory/receiving/create/", data).then(r => r.data);

/* ═══════════════════════════════════════
   خروج کالا (Issue)
═══════════════════════════════════════ */

export const createIssue = (data) =>
  client.post("/api/inventory/issue/create/", data).then(r => r.data);

/* ═══════════════════════════════════════
   ضایعات (Waste)
═══════════════════════════════════════ */

export const createWaste = (data) =>
  client.post("/api/inventory/waste/create/", data).then(r => r.data);

/* ═══════════════════════════════════════
   اصلاح / شمارش (Adjustment)
═══════════════════════════════════════ */

export const createAdjustment = (data) =>
  client.post("/api/inventory/adjustment/create/", data).then(r => r.data);

/* ═══════════════════════════════════════
   لیست خرید (Purchase List)
═══════════════════════════════════════ */

export const fetchPurchaseList = () =>
  client.get("/api/inventory/purchase-list/").then(r => r.data);

export const addToPurchaseList = (data) =>
  client.post("/api/inventory/purchase-list/add/", data).then(r => r.data);

export const updatePurchaseListStatus = (data) =>
  client.post("/api/inventory/purchase-list/status/", data).then(r => r.data);

/* ═══════════════════════════════════════
   گزارشات (Reports)
═══════════════════════════════════════ */

export const fetchItemMovement = (params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return client.get(`/api/inventory/reports/item-movement/?${qs}`).then(r => r.data);
};

export const fetchTransferReport = (params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return client.get(`/api/inventory/reports/transfer/?${qs}`).then(r => r.data);
};

export const fetchStockValueReport = (params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return client.get(`/api/inventory/reports/stock-value/?${qs}`).then(r => r.data);
};

export const fetchWarehouseMovements = (params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return client.get(`/api/inventory/reports/warehouse-movements/?${qs}`).then(r => r.data);
};

/* ═══════════════════════════════════════
   داشبورد انبار (Dashboard)
═══════════════════════════════════════ */

export const fetchInventoryDashboard = () =>
  client.get("/api/inventory/dashboard/").then(r => r.data);

/* ═══════════════════════════════════════
   مواد اولیه (برای Dropdown‌ها)
═══════════════════════════════════════ */

export const fetchRawMaterials = () =>
  client.get("/api/warehouse-json/").then(r => r.data);

/* ═══════════════════════════════════════
   تأمین‌کنندگان (برای Dropdown)
═══════════════════════════════════════ */

export const fetchSuppliers = () =>
  client.get("/api/suppliers/").then(r => r.data);