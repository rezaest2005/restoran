import axios from "axios";

const superClient = axios.create({
  baseURL: "http://127.0.0.1:8000",
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

    if (err.response?.status === 401 || err.response?.status === 403) {
      localStorage.removeItem("super_token");
      localStorage.removeItem("super_user");
      window.location.href = "/super/login";
    }
    return Promise.reject(err);
  }
);

export default superClient;