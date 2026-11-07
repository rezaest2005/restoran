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

export function hasTab(key, user = readUser()) {
  if (!user) return true;
  const bt = user.business_tabs;
  if (Array.isArray(bt) && bt.length > 0) return bt.includes(key);
  if (user.tabs && Object.keys(user.tabs).length > 0) return user.tabs[key] === true;
  if (user.permissions && Object.keys(user.permissions).length > 0) return user.permissions[key] === true;
  return user.role === "owner" || user.role === "manager";
}

/** Platform support is open to every owner / manager (no module needed). */
export const canSupport = (user = readUser()) => !user || user.role === "owner" || user.role === "manager";

export const canUse = (module, tabKey = module, user = readUser()) =>
  moduleEnabled(module, user) && hasTab(tabKey, user);
