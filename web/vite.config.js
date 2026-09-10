import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
      },
    },
  },
  resolve: {
    alias: {
      "@":           path.resolve(__dirname, "src"),
      "@app":        path.resolve(__dirname, "src/app"),
      "@shared":     path.resolve(__dirname, "src/shared"),
      "@restaurant": path.resolve(__dirname, "src/features/restaurant"),
      "@super":      path.resolve(__dirname, "src/features/super_admin"),
    },
  },
});