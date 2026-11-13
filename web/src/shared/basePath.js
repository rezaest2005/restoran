/**
 * Hidden prefix for assets / API / static / media (build-time, from Vite `base`). Empty when the app owns the whole
 * domain; "/biz" when it shares a domain with other applications behind a proxy that strips that prefix
 * (see docs/DEPLOY.md). Pages people see (/<slug>/dashboard, /admin, /<slug>/bizsuite_driver/1 ...) are always at the root.
 */
export const BASE = (import.meta.env.BASE_URL || "/").replace(/\/+$/, "");

/** Page links need no prefix; kept as a helper so call sites read the same everywhere. */
export const withBase = (path) => path;

/** Absolute address of a page, e.g. the link a courier or a customer opens. */
export const appUrl = (path = "") => `${window.location.origin}${path}`;

/** The pathname as the router sees it. */
export const pathWithoutBase = (pathname = window.location.pathname) => pathname;
