import client from "../api/client";
import { unwrap } from "./common";

export const fetchTickets = () => client.get("/api/support/tickets/").then(unwrap);
export const createTicket = (body) => client.post("/api/support/tickets/", body).then(unwrap);
export const fetchTicket = (id) => client.get(`/api/support/tickets/${id}/`).then(unwrap);
export const replyTicket = (id, message) =>
  client.post(`/api/support/tickets/${id}/messages/`, { message }).then(unwrap);
export const resolveTicket = (id) => client.post(`/api/support/tickets/${id}/resolve/`).then(unwrap);

/** Adapter used by the shared thread dialog. */
export const businessThreadApi = {
  get: fetchTicket,
  reply: replyTicket,
  resolve: resolveTicket,
};
