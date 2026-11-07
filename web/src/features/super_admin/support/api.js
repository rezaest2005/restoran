import superClient from "@super/api/super_client";

const unwrap = (r) => r.data?.data ?? r.data;

export const fetchSupportTickets = (params) =>
  superClient.get("/api/super/support/tickets/", { params }).then(unwrap);
export const fetchSupportSummary = () => superClient.get("/api/super/support/summary/").then(unwrap);

/** Adapter used by the shared thread dialog (module-level so its identity is stable). */
export const superThreadApi = {
  get: (id) => superClient.get(`/api/super/support/tickets/${id}/`).then(unwrap),
  reply: (id, message) => superClient.post(`/api/super/support/tickets/${id}/reply/`, { message }).then(unwrap),
  setStatus: (id, status) => superClient.post(`/api/super/support/tickets/${id}/status/`, { status }).then(unwrap),
};
