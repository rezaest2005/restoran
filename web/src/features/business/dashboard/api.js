import client from "../api/client";

const unwrap = (res) => res?.data?.data ?? res?.data;

export const fetchSummary = (config) => client.get("/api/dashboard/summary/", config).then(unwrap);
export const fetchSetup = () => client.get("/api/business/setup/").then(unwrap);
export const saveSetup = (body) => client.put("/api/business/setup/", body).then(unwrap);
export const setChecklistDismissed = (dismissed) =>
  client.post("/api/business/setup/checklist/", { dismissed }).then(unwrap);
