/**
 * Mount path of the app (build-time, from Vite `base`). Empty when the app owns the whole domain; "/biz" when it
 * shares a domain with other applications behind a proxy that strips the prefix (see docs/DEPLOY.md).
 */
export const BASE = (import.meta.env.BASE_URL || "/").replace(/\/+$/, "");

/** "/dashboard/login" -> "/biz/dashboard/login" (plain links, window.location, window.open). */
export const withBase = (path) => (path && path.startsWith("/") && !path.startsWith("//") ? BASE + path : path);

/** Absolute address of a path inside the app, e.g. the link a courier or a customer opens. */
export const appUrl = (path = "") => `${window.location.origin}${BASE}${path}`;

/** window.location.pathname without the mount path ("/biz/zfc/driver" -> "/zfc/driver"). */
export const pathWithoutBase = (pathname = window.location.pathname) =>
  BASE && pathname.startsWith(BASE + "/") ? pathname.slice(BASE.length) : pathname;
