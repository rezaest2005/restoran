import axios from "axios";

// ═══════════════════════════════════════════════════
//  ★ ذخیره tenant slug از URL (یکبار هنگام لود)
// ═══════════════════════════════════════════════════
(function saveTenantSlug() {
  const parts = window.location.pathname.split("/").filter(Boolean);
  const slug = parts[0] || "";
  if (slug && !["dashboard", "api", "super", "static", "media"].includes(slug)) {
    localStorage.setItem("tenant_slug", slug);
  }
})();

const client = axios.create({
  baseURL: "",
  headers: { "Content-Type": "application/json" },
  withCredentials: true,
});

// ─── ارسال توکن + CSRF + tenant ──────────────────
client.interceptors.request.use((config) => {
  const token = localStorage.getItem("access_token");
  if (token) config.headers.Authorization = "Bearer " + token;

  const csrf = document.cookie.match(/csrftoken=([^;]+)/);
  if (csrf) config.headers["X-CSRFToken"] = csrf[1];

  // ★ ارسال tenant slug به بک‌اند
  const slug = localStorage.getItem("tenant_slug");
  if (slug) config.headers["X-Tenant-Slug"] = slug;

  return config;
});

// ─── مدیریت خطا + auto-refresh ─────────────────────
let isRefreshing = false;
let failedQueue = [];
let redirecting = false;

const processQueue = (error, token = null) => {
  failedQueue.forEach((p) => {
    if (error) p.reject(error);
    else p.resolve(token);
  });
  failedQueue = [];
};

client.interceptors.response.use(
  (res) => res,
  async (err) => {
    const originalRequest = err.config;
    const status = err.response?.status;

    if (status === 401 && !originalRequest._retry) {
      const refreshToken = localStorage.getItem("refresh_token");
      if (!refreshToken) {
        return Promise.reject(err);
      }

      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then((token) => {
          originalRequest.headers.Authorization = "Bearer " + token;
          return client(originalRequest);
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const res = await client.post("/api/auth/refresh/", {
          refresh: refreshToken,
        });

        const newAccess = res.data.access;
        const newRefresh = res.data.refresh || refreshToken;

        localStorage.setItem("access_token", newAccess);
        localStorage.setItem("refresh_token", newRefresh);

        processQueue(null, newAccess);

        originalRequest.headers.Authorization = "Bearer " + newAccess;
        return client(originalRequest);
      } catch (refreshErr) {
        processQueue(refreshErr, null);
        redirectToLogin();
        return Promise.reject(refreshErr);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(err);
  }
);

// ─── redirect به لاگین ────────────────────────────
function redirectToLogin() {
  if (redirecting) return;
  redirecting = true;

  localStorage.removeItem("access_token");
  localStorage.removeItem("refresh_token");
  localStorage.removeItem("user");
  localStorage.removeItem("db_auth");
  localStorage.setItem("__logout__", Date.now().toString());
  window.location.href = "/dashboard/login";
}

// ─── اگه یه تب دیگه logout کرد ──────────────────
window.addEventListener("storage", (e) => {
  if (e.key === "__logout__") {
    if (!redirecting) {
      redirecting = true;
      window.location.href = "/dashboard/login";
    }
  }
});

// ─── auto-refresh: هر ۲۰ دقیقه ──────────────────
setInterval(async () => {
  const refreshToken = localStorage.getItem("refresh_token");
  if (!refreshToken) return;
  try {
    const res = await client.post("/api/auth/refresh/", {
      refresh: refreshToken,
    });
    localStorage.setItem("access_token", res.data.access);
    if (res.data.refresh) {
      localStorage.setItem("refresh_token", res.data.refresh);
    }
  } catch (_) {}
}, 20 * 60 * 1000);

// ═══════════════════════════════════════════════════
//  تشخیص تب اضافی (per-user)
// ═══════════════════════════════════════════════════

const CHANNEL_NAME = "restaurant_tabs";
const TAB_ID = `tab_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

function getCurrentUserId() {
  try {
    const user = JSON.parse(localStorage.getItem("user") || "{}");
    return user.id || "anonymous";
  } catch {
    return "anonymous";
  }
}

const MAX_TABS_PER_USER = 2;

let channel = null;
const knownTabs = new Map();

try {
  channel = new BroadcastChannel(CHANNEL_NAME);

  channel.postMessage({
    type: "tab_open",
    tabId: TAB_ID,
    userId: getCurrentUserId(),
    timestamp: Date.now(),
  });

  channel.onmessage = (e) => {
    const msg = e.data;
    const myUserId = getCurrentUserId();

    if (msg.type === "tab_open" && msg.tabId !== TAB_ID) {
      knownTabs.set(msg.tabId, {
        userId: msg.userId,
        timestamp: msg.timestamp,
      });
      cleanOldTabs();

      channel.postMessage({
        type: "tab_alive",
        tabId: TAB_ID,
        userId: myUserId,
        timestamp: Date.now(),
      });

      if (msg.userId !== myUserId) return;

      const activeCount = countUserTabs(myUserId);
      if (activeCount > MAX_TABS_PER_USER) {
        channel.postMessage({
          type: "kick",
          tabId: msg.tabId,
          userId: msg.userId,
        });
      }
    }

    if (msg.type === "tab_alive" && msg.tabId !== TAB_ID) {
      knownTabs.set(msg.tabId, {
        userId: msg.userId,
        timestamp: msg.timestamp,
      });
    }

    if (msg.type === "tab_close" && msg.tabId !== TAB_ID) {
      knownTabs.delete(msg.tabId);
    }

    if (msg.type === "kick" && msg.tabId === TAB_ID) {
      document.title = "⚠️ تب اضافی";
      alert(
        "شما حداکثر " +
          MAX_TABS_PER_USER +
          " تب باز دارید.\n\nلطفاً این تب را ببندید."
      );
      setTimeout(() => window.close(), 3000);
    }
  };

  window.addEventListener("beforeunload", () => {
    channel.postMessage({
      type: "tab_close",
      tabId: TAB_ID,
      userId: getCurrentUserId(),
    });
  });

  function cleanOldTabs() {
    const now = Date.now();
    for (const [id, info] of knownTabs.entries()) {
      if (now - info.timestamp > 30000) {
        knownTabs.delete(id);
      }
    }
  }

  function countUserTabs(userId) {
    let count = 1;
    for (const [, info] of knownTabs.entries()) {
      if (info.userId === userId) count++;
    }
    return count;
  }
} catch (_) {}

export default client;

// ═══════════════════════════════════════
//  مدیریت کاربران
// ═══════════════════════════════════════

export const getUsers = () => client.get("/api/users/management/");

export const createUser = (data) => client.post("/api/users/create/", data);

export const updateUserRole = (data) =>
  client.post("/api/users/update-role/", data);

export const toggleUserActive = (data) =>
  client.post("/api/users/toggle-active/", data);

export const resetUserPassword = (data) =>
  client.post("/api/users/reset-password/", data);

export const deleteUser = (data) => client.post("/api/users/delete/", data);

export const getUserTabs = () => client.get("/api/users/tabs/");

export const updateUserTabs = (data) => client.post("/api/users/tabs/", data);