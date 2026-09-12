import axios from "axios";

const client = axios.create({
  baseURL: "http://127.0.0.1:8000",
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

    if ((status === 401 || status === 403) && !originalRequest._retry) {
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

      const refreshToken = localStorage.getItem("refresh_token");
      if (!refreshToken) {
        isRefreshing = false;
        redirectToLogin();
        return Promise.reject(err);
      }

      try {
        const res = await axios.post(
          "http://127.0.0.1:8000/api/auth/refresh/",
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

// ─── redirect به لاگین + اطلاع‌رسانی به تب‌های دیگه ───
function redirectToLogin() {
  localStorage.removeItem("access_token");
  localStorage.removeItem("refresh_token");
  localStorage.removeItem("user");
  localStorage.removeItem("db_auth");
  localStorage.setItem("__logout__", Date.now().toString());
  window.location.href = "/login";
}

// ─── اگه یه تب دیگه logout کرد، این تب هم بره ────────
window.addEventListener("storage", (e) => {
  if (e.key === "__logout__") {
    window.location.href = "/login";
  }
});

// ─── auto-refresh: هر ۲۰ دقیقه توکن رو تمدید کن ──────
setInterval(async () => {
  const refreshToken = localStorage.getItem("refresh_token");
  if (!refreshToken) return;
  try {
    const res = await axios.post(
      "http://127.0.0.1:8000/api/auth/refresh/",
      { refresh: refreshToken }
    );
    localStorage.setItem("access_token", res.data.access);
    if (res.data.refresh) {
      localStorage.setItem("refresh_token", res.data.refresh);
    }
  } catch (_) {
    // interceptor بالا مدیریت می‌کنه
  }
}, 20 * 60 * 1000);

// ─── تشخیص تب اضافی ────────────────────────────────────
const CHANNEL_NAME = "restaurant_tabs";
let channel = null;

try {
  channel = new BroadcastChannel(CHANNEL_NAME);
  // به بقیه تب‌ها بگو من باز شدم
  channel.postMessage({ type: "new_tab", id: Date.now() });

  channel.onmessage = (e) => {
    if (e.data.type === "new_tab") {
      // تب جدید باز شد — بهش بگو بسته بشه
      channel.postMessage({ type: "kick", id: e.data.id });
    }
    if (e.data.type === "kick") {
      // این تب اضافی‌ست — پیام بده
      document.title = "⚠️ تب اضافی — لطفاً این تب رو ببندید";
      alert("یک نمونه دیگه از داشبورد باز هست. لطفاً این تب رو ببندید.");
    }
  };
} catch (_) {
  // مرورگر BroadcastChannel پشتیبانی نمی‌کنه — مهم نیست
}

export default client;