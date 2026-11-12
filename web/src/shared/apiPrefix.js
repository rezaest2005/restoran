import { BASE } from "./basePath";

/**
 * When the app is mounted under a path (BASE = "/biz"), every request the browser sends to a server path
 * ("/api/...", "/media/...", "/static/...", "/q/...", "/admin/...") must carry that prefix so the proxy can tell
 * our traffic from the other applications on the same domain. Done once, here, for fetch and XMLHttpRequest
 * (which is what axios uses) instead of at the ~200 call sites. Does nothing when BASE is empty.
 */
const ROOTS = ["/api/", "/media/", "/static/", "/q/", "/admin/"];

const needsPrefix = (u) =>
  typeof u === "string" && u.startsWith("/") && !u.startsWith("//") && !u.startsWith(BASE + "/") && ROOTS.some((r) => u.startsWith(r));

export function installApiPrefix() {
  if (!BASE || window.__bizApiPrefix) return;
  window.__bizApiPrefix = true;

  const nativeFetch = window.fetch.bind(window);
  window.fetch = (input, init) => nativeFetch(needsPrefix(input) ? BASE + input : input, init);

  const nativeOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function open(method, url, ...rest) {
    return nativeOpen.call(this, method, needsPrefix(url) ? BASE + url : url, ...rest);
  };
}
