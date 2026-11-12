import client from "../api/client";

const unwrap = (r) => r.data?.data ?? r.data;
const clean = (p) => Object.fromEntries(Object.entries(p || {}).filter(([, v]) => v !== "" && v != null));

export const errMsg = (e, fallback = "") =>
  e?.response?.data?.error ||
  e?.response?.data?.message ||
  e?.response?.data?.detail ||
  e?.message ||
  fallback;

const crud = (name) => ({
  list: () => client.get(`/api/delivery/${name}/`).then(unwrap),
  create: (body) => client.post(`/api/delivery/${name}/`, body).then(unwrap),
  update: (id, body) => client.put(`/api/delivery/${name}/${id}/`, body).then(unwrap),
  remove: (id) => client.delete(`/api/delivery/${name}/${id}/`).then((r) => r.data),
});

export const vehiclesApi = crud("vehicles");
export const carriersApi = crud("carriers");
export const driversApi = crud("drivers");
export const setDriverShift = (id, on) => client.post(`/api/delivery/drivers/${id}/shift/`, { on }).then(unwrap);

export const fetchTrips = (params) => client.get("/api/delivery/trips/", { params: clean(params) }).then(unwrap);
export const fetchTrip = (id) => client.get(`/api/delivery/trips/${id}/`).then(unwrap);
export const createTrip = (body) => client.post("/api/delivery/trips/", body).then(unwrap);
export const assignTrip = (id, body) => client.post(`/api/delivery/trips/${id}/assign/`, body).then(unwrap);
export const setTripStatus = (id, status) => client.post(`/api/delivery/trips/${id}/status/`, { status }).then(unwrap);
export const setStopStatus = (id, body) => client.post(`/api/delivery/stops/${id}/status/`, body).then(unwrap);

export const fetchPendingOrders = () => client.get("/api/delivery/pending-orders/").then(unwrap);
/** Public tracking page URL (stop token for a customer, trip token for a cargo owner). */
export const trackingUrl = (token) => `${window.location.origin}/t/${token}`;

export const fetchMap = () => client.get("/api/delivery/map/").then(unwrap);
export const fetchCash = () => client.get("/api/delivery/cash/").then(unwrap);
export const fetchSettlements = (params) =>
  client.get("/api/delivery/settlements/", { params: clean(params) }).then(unwrap);
export const createSettlement = (body) => client.post("/api/delivery/settlements/", body).then(unwrap);

// driver app
export const fetchDriverMe = () => client.get("/api/delivery/driver/me/").then(unwrap);
export const setMyShift = (on) => client.post("/api/delivery/driver/shift/", { on }).then(unwrap);
export const setMyStopStatus = (id, body) =>
  client.post(`/api/delivery/driver/stops/${id}/status/`, body).then(unwrap);
export const sendMyLocation = (body) => client.post("/api/delivery/driver/location/", body).then(unwrap);

// public
export async function fetchTracking(token, signal) {
  const res = await fetch(`/api/delivery/track/${encodeURIComponent(token)}/`, { signal });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.success === false) {
    const err = new Error(body.error || "error");
    err.status = res.status;
    throw err;
  }
  return body.data;
}
