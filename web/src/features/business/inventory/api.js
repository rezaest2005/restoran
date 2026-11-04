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
      data.materials || data.movements || data.suggestions || data.items || data.data || [];
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

const withQuery = (path, params = {}) => {
  const clean = {};
  Object.entries(params || {}).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") clean[k] = v;
  });
  const qs = new URLSearchParams(clean).toString();
  return `${path}${qs ? `?${qs}` : ""}`;
};

/* ═══════════ انبارها (Warehouses) ═══════════ */
export const fetchWarehouses = () =>
  safe(client.get("/api/inventory/warehouses/").then((r) => toList(r.data)), toList([]));

export const saveWarehouse = (data) =>
  client.post("/api/inventory/warehouses/save/", data).then((r) => r.data);
export const deleteWarehouse = (data) =>
  client.post("/api/inventory/warehouses/delete/", data).then((r) => r.data);

/* ═══════════ موجودی (Stock) ═══════════ */
// خروجی: { success, items: [...], count } — هر آیتم: raw_material_id, warehouse_id, quantity, ...
export const fetchStock = (params = {}) =>
  safe(
    client.get(withQuery("/api/inventory/stock/", params)).then((r) => r.data),
    { items: [], count: 0 }
  );
export const fetchStockItems = fetchStock;
export const updateMinimumStock = (data) =>
  client.post("/api/inventory/stock/minimum/", data).then((r) => r.data);

/* ═══════════ حرکات انبار (Movements) ═══════════ */
// type: in | out | waste | adjustment | transfer
// خروجی خام سرور: { success, results, count, page, pages, page_size }
export const fetchMovementList = (params = {}) =>
  safe(
    client.get(withQuery("/api/inventory/movements/", params)).then((r) => r.data),
    { results: [], count: 0, page: 1, pages: 1 }
  );

/* ═══════════ انتقال (Transfer) ═══════════ */
export const createTransfer = (data) =>
  client.post("/api/inventory/transfer/", data).then((r) => r.data);
export const fetchTransfers = (params = {}) =>
  fetchMovementList({ ...params, type: "transfer" }).then((d) => toList(d));
export const fetchTransferDetail = (id) => Promise.resolve({ id });
export const fetchStockTransfers = fetchTransfers;
export const createStockTransfer = createTransfer;

/* ═══════════ تحویل بار / ورود کالا (Receiving) ═══════════ */
// پشتیبانی از payload چندقلمی: { warehouse_id, items:[{raw_material_id, quantity, unit_price}], notes, supplier_id, invoice_number }
// قلم‌ها پشت‌سرهم ثبت می‌شوند؛ در صورت خطا پیام سرور (به‌همراه تعداد ثبت‌شده‌ها) نمایش داده می‌شود.
export const createReceiving = async (data = {}) => {
  const { items, supplier_id, invoice_number, ...base } = data;
  if (!Array.isArray(items)) {
    return client.post("/api/inventory/receive/", data).then((r) => r.data);
  }
  const noteParts = [];
  if (invoice_number) noteParts.push(`فاکتور ${invoice_number}`);
  if (base.notes) noteParts.push(base.notes);
  const notes = noteParts.join(" — ");
  const results = [];
  for (const it of items) {
    try {
      const res = await client.post("/api/inventory/receive/", { ...base, ...it, notes });
      results.push(res.data);
    } catch (err) {
      if (results.length && err.response?.data) {
        err.response.data.error =
          `${err.response.data.error || "خطا"} (${results.length} قلم قبل از خطا ثبت شد)`;
      }
      throw err;
    }
  }
  return { success: true, results };
};
export const fetchReceivings = (params = {}) =>
  fetchMovementList({ ...params, type: "in" }).then((d) => toList(d));
export const fetchReceiving = () => Promise.resolve({});
export const updateReceiving = () => notReady("ویرایش تحویل بار");
export const deleteReceiving = () => notReady("حذف تحویل بار");

/* ═══════════ خروج کالا (Issue) ═══════════ */
export const createIssue = (data) =>
  client.post("/api/inventory/issue/", data).then((r) => r.data);

/* ═══════════ ضایعات (Waste) ═══════════ */
export const createWaste = (data) =>
  client.post("/api/inventory/waste/", data).then((r) => r.data);
export const fetchWasteLogs = (params = {}) =>
  fetchMovementList({ ...params, type: "waste" }).then((d) => toList(d));
export const createWasteLog = createWaste;

/* ═══════════ اصلاح / شمارش (Adjustment) ═══════════ */
export const createAdjustment = (data) =>
  client.post("/api/inventory/adjust/", data).then((r) => r.data);
export const fetchStockAdjustments = (params = {}) =>
  fetchMovementList({ ...params, type: "adjustment" }).then((d) => toList(d));
export const createStockAdjustment = createAdjustment;

/* ═══════════ لیست خرید (Purchase List) — پیشنهاد خودکار، فقط‌خواندنی ═══════════ */
// خروجی خام سرور: { success, results, count, total_estimated_cost }
export const fetchPurchaseSuggestions = () =>
  safe(
    client.get("/api/inventory/purchase-suggestions/").then((r) => r.data),
    { results: [], count: 0, total_estimated_cost: 0 }
  );
export const fetchPurchaseList = () =>
  fetchPurchaseSuggestions().then((d) => toList(d));
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

export const fetchTransferReport = (params = {}) => fetchTransfers(params);

export const fetchStockValueReport = (params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return safe(
    client.get(`/api/inventory/reports/stock-value/${qs ? `?${qs}` : ""}`).then((r) => r.data),
    {}
  );
};

export const fetchWarehouseMovements = (params = {}) =>
  safe(
    client.get(withQuery("/api/inventory/reports/warehouse-movements/", params)).then((r) => toList(r.data)),
    toList([])
  );

/* ═══════════ داشبورد انبار ═══════════ */
export const fetchInventoryDashboard = () =>
  safe(client.get("/api/inventory/dashboard/").then((r) => r.data), {});

/* ═══════════ مواد اولیه (Raw Materials) ═══════════ */
export const fetchRawMaterials = () =>
  safe(
    client.get("/api/raw-materials/").then((r) => toList(r.data)),
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