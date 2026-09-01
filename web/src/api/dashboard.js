import client from "./client";

export const dashboardApi = {
  dailyReport: (params) => client.get("/api/pos/daily-report/", { params }),
  loyaltyDashboard: () => client.get("/api/loyalty/dashboard/"),
  closeSummary: () => client.get("/api/pos/close-summary/"),
  orders: (params) => client.get("/api/orders/", { params }),
};