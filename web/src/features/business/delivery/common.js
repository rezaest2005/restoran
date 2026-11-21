import { appUrl } from "@shared/basePath";
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

const readUser = () => {
  try { return JSON.parse(sessionStorage.getItem("user") || localStorage.getItem("user") || "{}"); } catch { return {}; }
};

/** The business slug (e.g. "zfc") the courier page lives under. */
export function currentSlug() {
  const u = readUser();
  let remembered = "";
  try { remembered = localStorage.getItem("tenant_slug") || ""; } catch { /* ignore */ }
  return u.business_slug || remembered || "";
}

/** Courier address: <domain>/bizsuite_driver (no slug). After sign-in the app moves to <domain>/<slug>/bizsuite_driver/<number>. */
export const driverUrl = () => appUrl("/bizsuite_driver");

export const FAILURE_CODES = ["absent", "refused", "address", "closed", "damaged", "no_payment", "other"];
export const PRIORITIES = [0, 1, 2];
export const priorityColor = (C, p) => ({ 1: C.warning, 2: C.danger }[p] || C.muted);

/** Shrink a camera photo to a JPEG data URL (max side `max` px) so it uploads fast on a mobile network. */
export function photoToDataUrl(file, max = 1280, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * k);
      canvas.height = Math.round(img.height * k);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("image")); };
    img.src = url;
  });
}
