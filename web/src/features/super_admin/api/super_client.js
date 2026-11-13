import { withBase } from "@shared/basePath";
import axios from "axios";

const superClient = axios.create({
  baseURL: "",
  headers: { "Content-Type": "application/json" },
});

superClient.interceptors.request.use((config) => {
  const token = sessionStorage.getItem("super_token");
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

    const isLoginRequest = url.includes("/login");

    if ((status === 401 || status === 403) && !isLoginRequest) {
      sessionStorage.removeItem("super_token");
      sessionStorage.removeItem("super_user");
      window.location.href = withBase("/admin/login");
    }

    return Promise.reject(err);
  }
);

export default superClient;