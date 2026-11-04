import client from "../api/client";

const unwrap = (r) => r.data?.data ?? r.data;

export const errMsg = (e, fallback = "") =>
  e?.response?.data?.error || e?.response?.data?.message || e?.response?.data?.detail || e?.message || fallback;

export const fetchMine = () => client.get("/api/storefront/mine/").then(unwrap);
export const saveMine = (body) => client.put("/api/storefront/mine/", body).then(unwrap);
export const publishMine = () => client.post("/api/storefront/mine/publish/").then(unwrap);
export const unpublishMine = () => client.post("/api/storefront/mine/unpublish/").then(unwrap);
export const applyTemplate = (template) =>
  client.post("/api/storefront/mine/apply-template/", { template }).then(unwrap);
export const fetchTemplates = () => client.get("/api/storefront/templates/").then(unwrap);
export const fetchRevisions = () => client.get("/api/storefront/mine/revisions/").then(unwrap);
export const restoreRevision = (id, publish = false) =>
  client.post(`/api/storefront/mine/revisions/${id}/restore/`, { publish }).then(unwrap);
export const uploadImage = (file) => {
  const fd = new FormData();
  fd.append("file", file);
  return client.post("/api/storefront/mine/assets/", fd, { headers: { "Content-Type": "multipart/form-data" } }).then(unwrap);
};
