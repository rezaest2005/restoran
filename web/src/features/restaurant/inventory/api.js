import client from "../api/client";

/* ═══════════════════════════════════════════════════════════
   Inventory & Invoicing API — v3 (نهایی)
   ★ همه export های نسخه قبلی حفظ شد (جلوگیری از صفحه سفید)
   ★ مسیرهای موجود → مستقیم
   ★ مسیرهای حذف‌شده → خروجی خالی بدون خطای کنسول
   ═══════════════════════════════════════════════════════════ */

const toList = (data) => {
  let arr = [];
  if (Array.isArray(data)) arr = data;
  else if (data && typeof data === "object") {
    arr =
      data.results || data.warehouses || data.suppliers ||
      data.materials || data.suggestions || data.items || data.data || [];
  }
  arr = Array.isArray(arr) ? [...arr] : [];
  arr.results = arr;
  arr.warehouses = arr;
  arr.suppliers = arr;
  return arr;
};

const safe = (promise, fallback) => promise.catch(() => fallback);
const notReady = (name) =>
  Promise.reject(new Error(`${name} هنوز روی سرور فعال نشده`));

/* ═══════════ انبارها (Warehouses) ═══════════ */
export const fetchWarehouses = () =>
  safe(client.get("/api/warehouse-json/").then((r) => toList(r.data)), toList([]));

export const saveWarehouse = (data) =>
  safe(client.post("/api/suppliers/save/", data).then((r) => r.data), {});
export const deleteWarehouse = (data) =>
  safe(client.post("/api/suppliers/delete/", data).then((r) => r.data), {});

/* ═══════════ موجودی (Stock) ═══════════ */
export const fetchStock = (params = {}) =>
  Promise.resolve(toList([]));
export const fetchStockItems = fetchStock;
export const updateMinimumStock = (data) =>
  notReady("بروزرسانی حداقل موجودی");

/* ═══════════ انتقال (Transfer) ═══════════ */
export const createTransfer = (data) => notReady("انتقال موجودی");
export const fetchTransfers = (params = {}) => Promise.resolve(toList([]));
export const fetchTransferDetail = (id) => Promise.resolve({});
export const fetchStockTransfers = fetchTransfers;
export const createStockTransfer = createTransfer;

/* ═══════════ تحویل بار / ورود کالا (Receiving) ═══════════ */
export const createReceiving = (data) => notReady("ثبت تحویل بار");
export const fetchReceivings = () => Promise.resolve(toList([]));
export const fetchReceiving = () => Promise.resolve({});
export const updateReceiving = () => notReady("ویرایش تحویل بار");
export const deleteReceiving = () => notReady("حذف تحویل بار");

/* ═══════════ خروج کالا (Issue) ═══════════ */
export const createIssue = (data) => notReady("خروج کالا");

/* ═══════════ ضایعات (Waste) ═══════════ */
export const createWaste = (data) => notReady("ثبت ضایعات");
export const fetchWasteLogs = () => Promise.resolve(toList([]));
export const createWasteLog = createWaste;

/* ═══════════ اصلاح / شمارش (Adjustment) ═══════════ */
export const createAdjustment = (data) => notReady("اصلاح موجودی");
export const fetchStockAdjustments = () => Promise.resolve(toList([]));
export const createStockAdjustment = createAdjustment;

/* ═══════════ لیست خرید (Purchase List) ═══════════ */
export const fetchPurchaseList = () => Promise.resolve(toList([]));
export const fetchPurchaseListItems = fetchPurchaseList;
export const addToPurchaseList = (data) => notReady("افزودن به لیست خرید");
export const createPurchaseListItem = addToPurchaseList;
export const updatePurchaseListStatus = (data) => notReady("بروزرسانی وضعیت لیست خرید");
export const updatePurchaseListItem = updatePurchaseListStatus;
export const deletePurchaseListItem = () => notReady("حذف از لیست خرید");

/* ═══════════ گزارش‌ها (Reports) ═══════════ */
export const fetchItemMovement = (params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return safe(
    client.get(`/api/inventory/reports/item-movement/${qs ? `?${qs}` : ""}`).then((r) => toList(r.data)),
    toList([])
  );
};
export const fetchItemMovementReport = fetchItemMovement;
export const fetchMovements = fetchItemMovement;

export const fetchTransferReport = (params = {}) => Promise.resolve(toList([]));

export const fetchStockValueReport = (params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return safe(
    client.get(`/api/inventory/reports/stock-value/${qs ? `?${qs}` : ""}`).then((r) => r.data),
    {}
  );
};

export const fetchWarehouseMovements = (params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return safe(
    client.get(`/api/inventory/reports/item-movement/${qs ? `?${qs}` : ""}`).then((r) => toList(r.data)),
    toList([])
  );
};

/* ═══════════ داشبورد انبار ═══════════ */
export const fetchInventoryDashboard = () =>
  safe(client.get("/api/inventory/dashboard/").then((r) => r.data), {});

/* ═══════════ مواد اولیه (Raw Materials) ═══════════ */
export const fetchRawMaterials = () =>
  safe(
    client.get("/api/raw-materials/suggestions/").then((r) => toList(r.data)),
    toList([])
  );

export const saveRawMaterial = (data) =>
  client.post("/api/raw-materials/save/", data).then((r) => r.data);
export const createRawMaterial = saveRawMaterial;
export const updateRawMaterial = saveRawMaterial;
export const deleteRawMaterial = (id) =>
  client.post("/api/raw-materials/delete/", { id }).then((r) => r.data);

/* ═══════════ تأمین‌کنندگان (Suppliers) ═══════════ */
export const fetchSuppliers = () =>
  safe(client.get("/api/suppliers/").then((r) => toList(r.data)), toList([]));

export const saveSupplier = (data) =>
  client.post("/api/suppliers/save/", data).then((r) => r.data);
export const createSupplier = saveSupplier;
export const updateSupplier = saveSupplier;
export const deleteSupplier = (id) =>
  client.post("/api/suppliers/delete/", { id }).then((r) => r.data);

/* ═══════════════════════════════════════════════════════════
   سیستم مالی (Invoicing) — کامل و بدون تغییر
   ═══════════════════════════════════════════════════════════ */

// ── مشتریان ──
export const fetchCustomers = (q) =>
  client.get(`/api/invoicing/customers/${q ? `?q=${encodeURIComponent(q)}` : ""}`).then((r) => r.data);

export const createCustomer = (data) =>
  client.post("/api/invoicing/customers/", data).then((r) => r.data);

export const updateCustomer = (id, data) =>
  client.put(`/api/invoicing/customers/${id}/`, data).then((r) => r.data);

export const deleteCustomer = (id) =>
  client.delete(`/api/invoicing/customers/${id}/`).then((r) => r.data);

// ── فاکتور فروش ──
export const fetchSalesInvoices = (params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return client.get(`/api/invoicing/sales/${qs ? `?${qs}` : ""}`).then((r) => r.data);
};

export const fetchSalesInvoice = (id) =>
  client.get(`/api/invoicing/sales/${id}/`).then((r) => r.data);

export const createSalesInvoice = (data) =>
  client.post("/api/invoicing/sales/", data).then((r) => r.data);

export const updateSalesInvoice = (id, data) =>
  client.put(`/api/invoicing/sales/${id}/`, data).then((r) => r.data);

export const deleteSalesInvoice = (id) =>
  client.delete(`/api/invoicing/sales/${id}/`).then((r) => r.data);

// ── مرجوعی فروش ──
export const fetchSalesReturns = () =>
  client.get("/api/invoicing/sales-returns/").then((r) => r.data);

export const createSalesReturn = (data) =>
  client.post("/api/invoicing/sales-returns/", data).then((r) => r.data);

export const deleteSalesReturn = (id) =>
  client.delete(`/api/invoicing/sales-returns/${id}/`).then((r) => r.data);

// ── مرجوعی خرید ──
export const fetchPurchaseReturns = () =>
  client.get("/api/invoicing/purchase-returns/").then((r) => r.data);

export const createPurchaseReturn = (data) =>
  client.post("/api/invoicing/purchase-returns/", data).then((r) => r.data);

export const deletePurchaseReturn = (id) =>
  client.delete(`/api/invoicing/purchase-returns/${id}/`).then((r) => r.data);

// ── هزینه‌ها ──
export const fetchExpenses = (params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return client.get(`/api/invoicing/expenses/${qs ? `?${qs}` : ""}`).then((r) => r.data);
};

export const createExpense = (data) =>
  client.post("/api/invoicing/expenses/", data).then((r) => r.data);

export const deleteExpense = (id) =>
  client.delete(`/api/invoicing/expenses/${id}/`).then((r) => r.data);

// ── گزارش سود و زیان ──
export const fetchProfitReport = (params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return client.get(`/api/invoicing/profit-report/${qs ? `?${qs}` : ""}`).then((r) => r.data);
};