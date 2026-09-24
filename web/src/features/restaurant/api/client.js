import axios from "axios";

const client = axios.create({
  baseURL: "",  // ★ خالی — از طریق nginx پروکسی میشه
  headers: { "Content-Type": "application/json" },
  withCredentials: true,
});

// ─── ارسال توکن ───────────────────────────────────
client.interceptors.request.use((config) => {
  const token = localStorage.getItem("access_token");
  if (token) config.headers.Authorization = "Bearer " + token;
  const csrf = document.cookie.match(/csrftoken=([^;]+)/);
  if (csrf) config.headers["X-CSRFToken"] = csrf[1];
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
        const res = await client.post(
          "/api/auth/refresh/",  // ★ نسبی
          { refresh: refreshToken }
        );

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
  window.location.href = "/dashboard/login";  // ★ درست شد
}

// ─── اگه یه تب دیگه logout کرد ──────────────────
window.addEventListener("storage", (e) => {
  if (e.key === "__logout__") {
    if (!redirecting) {
      redirecting = true;
      window.location.href = "/dashboard/login";  // ★ درست شد
    }
  }
});

// ─── auto-refresh: هر ۲۰ دقیقه ──────────────────
setInterval(async () => {
  const refreshToken = localStorage.getItem("refresh_token");
  if (!refreshToken) return;
  try {
    const res = await client.post(
      "/api/auth/refresh/",  // ★ نسبی
      { refresh: refreshToken }
    );
    localStorage.setItem("access_token", res.data.access);
    if (res.data.refresh) {
      localStorage.setItem("refresh_token", res.data.refresh);
    }
  } catch (_) {}
}, 20 * 60 * 1000);

// ─── تشخیص تب اضافی ─────────────────────────────
const CHANNEL_NAME = "restaurant_tabs";
let channel = null;

try {
  channel = new BroadcastChannel(CHANNEL_NAME);
  channel.postMessage({ type: "new_tab", id: Date.now() });

  channel.onmessage = (e) => {
    if (e.data.type === "new_tab") {
      channel.postMessage({ type: "kick", id: e.data.id });
    }
    if (e.data.type === "kick") {
      document.title = "⚠️ تب اضافی";
      alert("یک نمونه دیگه از داشبورد باز هست. لطفاً این تب رو ببندید.");
    }
  };
} catch (_) {}

export default client;

// ═══════════════════════════════════════
//  مدیریت کاربران
// ═══════════════════════════════════════

export const getUsers = () =>
  client.get("/api/users/management/");

export const createUser = (data) =>
  client.post("/api/users/create/", data);

export const updateUserRole = (data) =>
  client.post("/api/users/update-role/", data);

export const toggleUserActive = (data) =>
  client.post("/api/users/toggle-active/", data);

export const resetUserPassword = (data) =>
  client.post("/api/users/reset-password/", data);

export const deleteUser = (data) =>
  client.post("/api/users/delete/", data);

export const getUserTabs = () =>
  client.get("/api/users/tabs/");

export const updateUserTabs = (data) =>
  client.post("/api/users/tabs/", data);