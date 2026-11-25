import { BASE } from "./basePath";

/**
 * Takes this app's pages away from a service worker of ANOTHER site on the same domain.
 *
 * Why: on a shared domain (est.rysh.ir) some other site registered a worker for the whole domain ("/"). It answers our
 * pages and API calls from its own cache (old lists: a customer created in the admin panel never showed up; sign-in
 * answers from a stale cache) and returns an error for page addresses it does not know (net::ERR_CACHE_...).
 * A browser always uses the worker whose scope is the MOST SPECIFIC one for the page address, so we register our own
 * worker (public/sw.js: no fetch handler, no cache, it answers nothing) for the scope of this app's pages. With no fetch
 * handler every request of the page goes straight to the network. nginx sends "Service-Worker-Allowed: /" for /sw.js
 * so the script (which lives under the hidden prefix, e.g. /biz/sw.js) may control those scopes.
 * The courier pages register their own worker in DriverPage.jsx and are left alone here.
 */

// /bizsuite_admin/..., /bizsuite_dashboard/... and /<slug>/bizsuite_dashboard/...  (the courier pages are not included)
const SCOPE_RE = /^(\/(?:[a-z0-9][a-z0-9_-]+\/)?(?:bizsuite_admin|bizsuite_dashboard)\/)/i;

export const ownScope = (pathname = window.location.pathname) => (pathname.match(SCOPE_RE) || [])[1] || null;

/**
 * Registers our worker for this page's scope. Resolves when the page can safely call the API: at once when no foreign
 * worker controls it, otherwise after our worker has taken control (or after `waitMs`, so the app never hangs).
 */
export function ensureOwnWorker(waitMs = 3000) {
  const sw = typeof navigator !== "undefined" ? navigator.serviceWorker : null;
  if (!sw || !window.isSecureContext || !import.meta.env.PROD) return Promise.resolve();
  const scope = ownScope();
  if (!scope) return Promise.resolve();

  const script = `${BASE}/sw.js`;
  const scriptUrl = new URL(script, window.location.origin).href;
  const isOurs = (w) => !!w && w.scriptURL === scriptUrl;
  const foreign = !!sw.controller && !isOurs(sw.controller);

  const registered = sw.register(script, { scope, updateViaCache: "none" }).catch(() => null);
  if (!foreign) return Promise.resolve();

  return new Promise((resolve) => {
    let timer = 0;
    const done = () => {
      sw.removeEventListener("controllerchange", check);
      window.clearTimeout(timer);
      resolve();
    };
    const check = () => { if (isOurs(sw.controller)) done(); };
    timer = window.setTimeout(done, waitMs);
    sw.addEventListener("controllerchange", check);
    registered.then((reg) => { if (!reg) done(); else check(); });
  });
}

/** Removes the OLD whole-site registrations of our own worker (older builds installed one for "/" or the prefix). */
export function removeOldSiteWideWorker() {
  const sw = typeof navigator !== "undefined" ? navigator.serviceWorker : null;
  if (!sw) return;
  const ours = new URL(`${BASE}/sw.js`, window.location.origin).href;
  const broad = new Set([`${window.location.origin}/`, `${window.location.origin}${BASE}/`]);
  sw.getRegistrations().then((list) => list.forEach((r) => {
    const url = (r.active || r.waiting || r.installing)?.scriptURL || "";
    if (url === ours && broad.has(r.scope)) r.unregister();   // never a worker of another application
  })).catch(() => {});
}
