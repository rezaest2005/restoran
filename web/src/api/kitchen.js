import client from "./client";

export const kitchenApi = {
  dashboard: () => client.get("/api/kitchen/dashboard/"),
  createProduct: (data) => client.post("/api/kitchen/products/", data),
  updateProduct: (id, data) => client.patch(`/api/kitchen/products/${id}/`, data),
  produceProduct: (id, data) => client.post(`/api/kitchen/products/${id}/produce/`, data),
  calculateMaterials: (data) => client.post("/api/kitchen/calculate-materials/", data),
  createWaste: (data) => client.post("/api/kitchen/waste/", data),
  deleteWaste: (id) => client.delete(`/api/kitchen/waste/${id}/`),
  getKitchenOrders: () => client.get("/api/orders/kitchen/", { params: { status: "preparing" } }),
  markOrderReady: (id) => client.post(`/api/orders/${id}/status/`, { status: "ready" }),
  getMenuFoods: () => client.get("/api/dictionary/food-menu/"),
  getFoodCategories: () => client.get("/api/dictionary/food-categories/"),
};