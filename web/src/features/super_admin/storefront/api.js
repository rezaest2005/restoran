import client from "../api/super_client";

const unwrap = (r) => r.data?.data ?? r.data;
const base = (bid) => `/api/super/storefront/${bid}/`;

export const errMsg = (e, fallback = "") =>
  e?.response?.data?.error || e?.response?.data?.message || e?.response?.data?.detail || e?.message || fallback;

export const fetchMine = (bid) => client.get(base(bid)).then(unwrap);
export const saveMine = (bid, body) => client.put(base(bid), body).then(unwrap);
export const publishMine = (bid) => client.post(`${base(bid)}publish/`).then(unwrap);
export const unpublishMine = (bid) => client.post(`${base(bid)}unpublish/`).then(unwrap);
export const applyTemplate = (bid, template) => client.post(`${base(bid)}apply-template/`, { template }).then(unwrap);
export const fetchTemplates = () => client.get("/api/super/storefront/templates/").then(unwrap);
export const fetchRevisions = (bid) => client.get(`${base(bid)}revisions/`).then(unwrap);
export const restoreRevision = (bid, id, publish = false) =>
  client.post(`${base(bid)}revisions/${id}/restore/`, { publish }).then(unwrap);
export const saveDomain = (bid, custom_domain) => client.put(`${base(bid)}domain/`, { custom_domain }).then(unwrap);
export const uploadImage = (bid, file) => {
  const fd = new FormData();
  fd.append("file", file);
  return client.post(`${base(bid)}assets/`, fd, { headers: { "Content-Type": "multipart/form-data" } }).then(unwrap);
};
