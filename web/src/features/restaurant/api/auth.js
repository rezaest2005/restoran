
import client from "./client";

export const authApi = {
  login: (data) => client.post("/api/auth/login/", data),
  logout: () => client.post("/api/auth/logout/"),
  me: () => client.get("/api/auth/me/"),
  refresh: (data) => client.post("/api/auth/refresh/", data),
  setSession: (data) => client.post("/api/auth/set-session/", data),
  superLogin: (data) => client.post("/api/super/login/", data),
};
