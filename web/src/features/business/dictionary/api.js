import client from "../api/client";

/** { success, data } envelope -> data (falls back to the raw body). */
const unwrap = (r) => r.data?.data ?? r.data;

/** Best human message from an API error (server validation text first). */
export const errMsg = (e, fallback = "") => {
  const d = e?.response?.data;
  const first = (v) => (Array.isArray(v) ? first(v[0]) : v && typeof v === "object" ? first(Object.values(v)[0]) : v);
  return (
    (typeof d?.error === "string" && d.error) ||
    (typeof d?.message === "string" && d.message) ||
    (typeof d?.detail === "string" && d.detail) ||
    (d?.errors && first(d.errors)) ||
    e?.message ||
    fallback
  );
};

/* ── Categories ─────────────────────────────── */
export const fetchCategories = () => client.get("/api/catalog/categories/").then(unwrap);
export const createCategory = (body) => client.post("/api/catalog/categories/", body).then(unwrap);
export const updateCategory = (id, body) => client.put(`/api/catalog/categories/${id}/`, body).then(unwrap);
export const deleteCategory = (id) => client.delete(`/api/catalog/categories/${id}/`).then((r) => r.data);

/* ── Products (sellable) ────────────────────── */
/** Paged list: resolves { rows, total }. */
export const fetchProducts = (params = {}) =>
  client.get("/api/catalog/products/", { params }).then((r) => ({ rows: r.data?.data || [], total: r.data?.total ?? 0 }));
export const createProduct = (formData) =>
  client.post("/api/catalog/products/", formData, { headers: { "Content-Type": "multipart/form-data" } }).then(unwrap);
export const updateProduct = (id, formData) =>
  client.put(`/api/catalog/products/${id}/`, formData, { headers: { "Content-Type": "multipart/form-data" } }).then(unwrap);
export const deleteProduct = (id) => client.delete(`/api/catalog/products/${id}/`).then((r) => r.data);

/* ── Items (raw / semi-finished / packaging / finished) ── */
export const fetchItems = (params = {}) =>
  client.get("/api/catalog/items/", { params }).then((r) => ({ rows: r.data?.data || [], total: r.data?.total ?? 0 }));
export const createItem = (body) => client.post("/api/catalog/items/", body).then(unwrap);
export const updateItem = (id, body) => client.put(`/api/catalog/items/${id}/`, body).then(unwrap);
export const deleteItem = (id) => client.delete(`/api/catalog/items/${id}/`).then((r) => r.data);

/* ── Barcodes ───────────────────────────────── */
export const generateBarcodes = (body) => client.post("/api/catalog/barcodes/generate/", body).then(unwrap);
/** { rows, missing } — rows already repeated `copies` times by the server. */
export const fetchBarcodeLabels = (params) =>
  client.get("/api/catalog/barcodes/labels/", { params }).then((r) => ({ rows: r.data?.data || [], missing: r.data?.missing || [] }));

/* ── Formulas (definition only; production orders live in production/) ── */
export const fetchMaterials = () => client.get("/api/production/materials/").then(unwrap);
export const fetchFormulas = () => client.get("/api/formulas/").then(unwrap);
export const fetchFormula = (id) => client.get(`/api/formulas/${id}/`).then(unwrap);
export const createFormula = (body) => client.post("/api/formulas/", body).then(unwrap);
export const updateFormula = (id, body) => client.put(`/api/formulas/${id}/`, body).then(unwrap);
export const deleteFormula = (id) => client.delete(`/api/formulas/${id}/`).then((r) => r.data);

/* ── Suppliers ──────────────────────────────── */
export const fetchSuppliers = () =>
  client.get("/api/suppliers/").then((r) => {
    const d = r.data;
    return Array.isArray(d) ? d : d?.suppliers || d?.results || [];
  });
export const saveSupplier = (body) => client.post("/api/suppliers/save/", body).then((r) => r.data);
export const deleteSupplier = (id) => client.post("/api/suppliers/delete/", { id }).then((r) => r.data);

/* ── Customers ──────────────────────────────── */
export const fetchCustomers = () =>
  client.get("/api/invoicing/customers/").then((r) => {
    const d = r.data;
    return Array.isArray(d) ? d : d?.results || [];
  });
export const createCustomer = (body) => client.post("/api/invoicing/customers/", body).then((r) => r.data);
export const updateCustomer = (id, body) => client.put(`/api/invoicing/customers/${id}/`, body).then((r) => r.data);
export const deleteCustomer = (id) => client.delete(`/api/invoicing/customers/${id}/`).then((r) => r.data);

/* ── Warehouses ─────────────────────────────── */
export const fetchWarehouses = () =>
  client.get("/api/inventory/warehouses/").then((r) => {
    const d = r.data;
    return Array.isArray(d) ? d : d?.warehouses || [];
  });
export const saveWarehouse = (body) => client.post("/api/inventory/warehouses/save/", body).then((r) => r.data);
export const deleteWarehouse = (id) => client.post("/api/inventory/warehouses/delete/", { id }).then((r) => r.data);
export const setSalesDefault = (id, value) =>
  client.post(`/api/catalog/warehouses/${id}/sales-default/`, { value }).then(unwrap);

/* ── Users & access ─────────────────────────── */
export const fetchUsers = () => client.get("/api/users/management/").then((r) => r.data?.users || []);
export const createUser = (body) => client.post("/api/users/create/", body).then((r) => r.data);
export const updateUserRole = (body) => client.post("/api/users/update-role/", body).then((r) => r.data);
export const toggleUserActive = (body) => client.post("/api/users/toggle-active/", body).then((r) => r.data);
export const resetUserPassword = (body) => client.post("/api/users/reset-password/", body).then((r) => r.data);
export const deleteUser = (body) => client.post("/api/users/delete/", body).then((r) => r.data);
export const saveUserTabs = (body) => client.post("/api/users/tabs/", body).then((r) => r.data);
export const fetchUserWarehouses = (id) =>
  client.get(`/api/inventory/users/${id}/warehouses/`).then(unwrap);
export const saveUserWarehouses = (id, body) =>
  client.put(`/api/inventory/users/${id}/warehouses/`, body).then(unwrap);
