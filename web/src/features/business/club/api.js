import client from "../api/client";

const unwrap = (r) => r.data?.data ?? r.data;

export const errMsg = (e, fallback = "") =>
  e?.response?.data?.error || e?.response?.data?.message || e?.response?.data?.detail || e?.message || fallback;

export const fetchSettings = () => client.get("/api/club/settings/").then(unwrap);
export const saveSettings = (body) => client.put("/api/club/settings/", body).then(unwrap);
export const fetchMembers = (params = {}) => {
  const p = typeof params === "string" ? { q: params } : params;
  const clean = Object.fromEntries(Object.entries(p).filter(([, v]) => v !== "" && v != null));
  return client.get("/api/club/members/", { params: clean }).then(unwrap);
};
export const createMember = (body) => client.post("/api/club/members/", body).then(unwrap);
export const fetchMember = (id) => client.get(`/api/club/members/${id}/`).then(unwrap);
export const updateMember = (id, body) => client.put(`/api/club/members/${id}/`, body).then(unwrap);
export const adjustMember = (id, points, note) =>
  client.post(`/api/club/members/${id}/adjust/`, { points, note }).then(unwrap);
export const walletMember = (id, amount, note, kind = "topup") =>
  client.post(`/api/club/members/${id}/wallet/`, { amount, note, kind }).then(unwrap);
export const redeemReward = (id, rewardId) =>
  client.post(`/api/club/members/${id}/reward/`, { reward_id: rewardId }).then(unwrap);

export const lookupMember = (body) => client.post("/api/club/lookup/", body).then(unwrap);
export const quotePurchase = (body) => client.post("/api/club/purchases/quote/", body).then(unwrap);
export const createPurchase = (body) => client.post("/api/club/purchases/", body).then(unwrap);
export const fetchPurchases = (params = {}) => client.get("/api/club/purchases/", { params }).then(unwrap);
export const voidPurchase = (id) => client.post(`/api/club/purchases/${id}/void/`, {}).then(unwrap);

/** Generic CRUD for tiers | rules | rewards | coupons | campaigns. */
export const crud = (kind) => ({
  list: () => client.get(`/api/club/${kind}/`).then(unwrap),
  create: (body) => client.post(`/api/club/${kind}/`, body).then(unwrap),
  update: (id, body) => client.put(`/api/club/${kind}/${id}/`, body).then(unwrap),
  remove: (id) => client.delete(`/api/club/${kind}/${id}/`).then(unwrap),
});
export const runCampaign = (id) => client.post(`/api/club/campaigns/${id}/run/`, {}).then((r) => r.data);
export const fetchMessages = () => client.get("/api/club/messages/").then(unwrap);
export const fetchReport = (days) => client.get("/api/club/reports/", { params: { days } }).then(unwrap);
export const runDaily = () => client.post("/api/club/run-daily/", {}).then(unwrap);
