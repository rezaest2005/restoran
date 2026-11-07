import client from "../api/client";

const unwrap = (r) => r.data?.data ?? r.data;

export const errMsg = (e, fallback = "") =>
  e?.response?.data?.error || e?.response?.data?.message || e?.response?.data?.detail || e?.message || fallback;

export const fetchFeedback = (params = {}) => client.get("/api/feedback/list/", { params }).then(unwrap);
export const updateFeedback = (id, body) => client.post(`/api/feedback/${id}/update/`, body).then(unwrap);
