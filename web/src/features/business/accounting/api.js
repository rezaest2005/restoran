import client from "../api/client";

const unwrap = (r) => r.data?.data ?? r.data;
const clean = (p) => Object.fromEntries(Object.entries(p || {}).filter(([, v]) => v !== "" && v != null));

export const errMsg = (e, fallback = "") =>
  e?.response?.data?.error ||
  e?.response?.data?.message ||
  e?.response?.data?.detail ||
  e?.message ||
  fallback;

export const fetchSummary = () => client.get("/api/accounting/summary/").then(unwrap);

export const fetchAccounts = () => client.get("/api/accounting/accounts/").then(unwrap);
export const createAccount = (body) => client.post("/api/accounting/accounts/", body).then(unwrap);
export const updateAccount = (id, body) => client.put(`/api/accounting/accounts/${id}/`, body).then(unwrap);
export const deleteAccount = (id) => client.delete(`/api/accounting/accounts/${id}/`).then((r) => r.data);

export const fetchCostCenters = () => client.get("/api/accounting/cost-centers/").then(unwrap);

export const fetchJournal = (params) =>
  client.get("/api/accounting/journal/", { params: clean(params) }).then(unwrap);
export const fetchEntry = (id) => client.get(`/api/accounting/journal/${id}/`).then(unwrap);
export const createEntry = (body) => client.post("/api/accounting/journal/", body).then(unwrap);
export const reverseEntry = (id, reason) =>
  client.post(`/api/accounting/journal/${id}/reverse/`, reason ? { reason } : {}).then(unwrap);

const report = (name, params) =>
  client.get(`/api/accounting/reports/${name}/`, { params: clean(params) }).then(unwrap);
export const fetchTrialBalance = (p) => report("trial-balance", p);
export const fetchLedger = (p) => report("ledger", p);
export const fetchIncomeStatement = (p) => report("income-statement", p);
export const fetchBalanceSheet = (p) => report("balance-sheet", p);

// ── autopilot: the simple screens ──────────────────────────────────────────────
export const fetchAutopilot = () => client.get("/api/accounting/autopilot/").then(unwrap);
export const saveOpening = (body) => client.post("/api/accounting/opening/", body).then(unwrap);
export const fetchExpenses = (params) => client.get("/api/accounting/expenses/", { params: clean(params) }).then(unwrap);
export const createExpense = (body) => client.post("/api/accounting/expenses/", body).then(unwrap);
export const deleteExpense = (id) => client.delete(`/api/accounting/expenses/${id}/`).then((r) => r.data);
export const fetchPayments = () => client.get("/api/accounting/payments/").then(unwrap);
export const createPayment = (body) => client.post("/api/accounting/payments/", body).then(unwrap);
export const deletePayment = (id) => client.delete(`/api/accounting/payments/${id}/`).then((r) => r.data);
export const fetchRecurring = () => client.get("/api/accounting/recurring/").then(unwrap);
export const createRecurring = (body) => client.post("/api/accounting/recurring/", body).then(unwrap);
export const updateRecurring = (id, body) => client.put(`/api/accounting/recurring/${id}/`, body).then(unwrap);
export const deleteRecurring = (id) => client.delete(`/api/accounting/recurring/${id}/`).then((r) => r.data);
