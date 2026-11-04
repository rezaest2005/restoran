/** Status → palette colour keys shared by the delivery screens. */
export const tripStatusColor = (C, s) => ({
  planned: C.muted, assigned: C.info, in_progress: C.warning, completed: C.success, cancelled: C.danger,
}[s] || C.muted);

export const stopStatusColor = (C, s) => ({
  pending: C.muted, picked_up: C.info, arrived: C.accent, delivered: C.success, failed: C.danger,
}[s] || C.muted);

export const TRIP_STATUSES = ["planned", "assigned", "in_progress", "completed", "cancelled"];
export const STOP_STATUSES = ["pending", "picked_up", "arrived", "delivered", "failed"];
export const VEHICLE_KINDS = ["motorbike", "car", "van", "truck", "other"];
export const PAY_METHODS = ["cash", "card", "transfer", "door"];

/** Allowed next trip statuses (mirrors the backend state machine). */
export const NEXT_TRIP = {
  planned: ["in_progress", "cancelled"],
  assigned: ["in_progress", "cancelled"],
  in_progress: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
};

export const fmtTime = (iso, lang) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString(lang === "fa" ? "fa-IR" : "en-GB", { hour: "2-digit", minute: "2-digit" });
};

export const fmtDateTime = (iso, lang) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(lang === "fa" ? "fa-IR" : "en-GB", { dateStyle: "short", timeStyle: "short" });
};

/** Navigation URL for a stop: coordinates when known, else the address text. */
export const routeUrl = (stop) => {
  if (!stop) return "";
  const dest = stop.lat != null && stop.lng != null ? `${stop.lat},${stop.lng}` : encodeURIComponent(stop.address || "");
  return `https://www.google.com/maps/dir/?api=1&destination=${dest}`;
};
