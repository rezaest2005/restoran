/**
 * Which hub tabs the signed-in user may see: the module must be enabled for the
 * business AND the user must hold the matching permission tab.
 * Mirrors the rules BusinessLayout uses for the sidebar.
 */
function readUser() {
  try {
    const raw = sessionStorage.getItem("user") || localStorage.getItem("user");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function moduleEnabled(code, user = readUser()) {
  const mods = user?.business_modules;
  return !Array.isArray(mods) || mods.includes(code);
}

/**
 * The server computes the effective tabs (licence ∩ what the owner granted) and sends them as
 * `business_tabs`. That list is the only thing the UI trusts; an absent list (old payload) grants nothing.
 */
export function hasTab(key, user = readUser()) {
  if (!user) return false;
  const bt = user.business_tabs;
  return Array.isArray(bt) && bt.includes(key);
}

/** Platform support is open to every owner / manager (no module needed). */
export const canSupport = (user = readUser()) => !user || user.role === "owner" || user.role === "manager";

export const canUse = (module, tabKey = module, user = readUser()) =>
  moduleEnabled(module, user) && hasTab(tabKey, user);
