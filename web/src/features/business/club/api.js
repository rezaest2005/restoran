import client from "../api/client";

const unwrap = (r) => r.data?.data ?? r.data;

export const errMsg = (e, fallback = "") =>
  e?.response?.data?.error || e?.response?.data?.message || e?.response?.data?.detail || e?.message || fallback;

export const fetchSettings = () => client.get("/api/club/settings/").then(unwrap);
export const saveSettings = (body) => client.put("/api/club/settings/", body).then(unwrap);
export const fetchMembers = (q = "") =>
  client.get("/api/club/members/", { params: q ? { q } : {} }).then(unwrap);
export const createMember = (body) => client.post("/api/club/members/", body).then(unwrap);
export const fetchMember = (id) => client.get(`/api/club/members/${id}/`).then(unwrap);
export const adjustMember = (id, points, note) =>
  client.post(`/api/club/members/${id}/adjust/`, { points, note }).then(unwrap);
