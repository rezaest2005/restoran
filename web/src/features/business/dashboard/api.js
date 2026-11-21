import client from "../api/client";

const unwrap = (res) => res?.data?.data ?? res?.data;

export const fetchSummary = (config) => client.get("/api/dashboard/summary/", config).then(unwrap);
