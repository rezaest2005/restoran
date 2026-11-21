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

// ── journal drafts ─────────────────────────────────────────────────────────────
export const updateDraft = (id, body) => client.put(`/api/accounting/journal/${id}/`, body).then(unwrap);
export const deleteDraft = (id) => client.delete(`/api/accounting/journal/${id}/`).then((r) => r.data);
export const postDraft = (id) => client.post(`/api/accounting/journal/${id}/post/`).then(unwrap);

// ── professional accounting ────────────────────────────────────────────────────
export const fetchAccSettings = () => client.get("/api/accounting/settings/").then(unwrap);
export const saveAccSettings = (body) => client.put("/api/accounting/settings/", body).then(unwrap);
export const applyChartTemplate = (key) => client.post("/api/accounting/chart-templates/", { key }).then(unwrap);

export const fetchDetails = (params) => client.get("/api/accounting/details/", { params: clean(params) }).then(unwrap);
export const createDetail = (body) => client.post("/api/accounting/details/", body).then(unwrap);
export const updateDetail = (id, body) => client.put(`/api/accounting/details/${id}/`, body).then(unwrap);
export const deleteDetail = (id) => client.delete(`/api/accounting/details/${id}/`).then((r) => r.data);

export const fetchFiscalYears = () => client.get("/api/accounting/fiscal-years/").then(unwrap);
export const createFiscalYear = (body) => client.post("/api/accounting/fiscal-years/", body).then(unwrap);
export const fetchFiscalYear = (id) => client.get(`/api/accounting/fiscal-years/${id}/`).then(unwrap);
export const deleteFiscalYear = (id) => client.delete(`/api/accounting/fiscal-years/${id}/`).then((r) => r.data);
export const closeFiscalYear = (id) => client.post(`/api/accounting/fiscal-years/${id}/close/`, {}).then(unwrap);
export const reopenFiscalYear = (id) => client.post(`/api/accounting/fiscal-years/${id}/reopen/`, {}).then(unwrap);
export const lockPeriod = (id, locked) => client.post(`/api/accounting/periods/${id}/lock/`, { locked }).then(unwrap);

export const fetchMoneyAccounts = () => client.get("/api/accounting/money-accounts/").then(unwrap);
export const createMoneyAccount = (body) => client.post("/api/accounting/money-accounts/", body).then(unwrap);
export const updateMoneyAccount = (id, body) => client.put(`/api/accounting/money-accounts/${id}/`, body).then(unwrap);
export const fetchReconcile = (id, params) =>
  client.get(`/api/accounting/money-accounts/${id}/reconcile/`, { params: clean(params) }).then(unwrap);
export const importStatement = (id, rows) =>
  client.post(`/api/accounting/money-accounts/${id}/statement/`, { rows }).then(unwrap);
export const autoMatch = (id) => client.post(`/api/accounting/money-accounts/${id}/auto-match/`).then(unwrap);
export const deleteStatementLine = (id) => client.delete(`/api/accounting/statement-lines/${id}/`).then((r) => r.data);
export const matchStatementLine = (id, lineId) =>
  client.post(`/api/accounting/statement-lines/${id}/match/`, { line_id: lineId }).then(unwrap);
export const unmatchStatementLine = (id) =>
  client.delete(`/api/accounting/statement-lines/${id}/match/`).then((r) => r.data);
export const fetchTransfers = () => client.get("/api/accounting/transfers/").then(unwrap);
export const createTransfer = (body) => client.post("/api/accounting/transfers/", body).then(unwrap);
export const cancelTransfer = (id) => client.post(`/api/accounting/transfers/${id}/cancel/`).then(unwrap);

export const fetchCheques = (params) => client.get("/api/accounting/cheques/", { params: clean(params) }).then(unwrap);
export const fetchChequeReminders = () => client.get("/api/accounting/cheques/reminders/").then(unwrap);
export const createCheque = (body) => client.post("/api/accounting/cheques/", body).then(unwrap);
export const fetchCheque = (id) => client.get(`/api/accounting/cheques/${id}/`).then(unwrap);
export const chequeStatus = (id, body) => client.post(`/api/accounting/cheques/${id}/status/`, body).then(unwrap);
export const chequeUndo = (id) => client.post(`/api/accounting/cheques/${id}/undo/`).then(unwrap);

export const fetchBudgets = () => client.get("/api/accounting/budgets/").then(unwrap);
export const createBudget = (body) => client.post("/api/accounting/budgets/", body).then(unwrap);
export const fetchBudget = (id) => client.get(`/api/accounting/budgets/${id}/`).then(unwrap);
export const updateBudget = (id, body) => client.put(`/api/accounting/budgets/${id}/`, body).then(unwrap);
export const deleteBudget = (id) => client.delete(`/api/accounting/budgets/${id}/`).then((r) => r.data);

export const createVatDocument = (body) => client.post("/api/accounting/vat-documents/", body).then(unwrap);

export const fetchJournalBook = (p) => report("journal-book", p);
export const fetchTrialBalanceExt = (p) => report("trial-balance-ext", p);
export const fetchCashFlow = (p) => report("cash-flow", p);
export const fetchAging = (p) => report("aging", p);
export const fetchPartyBalances = (p) => report("party-balances", p);
export const fetchVatReport = (p) => report("vat", p);
