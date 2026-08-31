
import client from "./client";

export const posApi = {
  dailyReport: () => client.get("/api/pos/daily-report/"),
  createOrder: (data) => client.post("/api/pos/create-order/", data),
  closeSummary: () => client.get("/api/pos/close-summary/"),
  closeDay: (data) => client.post("/api/pos/close-day/", data),
  closeHistory: () => client.get("/api/pos/close-history/"),
  closeReport: (id) => client.get("/api/pos/close-report/" + id + "/"),
  foodMenu: () => client.get("/api/dictionary/food-menu/"),
};
