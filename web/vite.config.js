import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// Dev only: point the proxy at another API (VITE_API_TARGET=http://127.0.0.1:8410) when several copies run side by side
const API_TARGET = process.env.VITE_API_TARGET || "http://127.0.0.1:8000";

export default defineConfig({
  // "/" normally; "/biz/" when the app shares a domain behind a proxy that strips the prefix (docs/DEPLOY.md)
  base: process.env.VITE_BASE || "/",
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: API_TARGET,
        changeOrigin: true,
      },
      "/q": {
        target: API_TARGET,
        changeOrigin: true,
      },
    },
  },
  resolve: {
    alias: {
      "@":           path.resolve(__dirname, "src"),
      "@app":        path.resolve(__dirname, "src/app"),
      "@shared":     path.resolve(__dirname, "src/shared"),
      "@business": path.resolve(__dirname, "src/features/business"),
      "@super":      path.resolve(__dirname, "src/features/super_admin"),
    },
  },
});