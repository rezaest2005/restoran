import axios from "axios";

const superClient = axios.create({
  baseURL: "",
  headers: { "Content-Type": "application/json" },
});

superClient.interceptors.request.use((config) => {
  const token = localStorage.getItem("super_token");
  if (token) config.headers.Authorization = "Token " + token;

  const csrf = document.cookie.match(/csrftoken=([^;]+)/);
  if (csrf) config.headers["X-CSRFToken"] = csrf[1];

  return config;
});

superClient.interceptors.response.use(
  (res) => res,
  (err) => {
    const status = err.response?.status;
    const url = err.config?.url || "";

    // ★ فقط برای درخواست‌های غیر از لاگین → ریدایرکت
    const isLoginRequest = url.includes("/login");

    if ((status === 401 || status === 403) && !isLoginRequest) {
      localStorage.removeItem("super_token");
      localStorage.removeItem("super_user");
      window.location.href = "/super/login";
    }

    return Promise.reject(err);
  }
);

export default superClient;