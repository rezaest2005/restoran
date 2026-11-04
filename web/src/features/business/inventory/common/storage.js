// localStorage helpers shared by inventory tabs and dictionary sections.

export const readJSON = (key, def = []) => {
  try {
    return JSON.parse(localStorage.getItem(key) || JSON.stringify(def));
  } catch {
    return def;
  }
};

export const writeJSON = (key, val) => {
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch {
    /* storage unavailable */
  }
};

export const getCurrentUser = () => {
  try {
    const u = JSON.parse(localStorage.getItem("user") || "{}");
    return u.username || u.full_name || "نامشخص";
  } catch {
    return "نامشخص";
  }
};
